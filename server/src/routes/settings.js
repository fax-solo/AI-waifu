/**
 * Settings Routes
 *
 * GET  /api/settings            - Get user settings
 * PUT  /api/settings            - Update user settings
 * POST /api/settings/api-key    - Set custom API key
 * DELETE /api/settings/api-key  - Remove custom API key
 * GET  /api/settings/rate-limit - Get rate limit status
 */

import { Router } from 'express';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getRateLimitStatus } from '../middleware/rateLimit.js';
import db from '../config/database.js';

const router = Router();

/**
 * GET /api/settings
 * Get all settings for the current user.
 */
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'];

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const companion = db.prepare(
    'SELECT * FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  // Don't send the actual encrypted key, just whether one exists
  const hasCustomKey = !!companion?.custom_api_key_encrypted;

  res.json({
    user: {
      id: user?.id,
      displayName: user?.display_name || 'User',
    },
    companion: {
      name: companion?.name || 'Aria',
      tone: companion?.tone || 'cute, friendly, emotional',
      personality: companion?.personality || 'You are a loving and caring companion who deeply cares about the user.',
      backstory: companion?.backstory || 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
      ttsEnabled: !!(companion?.tts_enabled ?? 1),
      ttsVoice: companion?.tts_voice || 'af_bella',
      audioInputDevice: companion?.audio_input_device || 'default',
      audioOutputDevice: companion?.audio_output_device || 'default',
    },
    hasCustomApiKey: hasCustomKey,
  });
});

/**
 * PUT /api/settings
 * Update user display name and/or companion settings.
 */
router.put('/', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { displayName, companion } = req.body;

    console.log('[Settings] Saving for user:', userId);

    // Update user display name
    if (displayName !== undefined) {
      db.prepare(
        'UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(displayName, userId);
    }

    // Update companion settings
    if (companion) {
      const existing = db.prepare(
        'SELECT user_id FROM companion_settings WHERE user_id = ?'
      ).get(userId);

      if (existing) {
        db.prepare(`
          UPDATE companion_settings
          SET name = COALESCE(?, name),
              tone = COALESCE(?, tone),
              personality = COALESCE(?, personality),
              backstory = COALESCE(?, backstory),
              tts_enabled = COALESCE(?, tts_enabled),
              tts_voice = COALESCE(?, tts_voice),
              audio_input_device = COALESCE(?, audio_input_device),
              audio_output_device = COALESCE(?, audio_output_device),
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          companion.name || null,
          companion.tone || null,
          companion.personality || null,
          companion.backstory || null,
          companion.ttsEnabled !== undefined ? (companion.ttsEnabled ? 1 : 0) : null,
          companion.ttsVoice || null,
          companion.audioInputDevice || null,
          companion.audioOutputDevice || null,
          userId
        );
      } else {
        db.prepare(`
          INSERT INTO companion_settings (user_id, name, tone, personality, backstory, tts_enabled, tts_voice, audio_input_device, audio_output_device)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          companion.name || 'Aria',
          companion.tone || 'cute, friendly, emotional',
          companion.personality || 'You are a loving and caring companion who deeply cares about the user.',
          companion.backstory || 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
          companion.ttsEnabled !== undefined ? (companion.ttsEnabled ? 1 : 0) : 1,
          companion.ttsVoice || 'af_bella',
          companion.audioInputDevice || 'default',
          companion.audioOutputDevice || 'default'
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] SAVE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/api-key
 * Store a user's custom Gemini API key (encrypted).
 */
router.post('/api-key', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { apiKey } = req.body;

  if (!apiKey?.trim()) {
    return res.status(400).json({ error: 'API key cannot be empty.' });
  }

  // Basic validation - Gemini API keys start with "AI"
  if (!apiKey.startsWith('AI')) {
    return res.status(400).json({
      error: 'Invalid API key format. Gemini API keys typically start with "AI".',
    });
  }

  const encrypted = encrypt(apiKey.trim());

  // Ensure companion_settings row exists
  const existing = db.prepare(
    'SELECT user_id FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  if (existing) {
    db.prepare(
      'UPDATE companion_settings SET custom_api_key_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(encrypted, userId);
  } else {
    db.prepare(
      'INSERT INTO companion_settings (user_id, custom_api_key_encrypted) VALUES (?, ?)'
    ).run(userId, encrypted);
  }

  res.json({ success: true, message: 'API key saved securely.' });
});

/**
 * DELETE /api/settings/api-key
 * Remove a user's custom API key.
 */
router.delete('/api-key', (req, res) => {
  const userId = req.headers['x-user-id'];

  db.prepare(
    'UPDATE companion_settings SET custom_api_key_encrypted = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(userId);

  res.json({ success: true, message: 'API key removed.' });
});

/**
 * GET /api/settings/rate-limit
 * Get current rate limit status.
 */
router.get('/rate-limit', (req, res) => {
  const userId = req.headers['x-user-id'];
  const status = getRateLimitStatus(userId);

  // Check if user has custom key
  const companion = db.prepare(
    'SELECT custom_api_key_encrypted FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  res.json({
    ...status,
    hasCustomKey: !!companion?.custom_api_key_encrypted,
    bypassed: !!companion?.custom_api_key_encrypted,
  });
});

/**
 * GET /api/settings/memories
 * Get user's stored memories.
 */
router.get('/memories', (req, res) => {
  const userId = req.headers['x-user-id'];

  const memories = db.prepare(
    'SELECT id, category, content, created_at FROM user_memories WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);

  res.json(memories);
});

/**
 * DELETE /api/settings/memories/:id
 * Delete a specific memory.
 */
router.delete('/memories/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  db.prepare(
    'DELETE FROM user_memories WHERE id = ? AND user_id = ?'
  ).run(id, userId);

  res.json({ success: true });
});

export default router;
