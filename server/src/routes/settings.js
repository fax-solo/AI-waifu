import { Router } from 'express';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getRateLimitStatus } from '../middleware/rateLimit.js';
import db, { listBackups, runBackup } from '../config/database.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    console.log('[Settings] GET requested for user:', userId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const companion = db.prepare(
      'SELECT * FROM companion_settings WHERE user_id = ?'
    ).get(userId);

    console.log('[Settings] Found user:', !!user, 'Found companion:', !!companion);

    const hasCustomKey = !!companion?.custom_api_key_encrypted;
    const hasGroqKey = !!companion?.groq_api_key_encrypted;

    let shortcuts = {};
    try {
      shortcuts = companion?.shortcuts ? JSON.parse(companion.shortcuts) : {};
    } catch { shortcuts = {}; }

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
        lipSyncEnabled: !!(companion?.lip_sync_enabled ?? 1),
        ttsEnabled: !!(companion?.tts_enabled ?? 1),
        ttsVoice: companion?.tts_voice || 'default',
        audioInputDevice: companion?.audio_input_device || 'default',
        audioOutputDevice: companion?.audio_output_device || 'default',
        ttsDevice: companion?.tts_device || 'gpu',
        ttsSpeed: companion?.tts_speed ?? 1.0,
        ttsPitch: companion?.tts_pitch ?? 1.0,
        ttsVolume: companion?.tts_volume ?? 1.0,
        ttsMaxChars: companion?.tts_max_chars ?? 500,
        llmModel: companion?.llm_model || 'gemini-2.0-flash-lite',
        llmProvider: companion?.llm_provider || 'gemini',
        shortcuts,
      },
      hasCustomApiKey: hasCustomKey,
      hasGroqApiKey: hasGroqKey,
    });
  } catch (err) {
    console.error('[Settings] GET ERROR:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { displayName, companion } = req.body;

    console.log('[Settings] Saving for user:', userId);

    if (displayName !== undefined) {
      db.prepare(
        'UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(displayName, userId);
    }

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
              lip_sync_enabled = COALESCE(?, lip_sync_enabled),
              tts_voice = COALESCE(?, tts_voice),
              audio_input_device = COALESCE(?, audio_input_device),
              audio_output_device = COALESCE(?, audio_output_device),
              tts_device = COALESCE(?, tts_device),
              tts_speed = COALESCE(?, tts_speed),
              tts_pitch = COALESCE(?, tts_pitch),
              tts_volume = COALESCE(?, tts_volume),
              tts_max_chars = COALESCE(?, tts_max_chars),
              llm_model = COALESCE(?, llm_model),
              llm_provider = COALESCE(?, llm_provider),
              shortcuts = COALESCE(?, shortcuts),
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(
          companion.name || null,
          companion.tone || null,
          companion.personality || null,
          companion.backstory || null,
          companion.ttsEnabled !== undefined ? (companion.ttsEnabled ? 1 : 0) : null,
          companion.lipSyncEnabled !== undefined ? (companion.lipSyncEnabled ? 1 : 0) : null,
          companion.ttsVoice || null,
          companion.audioInputDevice || null,
          companion.audioOutputDevice || null,
          companion.ttsDevice || null,
          companion.ttsSpeed !== undefined ? companion.ttsSpeed : null,
          companion.ttsPitch !== undefined ? companion.ttsPitch : null,
          companion.ttsVolume !== undefined ? companion.ttsVolume : null,
          companion.ttsMaxChars ?? null,
          companion.llmModel || null,
          companion.llmProvider || null,
          companion.shortcuts ? JSON.stringify(companion.shortcuts) : null,
          userId
        );
      } else {
        db.prepare(`
          INSERT INTO companion_settings (user_id, name, tone, personality, backstory, tts_enabled, lip_sync_enabled, tts_voice, audio_input_device, audio_output_device, tts_device, tts_speed, tts_pitch, tts_volume, tts_max_chars, llm_model, llm_provider, shortcuts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          companion.name || 'Aria',
          companion.tone || 'cute, friendly, emotional',
          companion.personality || 'You are a loving and caring companion who deeply cares about the user.',
          companion.backstory || 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
          companion.ttsEnabled !== undefined ? (companion.ttsEnabled ? 1 : 0) : 1,
          companion.lipSyncEnabled !== undefined ? (companion.lipSyncEnabled ? 1 : 0) : 1,
          companion.ttsVoice || 'default',
          companion.audioInputDevice || 'default',
          companion.audioOutputDevice || 'default',
          companion.ttsDevice || 'gpu',
          companion.ttsSpeed ?? 1.0,
          companion.ttsPitch ?? 1.0,
          companion.ttsVolume ?? 1.0,
          companion.ttsMaxChars ?? 500,
          companion.llmModel || 'gemini-2.0-flash-lite',
          companion.llmProvider || 'gemini',
          companion.shortcuts ? JSON.stringify(companion.shortcuts) : null
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] SAVE ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api-key', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { apiKey } = req.body;

  if (!apiKey?.trim()) {
    return res.status(400).json({ error: 'API key cannot be empty.' });
  }

  if (!apiKey.startsWith('AI')) {
    return res.status(400).json({
      error: 'Invalid API key format. Gemini API keys typically start with "AI".',
    });
  }

  const encrypted = encrypt(apiKey.trim());

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

router.delete('/api-key', (req, res) => {
  const userId = req.headers['x-user-id'];

  db.prepare(
    'UPDATE companion_settings SET custom_api_key_encrypted = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(userId);

  res.json({ success: true, message: 'API key removed.' });
});

router.post('/groq-key', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { apiKey } = req.body;

  if (!apiKey?.trim()) {
    return res.status(400).json({ error: 'API key cannot be empty.' });
  }

  if (!apiKey.trim().startsWith('gsk_')) {
    return res.status(400).json({
      error: 'Invalid API key format. Groq API keys typically start with "gsk_".',
    });
  }

  const encrypted = encrypt(apiKey.trim());

  const existing = db.prepare(
    'SELECT user_id FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  if (existing) {
    db.prepare(
      'UPDATE companion_settings SET groq_api_key_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
    ).run(encrypted, userId);
  } else {
    db.prepare(
      'INSERT INTO companion_settings (user_id, groq_api_key_encrypted) VALUES (?, ?)'
    ).run(userId, encrypted);
  }

  res.json({ success: true, message: 'Groq API key saved securely.' });
});

router.delete('/groq-key', (req, res) => {
  const userId = req.headers['x-user-id'];

  db.prepare(
    'UPDATE companion_settings SET groq_api_key_encrypted = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(userId);

  res.json({ success: true, message: 'Groq API key removed.' });
});

router.get('/rate-limit', (req, res) => {
  const userId = req.headers['x-user-id'];
  const status = getRateLimitStatus(userId);

  const companion = db.prepare(
    'SELECT custom_api_key_encrypted FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  res.json({
    ...status,
    hasCustomKey: !!companion?.custom_api_key_encrypted,
    bypassed: !!companion?.custom_api_key_encrypted,
  });
});

router.get('/memories', (req, res) => {
  const userId = req.headers['x-user-id'];

  const memories = db.prepare(
    'SELECT id, category, content, created_at FROM user_memories WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);

  res.json(memories);
});

router.delete('/memories/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;

  db.prepare(
    'DELETE FROM user_memories WHERE id = ? AND user_id = ?'
  ).run(id, userId);

  res.json({ success: true });
});

router.get('/character/export', (req, res) => {
  const userId = req.headers['x-user-id'];

  const companion = db.prepare(
    'SELECT * FROM companion_settings WHERE user_id = ?'
  ).get(userId) || {};

  const character = {
    name: companion.name || 'Aria',
    tone: companion.tone || 'cute, friendly, emotional',
    personality: companion.personality || 'You are a loving and caring companion who deeply cares about the user.',
    backstory: companion.backstory || 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
    ttsVoice: companion.tts_voice || 'default',
    ttsSpeed: companion.tts_speed ?? 1.0,
    ttsPitch: companion.tts_pitch ?? 1.0,
    ttsVolume: companion.tts_volume ?? 1.0,
    ttsMaxChars: companion.tts_max_chars ?? 500,
    llmModel: companion.llm_model || 'gemini-2.0-flash-lite',
    llmProvider: companion.llm_provider || 'gemini',
  };

  const version = 1;
  const blob = JSON.stringify({ version, type: 'waifu-character', character }, null, 2);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${character.name.replace(/[^a-zA-Z0-9]/g, '_')}_character.json"`);
  res.send(blob);
});

router.post('/character/import', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { character } = req.body;

  if (!character || !character.name) {
    return res.status(400).json({ error: 'Invalid character data: name is required.' });
  }

  const existing = db.prepare(
    'SELECT user_id FROM companion_settings WHERE user_id = ?'
  ).get(userId);

  const data = {
    name: character.name || 'Aria',
    tone: character.tone || 'cute, friendly, emotional',
    personality: character.personality || 'You are a loving and caring companion who deeply cares about the user.',
    backstory: character.backstory || 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
    ttsVoice: character.ttsVoice || 'default',
    ttsSpeed: character.ttsSpeed ?? 1.0,
    ttsPitch: character.ttsPitch ?? 1.0,
    ttsVolume: character.ttsVolume ?? 1.0,
    ttsMaxChars: character.ttsMaxChars ?? 500,
    llmModel: character.llmModel || 'gemini-2.0-flash-lite',
    llmProvider: character.llmProvider || 'gemini',
  };

  if (existing) {
    db.prepare(`
      UPDATE companion_settings
      SET name = ?, tone = ?, personality = ?, backstory = ?,
          tts_voice = ?, tts_speed = ?, tts_pitch = ?, tts_volume = ?,
          tts_max_chars = ?, llm_model = ?, llm_provider = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      data.name, data.tone, data.personality, data.backstory,
      data.ttsVoice, data.ttsSpeed, data.ttsPitch, data.ttsVolume,
      data.ttsMaxChars, data.llmModel, data.llmProvider,
      userId
    );
  } else {
    db.prepare(`
      INSERT INTO companion_settings (user_id, name, tone, personality, backstory, tts_voice, tts_speed, tts_pitch, tts_volume, tts_max_chars, llm_model, llm_provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      data.name, data.tone, data.personality, data.backstory,
      data.ttsVoice, data.ttsSpeed, data.ttsPitch, data.ttsVolume,
      data.ttsMaxChars, data.llmModel, data.llmProvider
    );
  }

  res.json({ success: true, character: data });
});

router.get('/backups', (req, res) => {
  try {
    const backups = listBackups();
    res.json({ backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups', (req, res) => {
  try {
    runBackup();
    const backups = listBackups();
    res.json({ success: true, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
