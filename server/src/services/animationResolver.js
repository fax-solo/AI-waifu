import path from 'path';
import { readdirSync, existsSync } from 'fs';

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

const BODY_DIR = path.resolve('data/animations/body');

// Text-based body animation matching (middle layer between AI tags and emotion fallback)
const TEXT_TO_BODY = [
  { patterns: ['pose', 'posing', 'strike a pose', 'striking a pose', 'show off', 'catwalk'], value: 'model pose.vrma' },
  { patterns: ['jump', 'jumping', 'jumped', 'leap', 'leaping', 'bounce', 'bouncing', 'hop', 'hopping'], value: 'Jump.vrma' },
  { patterns: ['wave', 'waving', 'wave hello', 'waves', 'hello', 'hey there'], value: 'greeting.vrma' },
  { patterns: ['goodbye', 'bye', 'farewell', 'see you', 'leaving', 'take care', 'see ya'], value: 'Goodbye.vrma' },
  { patterns: ['yawn', 'yawning', 'sleepy', 'drowsy', 'exhausted', 'so tired', 'feeling tired'], value: 'Sleepy.vrma' },
  { patterns: ['blush', 'blushing', 'shy', 'shyly', 'flustered', 'embarrassed'], value: 'Blush.vrma' },
  { patterns: ['think', 'thinking', 'ponder', 'pondering', 'thoughtful', 'consider', 'let me see'], value: 'Thinking.vrma' },
  { patterns: ['look around', 'looks around', 'looking around', 'glance', 'glancing', 'curious', 'curiously', 'searching'], value: 'LookAround.vrma' },
  { patterns: ['spin', 'spinning', 'twirl', 'twirling', 'whirl', 'whirling'], value: 'spin.vrma' },
  { patterns: ['peace', 'victory', 'v-sign', '✌'], value: 'peace sign.vrma' },
  { patterns: ['finger gun', 'finger guns', 'pew pew', 'bang bang'], value: 'shoot.vrma' },
  { patterns: ['surprised', 'shocked', 'amazed', 'startled', 'gasp', 'gasping', 'cant believe'], value: 'Surprised.vrma' },
  { patterns: ['relax', 'relaxing', 'take it easy', 'calm', 'calm down', 'chill', 'chilling', 'breathe', 'breathing', 'deep breath'], value: 'Relax.vrma' },
  { patterns: ['angry', 'anger', 'angrily', 'frustrated', 'irritated', 'annoyed', 'annoying', 'mad'], value: 'Angry.vrma' },
  { patterns: ['sad', 'sadly', 'cry', 'crying', 'sob', 'sobbing', 'upset', 'unhappy', 'depressed', 'melancholy'], value: 'Sad.vrma' },
  { patterns: ['full body', 'show myself', 'present', 'ta-da', 'dramatic reveal', 'look at me'], value: 'show full body.vrma' },
  { patterns: ['welcome', 'warm welcome', 'greet', 'greeting', 'nice to meet'], value: 'greeting.vrma' },
  { patterns: ['excited', 'excitement', 'so excited', 'thrilled', 'can hardly contain'], value: 'Jump.vrma' },
];

// Maps AI emotions to existing VRMA body animation files
const EMOTION_TO_BODY = {
  angry: 'Angry.vrma',
  annoyed: 'Angry.vrma',
  disgust: 'Angry.vrma',
  sad: 'Sad.vrma',
  surprised: 'Surprised.vrma',
  relaxed: 'Relax.vrma',
  tired: 'Sleepy.vrma',
  sleepy: 'Sleepy.vrma',
  happy: 'greeting.vrma',
  joyful: 'Jump.vrma',
  excited: 'Jump.vrma',
  embarrassed: 'Blush.vrma',
  affectionate: 'Blush.vrma',
  loving: 'Blush.vrma',
  playful: 'peace sign.vrma',
  amused: 'peace sign.vrma',
  grateful: 'peace sign.vrma',
  thoughtful: 'Thinking.vrma',
  confusion: 'Thinking.vrma',
  curious: 'LookAround.vrma',
  worried: 'LookAround.vrma',
  nervous: 'LookAround.vrma',
  neutral: 'greeting.vrma',
  smug: 'model pose.vrma',
  proud: 'show full body.vrma',
  fear: 'Surprised.vrma',
};

let bodyFileIndex = [];

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

function matchBodyAnimation(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const group of TEXT_TO_BODY) {
    for (const pattern of group.patterns) {
      if (lower.includes(pattern)) return group.value;
    }
  }
  return null;
}

export function refreshFileIndex() {
  bodyFileIndex = [];
  if (!existsSync(BODY_DIR)) return;
  try {
    const files = readdirSync(BODY_DIR);
    for (const f of files) {
      if (f.endsWith('.vrma')) {
        bodyFileIndex.push(f);
      }
    }
  } catch {}
}

refreshFileIndex();

export function resolveAnimation(userMessage, aiText, aiEmotion, aiAnimationTag = null) {
  const mouthExpression = aiText ? matchMouthExpression(aiText) : null;
  const eyeExpression = aiText ? matchEyeExpression(aiText) : null;

  let animation = null;
  let loop = false;
  let source = 'none';

  // 1. Explicit AI animation tag [animation:filename.vrma] takes priority
  if (aiAnimationTag && bodyFileIndex.includes(aiAnimationTag)) {
    animation = aiAnimationTag;
    source = 'tag';
    loop = false;
  }

  // 2. Text-based keyword matching (user message or AI response text)
  if (!animation) {
    const textMatch = matchBodyAnimation(userMessage) || matchBodyAnimation(aiText);
    if (textMatch && bodyFileIndex.includes(textMatch)) {
      animation = textMatch;
      source = 'text';
      loop = true;
    }
  }

  // 3. Fallback: emotion-based body animation via mapping
  if (!animation && aiEmotion) {
    const mappedFile = EMOTION_TO_BODY[aiEmotion];
    if (mappedFile && bodyFileIndex.includes(mappedFile)) {
      animation = mappedFile;
      source = 'emotion';
      loop = true;
    }
  }

  return {
    animation,
    loop,
    source,
    mouthExpression: mouthExpression || undefined,
    eyeExpression: eyeExpression || undefined,
  };
}

export default { resolveAnimation, refreshFileIndex };
