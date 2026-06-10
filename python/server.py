import os
import sys

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
from pydantic import BaseModel
import time
import tempfile

from tts_manager import KokoroTTSManager
from emotion_presets import list_presets

manager = KokoroTTSManager()

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
    speed: float = 1.0
    pitch: float = 1.0
    volume: float = 1.0
    device: str = "gpu"
    engine: str = "kokoro"
    emotion: str = "neutral"
    intensity: float = 0.5


class STTRequest(BaseModel):
    audio: str


class SetDeviceRequest(BaseModel):
    device: str


@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    if not manager.loaded:
        requested = manager._resolve_device(req.device)
        manager.load(requested)
    if not manager.loaded or manager.model is None:
        detail = manager.error or "TTS engine not initialized"
        raise HTTPException(status_code=503, detail=detail)

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        result = manager.generate_emotional(
            text=text,
            emotion=req.emotion,
            intensity=req.intensity,
            voice_override=req.voice,
            speed=req.speed,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/emotions")
async def list_emotions():
    return {"emotions": list_presets()}


@app.get("/health")
async def health():
    status = "ok" if manager.loaded else ("error" if manager.error else "loading")
    return {
        "status": status,
        "device": manager.device,
        "engine": "kokoro",
        "loaded": manager.loaded,
        "error": manager.error,
        "available_devices": manager.available_devices(),
    }


@app.post("/set_device")
async def set_device(req: SetDeviceRequest):
    requested = manager._resolve_device(req.device)
    if requested != manager.device or not manager.loaded:
        print(f"[TTS] Switching Kokoro from {manager.device} to {requested}...")
        manager.unload()
        manager.load(requested)
    return {"status": "ok", "device": manager.device}


@app.get("/voices")
async def list_voices():
    all_voices = manager.get_voices()
    entries = [
        {"id": "default", "name": "Default Voice (af_nicole)", "engine": "kokoro"},
    ]
    for v in all_voices:
        display = v.replace("_", " ").title()
        entries.append({"id": v, "name": display, "engine": "kokoro"})
    return entries


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
    print("[TTS] Starting Kokoro Emotion TTS Server...")
    manager.load()
    uvicorn.run(app, host="127.0.0.1", port=5000)
