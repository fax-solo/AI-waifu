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

export async function chat({ apiKey, systemPrompt, history, userMessage, model: preferredModel, searchWeb, forceSearch, screenshot }) {
  const key = (apiKey && apiKey.trim()) || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No API key configured. Please add your Gemini API key in Settings, or set GEMINI_API_KEY in the server .env file. Get a free key at https://aistudio.google.com/app/apikey'
    );
  }

  const client = getClient(key);

  const fallbackModels = [
    'gemini-2.0-flash-lite',
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
        // When forceSearch is true, force the model to call web_search
        const modelConfig = {
          model: modelName,
          systemInstruction: systemPrompt,
          tools: WEB_SEARCH_TOOL,
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1024,
          },
        };
        if (forceSearch) {
          modelConfig.tool_config = {
            function_calling_config: {
              mode: 'ANY',
              allowed_function_names: ['web_search'],
            },
          };
        }

        const model = client.getGenerativeModel(modelConfig);
        const chatSession = model.startChat({ history: history || [] });

        const userParts = buildUserParts(userMessage, screenshot);
        const result = await chatSession.sendMessage(userParts);
        const response = result.response;
        const call = response.functionCalls?.[0];

        if (call?.name === 'web_search' && searchWeb) {
          const searchResults = await searchWeb(call.args.query);
          const searchContent = searchResults || 'No results found';

          const replyModel = client.getGenerativeModel({
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

          const userParts = buildUserParts(userMessage, screenshot);
          const fullHistory = [
            ...(history || []),
            { role: 'user', parts: userParts },
            { role: 'model', parts: [{ functionCall: { name: 'web_search', args: { query: call.args.query } } }] },
            { role: 'function', parts: [{ functionResponse: { name: 'web_search', response: { results: searchContent } } }] },
          ];

          const replyChat = replyModel.startChat({ history: fullHistory });
          const followUpResult = await replyChat.sendMessage('Now respond to the user based on the search results above.');
          const followUpResponse = followUpResult.response;
          const fullText = followUpResponse.text();

          const emotionMatch = fullText.match(/^(?:\[animation:([^\]]+)\]\s*)?\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud|disgust|fear)\]\s*(.*)/i);
          const animMatch = fullText.match(/\[animation:([^\]]+)\]/i);

          let text = emotionMatch ? emotionMatch[3].trim() : fullText.trim();
          let animation = animMatch ? animMatch[1].toLowerCase().replace(/\.vrma$/i, '') + '.vrma' : null;

          if (animation) {
            text = text.replace(/\[animation:[^\]]+\]/gi, '').trim();
          }

          if (emotionMatch) {
            return { emotion: emotionMatch[2].toLowerCase(), animation, text };
          }
          return { emotion: 'neutral', animation, text };
        }

        const fullText = response.text();

        const emotionMatch = fullText.match(/^(?:\[animation:([^\]]+)\]\s*)?\[(neutral|happy|angry|sad|relaxed|surprised|excited|embarrassed|nervous|affectionate|playful|tired|thoughtful|smug|loving|grateful|annoyed|curious|worried|proud|disgust|fear)\]\s*(.*)/i);
        const animMatch = fullText.match(/\[animation:([^\]]+)\]/i);

        let text = emotionMatch ? emotionMatch[3].trim() : fullText.trim();
        let animation = animMatch ? animMatch[1].toLowerCase().replace(/\.vrma$/i, '') + '.vrma' : null;

        if (animation) {
          text = text.replace(/\[animation:[^\]]+\]/gi, '').trim();
        }

        if (emotionMatch) {
          return { emotion: emotionMatch[2].toLowerCase(), animation, text };
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

function buildUserParts(userMessage, screenshot) {
  if (!screenshot) {
    return [{ text: userMessage }];
  }

  // Handle both raw base64 and data URLs
  let rawData = screenshot;
  let mimeType = 'image/png';

  if (typeof screenshot === 'string' && screenshot.startsWith('data:')) {
    const comma = screenshot.indexOf(',');
    if (comma !== -1) {
      const header = screenshot.slice(0, comma);
      const mime = header.match(/^data:([^;]+)/);
      if (mime) mimeType = mime[1];
      rawData = screenshot.slice(comma + 1);
    }
  }

  return [
    { text: userMessage },
    { inlineData: { mimeType, data: rawData } },
  ];
}

export default { chat };
