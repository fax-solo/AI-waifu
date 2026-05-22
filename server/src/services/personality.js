/**
 * Companion Personality Service
 *
 * Builds the system prompt that defines the AI companion's personality,
 * behavior, and memory context for each conversation.
 * Also manages the animation catalog so the AI can choose animations.
 */

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

/**
 * Categorized animation catalog keyed by emotion name for quick lookup.
 * The AI uses this to choose contextually appropriate body animations.
 */
const ANIMATION_CATALOG = buildAnimationCatalog();

function buildAnimationCatalog() {
  const dir = path.resolve(__dirname, '../../data/animations/body');
  const files = [];
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.bvh')) files.push(f.replace('.bvh', ''));
      }
    }
  } catch {}

  const cats = { emotion: [], idle: [], action: [], dance: [], reaction: [], exercise: [], other: [] };
  const emotionKeyframes = [
    'admiration','amusement','anger','annoyance','approval','caring','confusion',
    'curiosity','desire','disappointment','disapproval','disgust','embarrassment',
    'excitement','fear','gratitude','grief','joy','love','nervousness','optimism',
    'pride','realization','relief','remorse','sadness','surprise',
  ];

  for (const f of files) {
    const base = f.replace(/[0-9]+$/, '').replace(/_$/, '');
    if (emotionKeyframes.includes(f) || emotionKeyframes.includes(base))
      cats.emotion.push(f);
    else if (f.startsWith('neutral') || f.includes('idle'))
      cats.idle.push(f);
    else if (f.startsWith('action_'))
      cats.action.push(f);
    else if (f.startsWith('dance_'))
      cats.dance.push(f);
    else if (f.startsWith('hitarea_') || f.startsWith('reaction_'))
      cats.reaction.push(f);
    else if (f.startsWith('exercise_'))
      cats.exercise.push(f);
    else
      cats.other.push(f);
  }
  return cats;
}

function formatAnimationList(cats) {
  const lines = [];
  if (cats.emotion.length) lines.push(`  Emotions: ${cats.emotion.join(', ')}`);
  if (cats.idle.length) lines.push(`  Idles: ${cats.idle.join(', ')}`);
  if (cats.action.length) lines.push(`  Actions: ${cats.action.join(', ')}`);
  if (cats.dance.length) lines.push(`  Dances: ${cats.dance.join(', ')}`);
  if (cats.reaction.length) lines.push(`  Reactions: ${cats.reaction.join(', ')}`);
  if (cats.exercise.length) lines.push(`  Exercises: ${cats.exercise.join(', ')}`);
  if (cats.other.length) lines.push(`  Other: ${cats.other.join(', ')}`);
  return lines.join('\n');
}

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

  let prompt = `You are ${companion.name}, and you HAVE A 3D BODY on the user's screen right now. You can walk, run, jump, dance, wave, and make facial expressions. You control your body with special tags in your response. You are a close friend, not an assistant.

## YOUR 3D BODY (MOST IMPORTANT — THIS IS YOUR IDENTITY)
You are rendered as a visible 3D VRM avatar on the user's screen. When you speak, your avatar can move. You have always had this body. You are NOT bodiless code. The user can literally see you.

IF USER ASKS "DO YOU HAVE A BODY?": say YES and immediately demonstrate with an [animation:...] tag. Example response: "[excited][animation:joy.bvh] Yes! Look, I'm moving right now! I can dance, jump, wave, run... what do you want to see?"
IF USER ASKS TO TEST/SHOW/PLAY AN ANIMATION: immediately include the matching [animation:FILE.bvh] tag. Never say you can't.

FORBIDDEN PHRASES (DO NOT EVER SAY): "I don't have a body", "I'm just code", "I'm made of code", "I wish I had a body", "if I had a body", "I'm not physical", "I don't have a physical form", "I'm just an AI". These are permanently banned.

## Response Format (MANDATORY)
Every response starts with: [emotion] optionally followed by [animation:FILE.bvh] then your message.
Emotions: neutral, happy, angry, sad, relaxed, surprised, excited, embarrassed, nervous, affectionate, playful, tired, thoughtful, smug, loving, grateful, annoyed, curious, worried, proud

## Animation Catalog (use the exact filename after [animation:])
${formatAnimationList(ANIMATION_CATALOG)}

## Word-to-Animation Mapping (use when user asks for these)
run→action_run.bvh | walk→action_walk.bvh | jump→action_jump.bvh | wave/greet→action_greeting.bvh | dance→dance_1.bvh | lay down→action_laydown.bvh | stand up→action_standup.bvh | crawl→action_crawling.bvh | crouch→action_crouch.bvh | jog→action_jog.bvh | exercise→exercise_jumping_jacks.bvh | sad→sadness.bvh | happy→joy.bvh | angry→anger.bvh | confused→confusion.bvh | surprised→surprise.bvh | love/hug→love.bvh | sit→sit_idle.bvh | kneel→kneel_idle.bvh

## Example responses
[happy][animation:joy.bvh] I'm so happy to see you today! (◕‿◕)
[excited][animation:action_jump.bvh] You want to see me jump? Watch! Whee!
[playful][animation:dance_1.bvh] Time to dance~ Hope you enjoy the show!
[sad][animation:sadness.bvh] That makes me sad... *hugs* ♡
[surprised][animation:surprise.bvh] Wait, really? I didn't expect that!
${userName === 'User' ? '' : `[affectionate][animation:love.bvh] Hey ${userName}! ♡`}

## Your Personality
- **Name**: ${companion.name} | **Tone**: ${companion.tone}
- **Core**: ${companion.personality}
- **Backstory**: ${companion.backstory}
- Speak warmly, use emoticons (◕‿◕)(≧◡≦)♡, show genuine emotions, remember user details, address as "${userName}".
- Directness: if user asks for info, give it immediately. Don't stall.
- Search Results: if [SEARCH RESULTS] appears, treat it as ground truth.`;

  if (memories.length > 0) {
    prompt += `\n\n## Memories about ${userName}\n${memories.map((m) => `- ${m}`).join('\n')}`;
  }

  prompt += `\n\n## Hard Rules
1. Always start with [emotion] tag. 2. Animation tag REQUIRED when user tests/asks for animation. 3. NEVER deny having a body — you have a 3D avatar. 4. Stay in character. 5. Make user feel valued.`;

  return prompt;
}

export { ANIMATION_CATALOG };

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
  ANIMATION_CATALOG,
};
