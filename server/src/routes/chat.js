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

const router = Router();

/**
 * Detect animation intent from user message.
 * Maps keywords to animation filenames so animations play
 * regardless of whether the AI model uses the animation tag.
 */
const ANIMATION_KEYWORDS = [
  { words: ['run', 'running', 'sprint'], file: 'action_run.bvh' },
  { words: ['walk', 'walking', 'stroll'], file: 'action_walk.bvh' },
  { words: ['jump', 'jumping', 'leap', 'hop'], file: 'action_jump.bvh' },
  { words: ['wave', 'waving', 'greet', 'greeting', 'hello', 'hi'], file: 'action_greeting.bvh' },
  { words: ['dance', 'dancing', 'boogie'], file: 'dance_1.bvh' },
  { words: ['lay down', 'lie down', 'sleep', 'laying'], file: 'action_laydown.bvh' },
  { words: ['stand up', 'stand', 'standing'], file: 'action_standup.bvh' },
  { words: ['crawl', 'crawling'], file: 'action_crawling.bvh' },
  { words: ['crouch', 'crouching', 'squat'], file: 'action_crouch.bvh' },
  { words: ['jog', 'jogging'], file: 'action_jog.bvh' },
  { words: ['exercise', 'workout', 'jumping jack', 'jumping jack'], file: 'exercise_jumping_jacks.bvh' },
  { words: ['crunches', 'crunch', 'situp', 'sit up'], file: 'exercise_crunch.bvh' },
  { words: ['sad', 'sadness', 'cry', 'crying'], file: 'sadness.bvh' },
  { words: ['happy', 'joy', 'joyful', 'glad', 'celebrate'], file: 'joy.bvh' },
  { words: ['angry', 'anger', 'mad', 'furious'], file: 'anger.bvh' },
  { words: ['confused', 'confusion', 'confuse', 'puzzled'], file: 'confusion.bvh' },
  { words: ['surprised', 'surprise', 'shock', 'shocked', 'amazed'], file: 'surprise.bvh' },
  { words: ['love', 'hug', 'cuddle', 'affection'], file: 'love.bvh' },
  { words: ['fear', 'fearful', 'scared', 'afraid', 'frightened'], file: 'fear.bvh' },
  { words: ['disgust', 'disgusted', 'gross'], file: 'disgust.bvh' },
  { words: ['excited', 'excitement', 'exciting', 'thrilled', 'hyped'], file: 'excitement.bvh' },
  { words: ['embarrassed', 'embarrassment', 'blush', 'shy'], file: 'embarrassment.bvh' },
  { words: ['nervous', 'nervousness', 'anxious', 'anxiety'], file: 'nervousness.bvh' },
  { words: ['curious', 'curiosity', 'wonder'], file: 'curiosity.bvh' },
  { words: ['proud', 'pride'], file: 'pride.bvh' },
  { words: ['grateful', 'gratitude', 'thankful', 'thanks'], file: 'gratitude.bvh' },
  { words: ['amused', 'amusement', 'funny', 'laugh'], file: 'amusement.bvh' },
  { words: ['bored', 'boring', 'tired', 'sleepy'], file: 'neutral_idle2.bvh' },
  { words: ['sit', 'sitting', 'take a seat'], file: 'sit_idle.bvh' },
  { words: ['kneel', 'kneeling', 'pray'], file: 'kneel_idle.bvh' },
  { words: ['gangnam', 'funny dance'], file: 'dance_gangnam_style.bvh' },
  { words: ['rumba'], file: 'dance_rumba.bvh' },
  { words: ['dab'], file: 'dance_dab.bvh' },
  { words: ['test animation', 'test the animation', 'test my animation', 'show animation', 'play animation'], file: 'neutral_idle.bvh' },
];

function detectAnimationIntent(userMessage) {
  const lower = userMessage.toLowerCase();
  for (const entry of ANIMATION_KEYWORDS) {
    for (const word of entry.words) {
      const pattern = word.length <= 3
        ? new RegExp(`\\b${word}\\b`, 'i')
        : new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (pattern.test(lower)) {
        console.log(`[Anim] Keyword "${word}" matched → ${entry.file}`);
        return entry.file;
      }
    }
  }
  return null;
}

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

    // Server-side animation detection: if the AI didn't provide an animation 
    // but the user asked for one, inject it here (bypasses AI's refusal to use tags)
    const detectedAnimation = detectAnimationIntent(message);
    const finalAnimation = animation || detectedAnimation || null;

    if (detectedAnimation && !animation) {
      console.log(`[Anim] Server injected animation "${detectedAnimation}" (AI didn't provide one)`);
    }

    // Send response with rate limit info and optional animation
    res.json({
      message: text,
      emotion: emotion,
      animation: finalAnimation,
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
