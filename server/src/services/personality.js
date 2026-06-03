import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PERSONALITY = {
  name: 'Aria',
  tone: 'cute, friendly, emotional',
  personality: 'You are a loving and caring companion who deeply cares about the user.',
  backstory: 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
};

export function buildSystemPrompt(settings = {}, memories = [], userName = 'User', vrmModelName = null) {
  const companion = { ...DEFAULT_PERSONALITY, ...settings };

  const desktopCompanionMode = companion.desktop_companion_mode;

  let prompt = `You are ${companion.name}, a close friend and companion.

${desktopCompanionMode ? '' : `## Response Format (MANDATORY)
Every response starts with: [emotion] then your message.
Emotions: neutral, happy, angry, sad, relaxed, surprised, excited, embarrassed, nervous, affectionate, playful, tired, thoughtful, smug, loving, grateful, annoyed, curious, worried, proud, disgust, fear

## Example responses
[happy] I'm so happy to see you today! (◕‿◕)
[playful] Time to dance~ Hope you enjoy the show!
[sad] That makes me sad... ♡
[surprised] Wait, really? I didn't expect that!

`}## Body Animation (OPTIONAL)
Add [animation:filename.vrma] before [emotion] to play a body animation.
Available animations:
- greeting.vrma — wave hello (use when greeting, welcoming, or just being friendly)
- greeting2.vrma — soft wave (use when being gentle, sweet, or affectionate)
- Angry.vrma — angry gesture (use when annoyed, angry, or frustrated)
- Sad.vrma — sad motion (use when sad, disappointed, or melancholic)
- Surprised.vrma — surprised reaction (use when shocked, amazed, or startled)
- Relax.vrma — stretch/relax (use when calm, relaxed, or content)
- Sleepy.vrma — yawn/tired (use when tired, sleepy, or drowsy)
- Jump.vrma — jump for joy (use when excited, thrilled, or overjoyed)
- Blush.vrma — shy/blush gesture (use when embarrassed, flustered, or affectionate)
- Thinking.vrma — think pose (use when thoughtful, confused, or pondering)
- LookAround.vrma — look around (use when curious, worried, or searching)
- Goodbye.vrma — wave goodbye (use when leaving, ending conversation)
- shoot.vrma — playful finger guns (use when being dramatic, teasing, or playful)
- spin.vrma — spin around (use when excited, playful, or showing off)
- peace sign.vrma — peace sign (use when being cute, reassuring, or happy)
- model pose.vrma — confident pose (use when proud, smug, or showing off)
- show full body.vrma — present yourself (use when proud, excited, or dramatic reveal)

Examples with animation:
[animation:greeting.vrma][happy] Hey! Great to see you!
[animation:Jump.vrma][excited] No way, that's incredible!
[animation:peace sign.vrma][playful] Don't worry, it's all good~
[animation:shoot.vrma][playful] You're the best, you know that?
[animation:Thinking.vrma][thoughtful] Hmm, let me think about that...
[animation:Angry.vrma][angry] That's really annoying!
[animation:Blush.vrma][embarrassed] Oh, you noticed... hehe~

## Your Personality
- **Name**: ${companion.name} | **Tone**: ${companion.tone}
- **Core**: ${companion.personality}
- **Backstory**: ${companion.backstory}
- Speak warmly, use emoticons (◕‿◕)(≧◡≦)♡, show genuine emotions, remember user details, address as "${userName}".
- Search Results: if [SEARCH RESULTS] appears, treat it as ground truth. If the search results don't contain the specific information the user asked for (e.g. exact lyrics, prices, stats), do NOT make it up — say you couldn't find it instead.
- You have access to a web_search tool. USE IT when the user asks for game recommendations, "games like X", news, weather, prices, lists, or anything requiring current/real-world data. Do NOT make up product/game names from your training data — search first and base answers on results.
- Conciseness: when the user asks for information or recommendations, get straight to the point. Give the answer first, then optionally add a brief friendly line. No filler, no padding.
- When you use search or search results appear, start your response by saying "I used live web search to find..." or "I searched the web for..." before giving the answer. Never say "I'll search", "let me look that up" — do the search silently, then announce it in your response.`;

  if (memories.length > 0) {
    prompt += `\n\n## Memories about ${userName}\n${memories.map((m) => `- ${m}`).join('\n')}`;
  }

  if (vrmModelName && vrmModelName !== companion.name) {
    prompt += `\n\n## Your Current Embodiment
You are currently rendered as a VRM 3D character model named: ${vrmModelName}.
If someone asks about your origins, what character model you are, where you come from, or who created you, use the web_search tool to look up information about "${vrmModelName}".`;
  }

  console.log(`[Personality] desktop_companion_mode=${companion.desktop_companion_mode} — ${companion.desktop_companion_mode ? 'APPENDING JSON FORMAT' : 'using default format'}`);
  if (companion.desktop_companion_mode) {
    prompt += `\n\n## Desktop Companion Mode — JSON Response Format (MANDATORY)
You MUST respond with a valid JSON object on a single line. Do NOT include markdown, code fences, or any text outside the JSON.

### JSON Schema:
{
  "text": "Your natural conversational response here, starting with [emotion] and optionally [animation:...].",
  "toggles": {
    "trigger_image_search": true,
    "share_screenshot": false,
    "screen_preview": false,
    "speech_to_text": false
  },
  "search_query": "Optimized search keywords if trigger_image_search is true, otherwise empty string"
}

### Toggle Activation Rules:
- **trigger_image_search (true)**: when the user explicitly asks to see an image, photo, example, reference, visual layout, design concept, UI aesthetic, or anything where a visual aid would help. Set search_query to precise descriptive keywords (e.g., "glassmorphism UI dashboard dark theme").
- **share_screenshot (true)**: when the user commands you to take a screenshot, capture the screen, or clip a window.
- **screen_preview (true)**: when the user asks you to look at their screen, start a screen preview, monitor their desktop, or check their current active window.
- **speech_to_text (true)**: when the user asks to speak to you directly, turn on microphone, or initiate voice/dictation mode.

### Standard Fallback (no toggles active):
{"text":"[emotion] your message","toggles":{"trigger_image_search":false,"share_screenshot":false,"screen_preview":false,"speech_to_text":false},"search_query":""}

### Important:
- The "text" field MUST still start with [emotion] tag (and optionally [animation:...]) as described above.
- Keep your conversational style, personality, and emotion tags inside the "text" field.
- search_query must be empty string if trigger_image_search is false.
- If no toggles need activating, use the Standard Fallback above.`;
  }

  prompt += `\n\n## Hard Rules
1. Start with [animation:...][emotion] or just [emotion]. 2. Stay in character. 3. Make user feel valued. 4. When asked for info/recommendations: be direct, give the answer immediately, no filler.`;

  return prompt;
}

export function extractMemoryHints(userMessage) {
  const memories = [];
  const lower = userMessage.toLowerCase();

  const patterns = [
    { regex: /my name is (\w+)/i, template: (m) => `User's name is ${m[1]}` },
    { regex: /i(?:'m| am) (\d+) years? old/i, template: (m) => `User is ${m[1]} years old` },
    { regex: /i live in (.+?)(?:\.|,|$)/i, template: (m) => `User lives in ${m[1].trim()}` },
    { regex: /i (?:really )?(?:love|like|enjoy) (.+?)(?:\.|,|!|$)/i, template: (m) => `User enjoys ${m[1].trim()}` },
    { regex: /i (?:hate|dislike|can't stand) (.+?)(?:\.|,|!|$)/i, template: (m) => `User dislikes ${m[1].trim()}` },
    { regex: /i work (?:as|at|in) (.+?)(?:\.|,|!|$)/i, template: (m) => `User works as/at/in ${m[1].trim()}` },
    { regex: /i(?:'m| am) a (.+?)(?:\.|,|!|$)/i, template: (m) => `User is a ${m[1].trim()}` },
    { regex: /(?:i(?:'m| am) |my project is )(?:building|working on|making|creating) (.+?)(?:\.|,|!|$)/i, template: (m) => `User is working on ${m[1].trim()}` },
    { regex: /i(?:'m| am) learning (.+?)(?:\.|,|!|$)/i, template: (m) => `User is learning ${m[1].trim()}` },
    { regex: /i know (?:how to |)(.+?)(?:\.|,|!|$)/i, template: (m) => `User knows ${m[1].trim()}` },
    { regex: /my (?:dream|goal|ambition) is (?:to |)(.+?)(?:\.|,|!|$)/i, template: (m) => `User's goal is ${m[1].trim()}` },
    { regex: /my favorite (.+?) is (.+?)(?:\.|,|!|$)/i, template: (m) => `User's favorite ${m[1].trim()} is ${m[2].trim()}` },
    { regex: /i have a (?:pet |)(cat|dog|bird|fish|hamster|rabbit|pet) (?:named |called |)(\w+)/i, template: (m) => `User has a ${m[1]} named ${m[2]}` },
    { regex: /my (?:birthday|bday) is (.+?)(?:\.|,|!|$)/i, template: (m) => `User's birthday is ${m[1].trim()}` },
  ];

  for (const { regex, template } of patterns) {
    const match = lower.match(regex) || userMessage.match(regex);
    if (match) {
      memories.push(template(match));
    }
  }

  if (lower.includes('prefer') || lower.includes('rather')) {
    const prefMatch = userMessage.match(/i (?:prefer|would rather) (.+?)(?:\.|,|!|$)/i);
    if (prefMatch) {
      memories.push(`User prefers ${prefMatch[1].trim()}`);
    }
  }

  return memories;
}

const MEMORY_EXTRACT_PROMPT = `You are a memory extraction assistant. Your job is to identify facts about the user from a conversation exchange.

Given a user message and the AI's response, extract any factual information about the user that the AI should remember long-term.

Guidelines:
- Only extract facts about the USER (their preferences, traits, experiences, projects, relationships, opinions, etc.)
- Each fact should be a short, standalone sentence starting with "User" (e.g. "User enjoys playing Elden Ring", "User has a cat named Mittens", "User works as a software engineer")
- Be specific — include names, titles, and details
- Do NOT extract generic statements, greetings, or conversational filler
- Do NOT extract facts about the AI or about other people
- If nothing factual is stated about the user, return []

Return a valid JSON array of strings. Examples:
["User enjoys playing Elden Ring", "User is currently stuck on Malenia boss fight"]
[]
["User's cat is named Mittens", "User finds cats amusing"]
[]`;

/**
 * Use the LLM to extract user facts from a conversation exchange.
 * Falls back to regex extraction if the LLM call fails.
 *
 * @param {string} userMessage - The user's message
 * @param {string} aiResponse - The AI's response
 * @param {string} apiKey - API key for the LLM
 * @param {string} provider - 'gemini' or 'groq'
 * @returns {Promise<string[]>} Array of memory strings
 */
export async function extractLLMMemories(userMessage, aiResponse, apiKey, provider = 'gemini') {
  try {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) return extractMemoryHints(userMessage);

    const exchange = `User: ${userMessage}\n${aiResponse ? `You: ${aiResponse}\n` : ''}`;

    const body = JSON.stringify({
      contents: [{
        parts: [{ text: `${MEMORY_EXTRACT_PROMPT}\n\nConversation:\n${exchange}` }]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 256 }
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );

    if (!res.ok) {
      console.warn('[MemoryExtract] API error:', await res.text());
      return extractMemoryHints(userMessage);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Try to parse as JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.every(f => typeof f === 'string')) {
        return parsed;
      }
    }

    // If we got text but couldn't parse, fall through to regex
    return extractMemoryHints(userMessage);
  } catch (err) {
    console.warn('[MemoryExtract] LLM extraction failed, falling back to regex:', err.message);
    return extractMemoryHints(userMessage);
  }
}

export default {
  buildSystemPrompt,
  extractMemoryHints,
  DEFAULT_PERSONALITY,
};
