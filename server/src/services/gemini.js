import { GoogleGenerativeAI } from '@google/generative-ai';

const clientCache = new Map();

function getClient(apiKey) {
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new GoogleGenerativeAI(apiKey));
  }
  return clientCache.get(apiKey);
}

const WEB_SEARCH_TOOL = [{
  functionDeclarations: [{
    name: 'web_search',
    description: 'Search the web for real-time or up-to-date information. Use this when the user asks about current events, news, weather, game releases, prices, or anything that might have changed since your training data.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to look up on the web' }
      },
      required: ['query']
    }
  }]
}];

export async function chat({ apiKey, systemPrompt, history, userMessage, model: preferredModel, searchWeb }) {
  const key = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No API key configured. Please add your Gemini API key in Settings, or set GEMINI_API_KEY in the server .env file. Get a free key at https://aistudio.google.com/app/apikey'
    );
  }

  const client = getClient(key);

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
    const maxRetries = 1;

    while (retries <= maxRetries) {
      try {
        const model = client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          tools: WEB_SEARCH_TOOL,
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
        const response = result.response;
        const call = response.functionCalls?.[0];

        if (call?.name === 'web_search' && searchWeb) {
          const searchResults = await searchWeb(call.args.query);
          const searchContent = searchResults || 'No results found';

          const followUp = await chatSession.sendMessage([{
            functionResponse: {
              name: 'web_search',
              response: { results: searchContent }
            }
          }]);
          const followUpResponse = followUp.response;
          const fullText = followUpResponse.text();

          const emotionMatch = fullText.match(/^\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud)\]\s*(.*)/i);
          const animMatch = fullText.match(/\[animation:([\w.\-]+?\.bvh)\]/i);

          let text = emotionMatch ? emotionMatch[2].trim() : fullText.trim();
          let animation = animMatch ? animMatch[1].toLowerCase() : null;

          if (animation) {
            text = text.replace(/\[animation:[\w.\-]+?\.bvh\]/gi, '').trim();
          }

          if (emotionMatch) {
            return { emotion: emotionMatch[1].toLowerCase(), animation, text };
          }
          return { emotion: 'neutral', animation, text };
        }

        const fullText = response.text();

        const emotionMatch = fullText.match(/^\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud)\]\s*(.*)/i);
        const animMatch = fullText.match(/\[animation:([\w.\-]+?\.bvh)\]/i);

        let text = emotionMatch ? emotionMatch[2].trim() : fullText.trim();
        let animation = animMatch ? animMatch[1].toLowerCase() : null;

        if (animation) {
          text = text.replace(/\[animation:[\w.\-]+?\.bvh\]/gi, '').trim();
        }

        if (emotionMatch) {
          return { emotion: emotionMatch[1].toLowerCase(), animation, text };
        }

        return { emotion: 'neutral', animation, text };
      } catch (error) {
        lastError = error;
        const errorMessage = error.message || '';
        allErrors.push(`${modelName}: ${errorMessage.split('\n')[0]}`);

        console.warn(`Gemini attempt with ${modelName} failed:`, errorMessage);

        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid') || errorMessage.includes('400')) {
          if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
            throw new Error('INVALID_API_KEY');
          }
        }

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

        if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          break;
        }

        break;
      }
    }
  }

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
