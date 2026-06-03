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
import { buildSystemPrompt, extractLLMMemories } from '../services/personality.js';
import { shouldSearch, searchWeb, extractSearchQuery } from '../services/search.js';
import { searchImages } from '../services/imageSearch.js';
import { parseResponse, getDefaultToggles } from '../utils/responseParser.js';
import {
  getConversationHistory,
  getConversationSummary,
  saveMessage,
  saveMemories,
  getRelevantMemories,
  autoTitle,
  checkAndTriggerSummarization,
  getRelevantSummaries,
  consolidateMemories,
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
  const { conversationId, message, screenshot, vrmModelName } = req.body;

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
  const relevantSummaries = getRelevantSummaries(userId, message, apiKey, 3);
  const conversationSummary = getConversationSummary(conversationId);
  const history = getConversationHistory(conversationId, WINDOW_SIZE);

  let systemPrompt = buildSystemPrompt(settings, relevantMemories, userName, vrmModelName);

  // Inject cross-conversation context from past related conversations
  if (relevantSummaries.length > 0) {
    const crossContext = relevantSummaries
      .map(s => `[${s.title}]\n${s.summary}`)
      .join('\n\n');
    const label = relevantSummaries.length === 1
      ? 'a previous conversation'
      : 'previous conversations';
    systemPrompt = `## Context from ${label}\nThe following information comes from other conversations you've had with ${userName}. Use it to maintain continuity.\n\n${crossContext}\n\n${systemPrompt}`;
  }

  if (conversationSummary) {
    systemPrompt = `## Earlier in This Conversation\n${conversationSummary}\n\nThe summary above captures the key points from earlier in this conversation. The most recent messages follow below.\n\n${systemPrompt}`;
  }

  let proactiveResults = null;
  let isSearching = false;
  const searchNeeded = shouldSearch(message);

  if (searchNeeded) {
    const today = new Date().toISOString().split('T')[0];
    const limit = db.prepare('SELECT search_count FROM rate_limits WHERE user_id = ? AND date = ?').get(userId, today);
    const searchCount = limit?.search_count || 0;

    if (searchCount < 10) {
      const searchQuery = extractSearchQuery(message) || message.trim();
      proactiveResults = await searchWeb(searchQuery);

      if (!proactiveResults) {
        proactiveResults = await searchWeb(message.trim());
      }

      if (proactiveResults) {
        isSearching = true;
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

  let finalUserMessage = message.trim();
  if (proactiveResults) {
    finalUserMessage = `Use the following real-time information to answer the user:
[SEARCH RESULTS]
${proactiveResults}
[END SEARCH RESULTS]

User Query: ${finalUserMessage}`;
  } else if (searchNeeded) {
    // Search requested but no results available — let AI answer from its knowledge
    isSearching = false;
    finalUserMessage = `User Query: ${message.trim()}

Note: Web search is currently unavailable, so answer using your existing knowledge. It's OK to rely on your training data for this response.`;
  }

  saveMessage(conversationId, 'user', message.trim());

  const messageCount = db.prepare(
    'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
  ).get(conversationId);
  if (messageCount.count <= 1) {
    autoTitle(conversationId, message.trim());
  }

  const model = settings.llm_model || (provider === 'groq' ? 'llama-3.1-70b-versatile' : 'gemini-2.0-flash-lite');

  if (screenshot && provider !== 'gemini') {
    console.warn(`[Chat] Screenshot provided but provider is "${provider}" — screenshots only supported with Gemini`);
  }

  const desktopCompanionMode = !!(settings.desktop_companion_mode);
  console.log(`[Chat] desktopCompanionMode=${desktopCompanionMode} from settings.desktop_companion_mode=${settings.desktop_companion_mode}`);

  return {
    conversationId,
    userId,
    provider,
    apiKey,
    systemPrompt,
    history,
    finalUserMessage,
    isSearching,
    desktopCompanionMode,
    chatOptions: {
      apiKey,
      systemPrompt,
      history,
      userMessage: finalUserMessage,
      model,
      searchWeb,
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

    let { text, emotion, animation } = await (
      data.provider === 'groq' ? groqChat(data.chatOptions) : geminiChat(data.chatOptions)
    );

    if (!text?.trim() && data.chatOptions.userMessage.includes('[SEARCH RESULTS]')) {
      console.log('[Chat] AI returned empty with search results — retrying without them');
      const retryOptions = { ...data.chatOptions, userMessage: req.body.message?.trim(), searchWeb: undefined, forceSearch: false };
      const retry = await (data.provider === 'groq' ? groqChat(retryOptions) : geminiChat(retryOptions));
      text = retry.text;
      emotion = retry.emotion;
      animation = retry.animation;
    }

    console.log(`[Chat] POST parseResponse — desktopCompanionMode=${data.desktopCompanionMode}, text length=${text?.length}, first 80 chars="${text?.substring(0, 80).replace(/\n/g, '\\n')}"`);
    const parsed = data.desktopCompanionMode
      ? parseResponse(text, true)
      : { text, toggles: getDefaultToggles(), search_query: '', wasJson: false };
    console.log(`[Chat] POST parsed — wasJson=${parsed.wasJson}, toggles=${JSON.stringify(parsed.toggles)}, search_query="${parsed.search_query}"`);

    const finalText = parsed.text || text;

    saveMessage(data.conversationId, 'assistant', finalText);

    // Extract long-term memories using the LLM (fire-and-forget)
    extractLLMMemories(req.body.message?.trim(), finalText, data.apiKey, data.provider)
      .then(memories => {
        if (memories.length > 0) {
          saveMemories(data.userId, memories);
          console.log(`[Memory] Extracted ${memories.length} memories from chat`);
        }
      })
      .catch(err => console.warn('[Memory] Async extraction failed:', err.message));

    checkAndTriggerSummarization(data.conversationId, {
      apiKey: data.apiKey,
      provider: data.provider,
    }).then(() => {
      consolidateMemories(data.conversationId, data.apiKey, data.provider);
    });

    const resolvedAnim = resolveAnimation(data.finalUserMessage, finalText, emotion, animation);

    let images = [];
    if (parsed.toggles.trigger_image_search && parsed.search_query) {
      images = await searchImages(parsed.search_query);
    }

    res.json({
      message: finalText,
      emotion,
      animation: resolvedAnim.animation,
      loopAnimation: resolvedAnim.loop,
      mouthExpression: resolvedAnim.mouthExpression || null,
      eyeExpression: resolvedAnim.eyeExpression || null,
      isSearching: data.isSearching,
      conversationId: data.conversationId,
      rateLimit: data.rateLimit,
      toggles: parsed.toggles,
      search_query: parsed.search_query,
      images,
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

    // When DCM is on, buffer tokens instead of forwarding raw JSON to the client
    const dcmBuffer = data.desktopCompanionMode ? [] : null;

    for await (const event of stream) {
      if (event.type === 'token') {
        fullText += event.text;
        if (dcmBuffer) {
          dcmBuffer.push(event.text);
        } else {
          res.write(`event: token\ndata: ${JSON.stringify({ text: event.text })}\n\n`);
        }
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

    if (!fullText?.trim() && data.chatOptions.userMessage.includes('[SEARCH RESULTS]')) {
      console.log('[Chat] Stream returned empty with search results — retrying without them');
      const retryOptions = { ...data.chatOptions, userMessage: req.body.message?.trim(), searchWeb: undefined, forceSearch: false };
      const retry = await (data.provider === 'groq' ? groqChat(retryOptions) : geminiChat(retryOptions));
      fullText = retry.text || '';
      finalEmotion = retry.emotion || 'neutral';
      finalAnimation = retry.animation;
      if (dcmBuffer) {
        dcmBuffer.push(fullText);
      } else {
        res.write(`event: token\ndata: ${JSON.stringify({ text: fullText })}\n\n`);
      }
    }

    console.log(`[Chat] Stream parseResponse — desktopCompanionMode=${data.desktopCompanionMode}, text length=${fullText?.length}, first 80 chars="${fullText?.substring(0, 80).replace(/\n/g, '\\n')}"`);
    const parsed = data.desktopCompanionMode
      ? parseResponse(fullText, true)
      : { text: fullText, toggles: getDefaultToggles(), search_query: '', wasJson: false };
    console.log(`[Chat] Stream parsed — wasJson=${parsed.wasJson}, toggles=${JSON.stringify(parsed.toggles)}, search_query="${parsed.search_query}"`);

    const finalText = parsed.text || fullText;

    // If DCM was buffered, flush the clean parsed text as token(s) now
    if (dcmBuffer && parsed.wasJson) {
      res.write(`event: token\ndata: ${JSON.stringify({ text: finalText })}\n\n`);
    } else if (dcmBuffer && !parsed.wasJson) {
      // JSON parsing failed — flush the buffer as-is
      const raw = dcmBuffer.join('');
      res.write(`event: token\ndata: ${JSON.stringify({ text: raw })}\n\n`);
    }

    saveMessage(data.conversationId, 'assistant', finalText);

    // Extract long-term memories using the LLM (fire-and-forget)
    const userOriginalMessage = req.body.message?.trim() || '';
    extractLLMMemories(userOriginalMessage, finalText, data.apiKey, data.provider)
      .then(memories => {
        if (memories.length > 0) {
          saveMemories(data.userId, memories);
          console.log(`[Memory] Extracted ${memories.length} memories from chat`);
        }
      })
      .catch(err => console.warn('[Memory] Async extraction failed:', err.message));

    checkAndTriggerSummarization(data.conversationId, {
      apiKey: data.apiKey,
      provider: data.provider,
    }).then(() => {
      consolidateMemories(data.conversationId, data.apiKey, data.provider);
    });

    if (parsed.wasJson) {
      const emotionMatch = finalText.match(/^(?:\[animation:([^\]]+)\]\s*)?\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud|disgust|fear)\]/i);
      if (emotionMatch) {
        finalEmotion = emotionMatch[2].toLowerCase();
      }
      const animMatch = finalText.match(/\[animation:([^\]]+)\]/i);
      if (animMatch) {
        finalAnimation = animMatch[1].toLowerCase().replace(/\.vrma$/i, '') + '.vrma';
      }
    }

    const resolvedAnim = resolveAnimation(data.finalUserMessage, finalText, finalEmotion, finalAnimation);

    let images = [];
    if (parsed.toggles.trigger_image_search && parsed.search_query) {
      images = await searchImages(parsed.search_query);
    }

    res.write(`event: done\ndata: ${JSON.stringify({
      emotion: finalEmotion,
      animation: resolvedAnim.animation,
      loopAnimation: resolvedAnim.loop,
      mouthExpression: resolvedAnim.mouthExpression || null,
      eyeExpression: resolvedAnim.eyeExpression || null,
      message: finalText,
      isSearching: data.isSearching,
      conversationId: data.conversationId,
      rateLimit: data.rateLimit,
      toggles: parsed.toggles,
      search_query: parsed.search_query,
      images,
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
