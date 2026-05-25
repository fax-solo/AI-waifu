/**
 * Chat Routes
 *
 * POST /api/chat - Send a message and get an AI response
 * Features sliding window context, vector memory search, and background summarization.
 */

import { Router } from 'express';
import { chat as geminiChat } from '../services/gemini.js';
import { chat as groqChat } from '../services/groq.js';
import { buildSystemPrompt, extractMemoryHints } from '../services/personality.js';
import { shouldSearch, searchWeb, extractSearchQuery } from '../services/search.js';
import {
  getConversationHistory,
  getConversationSummary,
  saveMessage,
  saveMemories,
  getRelevantMemories,
  autoTitle,
  checkAndTriggerSummarization,
} from '../services/memory.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { decrypt } from '../utils/crypto.js';
import db from '../config/database.js';
import { resolveAnimation } from '../services/animationResolver.js';

const router = Router();

const WINDOW_SIZE = 10;
const MAX_RELEVANT_MEMORIES = 5;

/**
 * POST /api/chat
 *
 * Send a message to the AI companion and receive a response.
 * Uses sliding window context + vector memory search + background summarization.
 *
 * Body: { conversationId, message }
 * Headers: x-user-id, x-has-own-key (optional)
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const { conversationId, message, screenshot } = req.body;

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

    // ─── Sliding Window Context ─────────────────────────────────────
    // 1. Use vector search to find semantically relevant memories
    const relevantMemories = await getRelevantMemories(userId, message, apiKey, MAX_RELEVANT_MEMORIES);

    // 2. Get conversation summary (for older, compressed context)
    const conversationSummary = getConversationSummary(conversationId);

    // 3. Get the last N messages verbatim (sliding window)
    const history = getConversationHistory(conversationId, WINDOW_SIZE);

    // 4. Build system prompt with personality and relevant memories
    let systemPrompt = buildSystemPrompt(settings, relevantMemories, userName);

    // 5. Prepend conversation summary if it exists
    if (conversationSummary) {
      systemPrompt = `## Earlier Conversation Summary\n${conversationSummary}\n\nThe summary above captures the key points from earlier in this conversation. The most recent messages follow below.\n\n${systemPrompt}`;
    }

    // ─── Smart Search Logic ────────────────────────────────────────
    let proactiveResults = null;
    let isSearching = false;
    let forceSearch = false;
    const searchNeeded = shouldSearch(message);

    if (searchNeeded) {
      const today = new Date().toISOString().split('T')[0];
      const limit = db.prepare('SELECT search_count FROM rate_limits WHERE user_id = ? AND date = ?').get(userId, today);
      const searchCount = limit?.search_count || 0;

      if (searchCount < 10) {
        isSearching = true;
        proactiveResults = await searchWeb(message.trim());

        if (!proactiveResults) {
          const cleaned = extractSearchQuery(message);
          if (cleaned && cleaned !== message.trim().toLowerCase().replace(/[^\w\s]/g, '').trim()) {
            proactiveResults = await searchWeb(cleaned);
          }
        }

        if (proactiveResults) {
          db.prepare(`
            INSERT INTO rate_limits (user_id, date, search_count) 
            VALUES (?, ?, 1) 
            ON CONFLICT(user_id, date) DO UPDATE SET search_count = search_count + 1
          `).run(userId, today);
        } else {
          forceSearch = true;
        }
      } else {
        console.warn(`[Search] User ${userId} reached daily search limit.`);
      }
    }

    // Prepare message (inject proactive search results if found)
    let finalUserMessage = message.trim();
    if (proactiveResults) {
      finalUserMessage = `Use the following real-time information to answer the user:
[SEARCH RESULTS]
${proactiveResults}
[END SEARCH RESULTS]

User Query: ${finalUserMessage}`;
    } else if (forceSearch) {
      finalUserMessage = `User Query: ${message.trim()}

MANDATORY INSTRUCTION: You MUST use the web_search tool now to find up-to-date information before answering. Do NOT answer from your training data or memory. Search first, then answer based ONLY on the search results.`;
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

    // ─── Call AI ────────────────────────────────────────────────────
    const model = settings.llm_model || (provider === 'groq' ? 'llama-3.1-70b-versatile' : 'gemini-2.5-flash-lite');

    const chatOptions = {
      apiKey,
      systemPrompt,
      history,
      userMessage: finalUserMessage,
      model,
      searchWeb,
      forceSearch,
      screenshot: provider === 'gemini' ? screenshot : undefined,
    };

    const { text, emotion, animation } = await (provider === 'groq' ? groqChat(chatOptions) : geminiChat(chatOptions));

    // Save AI response (just the text, not the tag)
    saveMessage(conversationId, 'assistant', text);

    // ─── Background Summarization ───────────────────────────────────
    // Trigger async summarization if enough new messages have accumulated
    checkAndTriggerSummarization(conversationId, {
      apiKey,
      provider,
    });

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
      mouthExpression: resolvedAnim.mouthExpression || null,
      eyeExpression: resolvedAnim.eyeExpression || null,
      isSearching: isSearching && !!proactiveResults,
      conversationId,
      rateLimit: req.rateLimit || null,
    });
  } catch (error) {
    console.error('Chat error:', error.message);

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
