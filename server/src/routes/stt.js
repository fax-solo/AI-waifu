import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { detectRootDir, resolveVenvPath, resolvePythonExe } from '../utils/paths.js';

const router = Router();
const STT_SERVER_URL = process.env.STT_SERVER_URL || 'http://127.0.0.1:5001';

async function isSTTServerRunning() {
  try {
    const resp = await fetch(`${STT_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      return { running: true, engine: data.engine || null, error: null };
    }
    return { running: false, engine: null, error: 'Health check failed' };
  } catch {
    return { running: false, engine: null, error: 'Connection refused' };
  }
}

router.post('/restart', async (req, res) => {
  try {
    const status = await isSTTServerRunning();
    if (status.running) {
      return res.json({ ok: true, message: 'STT already running', status });
    }

    const rootDir = detectRootDir();
    const pythonDir = path.join(rootDir, 'python');
    const isWindows = os.platform() === 'win32';
    const pythonExe = resolvePythonExe(pythonDir);
    const scriptPath = path.join(pythonDir, 'stt_server.py');

    if (!fs.existsSync(pythonExe)) {
      return res.status(500).json({ error: `Python not found at ${pythonExe}` });
    }
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: `STT script not found at ${scriptPath}` });
    }

    // Kill stale process on port 5001
    try {
      if (isWindows) {
        try {
          const out = execSync('netstat -ano | findstr :5001 | findstr LISTENING', { encoding: 'utf8', timeout: 3000 });
          const lines = out.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
              try { execSync(`taskkill /PID ${pid} /F`, { timeout: 2000 }); } catch {}
            }
          }
        } catch {}
      } else {
        try {
          execSync('fuser -k 5001/tcp 2>/dev/null', { timeout: 3000 });
        } catch {}
      }
    } catch {}

    const proc = spawn(pythonExe, [scriptPath], {
      cwd: pythonDir,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    proc.unref();

    await new Promise(r => setTimeout(r, 1500));
    const newStatus = await isSTTServerRunning();

    if (newStatus.running) {
      res.json({ ok: true, message: 'STT sidecar started', status: newStatus });
    } else {
      res.status(500).json({ error: 'STT sidecar exited or failed to start', status: newStatus });
    }
  } catch (error) {
    console.error('[STT Restart Error]:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const status = await isSTTServerRunning();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    const response = await fetch(`${STT_SERVER_URL}/stt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`STT Server error: ${error}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[STT Proxy Error]:', err.message);
    res.status(500).json({ error: 'Failed to transcribe speech' });
  }
});

export default router;
