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
 * @returns {Promise<string>} The AI's response text
 */
export async function chat({ apiKey, systemPrompt, history, userMessage }) {
  const key = apiKey || process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error('No API key available. Please set GEMINI_API_KEY or provide your own.');
  }

  const client = getClient(key);

  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  });

  try {
    const chatSession = model.startChat({
      history: history || [],
    });

    const result = await chatSession.sendMessage(userMessage);
    const response = result.response;
    const text = response.text();

    return text;
  } catch (error) {
    // Handle specific Gemini API errors
    if (error.message?.includes('API key')) {
      throw new Error('Invalid API key. Please check your Gemini API key.');
    }
    if (error.message?.includes('quota') || error.message?.includes('429')) {
      throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
    }
    if (error.message?.includes('blocked') || error.message?.includes('safety')) {
      return "Hmm, I couldn't quite figure out how to respond to that... Can we talk about something else? (◕‿◕)";
    }

    console.error('Gemini API error:', error.message);
    throw new Error('Failed to get a response. Please try again.');
  }
}

export default { chat };
