import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

function getProjectRoot() {
  let d = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(d, 'models.json'))) return d;
  d = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(d, 'models.json'))) return d;
  return null;
}

function checkGpu() {
  // NVIDIA CUDA
  try {
    const out = execSync('nvidia-smi --query-gpu=name,driver_version --format=csv,noheader', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const parts = out.split(',').map(s => s.trim());
    return {
      status: 'ok',
      name: `NVIDIA ${parts[0] || ''}`,
      driver: parts[1] || null,
      backend: 'cuda',
      env: 'python-env-gpu',
    };
  } catch {}
  // AMD ROCm
  try {
    const out = execSync('rocm-smi --showproductname 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const name = out.split('\n').filter(l => l.includes('GPU'))[0]?.trim() || 'AMD GPU';
    return { status: 'ok', name, driver: 'ROCm', backend: 'rocm', env: 'python-env-rocm' };
  } catch {}
  // Vulkan (AMD/Intel/Virtual)
  try {
    const out = execSync('vulkaninfo --summary 2>/dev/null | grep "deviceName"', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const name = out.split('=').pop()?.trim() || null;
    if (name) {
      const isAmd = /amd|radeon/i.test(name);
      const isIntel = /intel|arc/i.test(name);
      return {
        status: 'ok',
        name,
        driver: 'Vulkan',
        backend: isAmd ? 'rocm' : isIntel ? 'vulkan' : 'vulkan',
        env: isAmd ? 'python-env-rocm' : 'python-env-cpu',
      };
    }
  } catch {}
  return { status: 'missing', name: null, driver: null, backend: null, env: 'python-env-cpu' };
}

function checkPython() {
  const candidates = ['python3', 'python'];
  for (const bin of candidates) {
    try {
      const out = execSync(`${bin} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
      return { status: 'ok', version: out, binary: bin };
    } catch {}
  }
  return { status: 'missing', version: null, binary: null };
}

function checkTtsModels(rootDir) {
  if (!rootDir) return { status: 'missing', error: 'Project root not found' };

  let modelsConfig;
  try {
    modelsConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'models.json'), 'utf8'));
  } catch {
    return { status: 'missing', error: 'models.json invalid' };
  }

  const missing = [];
  const found = [];

  const tts = modelsConfig.tts || {};
  for (const [key, entry] of Object.entries(tts)) {
    const modelPath = path.join(rootDir, entry.path);
    if (fs.existsSync(modelPath)) {
      found.push(key);
    } else {
      missing.push(key);
    }
  }

  if (missing.length === 0) {
    return { status: 'ok', found, missing: [] };
  }
  return { status: 'partial', found, missing };
}

router.post('/check', (req, res) => {
  try {
    const rootDir = getProjectRoot();
    const gpu = checkGpu();
    const python = checkPython();
    const tts = checkTtsModels(rootDir);

    res.json({
      checks: { gpu, python, tts },
      allPassed: gpu.status === 'ok' && python.status === 'ok' && tts.status === 'ok',
      recommendedEnv: gpu.env || 'python-env-cpu',
    });
  } catch (err) {
    console.error('[Setup] Check failed:', err);
    res.status(500).json({ error: 'System check failed' });
  }
});

/**
 * Download a file using native http/https with redirect following + headers.
 * Manual read-write loop with explicit backpressure.
 */
function downloadFile({ url, destPath, totalSize, onProgress }) {
  const MAX_REDIRECTS = 5;
  const DOWNLOAD_TIMEOUT = 1800_000; // 30 minutes per file
  const REQ_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };

  return new Promise((resolve, reject) => {
    let finished = false;

    function attempt(currentUrl, depth) {
      if (depth > MAX_REDIRECTS) return reject(new Error('Too many redirects'));

      const urlObj = new URL(currentUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        headers: REQ_HEADERS,
      };
      let idleTimer;
      const clearIdle = () => { clearTimeout(idleTimer); idleTimer = null; };
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          req.destroy(new Error('Download timed out: no data for 30 minutes'));
        }, DOWNLOAD_TIMEOUT);
      };

      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = response.headers.location;
          if (!location) { response.resume(); return reject(new Error('Redirect without Location')); }
          clearIdle();
          response.resume();
          return attempt(new URL(location, currentUrl).toString(), depth + 1);
        }

        if (response.statusCode !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${response.statusCode} ${response.statusMessage || ''}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        let bytesWritten = 0;
        let lastPct = -1;
        const startTime = Date.now();
        const serverTotal = parseInt(response.headers['content-length'], 10);
        const expectedTotal = serverTotal || totalSize;

        response.on('data', (chunk) => {
          if (finished) return;
          resetIdle();
          bytesWritten += chunk.length;
          const pct = expectedTotal > 0 ? Math.min(100, Math.round((bytesWritten / expectedTotal) * 100)) : 0;
          if (pct > lastPct) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? Math.round(bytesWritten / elapsed) : 0;
            onProgress({ percent: pct, bytes: bytesWritten, total: expectedTotal, speed });
            lastPct = pct;
          }

          const canContinue = fileStream.write(chunk);
          if (!canContinue) {
            response.pause();
            fileStream.once('drain', () => { if (!finished) response.resume(); });
          }
        });

        response.on('end', () => {
          clearIdle();
          if (!finished) {
            finished = true;
            fileStream.end();
            resolve({ bytes: bytesWritten, expected: expectedTotal });
          }
        });

        response.on('close', () => {
          clearIdle();
          if (!finished) {
            finished = true;
            fileStream.end();
            resolve({ bytes: bytesWritten, expected: expectedTotal });
          }
        });

        response.on('error', (err) => {
          clearIdle();
          if (!finished) {
            finished = true;
            fileStream.destroy();
            reject(err);
          }
        });

        fileStream.on('error', (err) => {
          clearIdle();
          if (!finished) {
            finished = true;
            response.destroy();
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        if (!finished) { finished = true; reject(err); }
      });
    }

    attempt(url, 0);
  });
}

router.get('/download', async (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; });

  // Keepalive ping every 30s; stop if client gone
  const keepalive = setInterval(() => {
    if (clientDisconnected || res.destroyed) {
      clearInterval(keepalive);
      return;
    }
    try { res.write(': keepalive\n\n'); } catch { clientDisconnected = true; clearInterval(keepalive); }
  }, 30_000);

  function sse(event, data) {
    if (clientDisconnected || res.destroyed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clientDisconnected = true;
    }
  }

  try {
    const rootDir = getProjectRoot();
    if (!rootDir) {
      sse('error', { error: 'Project root not found', key: 'system' });
      sse('complete', { downloaded: [], skipped: [], failed: ['system'] });
      return res.end();
    }

    let modelsConfig;
    try {
      modelsConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'models.json'), 'utf8'));
    } catch {
      sse('error', { error: 'models.json invalid', key: 'system' });
      sse('complete', { downloaded: [], skipped: [], failed: ['system'] });
      return res.end();
    }

    const tts = modelsConfig.tts || {};
    const engine = req.query.engine || 'kokoro';

    // Only download models relevant to the selected TTS engine
    let entries = Object.entries(tts);
    if (engine === 'kokoro') {
      entries = entries.filter(([key]) => key === 'kokoro_model' || key === 'kokoro_voices');
    } else {
      entries = entries.filter(([key]) => key !== 'kokoro_model' && key !== 'kokoro_voices');
    }

    console.log(`[Setup] Starting verify phase for ${entries.length} files (engine=${engine})...`);

    // Phase 1: Verify all files
    const needsDownload = [];
    for (const [key, entry] of entries) {
      const dest = path.join(rootDir, entry.path);
      const partial = dest + '.partial';
      let exists = false;

      try { if (fs.existsSync(partial)) { console.log(`  [verify] cleaning stale partial for ${key}`); fs.unlinkSync(partial); } } catch {}

      if (fs.existsSync(dest)) {
        const stat = fs.statSync(dest);
        const expected = parseInt(entry.size, 10);
        if (expected > 0 && stat.size === expected) {
          exists = true;
          console.log(`  [verify] ${key}: OK (${stat.size} bytes)`);
        } else if (expected > 0) {
          console.log(`  [verify] ${key}: size mismatch (${stat.size}/${expected}), removing`);
          try { fs.unlinkSync(dest); } catch {}
        } else {
          exists = true;
          console.log(`  [verify] ${key}: exists (no size check)`);
        }
      } else {
        console.log(`  [verify] ${key}: missing`);
      }

      sse('verify', { key, exists });
      if (!exists) needsDownload.push({ key, entry, dest });
    }

    console.log(`[Setup] Verify done: ${needsDownload.length} need download, ${entries.length - needsDownload.length} verified`);

    // Phase 2: Download missing files with stall detection + retry
    const skipped = entries
      .filter(([key]) => !needsDownload.find(n => n.key === key))
      .map(([key]) => key);
    const downloaded = [];
    const failed = [];

    for (const { key, entry, dest } of needsDownload) {
      if (clientDisconnected) {
        console.log(`[Setup] Client disconnected, stopping downloads`);
        break;
      }

      const totalSize = parseInt(entry.size, 10);
      const partial = dest + '.partial';
      const downloadStartTime = Date.now();

      console.log(`[Setup] Downloading ${key} (${totalSize} bytes) -> ${entry.url}`);
      sse('start', { key, size: entry.size });

      try {
        try { if (fs.existsSync(partial)) fs.unlinkSync(partial); } catch {}

        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const onProgress = (data) => sse('progress', { key, ...data });

        const { bytes: bytesWritten, expected } = await downloadFile({
          url: entry.url,
          destPath: partial,
          totalSize,
          onProgress,
        });

        // Verify size — use HTTP Content-Length if available, else configured size
        if (expected > 0 && bytesWritten < expected) {
          console.log(`[Setup] ${key}: truncated (${bytesWritten}/${expected})`);
          try { fs.unlinkSync(partial); } catch {}
          failed.push(key);
          sse('error', { key, error: `Download truncated: got ${bytesWritten}, expected ${expected}` });
          continue;
        }
        if (expected > 0 && bytesWritten !== expected) {
          console.warn(`[Setup] ${key}: size mismatch (${bytesWritten}/${expected}) — continuing anyway`);
        }

        // Rename .partial → final
        try {
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          fs.renameSync(partial, dest);
        } catch (renameErr) {
          console.error(`[Setup] ${key}: rename failed: ${renameErr.message}`);
          try { fs.unlinkSync(partial); } catch {}
          failed.push(key);
          sse('error', { key, error: `Rename failed: ${renameErr.message}` });
          continue;
        }

        const elapsed = Math.round((Date.now() - downloadStartTime) / 1000);
        console.log(`[Setup] ${key}: complete (${(totalSize / 1e6).toFixed(1)} MB in ${elapsed}s)`);
        sse('done', { key, elapsed, size: totalSize });
        downloaded.push(key);
      } catch (err) {
        console.error(`[Setup] ${key} failed:`, err.message);
        try { fs.unlinkSync(partial); } catch {}
        failed.push(key);
        sse('error', { key, error: err.message });
      }
    }

    sse('complete', { downloaded, skipped, failed });
    console.log(`[Setup] Done: ${downloaded.length} downloaded, ${skipped.length} skipped, ${failed.length} failed`);
    clearInterval(keepalive);
    res.end();
  } catch (err) {
    console.error('[Setup] Download endpoint error:', err);
    clearInterval(keepalive);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message, key: 'system' })}\n\n`);
      res.write(`event: complete\ndata: ${JSON.stringify({ downloaded: [], skipped: [], failed: ['system'] })}\n\n`);
    } catch {}
    res.end();
  }
});

router.get('/status', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM setup_state WHERE key = 'completed'").get();
    res.json({ completed: row?.value === 'true' });
  } catch (err) {
    console.error('[Setup] Status check failed:', err);
    res.json({ completed: false });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { backend } = req.body;

    db.exec(`
      CREATE TABLE IF NOT EXISTS setup_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    db.prepare('INSERT OR REPLACE INTO setup_state (key, value) VALUES (?, ?)').run('completed', 'true');
    if (backend) {
      db.prepare('INSERT OR REPLACE INTO setup_state (key, value) VALUES (?, ?)').run('backend', backend);
    }

    if (userId) {
      const existing = db.prepare('SELECT user_id FROM companion_settings WHERE user_id = ?').get(userId);
      if (backend && existing) {
        const device = (backend === 'cuda' || backend === 'vulkan') ? 'gpu' : 'cpu';
        db.prepare('UPDATE companion_settings SET tts_device = ? WHERE user_id = ?').run(device, userId);
      }
    }

    res.json({ completed: true });
  } catch (err) {
    console.error('[Setup] Complete failed:', err);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

export default router;
