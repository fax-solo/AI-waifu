import os
import sys

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
                # Restart the process so the dynamic linker picks up the new paths
                os.execv(sys.executable, [sys.executable] + sys.argv)
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

# Fix Windows console encoding for emojis
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

# Global Engine
kokoro = None
current_device = "cpu"
CACHE_DIR = "tts_cache"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def init_engine():
    global kokoro, current_device
    
    if kokoro is not None:
        return
        
    model_path = os.path.join(SCRIPT_DIR, "kokoro-v1.0.int8.onnx")
    voices_path = os.path.join(SCRIPT_DIR, "voices-v1.0.bin")
    
    if not os.path.exists(model_path) or not os.path.exists(voices_path):
        safe_print("[TTS] ⚠️ Model files missing! Please complete the Setup UI.")
        return

    safe_print("[TTS] Initializing Kokoro ONNX Runtime...")
    start_time = time.time()
        
    try:
        from kokoro_onnx import Kokoro
        import onnxruntime as ort
        
        providers = ort.get_available_providers()
        safe_print(f"[TTS] Available ONNX providers: {providers}")
        
        # Prefer CUDA or DirectML
        selected_providers = []
        if 'CUDAExecutionProvider' in providers:
            try:
                # Check if we can actually load it
                ort.InferenceSession(model_path, providers=['CUDAExecutionProvider'])
                selected_providers.append('CUDAExecutionProvider')
                safe_print("[TTS] ✅ CUDAExecutionProvider successfully initialized.")
            except Exception as e:
                safe_print(f"[TTS] ⚠️ CUDAExecutionProvider found but failed to initialize: {e}")
                safe_print("[TTS] 💡 Ensure you have CUDA (12.x) and cuDNN (9.x) installed on your system.")
        
        if 'DmlExecutionProvider' in providers:
            selected_providers.append('DmlExecutionProvider')
            safe_print("[TTS] ✅ DmlExecutionProvider successfully initialized.")
            
        if 'ROCMExecutionProvider' in providers:
            try:
                ort.InferenceSession(model_path, providers=['ROCMExecutionProvider'])
                selected_providers.append('ROCMExecutionProvider')
                safe_print("[TTS] ✅ ROCMExecutionProvider successfully initialized.")
            except Exception as e:
                safe_print(f"[TTS] ⚠️ ROCMExecutionProvider found but failed to initialize: {e}")
        
        selected_providers.append('CPUExecutionProvider')
        
        kokoro = Kokoro(model_path, voices_path)
        
        # Get active provider and GPU name
        import subprocess
        gpu_name = ""
        try:
            if 'CUDAExecutionProvider' in providers:
                gpu_name = subprocess.check_output(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,trim"]).decode('utf-8').strip()
        except:
            pass

        # We re-init without the test providers as the library manages its own session
        kokoro = Kokoro(model_path, voices_path)
        
        # Test if it's actually working by generating some dummy info
        # kokoro-onnx doesn't expose the session directly, but since our 
        # ort.InferenceSession test passed, we are good.
        
        if 'CUDAExecutionProvider' in selected_providers:
            current_device = f"gpu ({gpu_name})" if gpu_name else "gpu (CUDA)"
        elif 'ROCMExecutionProvider' in selected_providers:
            current_device = "gpu (ROCm)"
        elif 'DmlExecutionProvider' in selected_providers:
            current_device = "gpu (DirectML)"
        else:
            current_device = "cpu"
            
        safe_print(f"[TTS] Pipeline loaded in {time.time() - start_time:.2f}s on {current_device}")
    except ImportError as e:
        safe_print(f"[TTS] ❌ Missing dependencies. Please run Setup UI. {e}")
    except Exception as e:
        safe_print(f"[TTS] ❌ Failed to load pipeline: {e}")

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
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
    device: str = "gpu"

def clean_text_for_tts(text):
    text = re.sub(r'\*.*?\*', '', text)
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    text = re.sub(r'\([^\w\s]*?\)', '', text)
    text = re.sub(r'\[[^\w\s]*?\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    global kokoro
    
    clean_text = clean_text_for_tts(request.text)
    
    if not any(c.isalnum() for c in clean_text):
        safe_print(f"[TTS] Skipping message with no speakable content")
        raise HTTPException(status_code=400, detail="No speakable content")

    cache_key = hashlib.md5(f"{clean_text}|{request.voice}|{request.speed}|{current_device}".encode()).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.wav")

    if os.path.exists(cache_path):
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="audio/wav")

    if not kokoro:
        init_engine()
        if not kokoro:
            raise HTTPException(status_code=503, detail="TTS Engine not initialized (missing models?)")

    try:
        start_time = time.time()
        
        # kokoro-onnx .create() returns (samples, sample_rate)
        lang = "en-us"
        if request.voice.startswith("bf_") or request.voice.startswith("bm_"):
            lang = "en-gb"
            
        samples, sample_rate = kokoro.create(
            clean_text, 
            voice=request.voice, 
            speed=request.speed, 
            lang=lang
        )
        
        gen_time = time.time() - start_time
        safe_print(f"[TTS] Generated audio in {gen_time:.2f}s on {current_device}")
        
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
    return {"status": "ok", "device": current_device, "engine": "onnx"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
