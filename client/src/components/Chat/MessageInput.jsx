import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';
import { sendSTT } from '../../utils/api.js';

const MessageInput = forwardRef(({ onSend, disabled, placeholder = "Type a message...", audioInputDevice }, ref) => {
  const [text, setText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '48px';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ─── Voice Recording ──────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const onSendRef = useRef(onSend);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const micIconRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  const cleanupAudio = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    animFrameRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    if (micIconRef.current) micIconRef.current.style.transform = 'scale(1)';
  };

  const startVolumeMonitor = (stream) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;
    streamRef.current = stream;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const checkVolume = () => {
      if (!isListeningRef.current) return;
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i] / 128 - 1;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const scale = 1 + Math.min(rms * 3, 0.8);
      if (micIconRef.current) {
        micIconRef.current.style.transform = `scale(${scale})`;
      }
      animFrameRef.current = requestAnimationFrame(checkVolume);
    };
    checkVolume();
  };

  const startListening = useCallback(async () => {
    isListeningRef.current = true;
    let stream = null;
    if (audioInputDevice && audioInputDevice !== 'default') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: audioInputDevice } }
        });
      } catch { }
    }
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch { }
    }
    if (!stream) {
      isListeningRef.current = false;
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      if (isListeningRef.current) {
        isListeningRef.current = false;
        setIsListening(false);
      }
      cleanupAudio();
      if (chunks.length > 0) {
        setIsTranscribing(true);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        sendSTT(blob).then(result => {
          if (result?.text) onSendRef.current(result.text);
        }).catch(err => {
          console.error('STT failed:', err);
        }).finally(() => {
          setIsTranscribing(false);
        });
      }
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    startVolumeMonitor(stream);
    setIsListening(true);
  }, [audioInputDevice]);

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupAudio();
    }
  };

  const toggleVoiceMode = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useImperativeHandle(ref, () => ({
    toggleMic: toggleVoiceMode,
    isListening,
  }), [isListening, toggleVoiceMode]);

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <textarea
          ref={textareaRef}
          id="message-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <button
          className={`mic-btn ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}
          onClick={toggleVoiceMode}
          title={isListening ? "Stop recording" : isTranscribing ? "Transcribing..." : "Start recording"}
          disabled={(disabled && !isListening) || isTranscribing}
        >
          {isTranscribing ? (
            <Mic size={20} color="#ffaa00" />
          ) : isListening ? (
            <span ref={micIconRef} style={{ display: 'inline-flex', transition: 'transform 0.08s ease' }}>
              <Mic className="pulse-icon" size={20} color="#ff4a4a" />
            </span>
          ) : <MicOff size={20} />}
        </button>
        <button
          id="send-button"
          className="send-btn"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          title="Send message"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';
export default MessageInput;
