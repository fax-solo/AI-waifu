import { Router } from 'express';
import { Readable } from 'stream';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import db from '../config/database.js';

const router = Router();
const TTS_SERVER_URL = process.env.TTS_SERVER_URL || 'http://127.0.0.1:5000';

function detectTTSDir() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && process.resourcesPath) {
    return process.resourcesPath;
  }
  // Dev: relative to project root
  return process.cwd().endsWith('server') ? path.join(process.cwd(), '..') : process.cwd();
}

async function isTTSServerRunning() {
  try {
    const resp = await fetch(`${TTS_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      return { running: true, loaded: data.loaded === true, error: data.error || null };
    }
    return { running: false, loaded: false, error: 'Health check failed' };
  } catch {
    return { running: false, loaded: false, error: 'Connection refused' };
  }
}

router.post('/restart', async (req, res) => {
  try {
    const status = await isTTSServerRunning();
    if (status.running) {
      return res.json({ ok: true, message: 'TTS already running', status });
    }

    const rootDir = detectTTSDir();
    const pythonDir = path.join(rootDir, 'python');
    const isWindows = os.platform() === 'win32';
    const venvName = fs.existsSync(path.join(pythonDir, 'venv_py311')) ? 'venv_py311' : 'venv';
    const binDir = isWindows ? path.join(pythonDir, venvName, 'Scripts') : path.join(pythonDir, venvName, 'bin');
    const pythonExe = path.join(binDir, isWindows ? 'python.exe' : 'python');
    const scriptPath = path.join(pythonDir, 'tts_server.py');

    if (!fs.existsSync(pythonExe)) {
      return res.status(500).json({ error: `Python not found at ${pythonExe}` });
    }
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: `TTS script not found at ${scriptPath}` });
    }

    // Kill stale process on port 5000
    try {
      if (isWindows) {
        try {
          const out = execSync('netstat -ano | findstr :5000 | findstr LISTENING', { encoding: 'utf8', timeout: 3000 });
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
          execSync('fuser -k 5000/tcp 2>/dev/null', { timeout: 3000 });
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

    // Wait a moment then check if it started
    await new Promise(r => setTimeout(r, 1500));
    const newStatus = await isTTSServerRunning();

    if (newStatus.running) {
      res.json({ ok: true, message: 'TTS sidecar started', status: newStatus });
    } else {
      res.status(500).json({ error: 'TTS sidecar exited or failed to start', status: newStatus });
    }
  } catch (error) {
    console.error('[TTS Restart Error]:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const status = await isTTSServerRunning();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { text, voice, speed, pitch, volume, alpha, beta, diffusion_steps, embedding_scale } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const companion = db.prepare(
      'SELECT tts_device, tts_alpha, tts_beta, tts_diffusion_steps, tts_embedding_scale FROM companion_settings WHERE user_id = ?'
    ).get(userId);
    
    const device = companion?.tts_device || 'cpu';

    const response = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voice || 'default',
        speed: speed ?? 1.0,
        pitch: pitch ?? 1.0,
        volume: volume ?? 1.0,
        device,
        alpha: alpha ?? companion?.tts_alpha ?? 0.3,
        beta: beta ?? companion?.tts_beta ?? 0.7,
        diffusion_steps: diffusion_steps ?? companion?.tts_diffusion_steps ?? 5,
        embedding_scale: embedding_scale ?? companion?.tts_embedding_scale ?? 1.0,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS Server error: ${error}`);
    }

    res.setHeader('Content-Type', 'audio/wav');
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (err) {
    console.error('[TTS Proxy Error]:', err.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export default router;
