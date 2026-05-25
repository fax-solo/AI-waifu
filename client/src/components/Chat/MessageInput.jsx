import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Send, Mic, MicOff, Loader2, ScanEye, X } from 'lucide-react';
import { sendSTT } from '../../utils/api.js';

const MessageInput = forwardRef(({
  onSend,
  disabled,
  placeholder = "Type a message...",
  audioInputDevice,
  screenshot,
  screenshotError,
  onCaptureScreenshot,
  onClearScreenshot,
}, ref) => {
  const [text, setText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sttError, setSttError] = useState('');
  const sttErrorTimer = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '48px';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }
  }, [text]);

  // Paste handler for clipboard images
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (ev) => {
            onCaptureScreenshot?.(ev.target.result);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [onCaptureScreenshot]);

  const handleSubmit = async () => {
    if ((!text.trim() && !screenshot) || disabled) return;
    setIsSending(true);
    await onSend(text);
    setText('');
    setIsSending(false);
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
  const waveformCanvasRef = useRef(null);
  const waveformAnimRef = useRef(null);

  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  const cleanupAudio = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (waveformAnimRef.current) cancelAnimationFrame(waveformAnimRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    animFrameRef.current = null;
    waveformAnimRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    if (micIconRef.current) micIconRef.current.style.transform = 'scale(1)';
  };

  const drawWaveform = (analyser) => {
    if (!isListeningRef.current) return;
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      if (!isListeningRef.current || !ctx) return;
      waveformAnimRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      // Sync canvas resolution to CSS size to prevent distortion
      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      const barCount = 48;
      const step = Math.floor(bufferLength / barCount);
      const barWidth = (width / barCount) * 0.7;
      const gap = (width / barCount) * 0.3;
      for (let i = 0; i < barCount; i++) {
        const sum = dataArray.slice(i * step, (i + 1) * step).reduce((a, b) => a + b, 0);
        const avg = sum / step;
        const barHeight = (avg / 255) * height;
        const x = i * (barWidth + gap);
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#a882ff');
        gradient.addColorStop(1, '#ff82b8');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      }
    };
    draw();
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

    drawWaveform(analyser);

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
          setSttError('Could not transcribe audio. Try again?');
          if (sttErrorTimer.current) clearTimeout(sttErrorTimer.current);
          sttErrorTimer.current = setTimeout(() => setSttError(''), 4000);
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

  const activeScreenshot = screenshot;

  return (
    <>
      <div className="message-input-container">
        {isListening && (
          <canvas ref={waveformCanvasRef} className="waveform-canvas" />
        )}
        {activeScreenshot && (
          <div className="screenshot-preview">
            <img src={activeScreenshot} alt="Screen capture preview" className="screenshot-preview-img" />
            <button
              className="screenshot-preview-remove"
              onClick={onClearScreenshot}
              title="Remove screenshot"
              aria-label="Remove screenshot"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="message-input-wrapper">
          <textarea
            ref={textareaRef}
            id="message-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeScreenshot ? "Ask about what's on your screen..." : placeholder}
            disabled={disabled}
            rows={1}
          />
          <button
            className={`screenshot-btn${activeScreenshot ? ' has-screenshot' : ''}`}
            onClick={() => onCaptureScreenshot?.()}
            title={activeScreenshot ? 'Replace screenshot' : 'Capture screen (Ctrl+Shift+S)'}
            aria-label="Capture screen"
            disabled={disabled}
          >
            <ScanEye size={20} />
          </button>
          <button
            className={`mic-btn ${isListening ? 'listening' : ''} ${isTranscribing ? 'transcribing' : ''}`}
            onClick={toggleVoiceMode}
            title={isListening ? "Stop recording" : isTranscribing ? "Transcribing..." : "Start recording"}
            aria-label={isListening ? "Stop recording" : isTranscribing ? "Transcribing..." : "Start voice recording"}
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
            className={`send-btn${isSending ? ' loading' : ''}`}
            onClick={handleSubmit}
            disabled={(!text.trim() && !activeScreenshot) || disabled || isSending}
            title="Send message"
            aria-label="Send message"
          >
            {isSending ? <div className="send-btn-spinner" /> : <Send size={20} />}
          </button>
        </div>
      </div>
      {(sttError || screenshotError) && (
        <div className="error-toast" role="alert">
          {sttError || screenshotError}
        </div>
      )}
    </>
  );
});

MessageInput.displayName = 'MessageInput';
export default MessageInput;
