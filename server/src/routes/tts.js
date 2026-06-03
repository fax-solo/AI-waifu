import { Router } from 'express';
import { Readable } from 'stream';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import db from '../config/database.js';
import { detectRootDir, resolveVenvPath, resolvePythonExe } from '../utils/paths.js';

const router = Router();
const TTS_SERVER_URL = process.env.TTS_SERVER_URL || 'http://127.0.0.1:5000';

async function isTTSServerRunning() {
  try {
    const resp = await fetch(`${TTS_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      return {
        running: true,
        loaded: data.loaded === true,
        device: data.device || 'cpu',
        error: data.error || null,
      };
    }
    return { running: false, loaded: false, device: 'cpu', error: 'Health check failed' };
  } catch {
    return { running: false, loaded: false, device: 'cpu', error: 'Connection refused' };
  }
}

router.post('/restart', async (req, res) => {
  try {
    const rootDir = detectRootDir();
    const pythonDir = path.join(rootDir, 'python');
    const isWindows = os.platform() === 'win32';
    const pythonExe = resolvePythonExe(pythonDir);
    const scriptPath = path.join(pythonDir, 'server.py');

    if (!fs.existsSync(pythonExe)) {
      return res.status(500).json({ error: `Python not found at ${pythonExe}` });
    }
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: `TTS script not found at ${scriptPath}` });
    }

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
      try { execSync('fuser -k 5000/tcp 2>/dev/null', { timeout: 3000 }); } catch {}
    }

    await new Promise(r => setTimeout(r, 1000));

    const proc = spawn(pythonExe, [scriptPath], {
      cwd: pythonDir,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    proc.unref();

    await new Promise(r => setTimeout(r, 3000));
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
    const { text, voice, speed, pitch, volume, emotion, intensity } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const companion = db.prepare(
      'SELECT tts_device FROM companion_settings WHERE user_id = ?'
    ).get(userId);

    let device = companion?.tts_device || 'gpu';
    if (device === 'cpu') {
      try {
        const setupBackend = db.prepare("SELECT value FROM setup_state WHERE key = 'backend'").get();
        if (setupBackend && (setupBackend.value === 'python-env-gpu' || setupBackend.value === 'python-env-rocm')) {
          device = 'gpu';
        }
      } catch {}
    }

    const ttsVoice = voice || 'af_nicole';

    const response = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: ttsVoice,
        speed: speed ?? 1.0,
        pitch: pitch ?? 1.0,
        volume: volume ?? 1.0,
        device,
        engine: 'kokoro',
        emotion: 'neutral',
        intensity: 0,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS Server error: ${error}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('json') || contentType.includes('text');

    if (isJson) {
      const json = await response.json();
      const audioBuffer = Buffer.from(json.audio, 'base64');
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Duration-Ms', String(json.duration_ms || 0));
      res.setHeader('X-Emotion', json.emotion || 'neutral');
      res.send(audioBuffer);
    } else {
      const nodeStream = Readable.fromWeb(response.body);
      res.setHeader('Content-Type', 'audio/wav');
      nodeStream.pipe(res);
    }
  } catch (err) {
    console.error('[TTS Proxy Error]:', err.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export default router;
