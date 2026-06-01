/**
 * Chat Routes
 *
 * POST /api/chat - Send a message and get an AI response
 * Features sliding window context, vector memory search, and background summarization.
 */

import { Router } from 'express';
import { chat as geminiChat, chatStream as geminiChatStream } from '../services/gemini.js';
import { chat as groqChat } from '../services/groq.js';
import { groqChatStream } from '../services/groq.js';
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
 * Shared preamble: validate request, load settings, build context, handle search.
 * Returns everything needed for AI call + the user message already saved.
 */
async function prepareChatData(req) {
  const userId = req.headers['x-user-id'];
  const { conversationId, message, screenshot } = req.body;

  if (!message?.trim()) {
    throw new ChatError('Message cannot be empty.', 400);
  }
  if (!conversationId) {
    throw new ChatError('Conversation ID required.', 400);
  }

  const conversation = db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
  ).get(conversationId, userId);

  if (!conversation) {
    throw new ChatError('Conversation not found.', 404);
  }

  const settings = db.prepare(
    'SELECT * FROM companion_settings WHERE user_id = ?'
  ).get(userId) || {};

  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId);
  const userName = user?.display_name || 'User';
  const provider = settings.llm_provider || 'gemini';

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

  const relevantMemories = await getRelevantMemories(userId, message, apiKey, MAX_RELEVANT_MEMORIES);
  const conversationSummary = getConversationSummary(conversationId);
  const history = getConversationHistory(conversationId, WINDOW_SIZE);

  let systemPrompt = buildSystemPrompt(settings, relevantMemories, userName);
  if (conversationSummary) {
    systemPrompt = `## Earlier Conversation Summary\n${conversationSummary}\n\nThe summary above captures the key points from earlier in this conversation. The most recent messages follow below.\n\n${systemPrompt}`;
  }

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

  saveMessage(conversationId, 'user', message.trim());

  const messageCount = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
  ).get(conversationId);
  if (messageCount.count <= 1) {
    autoTitle(conversationId, message.trim());
  }

  const newMemories = extractMemoryHints(message);
  if (newMemories.length > 0) {
    saveMemories(userId, newMemories);
  }

  const model = settings.llm_model || (provider === 'groq' ? 'llama-3.1-70b-versatile' : 'gemini-2.0-flash-lite');

  if (screenshot && provider !== 'gemini') {
    console.warn(`[Chat] Screenshot provided but provider is "${provider}" — screenshots only supported with Gemini`);
  }

  return {
    conversationId,
    userId,
    provider,
    apiKey,
    systemPrompt,
    history,
    finalUserMessage,
    isSearching,
    forceSearch,
    chatOptions: {
      apiKey,
      systemPrompt,
      history,
      userMessage: finalUserMessage,
      model,
      searchWeb,
      forceSearch,
      screenshot: provider === 'gemini' ? screenshot : undefined,
    },
    rateLimit: req.rateLimit || null,
  };
}

class ChatError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

/**
 * POST /api/chat
 *
 * Send a message to the AI companion and receive a non-streaming JSON response.
 *
 * Body: { conversationId, message, screenshot }
 * Headers: x-user-id
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  try {
    const data = await prepareChatData(req);

    const { text, emotion, animation } = await (
      data.provider === 'groq' ? groqChat(data.chatOptions) : geminiChat(data.chatOptions)
    );

    saveMessage(data.conversationId, 'assistant', text);

    checkAndTriggerSummarization(data.conversationId, {
      apiKey: data.apiKey,
      provider: data.provider,
    });

    const resolvedAnim = resolveAnimation(data.finalUserMessage, text, emotion, animation);

    res.json({
      message: text,
      emotion,
      animation: resolvedAnim.animation,
      loopAnimation: resolvedAnim.loop,
      mouthExpression: resolvedAnim.mouthExpression || null,
      eyeExpression: resolvedAnim.eyeExpression || null,
      isSearching: data.isSearching,
      conversationId: data.conversationId,
      rateLimit: data.rateLimit,
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    let status = error.status || 500;
    if (error.message.includes('API key') || error.message.includes('No API key')) status = 401;
    else if (error.message.includes('rate limit') || error.message.includes('Rate limit') || error.message.includes('RESOURCE_EXHAUSTED')) status = 429;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/chat/stream
 *
 * Same as POST /api/chat but streams response tokens via SSE.
 * Returns `event: token` for each text chunk, then `event: done` with metadata.
 */
router.post('/stream', rateLimitMiddleware, async (req, res) => {
  try {
    const data = await prepareChatData(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const stream = data.provider === 'groq'
      ? groqChatStream(data.chatOptions)
      : geminiChatStream(data.chatOptions);

    let fullText = '';
    let finalEmotion = 'neutral';
    let finalAnimation = null;
    let lastError = null;

    for await (const event of stream) {
      if (event.type === 'token') {
        fullText += event.text;
        res.write(`event: token\ndata: ${JSON.stringify({ text: event.text })}\n\n`);
      } else if (event.type === 'search') {
        res.write(`event: search\ndata: ${JSON.stringify({ query: event.query })}\n\n`);
      } else if (event.type === 'done') {
        finalEmotion = event.emotion || 'neutral';
        finalAnimation = event.animation;
        fullText = event.text || fullText;
        break;
      } else if (event.type === 'error') {
        lastError = event.message;
      }
    }

    if (lastError && !fullText) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: lastError })}\n\n`);
      res.end();
      return;
    }

    saveMessage(data.conversationId, 'assistant', fullText);

    checkAndTriggerSummarization(data.conversationId, {
      apiKey: data.apiKey,
      provider: data.provider,
    });

    const resolvedAnim = resolveAnimation(data.finalUserMessage, fullText, finalEmotion, finalAnimation);

    res.write(`event: done\ndata: ${JSON.stringify({
      emotion: finalEmotion,
      animation: resolvedAnim.animation,
      loopAnimation: resolvedAnim.loop,
      mouthExpression: resolvedAnim.mouthExpression || null,
      eyeExpression: resolvedAnim.eyeExpression || null,
      message: fullText,
      isSearching: data.isSearching,
      conversationId: data.conversationId,
      rateLimit: data.rateLimit,
    })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Chat stream error:', error.message);

    if (!res.headersSent) {
      let status = error.status || 500;
      if (error.message.includes('API key') || error.message.includes('No API key')) status = 401;
      else if (error.message.includes('rate limit') || error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) status = 429;
      return res.status(status).json({ error: error.message });
    }

    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    res.end();
  }
});

export default router;
