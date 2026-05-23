import os
import sys
import tempfile
import base64
import speech_recognition as sr
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

    tmp_in = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp_in.write(data)
        tmp_in.close()
        from pydub import AudioSegment
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

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "google-speech-recognition"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5001)
