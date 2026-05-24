import os
import sys
import tempfile

# Inject NVIDIA CUDA libraries into LD_LIBRARY_PATH before importing onnxruntime
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
    except Exception as e:
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
import base64
import numpy as np

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

# Global engine
kokoro = None
engine_loaded = False
engine_error = None
current_device = "cpu"
CACHE_DIR = "tts_cache"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Map PyTorch lang codes to ONNX locale codes
LANG_MAP = {
    'a': 'en-us',
    'b': 'en-gb',
    'j': 'ja-jp',
}

# Voice prefixes for each language
VOICE_LANG = {
    'af_': 'a', 'am_': 'a',
    'bf_': 'b', 'bm_': 'b',
    'jf_': 'j', 'jm_': 'j',
}

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def init_engine():
    global kokoro, engine_loaded, engine_error, current_device
    
    if kokoro:
        return
    
    safe_print("[TTS] Initializing Kokoro ONNX Runtime...")
    start_time = time.time()
    
    # Find model files alongside this script
    model_path = os.path.join(SCRIPT_DIR, 'kokoro-v1.0.int8.onnx')
    voices_path = os.path.join(SCRIPT_DIR, 'voices-v1.0.bin')
    
    # Also try parent dirs for different install layouts
    if not os.path.exists(model_path):
        model_path = os.path.join(SCRIPT_DIR, '..', 'python', 'kokoro-v1.0.int8.onnx')
        voices_path = os.path.join(SCRIPT_DIR, '..', 'python', 'voices-v1.0.bin')
    if not os.path.exists(model_path):
        model_path = os.path.join(os.path.dirname(SCRIPT_DIR), 'kokoro-v1.0.int8.onnx')
        voices_path = os.path.join(os.path.dirname(SCRIPT_DIR), 'voices-v1.0.bin')
    
    if not os.path.exists(model_path):
        engine_error = f"Model file not found at {model_path}"
        safe_print(f"[TTS] ❌ {engine_error}")
        return
    
    if not os.path.exists(voices_path):
        engine_error = f"Voices file not found at {voices_path}"
        safe_print(f"[TTS] ❌ {engine_error}")
        return
    
    try:
        from kokoro_onnx import Kokoro
        kokoro = Kokoro(model_path, voices_path)
        engine_loaded = True
        safe_print(f"[TTS] Engine loaded in {time.time() - start_time:.2f}s")
    except Exception as e:
        engine_error = str(e)
        safe_print(f"[TTS] ❌ Failed to load engine: {e}")
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
    voice: str = "af_bella"
    speed: float = 1.0
    pitch: float = 1.0
    volume: float = 1.0
    device: str = "cpu"

def clean_text_for_tts(text):
    text = re.sub(r'\*.*?\*', '', text)
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def has_japanese(text):
    for ch in text:
        cp = ord(ch)
        if 0x3040 <= cp <= 0x309F or 0x30A0 <= cp <= 0x30FF or 0x4E00 <= cp <= 0x9FFF:
            return True
    return False

def resolve_lang(voice, text):
    """Determine language locale from voice prefix and text content."""
    for prefix, lang in VOICE_LANG.items():
        if voice.startswith(prefix):
            if lang == 'j':
                if has_japanese(text):
                    return 'ja-jp'
                else:
                    return 'en-us'
            return LANG_MAP.get(lang, 'en-us')
    return 'en-us'

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    global kokoro, engine_loaded
    
    if not engine_loaded:
        init_engine()
    
    if not engine_loaded or not kokoro:
        detail = engine_error or "TTS Engine not initialized (missing models?)"
        raise HTTPException(status_code=503, detail=detail)
    
    clean_text = clean_text_for_tts(request.text)
    
    if not clean_text:
        safe_print(f"[TTS] Skipping message with no speakable content")
        raise HTTPException(status_code=400, detail="No speakable content")
    
    lang = resolve_lang(request.voice, clean_text)
    
    cache_key = hashlib.md5(f"{clean_text}|{request.voice}|{request.speed}|{request.pitch}|{request.volume}|{lang}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")
    
    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")
    
    try:
        start_time = time.time()
        
        samples, sample_rate = kokoro.create(
            clean_text,
            voice=request.voice,
            speed=request.speed,
            lang=lang,
        )
        
        if samples is None or len(samples) == 0:
            raise HTTPException(status_code=500, detail="No audio generated")
        
        # Apply volume
        if request.volume != 1.0:
            samples = samples * max(0.0, min(2.0, request.volume))
        
        # Apply pitch shift via resampling
        if request.pitch != 1.0:
            orig_len = len(samples)
            step = request.pitch
            indices = np.arange(0, orig_len, step)
            indices = indices[indices < orig_len]
            if len(indices) > 0:
                samples = np.interp(indices, np.arange(orig_len), samples).astype(samples.dtype)
        
        gen_time = time.time() - start_time
        safe_print(f"[TTS] Generated audio in {gen_time:.2f}s ({lang} {request.voice})")
        
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        audio_data = buffer.getvalue()
        
        with open(cache_path, "wb") as f:
            f.write(audio_data)
        
        return Response(content=audio_data, media_type="audio/wav")
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
        "engine": "onnx",
        "loaded": engine_loaded,
        "error": engine_error,
    }

class STTRequest(BaseModel):
    audio: str

@app.post("/stt")
async def speech_to_text(req: STTRequest):
    if not req.audio:
        raise HTTPException(status_code=400, detail="No audio data provided")
    try:
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
