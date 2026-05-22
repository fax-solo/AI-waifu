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
 * @param {string} options.model - The preferred model name
 * @returns {Promise<{text: string, emotion: string}>} The AI's response text and detected emotion
 */
export async function chat({ apiKey, systemPrompt, history, userMessage, model: preferredModel }) {
  // Resolve the API key: prefer user-provided, fall back to server key
  const key = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No API key configured. Please add your Gemini API key in Settings, or set GEMINI_API_KEY in the server .env file. Get a free key at https://aistudio.google.com/app/apikey'
    );
  }

  const client = getClient(key);
  
  // Build models to try, prioritizing the user's preferred model
  const fallbackModels = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];
  
  const modelsToTry = preferredModel 
    ? [preferredModel, ...fallbackModels.filter(m => m !== preferredModel)]
    : fallbackModels;

  let lastError = null;
  let allErrors = [];

  for (const modelName of modelsToTry) {
    let retries = 0;
    const maxRetries = 1; // Reduced for fallbacks
    
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
        
        // Parse emotion tag: [emotion] message and optional [animation:file.bvh] tag
        const emotionMatch = fullText.match(/^\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud)\]\s*(.*)/i);
        const animMatch = fullText.match(/\[animation:([\w.\-]+?\.bvh)\]/i);

        let text = emotionMatch ? emotionMatch[2].trim() : fullText.trim();
        let animation = animMatch ? animMatch[1].toLowerCase() : null;

        if (animation) {
          // Remove the animation tag from the visible text
          text = text.replace(/\[animation:[\w.\-]+?\.bvh\]/gi, '').trim();
        }

        if (emotionMatch) {
          return {
            emotion: emotionMatch[1].toLowerCase(),
            animation,
            text,
          };
        }

        return {
          emotion: 'neutral',
          animation,
          text,
        };
      } catch (error) {
        lastError = error;
        const errorMessage = error.message || '';
        allErrors.push(`${modelName}: ${errorMessage.split('\n')[0]}`);
        
        console.warn(`Gemini attempt with ${modelName} failed:`, errorMessage);

        // If it's an API key error, STOP IMMEDIATELY
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid') || errorMessage.includes('400')) {
          if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
            throw new Error('INVALID_API_KEY');
          }
        }
        
        // If it's a quota/rate limit error (429), retry with exponential backoff
        if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          if (retries < maxRetries) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.log(`[Gemini] Rate limited. Retrying ${modelName} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          break;
        }

        // If it's a 404 (Model not found), move to next model immediately
        if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          break;
        }

        // For other errors, try next model
        break;
      }
    }
  }

  // If we get here, all models/retries failed
  if (lastError?.message === 'INVALID_API_KEY' || lastError?.message?.includes('API key not valid')) {
    throw new Error('Your Gemini API key appears to be invalid. Please check your settings and ensure the key is correct.');
  }

  if (lastError?.message?.includes('quota') || lastError?.message?.includes('429') || lastError?.message?.includes('RESOURCE_EXHAUSTED')) {
    throw new Error('You have hit the Gemini Free Tier rate limit. Please wait about a minute before sending another message, or try switching to a different model in Settings.');
  }

  const finalMessage = allErrors.length > 0 ? allErrors.join(' | ') : lastError?.message;
  throw new Error(`Gemini connection error: ${finalMessage}. Please check your internet and API key.`);
}

export default { chat };
