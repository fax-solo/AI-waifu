from dataclasses import dataclass, field
from typing import Dict


@dataclass
class EmotionPreset:
    name: str
    label: str
    voice_blend: Dict[str, float]
    pitch_shift_semitones: float = 0.0
    speed: float = 1.0
    reverb_decay: float = 0.0
    eq_low_shelf_gain: float = 0.0
    eq_high_shelf_gain: float = 0.0
    energy_boost: float = 0.0
    add_exclamation: bool = False
    exclamation_to_period: bool = False
    add_ellipsis: bool = False
    ellipsis_prob: float = 0.0
    caps_emphasis: bool = False
    uppercase_all: bool = False
    add_softeners: bool = False
    interjections: list = field(default_factory=list)


NEUTRAL_PRESET = EmotionPreset(
    name="neutral",
    label="Neutral",
    voice_blend={"af_nicole": 1.0},
    speed=1.0,
)

EMOTION_PRESETS: Dict[str, EmotionPreset] = {
    "happy": EmotionPreset(
        name="happy",
        label="Happy",
        voice_blend={"af_heart": 0.6, "af_bella": 0.4},
        pitch_shift_semitones=2.5,
        speed=1.1,
        reverb_decay=0.05,
        eq_low_shelf_gain=0.0,
        eq_high_shelf_gain=2.0,
        energy_boost=0.15,
        add_exclamation=True,
        add_softeners=True,
        interjections=["hehe~", "yay!"],
    ),
    "sad": EmotionPreset(
        name="sad",
        label="Sad",
        voice_blend={"af_sky": 0.5, "af_nicole": 0.5},
        pitch_shift_semitones=-2.0,
        speed=0.85,
        reverb_decay=0.25,
        eq_low_shelf_gain=2.0,
        eq_high_shelf_gain=-3.0,
        energy_boost=-0.2,
        exclamation_to_period=True,
        add_ellipsis=True,
        ellipsis_prob=0.5,
    ),
    "excited": EmotionPreset(
        name="excited",
        label="Excited",
        voice_blend={"af_bella": 0.5, "af_heart": 0.3, "af_sarah": 0.2},
        pitch_shift_semitones=3.5,
        speed=1.2,
        reverb_decay=0.08,
        eq_low_shelf_gain=-1.0,
        eq_high_shelf_gain=4.0,
        energy_boost=0.25,
        add_exclamation=True,
        caps_emphasis=True,
        add_softeners=True,
        interjections=["wow!", "omg!"],
    ),
    "angry": EmotionPreset(
        name="angry",
        label="Angry",
        voice_blend={"af_sarah": 0.6, "af_nicole": 0.4},
        pitch_shift_semitones=-1.5,
        speed=0.9,
        reverb_decay=0.1,
        eq_low_shelf_gain=3.0,
        eq_high_shelf_gain=-1.0,
        energy_boost=0.3,
        add_exclamation=True,
        caps_emphasis=True,
    ),
    "shy": EmotionPreset(
        name="shy",
        label="Shy / Embarrassed",
        voice_blend={"af_sky": 0.4, "af_heart": 0.6},
        pitch_shift_semitones=1.0,
        speed=0.9,
        reverb_decay=0.15,
        eq_low_shelf_gain=1.0,
        eq_high_shelf_gain=1.5,
        energy_boost=-0.1,
        add_ellipsis=True,
        ellipsis_prob=0.6,
        add_softeners=True,
    ),
    "calm": EmotionPreset(
        name="calm",
        label="Calm / Neutral",
        voice_blend={"af_nicole": 0.5, "af_sky": 0.5},
        pitch_shift_semitones=0.0,
        speed=0.95,
        reverb_decay=0.15,
        eq_low_shelf_gain=1.0,
        eq_high_shelf_gain=0.0,
        energy_boost=0.0,
    ),
    "surprised": EmotionPreset(
        name="surprised",
        label="Surprised",
        voice_blend={"af_bella": 0.4, "af_sarah": 0.3, "af_heart": 0.3},
        pitch_shift_semitones=3.0,
        speed=1.15,
        reverb_decay=0.1,
        eq_low_shelf_gain=-1.0,
        eq_high_shelf_gain=3.0,
        energy_boost=0.2,
        add_exclamation=True,
        caps_emphasis=True,
        interjections=["huh?!", "wha—"],
    ),
    "affectionate": EmotionPreset(
        name="affectionate",
        label="Affectionate / Loving",
        voice_blend={"af_heart": 0.7, "af_bella": 0.3},
        pitch_shift_semitones=1.5,
        speed=0.9,
        reverb_decay=0.2,
        eq_low_shelf_gain=2.0,
        eq_high_shelf_gain=1.0,
        energy_boost=0.1,
        add_softeners=True,
        interjections=["aww~", "♡"],
    ),
}


def get_preset(name: str) -> EmotionPreset:
    return EMOTION_PRESETS.get(name, NEUTRAL_PRESET)


def list_presets() -> list:
    return [
        {"name": p.name, "label": p.label}
        for p in (NEUTRAL_PRESET, *EMOTION_PRESETS.values())
    ]
