import os
import sys
import tempfile

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

kokoro_model = None
kokoro_loaded = False
kokoro_error = None
kokoro_device = "cpu"
available_devices = {"cpu": True, "cuda": False, "rocm": False}
CACHE_DIR = "tts_cache"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KOKORO_MODEL_PATH = os.path.join(SCRIPT_DIR, "kokoro-v1.0.onnx")
KOKORO_VOICES_PATH = os.path.join(SCRIPT_DIR, "voices-v1.0.bin")

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def detect_devices():
    global available_devices
    available_devices["cpu"] = True
    try:
        import torch
        available_devices["cuda"] = torch.cuda.is_available()
        available_devices["rocm"] = hasattr(torch.version, 'hip') and torch.version.hip is not None
    except ImportError:
        available_devices["cuda"] = False
        available_devices["rocm"] = False

def resolve_device(requested):
    if requested in ("gpu", "cuda"):
        if available_devices["cuda"]:
            return "cuda"
        if available_devices["rocm"]:
            return "cuda"
    if requested == "rocm" and available_devices["rocm"]:
        return "cuda"
    return "cpu"

def find_kokoro_models():
    return os.path.exists(KOKORO_MODEL_PATH) and os.path.exists(KOKORO_VOICES_PATH)

def init_kokoro(target_device=None):
    global kokoro_model, kokoro_loaded, kokoro_error, kokoro_device

    if kokoro_loaded and kokoro_model is not None:
        return

    if target_device is None:
        target_device = resolve_device("gpu")

    if not find_kokoro_models():
        kokoro_error = "Kokoro model files not found"
        safe_print(f"[TTS] {kokoro_error}")
        return

    safe_print(f"[TTS] Initializing Kokoro ONNX on {target_device}...")
    start_time = time.time()
    try:
        import onnxruntime
        if target_device == "cuda":
            providers = [
                ("CUDAExecutionProvider", {"device_id": 0}),
                "CPUExecutionProvider",
            ]
            available_providers = onnxruntime.get_available_providers()
            if "CUDAExecutionProvider" not in available_providers:
                safe_print("[TTS] Kokoro: CUDA not available in ONNX Runtime, using CPU")
                providers = ["CPUExecutionProvider"]
                kokoro_device = "cpu"
            else:
                kokoro_device = "cuda"
        else:
            providers = ["CPUExecutionProvider"]
            kokoro_device = "cpu"

        from kokoro_onnx import Kokoro
        kokoro_model = Kokoro(KOKORO_MODEL_PATH, KOKORO_VOICES_PATH)
        kokoro_loaded = True
        safe_print(f"[TTS] Kokoro ONNX loaded on {kokoro_device} in {time.time() - start_time:.2f}s")
    except Exception as e:
        kokoro_error = str(e)
        kokoro_loaded = False
        safe_print(f"[TTS] Failed to load Kokoro: {e}")
        import traceback
        traceback.print_exc()

def unload_kokoro():
    global kokoro_model, kokoro_loaded, kokoro_error
    if kokoro_model is not None:
        del kokoro_model
        kokoro_model = None
    kokoro_loaded = False
    kokoro_error = None
    import gc
    gc.collect()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_nicole"
    speed: float = 0.9
    pitch: float = 1.0
    volume: float = 1.0
    device: str = "gpu"
    engine: str = "kokoro"

def clean_text_for_tts(text):
    text = re.sub(r'\*.*?\*', '', text)
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    global kokoro_model, kokoro_loaded, kokoro_device

    requested_device = resolve_device(request.device)
    if not kokoro_loaded:
        init_kokoro(requested_device)
    if not kokoro_loaded or kokoro_model is None:
        detail = kokoro_error or "Kokoro engine not initialized"
        raise HTTPException(status_code=503, detail=detail)

    clean_text = clean_text_for_tts(request.text)
    if not clean_text:
        raise HTTPException(status_code=400, detail="No speakable content")

    cache_key = hashlib.md5(
        f"kokoro|{clean_text}|{request.voice}|{request.speed}|{request.volume}|{kokoro_device}".encode()
    ).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    try:
        start_time = time.time()
        voice_id = request.voice
        if voice_id == "default" or not voice_id:
            voice_id = "af_nicole"
        speed = request.speed
        audio, sr = kokoro_model.create(clean_text, voice=voice_id, speed=speed, lang="en-us")

        if audio is None or len(audio) == 0:
            raise HTTPException(status_code=500, detail="No audio generated")

        gen_time = time.time() - start_time
        safe_print(f"[TTS] Kokoro generated audio in {gen_time:.2f}s (voice: {voice_id}, speed: {speed}, device: {kokoro_device})")

        if request.volume != 1.0:
            audio = audio * max(0.0, min(2.0, request.volume))

        buffer = io.BytesIO()
        sf.write(buffer, audio, sr, format='WAV')
        audio_data = buffer.getvalue()

        with open(cache_path, "wb") as f:
            f.write(audio_data)

        return Response(content=audio_data, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:
        safe_print(f"[TTS] Kokoro error during generation: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    status = "ok" if kokoro_loaded else ("error" if kokoro_error else "loading")
    return {
        "status": status,
        "device": kokoro_device,
        "engine": "kokoro",
        "loaded": kokoro_loaded,
        "error": kokoro_error,
        "available_devices": available_devices,
    }

class SetDeviceRequest(BaseModel):
    device: str

@app.post("/set_device")
async def set_device(req: SetDeviceRequest):
    global kokoro_device
    requested = resolve_device(req.device)
    if requested != kokoro_device or not kokoro_loaded:
        safe_print(f"[TTS] Switching Kokoro from {kokoro_device} to {requested}...")
        unload_kokoro()
        init_kokoro(requested)
    return {"status": "ok", "device": kokoro_device}

@app.get("/voices")
async def list_kokoro_voices():
    if not kokoro_loaded or kokoro_model is None:
        try:
            from kokoro_onnx import Kokoro
            if find_kokoro_models():
                tmp = Kokoro(KOKORO_MODEL_PATH, KOKORO_VOICES_PATH)
                all_voices = tmp.get_voices()
                del tmp
            else:
                all_voices = []
        except Exception:
            all_voices = []
    else:
        all_voices = kokoro_model.get_voices()
    entries = []
    entries.append({"id": "default", "name": "Default Voice (af_nicole)", "engine": "kokoro"})
    for v in all_voices:
        display = v.replace("_", " ").title()
        entries.append({"id": v, "name": display, "engine": "kokoro"})
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
    detect_devices()
    uvicorn.run(app, host="127.0.0.1", port=5000)
