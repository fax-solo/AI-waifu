import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { Send, Mic, MicOff, Loader2, ScanEye, Image, X, Bold, Italic, Code, Link, Pencil } from 'lucide-react';
import { sendSTT } from '../../utils/api.js';

const CHAR_LIMIT = 4000;
const DRAFT_KEY = 'waifu-message-draft';

function loadDraft() {
  try { return localStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; }
}

function saveDraft(text) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function wrapSelection(textarea, before, after) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  const replacement = before + selected + after;
  const newValue = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.value = newValue;
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

const MessageInput = forwardRef(({
  onSend,
  onEdit,
  editMessage,
  disabled,
  isSending = false,
  placeholder = "Type a message...",
  audioInputDevice,
  screenshot,
  screenshotError,
  onCaptureScreenshot,
  onClearScreenshot,
}, ref) => {
  const [text, setText] = useState(loadDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [sentAnim, setSentAnim] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sttError, setSttError] = useState('');
  const sttErrorTimer = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftTimerRef = useRef(null);
  const [imageError, setImageError] = useState('');

  const [showFormatBar, setShowFormatBar] = useState(false);
  const [formatBarPos, setFormatBarPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (editMessage) {
      setText(editMessage.text);
      setIsEditing(true);
      textareaRef.current?.focus();
    } else {
      setIsEditing(false);
    }
  }, [editMessage]);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(text), 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [text]);

  const handleTextChange = (e) => {
    if (e.target.value.length <= CHAR_LIMIT) setText(e.target.value);
  };

  const handleSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const hasSelection = ta.selectionStart !== ta.selectionEnd;
    if (hasSelection) {
      const rect = ta.getBoundingClientRect();
      const lineHeight = 22;
      const lines = ta.value.substring(0, ta.selectionStart).split('\n');
      const row = lines.length;
      const col = lines[lines.length - 1].length;
      const estimatedTop = rect.top - 44;
      const estimatedLeft = rect.left + Math.min(col * 8, rect.width - 120);
      setFormatBarPos({ top: estimatedTop, left: Math.max(rect.left + 8, estimatedLeft) });
      setShowFormatBar(true);
    } else {
      setShowFormatBar(false);
    }
  };

  const handleFormat = (type) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pairs = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], strike: ['~~', '~~'] };
    const [before, after] = pairs[type] || ['', ''];
    wrapSelection(ta, before, after);
    setShowFormatBar(false);
    ta.focus();
  };

  const handleAttachImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file');
      setTimeout(() => setImageError(''), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onCaptureScreenshot?.(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onCaptureScreenshot]);

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

  const handleSubmit = () => {
    if ((!text.trim() && !screenshot) || disabled) return;
    if (isEditing && onEdit && editMessage) {
      onEdit(editMessage.id, text);
      setIsEditing(false);
    } else {
      onSend(text);
    }
    setText('');
    saveDraft('');
    setSentAnim(true);
    setTimeout(() => setSentAnim(false), 600);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && isEditing) {
      onEdit?.(null, null);
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
          <div className="textarea-wrap">
            <textarea
              ref={textareaRef}
              id="message-input"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onMouseUp={handleSelect}
              onKeyUp={handleSelect}
              placeholder={activeScreenshot ? "Ask about what's on your screen..." : placeholder}
              disabled={disabled}
              rows={1}
            />
            {showFormatBar && (
              <div className="format-bar" style={{ top: formatBarPos.top, left: formatBarPos.left }}>
                <button className="format-btn" onClick={() => handleFormat('bold')} title="Bold" aria-label="Bold"><Bold size={15} /></button>
                <button className="format-btn" onClick={() => handleFormat('italic')} title="Italic" aria-label="Italic"><Italic size={15} /></button>
                <button className="format-btn" onClick={() => handleFormat('code')} title="Code" aria-label="Code"><Code size={15} /></button>
                <button className="format-btn" onClick={() => handleFormat('strike')} title="Strikethrough" aria-label="Strikethrough"><span style={{ textDecoration: 'line-through', fontSize: 15 }}>S</span></button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          <div className="input-actions">
            {isEditing && (
              <span className="edit-badge"><Pencil size={13} /> Editing</span>
            )}
            <button
              className="attach-btn"
              onClick={handleAttachImage}
              title="Attach image"
              aria-label="Attach image"
              disabled={disabled}
            >
              <Image size={20} />
            </button>
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
            <div className="input-actions-spacer" />
            <span className={`char-count ${text.length > CHAR_LIMIT * 0.9 ? 'warn' : ''} ${text.length >= CHAR_LIMIT ? 'over' : ''}`}>
              {text.length}/{CHAR_LIMIT}
            </span>
            <button
              id="send-button"
              className={`send-btn${isSending ? ' loading' : ''}${sentAnim ? ' sent' : ''}`}
              onClick={handleSubmit}
              disabled={(!text.trim() && !activeScreenshot) || disabled}
            >
              {isSending ? <div className="send-btn-spinner" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>
      {(sttError || screenshotError || imageError) && (
        <div className="error-toast" role="alert">
          {sttError || screenshotError || imageError}
        </div>
      )}
    </>
  );
});

MessageInput.displayName = 'MessageInput';
export default memo(MessageInput);
