/**
 * Chat Routes
 *
 * POST /api/chat - Send a message and get an AI response
 */

import { Router } from 'express';
import { chat as geminiChat } from '../services/gemini.js';
import { chat as groqChat } from '../services/groq.js';
import { buildSystemPrompt, extractMemoryHints } from '../services/personality.js';
import { shouldSearch, searchWeb } from '../services/search.js';
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
import { resolveAnimation } from '../services/animationResolver.js';

const router = Router();

// Animation intent is now handled by animationResolver.js

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

    const provider = settings.llm_provider || 'gemini';

    // Determine which API key to use based on provider
    let apiKey = null;
    if (provider === 'gemini' && settings.custom_api_key_encrypted) {
      try {
        apiKey = decrypt(settings.custom_api_key_encrypted);
      } catch (e) {
        console.error('Failed to decrypt user Gemini API key:', e.message);
      }
    } else if (provider === 'groq' && settings.groq_api_key_encrypted) {
      try {
        apiKey = decrypt(settings.groq_api_key_encrypted);
      } catch (e) {
        console.error('Failed to decrypt user Groq API key:', e.message);
      }
    }
    
    if (apiKey) {
      console.log(`[Chat] Using custom user ${provider} API key (starts with ${apiKey.substring(0, 4)}...)`);
    } else {
      console.log(`[Chat] Using system default ${provider} API key`);
    }

    // Get memories and conversation history
    const memories = getMemories(userId);
    const history = getConversationHistory(conversationId);

    // Build system prompt with personality and memories
    const systemPrompt = buildSystemPrompt(settings, memories, userName);

    // --- Smart Search Logic ---
    let searchResults = null;
    let isSearching = false;
    const searchNeeded = shouldSearch(message);

    if (searchNeeded) {
      // Check search rate limit (e.g., 10 per day)
      const today = new Date().toISOString().split('T')[0];
      const limit = db.prepare('SELECT search_count FROM rate_limits WHERE user_id = ? AND date = ?').get(userId, today);
      const searchCount = limit?.search_count || 0;

      if (searchCount < 10) {
        isSearching = true;
        searchResults = await searchWeb(message.trim());
        
        if (searchResults) {
          // Increment search count
          db.prepare(`
            INSERT INTO rate_limits (user_id, date, search_count) 
            VALUES (?, ?, 1) 
            ON CONFLICT(user_id, date) DO UPDATE SET search_count = search_count + 1
          `).run(userId, today);
        }
      } else {
        console.warn(`[Search] User ${userId} reached daily search limit.`);
      }
    }

    // Prepare message for Gemini (inject search results if found)
    let finalUserMessage = message.trim();
    if (searchResults) {
      finalUserMessage = `Use the following real-time information to answer the user:
[SEARCH RESULTS]
${searchResults}
[END SEARCH RESULTS]

User Query: ${finalUserMessage}`;
    }

    // Save user message (original one)
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

    // Call AI
    const chatOptions = {
      apiKey,
      systemPrompt,
      history,
      userMessage: finalUserMessage,
      model: settings.llm_model || (provider === 'groq' ? 'llama-3.1-70b-versatile' : 'gemini-3.1-flash-lite'),
    };

    const { text, emotion, animation } = await (provider === 'groq' ? groqChat(chatOptions) : geminiChat(chatOptions));

    // Save AI response (just the text, not the tag)
    saveMessage(conversationId, 'assistant', text);

    // Resolve the best animation based on the user's message, AI's response text, and the AI's emotion/animation tags
    const resolvedAnim = resolveAnimation(message, text, emotion, animation);

    if (resolvedAnim.animation && resolvedAnim.source !== 'ai_tag') {
      console.log(`[AnimResolver] Overrode/injected animation: ${resolvedAnim.animation} (Source: ${resolvedAnim.source})`);
    }

    // Send response with rate limit info and optional animation
    res.json({
      message: text,
      emotion: emotion,
      animation: resolvedAnim.animation,
      loopAnimation: resolvedAnim.loop,
      isSearching: isSearching && !!searchResults,
      conversationId,
      rateLimit: req.rateLimit || null,
    });
  } catch (error) {
    console.error('Chat error:', error.message);

    // Classify error for proper HTTP status
    let status = 500;
    if (error.message.includes('API key') || error.message.includes('No API key')) {
      status = 401;
    } else if (error.message.includes('rate limit') || error.message.includes('Rate limit') || error.message.includes('RESOURCE_EXHAUSTED')) {
      status = 429;
    }

    res.status(status).json({ error: error.message });
  }
});

export default router;
