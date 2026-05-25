const SUMMARY_PROMPT = `You are a conversation summarizer. Condense the following chat messages into a concise, bullet-point summary that captures the key topics, facts, decisions, and emotional context discussed.

Guidelines:
- Keep it brief: 3-8 bullet points max
- Preserve important facts about the user (name, preferences, projects, goals)
- Preserve any decisions or plans made
- Note the overall mood/tone of the interaction
- Use the user's name if known, otherwise refer to "User"
- Write in present tense
- If this is an update to an existing summary, merge the new information with the old, avoiding redundancy`;

function buildGeminiRequestBody(messages, existingSummary) {
  let text = '';
  if (existingSummary) {
    text += `Existing summary:\n${existingSummary}\n\n`;
  }
  text += `Messages to summarize:\n\n`;
  for (const msg of messages) {
    text += `[${msg.role === 'model' ? 'Assistant' : 'User'}]: ${msg.content}\n\n`;
  }
  text += `\nProvide an updated bullet-point summary consolidating all information:`;

  return {
    contents: [{ parts: [{ text }] }],
    systemInstruction: { parts: [{ text: SUMMARY_PROMPT }] },
    generationConfig: {
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: 512,
    },
  };
}

function buildGroqRequestBody(messages, existingSummary) {
  let content = '';
  if (existingSummary) {
    content += `Existing summary:\n${existingSummary}\n\n`;
  }
  content += `Messages to summarize:\n\n`;
  for (const msg of messages) {
    content += `[${msg.role === 'model' ? 'Assistant' : 'User'}]: ${msg.content}\n\n`;
  }
  content += `\nProvide an updated bullet-point summary consolidating all information:`;

  return {
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content },
    ],
    temperature: 0.3,
    max_tokens: 512,
  };
}

async function summarizeWithGemini(apiKey, messages, existingSummary) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No Gemini API key for summarization');

  const body = buildGeminiRequestBody(messages, existingSummary);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini summarization failed: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function summarizeWithGroq(apiKey, messages, existingSummary) {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('No Groq API key for summarization');

  const body = buildGroqRequestBody(messages, existingSummary);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Groq summarization failed: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function summarizeConversation({ apiKey, provider, messages, existingSummary }) {
  try {
    if (!messages || messages.length === 0) return existingSummary || '';

    const providerToUse = provider || 'gemini';

    let summary;
    if (providerToUse === 'groq') {
      summary = await summarizeWithGroq(apiKey, messages, existingSummary);
    } else {
      summary = await summarizeWithGemini(apiKey, messages, existingSummary);
    }

    return summary || existingSummary || '';
  } catch (err) {
    console.warn('[Summarize] Failed to summarize conversation:', err.message);
    return existingSummary || '';
  }
}

export default { summarizeConversation };
