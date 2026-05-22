import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';

export default function MessageInput({ onSend, disabled, placeholder = "Type a message..." }) {
  const [text, setText] = useState('');
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

  // ─── Voice Recognition ──────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setText((prev) => prev + finalTranscript);
        }
      };

      recognition.onerror = (err) => {
        console.error('Speech recognition error', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceMode = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition isn't supported in this environment yet.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      // Small visual feedback
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

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
          className={`mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleVoiceMode}
          title={isListening ? "Stop listening" : "Start Voice Mode"}
          disabled={disabled && !isListening}
        >
          {isListening ? <Mic className="pulse-icon" size={20} color="#ff4a4a" /> : <MicOff size={20} />}
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
}
