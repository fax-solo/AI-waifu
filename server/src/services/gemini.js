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
  const modelsToTry = [
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-flash-latest'
  ];
  let lastError = null;

  for (const modelName of modelsToTry) {
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        const model = client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1024,
          },
        });

        const chatSession = model.startChat({
          history: history || [],
        });

        const result = await chatSession.sendMessage(userMessage);
        const response = await result.response;
        const fullText = response.text();
        
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
        const errorMessage = error.message || '';
        
        console.warn(`Gemini attempt with ${modelName} (retry ${retries}) failed:`, errorMessage);

        // If it's an API key error, don't bother retrying
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
          break;
        }
        
        // If it's a quota/rate limit error (429), retry with exponential backoff
        if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          if (retries < maxRetries) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.log(`[Gemini] Rate limited. Retrying ${modelName} in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          break;
        }

        // If it's a fetch error or network error, retry immediately once
        if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET')) {
          if (retries < maxRetries) {
            retries++;
            console.log(`[Gemini] Network error with ${modelName}. Retrying immediately... (Attempt ${retries}/${maxRetries})`);
            continue;
          }
          break;
        }

        // If it's a 503 (High demand) or 500, try the next model
        if (errorMessage.includes('503') || errorMessage.includes('500')) {
          console.warn(`[Gemini] Server error (50x) with ${modelName}. Moving to next model fallback.`);
          break; 
        }

        // If it's a 404 (Model not found), move to next model immediately
        if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          console.warn(`[Gemini] Model ${modelName} not found or unsupported. Moving to next fallback.`);
          break;
        }

        // For other errors (like safety), return the specialized message
        if (errorMessage.includes('blocked') || errorMessage.includes('safety')) {
          return {
            emotion: 'sad',
            text: "Hmm, I couldn't quite figure out how to respond to that... Can we talk about something else? (◕‿◕)"
          };
        }
        
        // For anything else, just log it and try next model
        console.error(`[Gemini] Unrecognized error with ${modelName}:`, errorMessage);
        break;
      }
    }
  }

  // If we get here, all models/retries failed
  const error = lastError;
  const errorMessage = error?.message || 'Unknown error';
  
  if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
    throw new Error('Invalid API key. Please check your Gemini API key in Settings or .env file.');
  }
  if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    throw new Error('Gemini API rate limit hit. Please wait a minute or add your own API key in Settings.');
  }
  if (errorMessage.includes('503') || errorMessage.includes('500')) {
    throw new Error('Gemini servers are currently overloaded. Please try again in a few seconds.');
  }

  console.error('[Gemini] All fallback attempts failed. Last error:', errorMessage);
  throw new Error(`Gemini connection error: ${errorMessage.split('\n')[0]}. Please check your internet and API key.`);
}

export default { chat };
