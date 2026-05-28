import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { detectRootDir, resolvePythonExe } from '../utils/paths.js';
import db from '../config/database.js';

const router = express.Router();

function readModelsJson() {
  const rootDir = detectRootDir();
  const modelsPath = path.join(rootDir, 'models.json');
  if (!fs.existsSync(modelsPath)) return null;
  const raw = fs.readFileSync(modelsPath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

async function getDiskInfo() {
  try {
    const stats = await fs.promises.statfs(process.cwd());
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const freeGB = freeBytes / (1024 ** 3);
    const totalGB = totalBytes / (1024 ** 3);
    return { freeGB: Math.round(freeGB * 100) / 100, totalGB: Math.round(totalGB * 100) / 100, enough: freeGB > 0.5 };
  } catch {
    return { freeGB: null, totalGB: null, enough: true };
  }
}

function getOsInfo() {
  const platform = os.platform();
  const release = os.release();
  const supported = ['linux', 'darwin', 'win32'].includes(platform);
  return { platform, release, supported, label: platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux' };
}

async function getGpuInfo() {
  return new Promise((resolve) => {
    const proc = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    const timeout = setTimeout(() => { proc.kill(); resolve({ hasNvidia: false, name: null }); }, 5000);
    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && output.trim()) resolve({ hasNvidia: true, name: output.trim().split('\n')[0] });
      else resolve({ hasNvidia: false, name: null });
    });
    proc.on('error', () => { clearTimeout(timeout); resolve({ hasNvidia: false, name: null }); });
  });
}

async function checkNetwork() {
  try {
    const resp = await fetch('https://huggingface.co', { signal: AbortSignal.timeout(5000) });
    return { reachable: resp.ok };
  } catch {
    return { reachable: false };
  }
}

function resolveVenvName(pythonDir) {
  if (fs.existsSync(path.join(pythonDir, 'venv_py311'))) return 'venv_py311';
  if (fs.existsSync(path.join(pythonDir, 'venv'))) return 'venv';
  return 'venv_py311';
}

function isVenvValid(venvPath) {
  const isWin = os.platform() === 'win32';
  const binDir = isWin ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
  const pythonExe = isWin ? 'python.exe' : 'python';
  return fs.existsSync(venvPath) && fs.existsSync(path.join(binDir, pythonExe));
}

async function findPython(pythonDir) {
  const candidates = os.platform() === 'win32'
    ? ['python']
    : ['python3.11', 'python3.10', 'python3.12', 'python3', 'python'];
  for (const cmd of candidates) {
    try {
      const proc = spawn(cmd, ['--version'], { cwd: pythonDir });
      await new Promise((resolve, reject) => {
        proc.on('close', (code) => code === 0 ? resolve() : reject());
        proc.on('error', reject);
      });
      return cmd;
    } catch { continue; }
  }
  return null;
}

// ─── GET /status ─────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const rootDir = detectRootDir();
    const pythonDir = path.join(rootDir, 'python');
    const modelsData = readModelsJson();

    const setupRow = db.prepare('SELECT * FROM setup_state WHERE id = ?').get('default');
    const setupComplete = setupRow?.setup_complete === 1;
    const markerExists = fs.existsSync(path.join(rootDir, '.setup-complete'));

    // Check each component
    let modelsMissing = false;
    let pythonMissing = true;
    if (modelsData) {
      const ttsModels = modelsData.tts || {};
      for (const asset of Object.keys(ttsModels)) {
        if (!fs.existsSync(path.join(rootDir, ttsModels[asset].path))) {
          modelsMissing = true;
          break;
        }
      }
    } else {
      modelsMissing = true;
    }

    const venvName = resolveVenvName(pythonDir);
    const venvPath = path.join(pythonDir, venvName);
    pythonMissing = !isVenvValid(venvPath);

    const galleryDir = path.join(rootDir, 'data', 'gallery');
    const hasGalleryAvatars = fs.existsSync(galleryDir) && fs.readdirSync(galleryDir).some(f => f.endsWith('.vrm') || f.endsWith('.glb'));

    const [gpuInfo, diskInfo, networkInfo] = await Promise.all([getGpuInfo(), getDiskInfo(), checkNetwork()]);
    const osInfo = getOsInfo();

    res.json({
      setupRequired: !setupComplete && (modelsMissing || pythonMissing),
      setupComplete: setupComplete || markerExists,
      modelsMissing,
      pythonMissing,
      hasGalleryAvatars,
      gpuInfo,
      diskInfo,
      osInfo,
      network: networkInfo,
      sessionActive: setupRow?.session_active === 1,
      sessionId: setupRow?.session_id || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /packages ───────────────────────────────────────────────────

router.get('/packages', async (req, res) => {
  try {
    const modelsData = readModelsJson();
    if (!modelsData || !modelsData.__packages__) {
      return res.json({ packages: [] });
    }
    const gpuInfo = await getGpuInfo();
    res.json({
      packages: modelsData.__packages__,
      gpuInfo,
      hasGalleryAvatars: fs.existsSync(path.join(detectRootDir(), 'data', 'gallery')),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /start ─────────────────────────────────────────────────────

router.post('/start', async (req, res) => {
  try {
    const { packages, engine } = req.body;
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'No packages specified' });
    }

    const sessionId = uuidv4();
    const existing = db.prepare('SELECT * FROM setup_state WHERE id = ?').get('default');
    if (existing) {
      db.prepare(`UPDATE setup_state SET session_active = 1, session_id = ?, session_started_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(sessionId, new Date().toISOString(), 'default');
    } else {
      db.prepare(`INSERT INTO setup_state (id, session_active, session_id, session_started_at, selected_engine, updated_at) VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP)`)
        .run('default', sessionId, new Date().toISOString(), engine || 'cpu');
    }

    res.json({ sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /cancel ────────────────────────────────────────────────────

router.post('/cancel', async (req, res) => {
  try {
    const { sessionId, keepDownloads } = req.body;
    db.prepare(`UPDATE setup_state SET session_active = 0, session_id = NULL, session_started_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 'default'`).run();
    if (!keepDownloads) {
      const modelsData = readModelsJson();
      if (modelsData && modelsData.tts) {
        const rootDir = detectRootDir();
        for (const asset of Object.keys(modelsData.tts)) {
          const filePath = path.join(rootDir, modelsData.tts[asset].path);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size < 1024) { // partial/empty files
              fs.unlinkSync(filePath);
            }
          }
        }
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /complete ──────────────────────────────────────────────────

router.post('/complete', async (req, res) => {
  try {
    const rootDir = detectRootDir();
    const isWindows = os.platform() === 'win32';
    const { companionName, language, ttsEnabled } = req.body || {};

    // Write marker file
    const markerPath = path.join(rootDir, '.setup-complete');
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');

    // Update DB
    const existing = db.prepare('SELECT * FROM setup_state WHERE id = ?').get('default');
    if (existing) {
      db.prepare(`UPDATE setup_state SET setup_complete = 1, completed_at = ?, session_active = 0, session_id = NULL, companion_name = ?, language = ?, tts_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(new Date().toISOString(), companionName || 'Aria', language || 'en', ttsEnabled !== false ? 1 : 0, 'default');
    } else {
      db.prepare(`INSERT INTO setup_state (id, setup_complete, completed_at, companion_name, language, tts_enabled, updated_at) VALUES (?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
        .run('default', new Date().toISOString(), companionName || 'Aria', language || 'en', ttsEnabled !== false ? 1 : 0);
    }

    // Update companion_settings in DB if applicable
    const userRow = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (userRow) {
      const existingSettings = db.prepare('SELECT * FROM companion_settings WHERE user_id = ?').get(userRow.id);
      if (existingSettings) {
        db.prepare(`UPDATE companion_settings SET name = ?, tts_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
          .run(companionName || 'Aria', ttsEnabled !== false ? 1 : 0, userRow.id);
      } else {
        db.prepare(`INSERT INTO companion_settings (user_id, name, tts_enabled) VALUES (?, ?, ?)`)
          .run(userRow.id, companionName || 'Aria', ttsEnabled !== false ? 1 : 0);
      }
    }

    // Start TTS Python sidecar
    const pythonDir = path.join(rootDir, 'python');
    const pythonExe = resolvePythonExe(pythonDir);
    const scriptPath = path.join(pythonDir, 'tts_server.py');

    if (fs.existsSync(pythonExe) && fs.existsSync(scriptPath)) {
      if (isWindows) {
        try {
          const result = execSync(`netstat -ano | findstr :5000 | findstr LISTENING`, { encoding: 'utf8', timeout: 3000 });
          const lines = result.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') { try { execSync(`taskkill /PID ${pid} /F`, { timeout: 2000 }); } catch {} }
          }
        } catch {}
      } else {
        try { execSync(`fuser -k 5000/tcp 2>/dev/null`, { timeout: 3000 }); } catch {}
      }

      const proc = spawn(pythonExe, [scriptPath], {
        cwd: pythonDir, detached: true, stdio: 'ignore',
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
      proc.unref();
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /stream (SSE) ───────────────────────────────────────────────

router.get('/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let destroyed = false;
  const cleanup = () => { destroyed = true; };
  req.on('close', cleanup);
  req.on('error', cleanup);

  const sendEvent = (event, data) => {
    if (destroyed || res.destroyed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { destroyed = true; }
  };

  const keepalive = setInterval(() => {
    if (destroyed || res.destroyed) { clearInterval(keepalive); return; }
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); destroyed = true; }
  }, 10000);

  try {
    const rootDir = detectRootDir();
    const modelsData = readModelsJson();
    const packagesMeta = modelsData?.__packages__ || {};
    const ttsModels = modelsData?.tts || {};
    const requested = req.query.packages ? req.query.packages.split(',') : [];
    const gpuInfo = await getGpuInfo();
    const gpuNvidia = requested.includes('python-env-gpu');
    const gpuAmd = requested.includes('python-env-amd');
    const gpuName = gpuInfo.hasNvidia ? gpuInfo.name : null;

    sendEvent('log', { text: `Starting setup for ${requested.length} package(s)...`, type: 'info' });

    // Build execution plan: python env first (if any), then downloads
    const pythonPkg = requested.find(p => packagesMeta[p]?.type === 'python-env');
    const downloadPkgs = requested.filter(p => packagesMeta[p]?.type === 'download');

    // Step 1: Python env
    if (pythonPkg) {
      const meta = packagesMeta[pythonPkg];
      const pythonDir = path.join(rootDir, 'python');
      if (!fs.existsSync(pythonDir)) fs.mkdirSync(pythonDir, { recursive: true });
      const venvDirName = resolveVenvName(pythonDir);
      const venvPath = path.join(pythonDir, venvDirName);
      await bootstrapPython(pythonPkg, venvPath, sendEvent, gpuNvidia, gpuAmd, gpuName);
    }

    // Step 2: Downloads
    let downloadIndex = 0;
    for (const pkgId of downloadPkgs) {
      if (destroyed) break;
      const meta = packagesMeta[pkgId];
      if (!meta || !meta.assets) continue;
      downloadIndex++;

      // Collect all files to download for this package
      const filesToDownload = [];
      for (const assetId of meta.assets) {
        const entry = ttsModels[assetId];
        if (entry) {
          filesToDownload.push({
            assetId,
            url: entry.url,
            dest: path.join(rootDir, entry.path),
            size: entry.size || 0,
            sha256: entry.sha256 || null,
          });
        }
      }

      sendEvent('log', { text: `Preparing ${meta.name} (${filesToDownload.length} file(s))...`, type: 'info' });

      for (const file of filesToDownload) {
        if (destroyed) break;
        sendEvent('progress', { id: file.assetId, progress: 0 });

        const dir = path.dirname(file.dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Check if file already exists
        if (fs.existsSync(file.dest)) {
          const stats = fs.statSync(file.dest);
          if (file.sha256) {
            const hash = crypto.createHash('sha256').update(fs.readFileSync(file.dest)).digest('hex');
            if (hash === file.sha256) {
              sendEvent('log', { text: `${path.basename(file.dest)} already exists (checksum OK)`, type: 'success' });
              sendEvent('progress', { id: file.assetId, progress: 100 });
              continue;
            }
          } else if (stats.size > 0) {
            sendEvent('log', { text: `${path.basename(file.dest)} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`, type: 'success' });
            sendEvent('progress', { id: file.assetId, progress: 100 });
            continue;
          }
        }

        // Download with retry
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (destroyed) break;
          try {
            if (attempt > 1) {
              sendEvent('log', { text: `Retrying ${path.basename(file.dest)} (${attempt}/3)...`, type: 'warning' });
            }

            sendEvent('log', { text: `Downloading ${path.basename(file.dest)}...`, type: 'info' });
            const response = await fetch(file.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const totalBytes = parseInt(response.headers.get('content-length'), 10) || file.size || 0;
            const body = response.body;
            if (!body) throw new Error('Empty response body');

            const fileStream = fs.createWriteStream(file.dest);
            let downloadedBytes = 0;
            let lastReportTime = Date.now();
            let startTime = Date.now();

            const webStream = Readable.fromWeb(body);
            webStream.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              const now = Date.now();
              if (now - lastReportTime > 250) {
                const pct = totalBytes ? Math.min(Math.floor((downloadedBytes / totalBytes) * 100), 99) : 0;
                const elapsed = (now - startTime) / 1000;
                const speed = elapsed > 0 ? (downloadedBytes / elapsed) : 0;
                const remaining = totalBytes > 0 && speed > 0 ? (totalBytes - downloadedBytes) / speed : 0;
                sendEvent('progress', { id: file.assetId, progress: pct, speed: Math.round(speed), eta: Math.round(remaining) });
                lastReportTime = now;
              }
            });

            await pipeline(webStream, fileStream);

            // Verify
            if (file.sha256) {
              const hash = crypto.createHash('sha256').update(fs.readFileSync(file.dest)).digest('hex');
              if (hash !== file.sha256) throw new Error('SHA256 mismatch');
            }

            sendEvent('progress', { id: file.assetId, progress: 100 });
            sendEvent('log', { text: `Finished ${path.basename(file.dest)}.`, type: 'success' });
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            try { fs.unlinkSync(file.dest); } catch {}
            sendEvent('log', { text: `Attempt ${attempt}/3 failed: ${err.message}`, type: attempt < 3 ? 'warning' : 'error' });
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 2000 * attempt));
            }
          }
        }

        if (lastError) {
          sendEvent('error', { id: file.assetId, text: `Failed to download ${path.basename(file.dest)}: ${lastError.message}` });
        }
      }
    }

    if (!destroyed) {
      sendEvent('done', { text: 'All packages installed successfully.' });
      await new Promise(r => setTimeout(r, 300));
    }
    res.end();
  } catch (error) {
    console.error('Setup stream error:', error);
    if (!destroyed) {
      sendEvent('error', { text: error.message });
      await new Promise(r => setTimeout(r, 300));
    }
    res.end();
  } finally {
    clearInterval(keepalive);
    req.off('close', cleanup);
    req.off('error', cleanup);
  }
});

// ─── GET /components ──────────────────────────────────────────────────

router.get('/components', async (req, res) => {
  try {
    const rootDir = detectRootDir();
    const modelsData = readModelsJson();
    const packagesMeta = modelsData?.__packages__ || {};
    const ttsModels = modelsData?.tts || {};

    const components = [];
    for (const [id, meta] of Object.entries(packagesMeta)) {
      let installed = false;
      if (meta.type === 'python-env') {
        const pythonDir = path.join(rootDir, 'python');
        installed = isVenvValid(path.join(pythonDir, resolveVenvName(pythonDir)));
      } else if (meta.type === 'download' && meta.assets) {
        installed = meta.assets.every(a => {
          const entry = ttsModels[a];
          return entry && fs.existsSync(path.join(rootDir, entry.path));
        });
      } else if (meta.type === 'preinstalled') {
        installed = true;
      }
      components.push({ id, ...meta, installed });
    }

    res.json({ components });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /repair ────────────────────────────────────────────────────

router.post('/repair', async (req, res) => {
  try {
    const { componentId } = req.body;
    if (!componentId) return res.status(400).json({ error: 'No componentId specified' });
    res.json({ ok: true, redirect: `/api/setup/stream?packages=${componentId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function runCommand(command, args, cwd, sendEvent, progressUpdate) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd });
    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) sendEvent('log', { text: line.trim(), type: 'info' });
      }
      if (progressUpdate) progressUpdate();
    });
    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) sendEvent('log', { text: line.trim(), type: 'info' });
      }
      if (progressUpdate) progressUpdate();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

async function bootstrapPython(pkgId, venvPath, sendEvent, gpuNvidia, gpuAmd, gpuName) {
  const rootDir = detectRootDir();
  const pythonDir = path.join(rootDir, 'python');
  if (!fs.existsSync(pythonDir)) fs.mkdirSync(pythonDir, { recursive: true });

  const isWindows = os.platform() === 'win32';
  const binDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');

  sendEvent('progress', { id: pkgId, progress: 5 });

  if (fs.existsSync(venvPath) && !isVenvValid(venvPath)) {
    sendEvent('log', { text: `Found incomplete or incompatible virtual environment. Removing...`, type: 'warning' });
    fs.rmSync(venvPath, { recursive: true, force: true });
  }

  if (!fs.existsSync(venvPath)) {
    sendEvent('log', { text: `Creating virtual environment in ${venvPath}...`, type: 'info' });
    let pyCmd = await findPython(pythonDir);
    let hasPython = !!pyCmd;

    if (!hasPython) {
      sendEvent('log', { text: `System Python not found.`, type: 'warning' });
    }

    // Windows: download portable Python
    if (!hasPython && isWindows) {
      const portablePyDir = path.join(pythonDir, 'runtime');
      const zipPath = path.join(pythonDir, 'python-portable.zip');
      const pyUrl = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';

      if (!fs.existsSync(portablePyDir)) {
        fs.mkdirSync(portablePyDir, { recursive: true });
        sendEvent('log', { text: `Downloading portable Python runtime (3.11.9)...`, type: 'info' });
        try {
          const response = await fetch(pyUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(zipPath, Buffer.from(buffer));
          sendEvent('log', { text: `Extracting Python runtime...`, type: 'info' });
          await runCommand('powershell', ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${portablePyDir}" -Force`], pythonDir, sendEvent);
          fs.unlinkSync(zipPath);
        } catch (err) {
          sendEvent('log', { text: `Failed to download portable Python: ${err.message}`, type: 'error' });
          throw err;
        }
        const pthFile = path.join(portablePyDir, 'python311._pth');
        if (fs.existsSync(pthFile)) {
          fs.writeFileSync(pthFile, 'python311.zip\n.\n#import site\nimport site');
        }
      }

      pyCmd = path.join(portablePyDir, 'python.exe');
      hasPython = true;

      if (!fs.existsSync(path.join(portablePyDir, 'Scripts', 'pip.exe'))) {
        sendEvent('log', { text: `Installing pip for portable runtime...`, type: 'info' });
        const localGetPip = [path.join(rootDir, 'get-pip.py'), path.join(pythonDir, 'get-pip.py')].find(p => fs.existsSync(p));
        if (localGetPip) {
          sendEvent('log', { text: `Using local get-pip.py...`, type: 'info' });
          await runCommand(pyCmd, [localGetPip], portablePyDir, sendEvent);
        } else {
          const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
          sendEvent('log', { text: `Downloading get-pip.py...`, type: 'info' });
          const getPipResp = await fetch(getPipUrl);
          const getPipBuf = await getPipResp.arrayBuffer();
          const getPipPath = path.join(portablePyDir, 'get-pip.py');
          fs.writeFileSync(getPipPath, Buffer.from(getPipBuf));
          await runCommand(pyCmd, [getPipPath], portablePyDir, sendEvent);
          fs.unlinkSync(getPipPath);
        }
      }
    }

    if (!hasPython) {
      sendEvent('log', { text: `Python is not installed.`, type: 'error' });
      sendEvent('log', { text: `Please install Python 3.10 or later from https://python.org`, type: 'info' });
      throw new Error('Python not found');
    }

    try {
      await runCommand(pyCmd, ['-m', 'venv', 'venv_py311'], pythonDir, sendEvent);
    } catch (e) {
      sendEvent('log', { text: `Creating venv failed. Copying Python environment as fallback...`, type: 'warning' });
      if (isWindows && fs.existsSync(path.join(pythonDir, 'runtime'))) {
        const runtimeDir = path.join(pythonDir, 'runtime');
        fs.cpSync(runtimeDir, venvPath, { recursive: true, force: true });
        const scriptsDir = path.join(venvPath, 'Scripts');
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
        if (fs.existsSync(path.join(runtimeDir, 'Scripts', 'pip.exe'))) {
          fs.cpSync(path.join(runtimeDir, 'Scripts'), scriptsDir, { recursive: true, force: true });
        }
      } else {
        sendEvent('log', { text: `Failed to create venv: ${e.message}.`, type: 'error' });
        throw e;
      }
    }
  } else {
    sendEvent('log', { text: `Virtual environment already exists.`, type: 'success' });
  }

  sendEvent('progress', { id: pkgId, progress: 20 });

  const pipCmd = isWindows ? path.join(venvPath, 'Scripts', 'pip.exe') : path.join(venvPath, 'bin', 'pip');
  if (!fs.existsSync(pipCmd)) {
    throw new Error(`pip not found at ${pipCmd}. Virtual environment is incomplete.`);
  }

  let fakeProgress = 20;
  const advanceProgress = () => {
    fakeProgress += 0.5;
    if (fakeProgress > 95) fakeProgress = 95;
    sendEvent('progress', { id: pkgId, progress: Math.floor(fakeProgress) });
  };

  let engineName = 'CPU';
  if (gpuNvidia) engineName = `NVIDIA GPU: ${gpuName || 'Unknown'}`;
  else if (gpuAmd) engineName = `AMD GPU: ${gpuName || 'Unknown'}`;

  sendEvent('log', { text: `Installing PyTorch (${engineName})...`, type: 'info' });

  if (gpuNvidia) {
    await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu124'], pythonDir, sendEvent, advanceProgress);
  } else if (gpuAmd) {
    const idxUrl = 'https://download.pytorch.org/whl/rocm6.2';
    await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', idxUrl], pythonDir, sendEvent, advanceProgress);
  } else {
    await runCommand(pipCmd, ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu'], pythonDir, sendEvent, advanceProgress);
  }

  sendEvent('log', { text: `Installing TTS dependencies (styletts2, fastapi, uvicorn, soundfile)...`, type: 'info' });
  await runCommand(pipCmd, ['install', 'fastapi', 'uvicorn', 'soundfile', 'styletts2'], pythonDir, sendEvent, advanceProgress);

  if (!isWindows) {
    try {
      const proc = spawn('ldconfig', ['-p']);
      let output = '';
      proc.stdout.on('data', (d) => { output += d.toString(); });
      await new Promise((resolve) => { proc.on('close', () => resolve()); proc.on('error', () => resolve()); });
      if (!output.includes('libsndfile')) {
        sendEvent('log', { text: `libsndfile1 not found. Attempting to install...`, type: 'warning' });
        try { await runCommand('sudo', ['apt-get', 'install', '-y', 'libsndfile1'], process.cwd(), sendEvent); } catch {
          sendEvent('log', { text: `Could not auto-install libsndfile1.`, type: 'warning' });
        }
      }
    } catch {}
  }

  sendEvent('progress', { id: pkgId, progress: 100 });
  sendEvent('log', { text: `Python Environment successfully bootstrapped!`, type: 'success' });
}

export default router;
