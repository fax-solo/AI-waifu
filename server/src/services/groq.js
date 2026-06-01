const WEB_SEARCH_TOOL = [{
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for real-time or up-to-date information. Use this when the user asks about current events, news, weather, game releases, prices, or anything that might have changed since your training data.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to look up on the web' }
      },
      required: ['query']
    }
  }
}];

export async function chat({ apiKey, systemPrompt, history, userMessage, model: preferredModel, searchWeb, forceSearch }) {
  const key = (apiKey && apiKey.trim()) || (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

  if (!key) {
    throw new Error(
      'No Groq API key configured. Please add your Groq API key in Settings, or set GROQ_API_KEY in the server .env file. Get a free key at https://console.groq.com/keys'
    );
  }

  function buildMessages(userMsg) {
    return [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts[0].text
      })),
      { role: 'user', content: userMsg }
    ];
  }

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
      const groqMessages = buildMessages(userMessage);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: groqMessages,
          tools: WEB_SEARCH_TOOL,
          tool_choice: forceSearch ? 'required' : 'auto',
           temperature: 0.7,
           max_tokens: 8192,
           top_p: 1,
           stream: false
         })
       });

       if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0];
      const toolCalls = choice.message?.tool_calls;

      if (toolCalls?.length > 0 && searchWeb) {
        const call = toolCalls[0];
        if (call.function.name === 'web_search') {
          const args = JSON.parse(call.function.arguments);
          const searchResults = await searchWeb(args.query);
          const searchContent = searchResults || 'No results found';

          groqMessages.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls
          });
          groqMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: searchContent
          });

          const followUp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: modelName,
              messages: groqMessages,
              temperature: 0.7,
              max_tokens: 8192,
              top_p: 1,
              stream: false
            })
          });

          if (!followUp.ok) {
            const errData = await followUp.json();
            throw new Error(errData.error?.message || `HTTP ${followUp.status}`);
          }

          const followUpData = await followUp.json();
          const fullText = followUpData.choices[0]?.message?.content || '';

          return parseResponse(fullText);
        }
      }

      const fullText = choice.message?.content || '';
      return parseResponse(fullText);

    } catch (error) {
      lastError = error;
      const errorMessage = error.message || '';
      allErrors.push(`${modelName}: ${errorMessage.split('\n')[0]}`);

      console.warn(`Groq attempt with ${modelName} failed:`, errorMessage);

      if (errorMessage.includes('API key') || errorMessage.includes('401')) {
        throw new Error('INVALID_API_KEY');
      }

      continue;
    }
  }

  if (lastError?.message === 'INVALID_API_KEY') {
    throw new Error('Your Groq API key appears to be invalid. Please check your settings.');
  }

  const finalMessage = allErrors.length > 0 ? allErrors.join(' | ') : lastError?.message;
  throw new Error(`Groq connection error: ${finalMessage}. Please check your internet and API key.`);
}

function parseResponse(fullText) {
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

export async function* groqChatStream({ apiKey, systemPrompt, history, userMessage, model: preferredModel, searchWeb, forceSearch }) {
  const key = (apiKey && apiKey.trim()) || (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());

  if (!key) {
    throw new Error('No Groq API key configured.');
  }

  const fallbackModels = [
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ];

  const modelsToTry = preferredModel
    ? [preferredModel, ...fallbackModels.filter(m => m !== preferredModel)]
    : fallbackModels;

  function buildMessages(userMsg) {
    return [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.parts[0].text
      })),
      { role: 'user', content: userMsg }
    ];
  }

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const groqMessages = buildMessages(userMessage);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: groqMessages,
          tools: WEB_SEARCH_TOOL,
          tool_choice: forceSearch ? 'required' : 'auto',
          temperature: 0.7,
          max_tokens: 8192,
          top_p: 1,
          stream: true,
          stream_options: { include_usage: false }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let toolCall = null;
      const preambleChunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
          try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.tool_calls?.[0]) {
              const tc = delta.tool_calls[0];
              if (!toolCall) {
                toolCall = { id: tc.id, function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } };
              } else {
                if (tc.id) toolCall.id = tc.id;
                if (tc.function?.name) toolCall.function.name += tc.function.name;
                if (tc.function?.arguments) toolCall.function.arguments += tc.function.arguments;
              }
              continue;
            }

            if (delta?.content) {
              preambleChunks.push(delta.content);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      if (toolCall && toolCall.function.name === 'web_search' && searchWeb) {
        yield { type: 'search', query: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments).query : '' };

        const args = JSON.parse(toolCall.function.arguments);
        const searchResults = await searchWeb(args.query);
        const searchContent = searchResults || 'No results found';

        groqMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.function.name, arguments: toolCall.function.arguments }
          }]
        });
        groqMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: searchContent
        });

        const followUp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            messages: groqMessages,
            temperature: 0.7,
            max_tokens: 8192,
            top_p: 1,
            stream: true,
            stream_options: { include_usage: false }
          })
        });

        if (!followUp.ok) {
          const errData = await followUp.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${followUp.status}`);
        }

        const reader2 = followUp.body.getReader();
        let buffer2 = '';

        while (true) {
          const { done, value } = await reader2.read();
          if (done) break;

          buffer2 += decoder.decode(value, { stream: true });
          const lines = buffer2.split('\n');
          buffer2 = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':') || trimmed === 'data: [DONE]') continue;

            const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
            try {
              const chunk = JSON.parse(jsonStr);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                yield { type: 'token', text: content };
              }
            } catch { /* skip */ }
          }
        }
      } else {
        fullText = preambleChunks.join('');
        for (const chunk of preambleChunks) {
          yield { type: 'token', text: chunk };
        }
      }

      const parsed = parseResponse(fullText);
      yield {
        type: 'done',
        emotion: parsed.emotion,
        animation: parsed.animation,
        text: parsed.text,
      };
      return;

    } catch (error) {
      lastError = error;
      const errorMessage = error.message || '';
      console.warn(`Groq stream attempt with ${modelName} failed:`, errorMessage);
      yield { type: 'error', message: errorMessage };

      if (errorMessage.includes('API key') || errorMessage.includes('401')) {
        throw new Error('INVALID_API_KEY');
      }
      continue;
    }
  }

  throw new Error(lastError?.message || 'All Groq models failed');
}

export default { chat, groqChatStream };
