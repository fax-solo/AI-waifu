/**
 * Animation Resolver Service
 *
 * Unified server-side engine that decides which BVH animation to play
 * based on the user's request, the AI's response, and the detected emotion.
 *
 * Priority order:
 *   1. AI-provided [animation:...] tag (if file exists on disk)
 *   2. Explicit user action request ("can you dance?", "wave at me")
 *   3. AI response sentiment analysis ("I'm so happy!", "that makes me sad")
 *   4. Emotion tag → animation fallback
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BODY_DIR = path.resolve(__dirname, '../../data/animations/body');

// ── Build a file index on startup ─────────────────────────────────
let _fileIndex = null;

function getFileIndex() {
  if (_fileIndex) return _fileIndex;
  _fileIndex = new Set();
  try {
    if (fs.existsSync(BODY_DIR)) {
      for (const f of fs.readdirSync(BODY_DIR)) {
        if (f.endsWith('.bvh') || f.endsWith('.vrma')) _fileIndex.add(f.toLowerCase());
      }
    }
  } catch { /* empty */ }
  return _fileIndex;
}

/** Check if an animation file exists (case-insensitive, supports .bvh and .vrma). */
function fileExists(filename) {
  if (!filename) return false;
  return getFileIndex().has(filename.toLowerCase());
}

/** Pick a random variant from available files. e.g. "joy" → "joy.vrma"|"joy.bvh"|"joy2.bvh" */
function pickVariant(baseName, exclude = null, requestedVersion = null) {
  const index = getFileIndex();
  const bvhVariants = [];
  const vrmaVariants = [];
  // Strip extension and version suffix for base matching
  const base = baseName.toLowerCase().replace(/\.(bvh|vrma)$/, '').replace(/_1$/, '');
  const extRe = /\.(bvh|vrma)$/;

  for (const f of index) {
    const stripped = f.replace(extRe, '');
    // Exact match or base + number/suffix match
    if (stripped === base || stripped.match(new RegExp(`^${escapeRegex(base)}_?\\d+$`))) {
      if (f.endsWith('.vrma')) vrmaVariants.push(f);
      else bvhVariants.push(f);
    }
  }

  // Prefer VRMA over BVH when both exist for the same animation
  const variants = vrmaVariants.length > 0 ? vrmaVariants : bvhVariants;
  if (variants.length === 0) return null;

  // If a specific version is requested, try to find it
  if (requestedVersion) {
    const targetSuffix = new RegExp(`_?${requestedVersion}(\\.(bvh|vrma))?$`);
    const specificVariant = variants.find(v => v.match(targetSuffix));
    if (specificVariant) return specificVariant;
  }

  // Prefer a different variant than the last one played
  if (exclude && variants.length > 1) {
    const filtered = variants.filter(v => v !== exclude.toLowerCase());
    if (filtered.length > 0) {
      return filtered[Math.floor(Math.random() * filtered.length)];
    }
  }

  return variants[Math.floor(Math.random() * variants.length)];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Intent categories ─────────────────────────────────────────────
// Each entry: { keywords, phrases, base, loop }
// - keywords: single words that indicate this intent (word-boundary matched)
// - phrases: multi-word phrases (substring matched)
// - base: base BVH filename (without number suffix)
// - loop: whether the animation should loop
// - requiresAction: if true, only match when user is clearly requesting an action

const ACTION_INTENTS = [
  // Greetings
  { keywords: ['wave', 'waving', 'greet', 'greeting'], phrases: ['say hello', 'say hi', 'wave at'], base: 'action_greeting', loop: false },

  // Dance
  { keywords: ['dance', 'dancing', 'boogie', 'groove'], phrases: ['show me a dance', 'do a dance', 'dance for me', 'let me see you dance'], base: 'dance_1', loop: true },

  // Movement
  { keywords: ['run', 'running', 'sprint'], phrases: ['start running', 'run for me', 'can you run'], base: 'action_run', loop: true, requiresAction: true },
  { keywords: ['jog', 'jogging'], phrases: ['go jogging', 'start jogging'], base: 'action_jog', loop: true },
  { keywords: ['jump', 'jumping', 'leap', 'hop'], phrases: ['do a jump', 'can you jump'], base: 'action_jump', loop: false },
  { keywords: ['crawl', 'crawling'], phrases: ['crawl around'], base: 'action_crawling', loop: true },
  { keywords: ['crouch', 'crouching', 'squat'], phrases: ['crouch down'], base: 'action_crouch', loop: false },

  // Poses
  { keywords: [], phrases: ['lay down', 'lie down', 'go to sleep', 'take a nap'], base: 'action_laydown', loop: false },
  { keywords: [], phrases: ['stand up', 'get up'], base: 'action_standup', loop: false },
  { keywords: ['sit', 'sitting'], phrases: ['sit down', 'take a seat', 'have a seat'], base: 'sit_idle', loop: true, requiresAction: true },

  // Exercise
  { keywords: ['exercise', 'workout'], phrases: ['work out', 'do some exercise', 'let\'s exercise'], base: 'exercise_jumping_jacks', loop: true },
  { keywords: [], phrases: ['jumping jacks', 'jumping jack'], base: 'exercise_jumping_jacks', loop: true },
  { keywords: ['crunch', 'crunches', 'situp', 'situps'], phrases: ['do crunches', 'do sit ups'], base: 'exercise_crunch', loop: true },
];

const RESPONSE_ACTIONS = [
  { patterns: ['sits down', 'sitting down', 'sit down', 'taking a seat', 'take a seat'], base: 'sit_idle' },
  { patterns: ['stands up', 'standing up', 'stand up', 'getting up', 'get up'], base: 'action_standup' },
  { patterns: ['lays down', 'laying down', 'lay down', 'lie down', 'lying down'], base: 'action_laydown' },
  { patterns: ['let me dance', 'watch me dance', 'time to dance', 'dancing', 'starts dancing'], base: 'dance_1' },
  { patterns: ['waves at you', 'waving', 'waves hello'], base: 'action_greeting' },
  { patterns: ['jumps up', 'jumping around', 'jumping for joy'], base: 'action_jump' },
];

// Mouth expression patterns detected in AI response text
const RESPONSE_MOUTH = [
  { patterns: ['smiles', 'smiling', 'with a smile', 'smile at you', 'gives a smile', 'flashes a smile'], value: 'smile' },
  { patterns: ['frowns', 'frowning', 'with a frown', 'pouts', 'pouting'], value: 'frown' },
  { patterns: ['mouth open', 'open-mouthed', 'jaw drops', 'gapes', 'gaping'], value: 'open' },
  { patterns: ['gasp', 'gasps', 'gasping'], value: 'surprised' },
  { patterns: ['mouth wide', 'wide mouth', 'wide-open'], value: 'wide' },
  { patterns: ['purses lips', 'pursed lips', 'puckers', 'puckered'], value: 'pucker' },
  { patterns: ['grins', 'grinning', 'grin at you', 'with a grin', 'gives a grin'], value: 'smile' },
  { patterns: ['bites lip', 'biting lip', 'lip bite'], value: 'pucker' },
];

// Eye expression patterns detected in AI response text
const RESPONSE_EYES = [
  { patterns: ['winks', 'winking', 'gives a wink', 'with a wink', 'wink at you'], value: 'wink_left' },
  { patterns: ['eye wide', 'eyes wide', 'wide-eyed', 'wide eyes'], value: 'wide' },
  { patterns: ['eyes narrow', 'narrows eyes', 'squints', 'squinting'], value: 'angry' },
  { patterns: ['rolls eyes', 'eye roll', 'rolls her eyes', 'rolls his eyes'], value: 'neutral' },
  { patterns: ['eyes light up', 'eyes sparkle', 'eyes sparkled'], value: 'happy' },
  { patterns: ['teary-eyed', 'teary eyes', 'eyes well up', 'eyes filled with tears'], value: 'sad' },
  { patterns: ['eyes widen', 'eyes wide in', 'widens eyes', 'eyes went wide'], value: 'surprised' },
  { patterns: ['blinks', 'blinking', 'rapid blinking'], value: 'neutral' },
];

// Emotion keywords detected in AI response text
const RESPONSE_SENTIMENT = [
  { patterns: ['so happy', 'really happy', 'that\'s wonderful', 'amazing', 'that\'s great', 'awesome', 'fantastic', 'love that', 'love it', 'yay', 'woohoo', 'hooray'], base: 'joy' },
  { patterns: ['so sad', 'that\'s sad', 'i\'m sorry to hear', 'that\'s terrible', 'how awful', 'breaks my heart', 'feel bad'], base: 'sadness' },
  { patterns: ['so angry', 'that makes me mad', 'furious', 'outrageous', 'unacceptable', 'how dare'], base: 'anger' },
  { patterns: ['hahaha', 'lol', 'that\'s hilarious', 'so funny', 'cracking up', 'laughing', 'haha'], base: 'amusement' },
  { patterns: ['really?!', 'no way', 'i can\'t believe', 'what?!', 'oh my', 'seriously?', 'whoa', 'wow'], base: 'surprise' },
  { patterns: ['i love you', 'you\'re so sweet', 'you mean so much', 'love you', 'you\'re the best', 'adore you', 'hugs', '*hugs*', '*hug*'], base: 'love' },
  { patterns: ['that\'s scary', 'i\'m scared', 'frightening', 'terrifying', 'oh no'], base: 'fear' },
  { patterns: ['ew', 'gross', 'disgusting', 'that\'s nasty', 'yuck'], base: 'disgust' },
  { patterns: ['so excited', 'can\'t wait', 'thrilling', 'pumped', 'hyped', 'thrilled'], base: 'excitement' },
  { patterns: ['*blushes*', 'blushing', 'so embarrassing', 'how embarrassing', 'oh gosh'], base: 'embarrassment' },
  { patterns: ['i\'m nervous', 'a bit anxious', 'butterflies', 'worried about'], base: 'nervousness' },
  { patterns: ['hmm', 'interesting', 'i wonder', 'curious', 'that\'s intriguing', 'fascinating'], base: 'curiosity' },
  { patterns: ['i\'m proud', 'so proud', 'well done', 'great job', 'impressive'], base: 'pride' },
  { patterns: ['thank you', 'thanks so much', 'i appreciate', 'grateful', 'thankful'], base: 'gratitude' },
];

// Emotion tag → BVH base name mapping (fallback)
const EMOTION_TO_BVH = {
  happy: 'joy',
  sad: 'sadness',
  angry: 'anger',
  surprised: 'surprise',
  excited: 'excitement',
  embarrassed: 'embarrassment',
  nervous: 'nervousness',
  affectionate: 'love',
  playful: 'amusement',
  thoughtful: 'confusion',
  smug: 'pride',
  loving: 'love',
  grateful: 'admiration',
  annoyed: 'annoyance',
  curious: 'curiosity',
  worried: 'fear',
  proud: 'pride',
  relaxed: 'neutral',
  disgust: 'disgust',
  fear: 'fear'
};

// Track last animation to avoid repetition
let _lastAnimation = null;

/**
 * Main resolver function.
 *
 * @param {string} userMessage - The user's original chat message
 * @param {string} aiText - The AI's response text (without tags)
 * @param {string} aiEmotion - The parsed emotion tag from the AI
 * @param {string|null} aiAnimationTag - The AI's [animation:...] tag value (if any)
 * @returns {{ animation: string|null, loop: boolean, source: string }}
 */
function matchMouthExpression(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const group of RESPONSE_MOUTH) {
    for (const pattern of group.patterns) {
      if (lower.includes(pattern)) return group.value;
    }
  }
  return null;
}

function matchEyeExpression(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const group of RESPONSE_EYES) {
    for (const pattern of group.patterns) {
      if (lower.includes(pattern)) return group.value;
    }
  }
  return null;
}

export function resolveAnimation(userMessage, aiText, aiEmotion, aiAnimationTag = null) {
  // Detect mouth/eye expressions from AI text
  const mouthExpression = aiText ? matchMouthExpression(aiText) : null;
  const eyeExpression = aiText ? matchEyeExpression(aiText) : null;
  
  // Extract requested version if present in user message
  const versionMatch = userMessage ? (userMessage.match(/version\s*(\d+)/i) || userMessage.match(/\bv\s*(\d+)\b/i) || userMessage.match(/number\s*(\d+)/i) || userMessage.match(/part\s*(\d+)/i)) : null;
  const requestedVersion = versionMatch ? versionMatch[1] : null;

  // Helper to determine if an animation should loop based on its name
  const shouldLoop = (filename) => {
    const name = filename.toLowerCase();
    return name.includes('dance') || name.includes('sit') || name.includes('lay') || 
           name.includes('kneel') || name.includes('walk') || name.includes('run') || 
           name.includes('idle');
  };

  const makeResult = (anim, loop, source) => ({
    animation: anim, loop, source,
    mouthExpression: mouthExpression || undefined,
    eyeExpression: eyeExpression || undefined,
  });

  // ── 1. Explicit user action request ──
  const userAction = matchUserIntent(userMessage);
  if (userAction) {
    const variant = pickVariant(userAction.base, _lastAnimation, requestedVersion);
    if (variant) {
      console.log(`[AnimResolver] User intent "${userAction.matched}" → ${variant} (Requested Version: ${requestedVersion || 'none'})`);
      _lastAnimation = variant;
      return makeResult(variant, userAction.loop, 'user_intent');
    }
  }

  // ── 2. Explicit AI action description ──
  if (aiText) {
    const aiAction = matchResponseActions(aiText);
    if (aiAction) {
      const variant = pickVariant(aiAction.base, _lastAnimation, requestedVersion);
      if (variant) {
        console.log(`[AnimResolver] AI action text "${aiAction.matched}" → ${variant}`);
        _lastAnimation = variant;
        return makeResult(variant, ['sit_idle', 'action_laydown', 'kneel_idle', 'dance_1'].includes(aiAction.base), 'ai_action_text');
      }
    }
  }

  // ── 3. AI-provided animation tag (validated) ──
  if (aiAnimationTag) {
    const tag = aiAnimationTag.toLowerCase();
    const tagVersionMatch = tag.match(/(?:version|v|number|_|\s)+(\d+)(?:\.bvh)?$/i);
    const tagVersion = tagVersionMatch ? tagVersionMatch[1] : requestedVersion;
    
    if (fileExists(tag)) {
      console.log(`[AnimResolver] Using AI tag: ${tag}`);
      _lastAnimation = tag;
      return makeResult(tag, shouldLoop(tag), 'ai_tag');
    }
    
    const base = tag.replace(/\.bvh$/, '').replace(/(?:version|v|number|_|\s)+(\d+)$/i, '').replace(/\d+$/, '');
    const variant = pickVariant(base, _lastAnimation, tagVersion);
    if (variant) {
      console.log(`[AnimResolver] AI tag "${tag}" not found, resolved variant: ${variant}`);
      _lastAnimation = variant;
      return makeResult(variant, shouldLoop(variant), 'ai_tag_corrected');
    }
    console.warn(`[AnimResolver] AI tag "${tag}" has no matching file, falling through`);
  }

  // ── 4. AI response sentiment ──
  if (aiText) {
    const sentiment = matchResponseSentiment(aiText);
    if (sentiment) {
      const variant = pickVariant(sentiment.base, _lastAnimation, requestedVersion);
      if (variant) {
        console.log(`[AnimResolver] AI sentiment "${sentiment.matched}" → ${variant}`);
        _lastAnimation = variant;
        return makeResult(variant, true, 'response_sentiment');
      }
    }
  }

  // ── 5. Emotion tag fallback ──
  if (aiEmotion && aiEmotion !== 'neutral') {
    const base = EMOTION_TO_BVH[aiEmotion];
    if (base) {
      const variant = pickVariant(base, _lastAnimation, requestedVersion);
      if (variant) {
        console.log(`[AnimResolver] Emotion fallback "${aiEmotion}" → ${variant}`);
        _lastAnimation = variant;
        return makeResult(variant, true, 'emotion_fallback');
      }
    }
  }

  // No animation needed
  return makeResult(null, false, 'none');
}

/**
 * Match explicit user action requests.
 * Returns { base, loop, matched } or null.
 */
function matchUserIntent(message) {
  if (!message) return null;
  const lower = message.toLowerCase();

  // Check if the message looks like an action request
  // (contains question marks, imperatives, "can you", "show me", etc.)
  const isRequest = /\?|can you|could you|please|show me|do a|let me see|i want to see|try to|go ahead/i.test(lower);

  for (const intent of ACTION_INTENTS) {
    // Check multi-word phrases first (higher specificity)
    for (const phrase of intent.phrases) {
      if (lower.includes(phrase)) {
        return { base: intent.base, loop: intent.loop, matched: phrase };
      }
    }

    // Check single keywords with word boundary
    for (const kw of intent.keywords) {
      // For action-gated intents (run, walk, sit), only match if the user is clearly requesting an action
      if (intent.requiresAction && !isRequest) continue;

      const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
      if (pattern.test(lower)) {
        // Guard: "running late" / "walk me through" / "sit tight" are NOT action requests
        if (hasNonActionContext(lower, kw)) continue;
        return { base: intent.base, loop: intent.loop, matched: kw };
      }
    }
  }

  return null;
}

/**
 * Check if a keyword appears in a non-action context.
 * e.g. "running late", "walk me through", "sit tight"
 */
function hasNonActionContext(text, keyword) {
  const NON_ACTION_PHRASES = {
    run: ['running late', 'run into', 'run out of', 'in the long run', 'run of'],
    walk: ['walk me through', 'walk through', 'walkthrough', 'walk away from'],
    sit: ['sit tight', 'sit well', 'sit right'],
    stand: ['stand for', 'stand out', 'can\'t stand', 'stand by', 'stand a chance'],
    jump: ['jump to conclusions', 'jump the gun', 'jump ahead', 'jump ship'],
  };

  const phrases = NON_ACTION_PHRASES[keyword.toLowerCase()];
  if (!phrases) return false;
  return phrases.some(p => text.includes(p));
}

/**
 * Analyze AI response text for explicitly described physical actions.
 * Returns { base, matched } or null.
 */
function matchResponseActions(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const group of RESPONSE_ACTIONS) {
    for (const pattern of group.patterns) {
      if (lower.includes(pattern)) {
        return { base: group.base, matched: pattern };
      }
    }
  }

  return null;
}

/**
 * Analyze AI response text for emotional sentiment.
 * Returns { base, matched } or null.
 */
function matchResponseSentiment(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const group of RESPONSE_SENTIMENT) {
    for (const pattern of group.patterns) {
      if (lower.includes(pattern)) {
        return { base: group.base, matched: pattern };
      }
    }
  }

  return null;
}

/** Force-refresh the file index (call after uploading new animations). */
export function refreshFileIndex() {
  _fileIndex = null;
  getFileIndex();
}

export default { resolveAnimation, refreshFileIndex };
