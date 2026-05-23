import { useEffect, useState, forwardRef } from 'react';
import { Menu, Volume2, VolumeX } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import MessageBubble from './MessageBubble.jsx';
import MessageInput from './MessageInput.jsx';
import TypingIndicator from './TypingIndicator.jsx';

const SUGGESTIONS = [
  "How's your day going? ✨",
  "Tell me something interesting!",
  "What do you like to do for fun?",
  "I need some motivation today...",
];

const ChatWindow = forwardRef(function ChatWindow({
  messages,
  isLoading,
  isSending,
  isSearching,
  error,
  rateLimit,
  messagesEndRef,
  companionName,
  onSend,
  onError,
  onToggleSidebar,
  ttsEnabled,
  onToggleTTS,
  audioInputDevice,
}, ref) {
  const { t } = useLanguage();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
        onError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, onError]);

  const rateLimitClass = rateLimit
    ? rateLimit.remaining <= 0 ? 'empty'
    : rateLimit.remaining <= 10 ? 'low'
    : ''
    : '';

  return (
    <div className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <button
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        <div className="chat-header-avatar">✦</div>
        <div className="chat-header-info">
          <h2>{companionName || 'Aria'}</h2>
          <div className="status">Online</div>
        </div>

        <div className="chat-header-actions">
          {rateLimit && !rateLimit.bypassed && (
            <div className={`rate-limit-badge ${rateLimitClass}`} title="Messages remaining today">
              {rateLimit.remaining}/{rateLimit.limit} left
            </div>
          )}
          {rateLimit?.bypassed && (
            <div className="rate-limit-badge" title="Using your own API key - no limits!">
              ∞ Unlimited
            </div>
          )}
          
          <button 
            className={`tts-toggle-btn ${ttsEnabled ? 'enabled' : 'disabled'}`}
            onClick={onToggleTTS}
            title={ttsEnabled ? 'Disable voice' : 'Enable voice'}
            aria-label={ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
            aria-pressed={ttsEnabled}
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>

      {/* Error Toast */}
      {showError && error && (
        <div className="error-toast" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Messages or Welcome */}
      {messages.length === 0 && !isLoading ? (
        <div className="welcome-screen">
          <div className="welcome-content">
            <div className="welcome-badge">AI Companion</div>
            <div className="welcome-avatar">
              <div className="welcome-avatar-ring" />
              <div className="welcome-avatar-inner">✦</div>
            </div>
            <h1 className="welcome-title">
              Hey there! I'm <span className="welcome-name">{companionName || 'Aria'}</span>
            </h1>
            <p className="welcome-desc">
              I'm your AI companion — here to chat, listen, and make your day a little brighter.
            </p>
            <div className="welcome-status">
              <span className="welcome-status-dot" />
              <span>Online & ready to chat</span>
            </div>
            <div className="welcome-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="welcome-suggestion"
                  onClick={() => onSend(s)}
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="messages-container" role="log" aria-live="polite" aria-relevant="additions" aria-label="Chat messages">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isSending && <TypingIndicator isSearching={isSearching} />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <MessageInput
        ref={ref}
        onSend={onSend}
        disabled={isSending || (rateLimit && rateLimit.remaining <= 0 && !rateLimit.bypassed)}
        placeholder={t('chat.typeMessage')}
        audioInputDevice={audioInputDevice}
      />
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';
export default ChatWindow;
