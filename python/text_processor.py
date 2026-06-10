import re
import random
from emotion_presets import EmotionPreset, NEUTRAL_PRESET

_EMPHASIS_WORDS = {
    "very", "really", "so", "super", "extremely", "absolutely",
    "totally", "completely", "too", "such", "quite",
}


def preprocess_text(text: str, preset: EmotionPreset) -> str:
    if preset is NEUTRAL_PRESET or preset.name == "calm":
        return _basic_clean(text)

    text = _basic_clean(text)

    text = _apply_interjections(text, preset)

    text = _apply_punctuation(text, preset)

    text = _apply_caps(text, preset)

    text = _apply_softeners(text, preset)

    return text.strip()


def _basic_clean(text: str) -> str:
    text = re.sub(r'\*.*?\*', '', text)
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _apply_interjections(text: str, preset: EmotionPreset) -> str:
    if not preset.interjections:
        return text
    if random.random() < 0.3 and len(text) < 60:
        ij = random.choice(preset.interjections)
        text = f"{ij} {text}"
    return text


def _apply_punctuation(text: str, preset: EmotionPreset) -> str:
    if preset.exclamation_to_period:
        text = text.replace("!", ".").replace("!!", ".")

    if preset.add_exclamation:
        text = re.sub(r'[.!?]+$', '', text)
        text += "!"

    if preset.add_ellipsis and random.random() < preset.ellipsis_prob:
        text = re.sub(r'[.!?]+$', '', text)
        if len(text) < 50:
            text += "..."
        else:
            text += "."

    return text


def _apply_caps(text: str, preset: EmotionPreset) -> str:
    if preset.uppercase_all:
        return text.upper()

    if preset.caps_emphasis:
        words = text.split()
        result = []
        for word in words:
            clean = re.sub(r'[^a-zA-Z]', '', word)
            if clean.lower() in _EMPHASIS_WORDS and len(clean) > 2:
                result.append(word.upper())
            else:
                result.append(word)
        text = " ".join(result)

    return text


def _apply_softeners(text: str, preset: EmotionPreset) -> str:
    if not preset.add_softeners:
        return text

    text = re.sub(r'\s+$', '', text)

    if random.random() < 0.4:
        text += "~"

    if random.random() < 0.2 and "♡" not in text and len(text) < 50:
        text += " ♡"

    return text
