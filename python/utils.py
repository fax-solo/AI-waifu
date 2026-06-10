import io
import base64
import hashlib
from collections import OrderedDict
from typing import Optional, Tuple

import numpy as np
import soundfile as sf

SAMPLE_RATE = 24000


class LRUCache:
    def __init__(self, maxsize: int = 32):
        self.maxsize = maxsize
        self._cache: OrderedDict[str, Tuple[np.ndarray, int]] = OrderedDict()

    def _make_key(self, text: str, emotion: str, intensity: float, voice: str) -> str:
        raw = f"{text}|{emotion}|{intensity:.2f}|{voice}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, text: str, emotion: str, intensity: float, voice: str) -> Optional[Tuple[np.ndarray, int]]:
        key = self._make_key(text, emotion, intensity, voice)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def put(self, text: str, emotion: str, intensity: float, voice: str, audio: np.ndarray, sr: int):
        key = self._make_key(text, emotion, intensity, voice)
        self._cache[key] = (audio, sr)
        self._cache.move_to_end(key)
        while len(self._cache) > self.maxsize:
            self._cache.popitem(last=False)

    def clear(self):
        self._cache.clear()


def audio_to_wav_bytes(audio: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def encode_wav_base64(audio: np.ndarray, sr: int = SAMPLE_RATE) -> str:
    wav_bytes = audio_to_wav_bytes(audio, sr)
    return base64.b64encode(wav_bytes).decode("ascii")


def normalize_peak(audio: np.ndarray, target_db: float = -1.0) -> np.ndarray:
    peak = np.max(np.abs(audio))
    if peak < 1e-10:
        return audio
    target_amp = 10 ** (target_db / 20.0)
    gain = target_amp / peak
    return audio * min(gain, 2.0)


def apply_energy_boost(audio: np.ndarray, boost: float) -> np.ndarray:
    if boost >= 0:
        return audio * (1.0 + boost)
    else:
        return audio * (1.0 / (1.0 - boost))
