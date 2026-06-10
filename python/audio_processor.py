import numpy as np
from scipy import signal as scipy_signal
from emotion_presets import EmotionPreset, NEUTRAL_PRESET
from utils import normalize_peak, apply_energy_boost

SAMPLE_RATE = 24000


def postprocess_audio(
    audio: np.ndarray,
    sr: int,
    preset: EmotionPreset,
    intensity: float,
) -> np.ndarray:
    if preset is NEUTRAL_PRESET or intensity <= 0:
        return normalize_peak(audio, -1.0)

    audio = audio.copy()

    pitch_shift = _interp(0.0, preset.pitch_shift_semitones, intensity)
    reverb_decay = _interp(0.0, preset.reverb_decay, intensity)
    low_gain = _interp(0.0, preset.eq_low_shelf_gain, intensity)
    high_gain = _interp(0.0, preset.eq_high_shelf_gain, intensity)
    energy = _interp(0.0, preset.energy_boost, intensity)

    if abs(pitch_shift) > 0.1:
        audio = _pitch_shift(audio, sr, pitch_shift)

    if abs(low_gain) > 0.5 or abs(high_gain) > 0.5:
        audio = _apply_eq(audio, sr, low_gain, high_gain)

    if reverb_decay > 0.01:
        audio = _apply_reverb(audio, sr, reverb_decay)

    if abs(energy) > 0.01:
        audio = apply_energy_boost(audio, energy)

    audio = normalize_peak(audio, -1.0)
    return audio


def _interp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _pitch_shift(audio: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    factor = 2.0 ** (semitones / 12.0)
    indices = np.arange(0, len(audio), factor)
    indices = indices[indices < len(audio)]
    stretched = np.interp(indices, np.arange(len(audio)), audio)
    x_old = np.linspace(0, 1, len(stretched))
    x_new = np.linspace(0, 1, len(audio))
    return np.interp(x_new, x_old, stretched).astype(audio.dtype)


def _apply_eq(
    audio: np.ndarray,
    sr: int,
    low_shelf_gain: float,
    high_shelf_gain: float,
) -> np.ndarray:
    if abs(low_shelf_gain) > 0.5:
        sos_low = scipy_signal.iirfilter(
            4, 300 / (sr / 2),
            btype="low",
            ftype="butter",
            output="sos",
        )
        low_signal = scipy_signal.sosfilt(sos_low, audio)
        gain_linear = 10 ** (low_shelf_gain / 20.0)
        audio = audio + low_signal * (gain_linear - 1.0)

    if abs(high_shelf_gain) > 0.5:
        sos_high = scipy_signal.iirfilter(
            4, 3000 / (sr / 2),
            btype="high",
            ftype="butter",
            output="sos",
        )
        high_signal = scipy_signal.sosfilt(sos_high, audio)
        gain_linear = 10 ** (high_shelf_gain / 20.0)
        audio = audio + high_signal * (gain_linear - 1.0)

    return audio


def _apply_reverb(audio: np.ndarray, sr: int, decay: float) -> np.ndarray:
    ir_length = int(sr * 0.5)
    ir = np.exp(-np.linspace(0, ir_length / sr * decay * 10, ir_length))
    ir = ir * np.random.randn(ir_length)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-10

    import scipy.signal as sg
    wet = sg.fftconvolve(audio, ir, mode="full")[: len(audio)]
    wet = normalize_peak(wet, -6.0)
    mix = 0.3
    return audio * (1 - mix) + wet * mix
