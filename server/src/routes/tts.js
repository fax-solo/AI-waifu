/**
 * TTS Proxy Route
 * 
 * Proxies requests to the local Python TTS server.
 */

import { Router } from 'express';
import { Readable } from 'stream';
import db from '../config/database.js';

const router = Router();
const TTS_SERVER_URL = process.env.TTS_SERVER_URL || 'http://127.0.0.1:5000';

router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { text, voice, speed, pitch, volume } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get user's preferred device
    const companion = db.prepare(
      'SELECT tts_device FROM companion_settings WHERE user_id = ?'
    ).get(userId);
    
    const device = companion?.tts_device || 'cpu';

    const response = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voice, speed: speed ?? 1.0, pitch: pitch ?? 1.0, volume: volume ?? 1.0, device }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TTS Server error: ${error}`);
    }

    // Proxy the audio stream
    res.setHeader('Content-Type', 'audio/wav');
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (err) {
    console.error('[TTS Proxy Error]:', err.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export default router;
