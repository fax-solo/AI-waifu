import os
import sys
import time
import gc
from typing import Optional, Tuple

import numpy as np

from emotion_presets import get_preset, EmotionPreset, NEUTRAL_PRESET
from text_processor import preprocess_text
from audio_processor import postprocess_audio
from utils import LRUCache, encode_wav_base64, SAMPLE_RATE

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KOKORO_MODEL_PATH = os.path.join(SCRIPT_DIR, "kokoro-v1.0.onnx")
KOKORO_VOICES_PATH = os.path.join(SCRIPT_DIR, "voices-v1.0.bin")


def _safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        try:
            print(msg.encode("ascii", "ignore").decode("ascii"))
        except Exception:
            print("[Log encoding error]")


class KokoroTTSManager:
    def __init__(self):
        self.model = None
        self.loaded = False
        self.error: Optional[str] = None
        self.device = "cpu"
        self._available_devices = {"cpu": True, "cuda": False, "rocm": False}
        self.cache = LRUCache(maxsize=32)
        self._detect_devices()

    def _detect_devices(self):
        try:
            import torch
            self._available_devices["cuda"] = torch.cuda.is_available()
            self._available_devices["rocm"] = (
                hasattr(torch.version, "hip") and torch.version.hip is not None
            )
        except ImportError:
            pass

    def available_devices(self) -> dict:
        return dict(self._available_devices)

    def _resolve_device(self, requested: str) -> str:
        if requested in ("gpu", "cuda"):
            if self._available_devices["cuda"]:
                return "cuda"
            if self._available_devices["rocm"]:
                return "cuda"
        if requested == "rocm" and self._available_devices["rocm"]:
            return "cuda"
        return "cpu"

    def _models_exist(self) -> bool:
        return os.path.exists(KOKORO_MODEL_PATH) and os.path.exists(KOKORO_VOICES_PATH)

    def load(self, target_device: Optional[str] = None) -> bool:
        if self.loaded and self.model is not None:
            return True

        if target_device is None:
            target_device = self._resolve_device("gpu")

        if not self._models_exist():
            self.error = "Kokoro model files not found"
            _safe_print(f"[TTS] {self.error}")
            return False

        _safe_print(f"[TTS] Initializing Kokoro ONNX on {target_device}...")
        start = time.time()
        try:
            import onnxruntime
            if target_device == "cuda":
                providers = [
                    ("CUDAExecutionProvider", {"device_id": 0}),
                    "CPUExecutionProvider",
                ]
                available = onnxruntime.get_available_providers()
                if "CUDAExecutionProvider" not in available:
                    _safe_print("[TTS] CUDA not available in ONNX Runtime, using CPU")
                    providers = ["CPUExecutionProvider"]
                    self.device = "cpu"
                else:
                    self.device = "cuda"
            else:
                providers = ["CPUExecutionProvider"]
                self.device = "cpu"

            from kokoro_onnx import Kokoro
            self.model = Kokoro(KOKORO_MODEL_PATH, KOKORO_VOICES_PATH)
            self.loaded = True
            _safe_print(
                f"[TTS] Kokoro ONNX loaded on {self.device} in {time.time() - start:.2f}s"
            )
            return True
        except Exception as e:
            self.error = str(e)
            self.loaded = False
            _safe_print(f"[TTS] Failed to load Kokoro: {e}")
            import traceback
            traceback.print_exc()
            return False

    def unload(self):
        if self.model is not None:
            del self.model
            self.model = None
        self.loaded = False
        self.error = None
        self.cache.clear()
        gc.collect()

    def get_voices(self) -> list:
        if self.loaded and self.model is not None:
            try:
                return self.model.get_voices()
            except Exception:
                pass

        try:
            from kokoro_onnx import Kokoro
            if self._models_exist():
                tmp = Kokoro(KOKORO_MODEL_PATH, KOKORO_VOICES_PATH)
                voices = tmp.get_voices()
                del tmp
                return voices
        except Exception:
            pass
        return []

    def generate(self, text: str, voice: str = "af_nicole", speed: float = 1.0) -> Tuple[np.ndarray, int]:
        audio, sr = self.model.create(text, voice=voice, speed=speed, lang="en-us")
        if audio is None or len(audio) == 0:
            raise RuntimeError("No audio generated")
        return audio, sr

    def generate_emotional(
        self,
        text: str,
        emotion: str = "neutral",
        intensity: float = 0.5,
        voice_override: Optional[str] = None,
        speed: Optional[float] = None,
    ) -> dict:
        preset = get_preset(emotion)
        effective_speed = speed if speed is not None else preset.speed
        effective_voice = voice_override or "af_nicole"

        cached = self.cache.get(text, emotion, intensity, effective_voice)
        if cached is not None:
            audio, sr = cached
            duration_ms = int(len(audio) / sr * 1000)
            b64 = encode_wav_base64(audio, sr)
            return {
                "audio": b64,
                "duration_ms": duration_ms,
                "emotion": emotion,
                "intensity": intensity,
            }

        processed_text = preprocess_text(text, preset)

        _safe_print(
            f"[TTS] Generating emotion={emotion} intensity={intensity:.1f} voice={effective_voice} speed={effective_speed:.2f}"
        )
        gen_start = time.time()

        if preset is not NEUTRAL_PRESET and preset.voice_blend:
            primary_voice = max(preset.voice_blend, key=preset.voice_blend.get)
        else:
            primary_voice = effective_voice

        audio, sr = self.generate(processed_text, primary_voice, effective_speed)

        if audio is None or len(audio) == 0:
            raise RuntimeError("No audio generated")

        gen_time = time.time() - gen_start
        _safe_print(f"[TTS] Raw audio generated in {gen_time:.2f}s, length={len(audio)} samples")

        pp_start = time.time()
        audio = postprocess_audio(audio, sr, preset, intensity)
        pp_time = time.time() - pp_start
        _safe_print(f"[TTS] Post-processing in {pp_time:.2f}s")

        duration_ms = int(len(audio) / sr * 1000)

        self.cache.put(text, emotion, intensity, effective_voice, audio, sr)

        b64 = encode_wav_base64(audio, sr)
        return {
            "audio": b64,
            "duration_ms": duration_ms,
            "emotion": emotion,
            "intensity": intensity,
        }


