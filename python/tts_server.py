import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
from kokoro_onnx import Kokoro
import urllib.request

app = FastAPI()

# Configuration
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0.19.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin"
MODEL_PATH = "model.onnx"
VOICES_PATH = "voices.bin"

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
        print("✅ Kokoro TTS is ready!")
    except Exception as e:
        print(f"❌ Failed to initialize Kokoro: {e}")

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_bella" # af_bella is a high-quality female voice
    speed: float = 1.0

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    if not kokoro:
        raise HTTPException(status_code=500, detail="TTS not initialized")
    
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
        
        return Response(content=buffer.read(), media_type="audio/wav")
    except Exception as e:
        print(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "initialized": kokoro is not None}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
