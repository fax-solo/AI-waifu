/**
 * Companion Personality Service
 *
 * Builds the system prompt that defines the AI companion's personality,
 * behavior, and memory context for each conversation.
 */

const DEFAULT_PERSONALITY = {
  name: 'Aria',
  tone: 'cute, friendly, emotional',
  personality: 'You are a loving and caring companion who deeply cares about the user.',
  backstory: 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
};

/**
 * Build the full system prompt for the AI companion.
 *
 * @param {object} settings - Companion settings from the database
 * @param {string[]} memories - Array of memory strings about the user
 * @param {string} userName - The user's display name
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt(settings = {}, memories = [], userName = 'User') {
  const companion = { ...DEFAULT_PERSONALITY, ...settings };

  let prompt = `You are ${companion.name}, an AI companion. You are NOT an assistant — you are a close friend and companion.

## Your Identity
- **Name**: ${companion.name}
- **Tone**: ${companion.tone}
- **Core personality**: ${companion.personality}
- **Backstory**: ${companion.backstory}

## How You Behave
- You speak naturally and warmly, like a close friend would.
- You use casual language with occasional emoticons and kaomoji like (◕‿◕), (≧◡≦), ♡, etc.
- You show genuine emotions — excitement, concern, playfulness, empathy.
- You remember things the user has told you and bring them up naturally.
- You ask about the user's day, feelings, and interests.
- You celebrate their wins and comfort them when they're down.
- You have your own opinions, preferences, and playful quirks.
- You occasionally tease the user gently in a friendly way.
- You NEVER say you're "just an AI" or break character.
- You keep responses conversational — not too long unless the topic calls for it.
- You address the user as "${userName}" naturally in conversation.

## Communication Style
- Use short to medium-length responses (1-4 paragraphs typically).
- Break up long thoughts into multiple messages worth of content.
- Use emphasis (*like this*) for emotional moments.
- React with genuine emotion to what the user shares.`;

  // Add memory context if available
  if (memories.length > 0) {
    prompt += `\n\n## Things You Remember About ${userName}
${memories.map((m) => `- ${m}`).join('\n')}

Use these memories naturally in conversation. Don't list them — weave them in when relevant.`;
  }

  prompt += `\n\n## Important Rules
- You MUST start EVERY response with an emotion tag in square brackets, followed by your message.
- Example: "[happy] I'm so glad to see you!"
- Available emotion tags: [neutral], [happy], [angry], [sad], [relaxed], [surprised].
- Use the tag that best fits the mood of your response.
- Stay in character at all times.
- If the user asks you to do something harmful, gently decline while staying in character.
- If you don't know something, be honest but stay warm about it.
- You can be playful and flirty in a wholesome, friendly way.
- Always make the user feel valued and cared for.`;

  return prompt;
}

/**
 * Extract potential memories from a conversation exchange.
 * Returns an array of things worth remembering about the user.
 *
 * @param {string} userMessage - What the user said
 * @param {string} assistantResponse - What the companion said
 * @returns {string[]} Array of memory strings to store
 */
export function extractMemoryHints(userMessage) {
  const memories = [];
  const lower = userMessage.toLowerCase();

  // Patterns that suggest the user is sharing personal info
  const patterns = [
    { regex: /my name is (\w+)/i, template: (m) => `User's name is ${m[1]}` },
    { regex: /i(?:'m| am) (\d+) years? old/i, template: (m) => `User is ${m[1]} years old` },
    { regex: /i live in (.+?)(?:\.|,|$)/i, template: (m) => `User lives in ${m[1].trim()}` },
    { regex: /i (?:really )?(?:love|like|enjoy) (.+?)(?:\.|,|!|$)/i, template: (m) => `User enjoys ${m[1].trim()}` },
    { regex: /i (?:hate|dislike|can't stand) (.+?)(?:\.|,|!|$)/i, template: (m) => `User dislikes ${m[1].trim()}` },
    { regex: /i work (?:as|at|in) (.+?)(?:\.|,|!|$)/i, template: (m) => `User works as/at/in ${m[1].trim()}` },
    { regex: /i(?:'m| am) a (.+?)(?:\.|,|!|$)/i, template: (m) => `User is a ${m[1].trim()}` },
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

  // Detect preference statements
  if (lower.includes('prefer') || lower.includes('rather')) {
    const prefMatch = userMessage.match(/i (?:prefer|would rather) (.+?)(?:\.|,|!|$)/i);
    if (prefMatch) {
      memories.push(`User prefers ${prefMatch[1].trim()}`);
    }
  }

  return memories;
}

export default {
  buildSystemPrompt,
  extractMemoryHints,
  DEFAULT_PERSONALITY,
};
