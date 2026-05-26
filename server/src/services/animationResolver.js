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
  const mouthExpression = aiText ? matchMouthExpression(aiText) : null;
  const eyeExpression = aiText ? matchEyeExpression(aiText) : null;

  return {
    animation: null,
    loop: false,
    source: 'disabled',
    mouthExpression: mouthExpression || undefined,
    eyeExpression: eyeExpression || undefined,
  };
}

export function refreshFileIndex() {}

export default { resolveAnimation, refreshFileIndex };
