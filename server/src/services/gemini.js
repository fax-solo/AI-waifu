/**
 * Gemini Service
 *
 * Handles communication with Google's Gemini API.
 * Supports both server API key and user-provided keys.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Cache GenAI instances by API key to avoid recreating
const clientCache = new Map();

/**
 * Get or create a Gemini client for the given API key.
 *
 * @param {string} apiKey
 * @returns {GoogleGenerativeAI}
 */
function getClient(apiKey) {
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new GoogleGenerativeAI(apiKey));
  }
  return clientCache.get(apiKey);
}

/**
 * Send a message to Gemini and get a response.
 *
 * @param {object} options
 * @param {string} options.apiKey - The API key to use
 * @param {string} options.systemPrompt - System instructions for the AI
 * @param {Array} options.history - Conversation history in Gemini format
 * @param {string} options.userMessage - The new user message
 * @returns {Promise<{text: string, emotion: string}>} The AI's response text and detected emotion
 */
export async function chat({ apiKey, systemPrompt, history, userMessage }) {
  // Resolve the API key: prefer user-provided, fall back to server key
  const key = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No API key configured. Please add your Gemini API key in Settings, or set GEMINI_API_KEY in the server .env file. Get a free key at https://aistudio.google.com/app/apikey'
    );
  }

  const client = getClient(key);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1024,
        },
      });

      const chatSession = model.startChat({
        history: history || [],
      });

      const result = await chatSession.sendMessage(userMessage);
      const fullText = result.response.text();
      
      // Parse emotion tag: [emotion] message
      const emotionMatch = fullText.match(/^\[(neutral|happy|angry|sad|relaxed|surprised)\]\s*(.*)/i);
      
      if (emotionMatch) {
        return {
          emotion: emotionMatch[1].toLowerCase(),
          text: emotionMatch[2].trim()
        };
      }

      return {
        emotion: 'neutral',
        text: fullText.trim()
      };
    } catch (error) {
      lastError = error;
      // ... existing error handling ...
      console.warn(`Gemini attempt with ${modelName} failed:`, error.message);

      // If it's an API key error, don't bother retrying with other models
      if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key not valid')) {
        break;
      }
      
      // If it's a quota/rate limit error, don't retry immediately
      if (error.message?.includes('quota') || error.message?.includes('429')) {
        break;
      }

      // If it's a 503 (High demand) or 500, we'll try the next model in the list
      if (error.message?.includes('503') || error.message?.includes('500')) {
        continue;
      }

      // For other errors (like safety), stop and return the specialized message
      if (error.message?.includes('blocked') || error.message?.includes('safety')) {
        return "Hmm, I couldn't quite figure out how to respond to that... Can we talk about something else? (◕‿◕)";
      }
    }
  }

  // If we get here, all models failed
  const error = lastError;
  if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key not valid')) {
    throw new Error('Invalid API key. Please check your Gemini API key and try again.');
  }
  if (error.message?.includes('API key')) {
    throw new Error('API key error. Please check your Gemini API key in Settings or server .env file.');
  }
  if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
    throw new Error('Gemini API rate limit hit. Please wait a minute before trying again.');
  }
  if (error.message?.includes('503')) {
    throw new Error('Gemini servers are currently overloaded due to high demand. Please try again in a few seconds.');
  }

  console.error('Gemini API error after fallbacks:', error.message);
  throw new Error('Failed to get a response from Gemini. Please try again.');
}

export default { chat };
