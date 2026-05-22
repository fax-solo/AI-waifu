/**
 * Groq Service
 * 
 * Handles communication with Groq's high-speed inference API.
 * Uses OpenAI-compatible chat completions endpoint.
 */

/**
 * Send a message to Groq and get a response.
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
  const key = (apiKey && apiKey.trim()) || (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No Groq API key configured. Please add your Groq API key in Settings, or set GROQ_API_KEY in the server .env file. Get a free key at https://console.groq.com/keys'
    );
  }

  // Convert Gemini-style history to OpenAI/Groq-style
  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts[0].text
    })),
    { role: 'user', content: userMessage }
  ];

  const fallbackModels = [
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ];

  const modelsToTry = preferredModel 
    ? [preferredModel, ...fallbackModels.filter(m => m !== preferredModel)]
    : fallbackModels;

  let lastError = null;
  let allErrors = [];

  for (const modelName of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: groqMessages,
          temperature: 0.7,
          max_tokens: 1024,
          top_p: 1,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const fullText = data.choices[0]?.message?.content || '';

      // Parse emotion tag: [emotion] message and optional [animation:file.bvh] tag
      const emotionMatch = fullText.match(/^\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud)\]\s*(.*)/i);
      const animMatch = fullText.match(/\[animation:([\w.\-]+?\.bvh)\]/i);

      let text = emotionMatch ? emotionMatch[2].trim() : fullText.trim();
      let animation = animMatch ? animMatch[1].toLowerCase() : null;

      if (animation) {
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
      
      console.warn(`Groq attempt with ${modelName} failed:`, errorMessage);

      // If it's an API key error, STOP
      if (errorMessage.includes('API key') || errorMessage.includes('401')) {
        throw new Error('INVALID_API_KEY');
      }
      
      // For other errors (429/quota), move to next model
      continue;
    }
  }

  // Handle errors
  if (lastError?.message === 'INVALID_API_KEY') {
    throw new Error('Your Groq API key appears to be invalid. Please check your settings.');
  }

  const finalMessage = allErrors.length > 0 ? allErrors.join(' | ') : lastError?.message;
  throw new Error(`Groq connection error: ${finalMessage}. Please check your internet and API key.`);
}

export default { chat };
