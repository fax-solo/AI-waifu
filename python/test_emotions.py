"""Script to generate one WAV file per emotion preset for auditioning.

Usage:
    python test_emotions.py [--text "Hello, how are you?"] [--output-dir test_emotions]

Produces one .wav per preset in the output directory."""

import os
import sys
import argparse

import numpy as np

from emotion_presets import EMOTION_PRESETS, NEUTRAL_PRESET
from tts_manager import KokoroTTSManager
from utils import audio_to_wav_bytes


def ensure_nvidia_libs():
    if sys.platform != "linux":
        return
    try:
        import site
        site_packages = site.getsitepackages()
        nvidia_paths = []
        for sp in site_packages:
            for pkg in ['cublas', 'cudnn', 'cufft', 'curand', 'cusparse', 'nvrtc']:
                lib_path = os.path.join(sp, 'nvidia', pkg, 'lib')
                if os.path.exists(lib_path):
                    nvidia_paths.append(lib_path)
        if nvidia_paths:
            current_ld = os.environ.get('LD_LIBRARY_PATH', '')
            new_ld = ':'.join(nvidia_paths)
            if current_ld:
                new_ld += ':' + current_ld
            if os.environ.get('LD_LIBRARY_PATH') != new_ld:
                os.environ['LD_LIBRARY_PATH'] = new_ld
    except Exception:
        pass

ensure_nvidia_libs()


def main():
    parser = argparse.ArgumentParser(description="Generate test WAVs for all emotion presets")
    parser.add_argument(
        "--text",
        default="Hello! I'm so happy to see you today. How are you doing?",
        help="Text to generate speech for",
    )
    parser.add_argument(
        "--output-dir",
        default="test_emotions",
        help="Output directory for WAV files",
    )
    parser.add_argument(
        "--intensity",
        type=float,
        default=0.5,
        help="Emotion intensity (0.0-1.0)",
    )
    parser.add_argument(
        "--voice",
        default="af_nicole",
        help="Default voice override",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    print(f"Loading Kokoro TTS...")
    manager = KokoroTTSManager()
    if not manager.load():
        print(f"Failed to load TTS: {manager.error}")
        sys.exit(1)

    all_presets = [("neutral", NEUTRAL_PRESET), *EMOTION_PRESETS.items()]

    sample_texts = {
        "happy": "I'm so happy to see you today! This is wonderful!",
        "sad": "I miss you so much. It's hard without you here.",
        "excited": "Oh my god, you won't believe what happened today!",
        "angry": "That really makes me mad. I can't believe it.",
        "shy": "Um... I... I really like you, you know?",
        "calm": "Everything is fine. Take your time and relax.",
        "surprised": "Wait, really? I had no idea that was coming!",
        "affectionate": "You mean so much to me. I love spending time with you.",
        "neutral": "Hello, how are you doing today? I hope you're well.",
    }

    for name, preset in all_presets:
        text = sample_texts.get(name, args.text)
        intensity = 0.0 if name == "neutral" else args.intensity

        print(f"  Generating '{name}' (intensity={intensity:.1f})...")
        try:
            result = manager.generate_emotional(
                text=text,
                emotion=name,
                intensity=intensity,
                voice_override=args.voice,
            )
            import base64
            audio_bytes = base64.b64decode(result["audio"])
            out_path = os.path.join(args.output_dir, f"{name}.wav")
            with open(out_path, "wb") as f:
                f.write(audio_bytes)
            print(f"    -> {out_path} ({result['duration_ms']}ms)")
        except Exception as e:
            print(f"    ERROR: {e}")

    print(f"\nDone! Generated {len(all_presets)} files in {args.output_dir}/")

    # Cleanup
    manager.unload()
    print("All done!")


if __name__ == "__main__":
    main()
