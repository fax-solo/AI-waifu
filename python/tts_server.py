import os
import sys
import tempfile

# Inject NVIDIA CUDA libraries into LD_LIBRARY_PATH before importing torch
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

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
import hashlib
import time
import re
import contextlib
import numpy as np
import json

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        try:
            print(msg.encode('ascii', 'ignore').decode('ascii'))
        except:
            print("[Log encoding error]")

try:
    if sys.platform == "win32":
        import io as sys_io
        sys.stdout = sys_io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = sys_io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
except Exception:
    pass

model = None
engine_loaded = False
engine_error = None
current_device = "cpu"
CACHE_DIR = "tts_cache"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.join(SCRIPT_DIR, "voices")
VOICES_MANIFEST = os.path.join(VOICES_DIR, "manifest.json")

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)
if not os.path.exists(VOICES_DIR):
    os.makedirs(VOICES_DIR)

def load_voices_manifest():
    if os.path.exists(VOICES_MANIFEST):
        try:
            with open(VOICES_MANIFEST, 'r') as f:
                return json.load(f)
        except:
            pass
    return []

voices_manifest = load_voices_manifest()

def find_checkpoint():
    paths = [
        os.path.join(SCRIPT_DIR, 'styletts2-libritts.pth'),
        os.path.join(SCRIPT_DIR, '..', 'python', 'styletts2-libritts.pth'),
        os.path.join(SCRIPT_DIR, 'styletts2-ljspeech.pth'),
        os.path.join(SCRIPT_DIR, '..', 'python', 'styletts2-ljspeech.pth'),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None

def find_config():
    paths = [
        os.path.join(SCRIPT_DIR, 'styletts2-config-libritts.yml'),
        os.path.join(SCRIPT_DIR, '..', 'python', 'styletts2-config-libritts.yml'),
        os.path.join(SCRIPT_DIR, 'styletts2-config-ljspeech.yml'),
        os.path.join(SCRIPT_DIR, '..', 'python', 'styletts2-config-ljspeech.yml'),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None

def init_engine():
    global model, engine_loaded, engine_error, current_device

    if model:
        return

    safe_print("[TTS] Initializing StyleTTS2...")
    start_time = time.time()

    try:
        from styletts2 import tts

        checkpoint_path = find_checkpoint()
        config_path = find_config()

        if checkpoint_path and config_path:
            safe_print(f"[TTS] Loading model from {os.path.basename(checkpoint_path)}")
            model = tts.StyleTTS2(
                model_checkpoint_path=checkpoint_path,
                config_path=config_path
            )
        else:
            safe_print("[TTS] No local checkpoint found. Will auto-download from HuggingFace on first inference.")
            model = tts.StyleTTS2()

        engine_loaded = True
        safe_print(f"[TTS] Engine loaded in {time.time() - start_time:.2f}s")
    except Exception as e:
        engine_error = str(e)
        safe_print(f"[TTS] Failed to load engine: {e}")
        import traceback
        traceback.print_exc()

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    threading.Thread(target=init_engine, daemon=True).start()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0
    pitch: float = 1.0
    volume: float = 1.0
    device: str = "cpu"
    alpha: float = 0.3
    beta: float = 0.7
    diffusion_steps: int = 5
    embedding_scale: float = 1.0

def clean_text_for_tts(text):
    text = re.sub(r'\*.*?\*', '', text)
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def resolve_voice_path(voice_id):
    if voice_id == "default" or not voice_id:
        return None
    if voice_id.startswith("/") or voice_id.startswith("\\"):
        return voice_id
    candidate = os.path.join(VOICES_DIR, voice_id)
    if os.path.exists(candidate):
        return candidate
    for entry in voices_manifest:
        if entry.get("id") == voice_id:
            fname = entry.get("path", "")
            candidate2 = os.path.join(VOICES_DIR, fname)
            if os.path.exists(candidate2):
                return candidate2
    return None

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    global model, engine_loaded

    if not engine_loaded:
        init_engine()
        if not engine_loaded and model is None:
            detail = engine_error or "TTS Engine not initialized"
            raise HTTPException(status_code=503, detail=detail)

    clean_text = clean_text_for_tts(request.text)
    if not clean_text:
        safe_print(f"[TTS] Skipping message with no speakable content")
        raise HTTPException(status_code=400, detail="No speakable content")

    cache_key = hashlib.md5(
        f"{clean_text}|{request.voice}|{request.speed}|{request.pitch}|{request.volume}|{request.alpha}|{request.beta}|{request.diffusion_steps}|{request.embedding_scale}".encode()
    ).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    try:
        start_time = time.time()

        voice_path = resolve_voice_path(request.voice)

        samples = model.inference(
            clean_text,
            target_voice_path=voice_path,
            alpha=request.alpha,
            beta=request.beta,
            diffusion_steps=request.diffusion_steps,
            embedding_scale=request.embedding_scale,
        )

        if samples is None or len(samples) == 0:
            raise HTTPException(status_code=500, detail="No audio generated")

        sample_rate = 24000

        if request.volume != 1.0:
            samples = samples * max(0.0, min(2.0, request.volume))

        if request.speed != 1.0:
            orig_len = len(samples)
            step = request.speed
            indices = np.arange(0, orig_len, step)
            indices = indices[indices < orig_len]
            if len(indices) > 0:
                samples = np.interp(indices, np.arange(orig_len), samples).astype(samples.dtype)

        if request.pitch != 1.0:
            orig_len = len(samples)
            step = request.pitch
            indices = np.arange(0, orig_len, step)
            indices = indices[indices < orig_len]
            if len(indices) > 0:
                samples = np.interp(indices, np.arange(orig_len), samples).astype(samples.dtype)

        gen_time = time.time() - start_time
        voice_label = request.voice if request.voice != "default" else "default"
        safe_print(f"[TTS] Generated audio in {gen_time:.2f}s (voice: {voice_label})")

        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        audio_data = buffer.getvalue()

        with open(cache_path, "wb") as f:
            f.write(audio_data)

        return Response(content=audio_data, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:
        safe_print(f"[TTS] Error during generation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    status = "ok" if engine_loaded else ("error" if engine_error else "loading")
    return {
        "status": status,
        "device": current_device,
        "engine": "styletts2",
        "loaded": engine_loaded,
        "error": engine_error,
    }

@app.get("/voices")
async def list_voices():
    entries = []
    entries.append({"id": "default", "name": "Default Voice", "path": ""})
    for entry in voices_manifest:
        vid = entry.get("id", "")
        vname = entry.get("name", vid)
        vpath = entry.get("path", "")
        entries.append({"id": vid, "name": vname, "path": vpath})
    return entries

class STTRequest(BaseModel):
    audio: str

@app.post("/stt")
async def speech_to_text(req: STTRequest):
    if not req.audio:
        raise HTTPException(status_code=400, detail="No audio data provided")
    try:
        import base64
        data = base64.b64decode(req.audio)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")

    import speech_recognition as sr
    from pydub import AudioSegment
    tmp_in = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp_in.write(data)
        tmp_in.close()
        audio_seg = AudioSegment.from_file(tmp_in.name)
        audio_seg.export(tmp_wav.name, format="wav")
        tmp_wav.close()

        recognizer = sr.Recognizer()
        with sr.AudioFile(tmp_wav.name) as source:
            audio = recognizer.record(source)
        text = recognizer.recognize_google(audio)
        return {"text": text}
    except sr.UnknownValueError:
        return {"text": ""}
    except sr.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Speech recognition service error: {e}")
    finally:
        os.unlink(tmp_in.name)
        if os.path.exists(tmp_wav.name):
            os.unlink(tmp_wav.name)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
