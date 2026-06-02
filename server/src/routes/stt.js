import { Router } from 'express';

const router = Router();
const STT_URL = process.env.STT_SERVER_URL || process.env.TTS_SERVER_URL || 'http://127.0.0.1:5000';

router.get('/status', async (req, res) => {
  try {
    const resp = await fetch(`${STT_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      return res.json({ running: true, engine: data.engine || null, error: null });
    }
    return res.json({ running: false, engine: null, error: 'Health check failed' });
  } catch {
    return res.json({ running: false, engine: null, error: 'Connection refused' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    const response = await fetch(`${STT_URL}/stt`, {
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
