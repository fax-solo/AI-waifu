/**
 * Chat Routes
 *
 * POST /api/chat - Send a message and get an AI response
 */

import { Router } from 'express';
import { chat as geminiChat } from '../services/gemini.js';
import { buildSystemPrompt, extractMemoryHints } from '../services/personality.js';
import {
  getConversationHistory,
  saveMessage,
  saveMemories,
  getMemories,
  autoTitle,
} from '../services/memory.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { decrypt } from '../utils/crypto.js';
import db from '../config/database.js';

const router = Router();

/**
 * POST /api/chat
 *
 * Send a message to the AI companion and receive a response.
 *
 * Body: { conversationId, message }
 * Headers: x-user-id, x-has-own-key (optional)
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { conversationId, message } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required.' });
    }

    // Verify conversation exists and belongs to user
    const conversation = db.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    ).get(conversationId, userId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    // Get companion settings
    const settings = db.prepare(
      'SELECT * FROM companion_settings WHERE user_id = ?'
    ).get(userId) || {};

    // Get user profile
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId);
    const userName = user?.display_name || 'User';

    // Determine which API key to use
    let apiKey = null;
    if (settings.custom_api_key_encrypted) {
      try {
        apiKey = decrypt(settings.custom_api_key_encrypted);
      } catch (e) {
        console.error('Failed to decrypt user API key:', e.message);
      }
    }

    // Get memories and conversation history
    const memories = getMemories(userId);
    const history = getConversationHistory(conversationId);

    // Build system prompt with personality and memories
    const systemPrompt = buildSystemPrompt(settings, memories, userName);

    // Save user message
    saveMessage(conversationId, 'user', message.trim());

    // Auto-title if this is the first message
    const messageCount = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
    ).get(conversationId);
    if (messageCount.count <= 1) {
      autoTitle(conversationId, message.trim());
    }

    // Extract and save any new memories from user message
    const newMemories = extractMemoryHints(message);
    if (newMemories.length > 0) {
      saveMemories(userId, newMemories);
    }

    // Call Gemini
    const aiResponse = await geminiChat({
      apiKey,
      systemPrompt,
      history,
      userMessage: message.trim(),
    });

    // Save AI response
    saveMessage(conversationId, 'assistant', aiResponse);

    // Send response with rate limit info
    res.json({
      message: aiResponse,
      conversationId,
      rateLimit: req.rateLimit || null,
    });
  } catch (error) {
    console.error('Chat error:', error.message);

    const status = error.message.includes('Rate limit') ? 429
      : error.message.includes('API key') ? 401
      : 500;

    res.status(status).json({ error: error.message });
  }
});

export default router;
