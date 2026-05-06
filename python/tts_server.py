import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import io
import soundfile as sf
import torch
from kokoro import KPipeline
import hashlib
import time
import re
import contextlib

# Fix Windows console encoding for emojis
def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        try:
            print(msg.encode('ascii', 'ignore').decode('ascii'))
        except:
            print("[Log encoding error]")

# Fix Windows console encoding issues for emojis
try:
    if sys.platform == "win32":
        import io as sys_io
        sys.stdout = sys_io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = sys_io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
except Exception:
    pass

# Global Engine
pipeline = None
current_device = "cpu"
CACHE_DIR = "tts_cache"

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def init_engine():
    global pipeline, current_device
    
    # Check for CUDA
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    if pipeline and current_device == device:
        return
        
    safe_print(f"[TTS] Initializing Kokoro PyTorch Pipeline on {device}...")
    start_time = time.time()
        
    try:
        # KPipeline handles model downloading/loading automatically
        # lang_code='a' for American English
        pipeline = KPipeline(lang_code='a', device=device)
        current_device = device
        safe_print(f"[TTS] Pipeline loaded in {time.time() - start_time:.2f}s")
    except Exception as e:
        safe_print(f"[TTS] Failed to load pipeline: {e}")
        if device == "cuda":
            safe_print("[TTS] Falling back to CPU mode...")
            current_device = "cpu"
            pipeline = KPipeline(lang_code='a', device='cpu')
        else:
            raise e

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load engine
    init_engine()
    yield
    # Shutdown: Clean up
    pass

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
    device: str = "gpu" # Ignored now, we use the best available

def clean_text_for_tts(text):
    # 1. Remove asterisks content like *giggles*, *smiles*
    text = re.sub(r'\*.*?\*', '', text)
    
    # 2. Remove emojis and kaomojis (non-ascii)
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    
    # 3. Remove common kaomoji brackets and symbols
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    
    # 4. Strip extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    global pipeline
    
    # Clean text for TTS
    clean_text = clean_text_for_tts(request.text)
    
    if not any(c.isalnum() for c in clean_text):
        safe_print(f"[TTS] Skipping message with no speakable content")
        raise HTTPException(status_code=400, detail="No speakable content")

    # Cache
    cache_key = hashlib.md5(f"{clean_text}|{request.voice}|{request.speed}|{current_device}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    if not pipeline:
        init_engine()

    try:
        start_time = time.time()
        
        # KPipeline.generate returns a generator of (graphemes, phonemes, audio)
        # We'll join all segments into one audio file
        generator = pipeline(
            clean_text, 
            voice=request.voice, 
            speed=request.speed, 
            split_pattern=r'\n+' # Keep sentences together for better flow
        )
        
        full_audio = []
        for gs, ps, audio in generator:
            full_audio.append(audio)
        
        import numpy as np
        if not full_audio:
            raise Exception("No audio generated")
            
        combined_audio = np.concatenate(full_audio)
        
        gen_time = time.time() - start_time
        safe_print(f"[TTS] Generated audio in {gen_time:.2f}s on {current_device}")
        
        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format='WAV') # Kokoro uses 24kHz
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
    return {"status": "ok", "device": current_device}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
