import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
from kokoro_onnx import Kokoro
import urllib.request
import onnxruntime as rt

# Optimize ONNX CPU execution by limiting threads
_old_session = rt.InferenceSession
def _optimized_session(*args, **kwargs):
    opts = rt.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    kwargs['sess_options'] = opts
    return _old_session(*args, **kwargs)
rt.InferenceSession = _optimized_session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import hashlib

# Configuration
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
MODEL_PATH = "kokoro-v1.0.int8.onnx"
VOICES_PATH = "voices-v1.0.bin"
CACHE_DIR = "tts_cache"

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

kokoro = None

def download_assets():
    if not os.path.exists(MODEL_PATH):
        print(f"Downloading model to {MODEL_PATH}...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    if not os.path.exists(VOICES_PATH):
        print(f"Downloading voices to {VOICES_PATH}...")
        urllib.request.urlretrieve(VOICES_URL, VOICES_PATH)

@app.on_event("startup")
async def startup_event():
    global kokoro
    try:
        download_assets()
        kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
        # Warm up the model with a tiny inference
        print("Warming up TTS model...")
        kokoro.create(".", voice="af_bella", speed=1.0, lang="en-us")
        print("OK: Kokoro TTS is ready!")
    except Exception as e:
        print(f"ERROR: Failed to initialize Kokoro: {e}")

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_bella"
    speed: float = 1.0

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    if not kokoro:
        raise HTTPException(status_code=500, detail="TTS not initialized")
    
    # Generate a unique cache key based on text, voice and speed
    cache_key = hashlib.md5(f"{request.text}|{request.voice}|{request.speed}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    # Return cached version if exists
    if os.path.exists(cache_path):
        print(f"Cache hit: {cache_key}")
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    try:
        # Generate audio
        samples, sample_rate = kokoro.create(
            request.text, 
            voice=request.voice, 
            speed=request.speed, 
            lang="en-us"
        )
        
        # Convert to WAV in memory
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV')
        buffer.seek(0)
        
        # Save to cache
        audio_data = buffer.read()
        with open(cache_path, "wb") as f:
            f.write(audio_data)
        
        return Response(content=audio_data, media_type="audio/wav")
    except Exception as e:
        print(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "initialized": kokoro is not None}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
