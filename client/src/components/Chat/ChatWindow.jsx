import { useEffect, useState } from 'react';
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

export default function ChatWindow({
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
}) {
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
          >
            {ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>

      {/* Error Toast */}
      {showError && error && (
        <div style={{
          position: 'absolute',
          top: 72,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          padding: '10px 20px',
          background: 'rgba(255, 107, 122, 0.15)',
          border: '1px solid rgba(255, 107, 122, 0.3)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-error)',
          fontSize: '0.85rem',
          maxWidth: '90%',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
          animation: 'fade-in 0.3s ease',
        }}>
          {error}
        </div>
      )}

      {/* Messages or Welcome */}
      {messages.length === 0 && !isLoading ? (
        <div className="welcome-screen">
          <div className="welcome-avatar">✦</div>
          <h1>Hey there! I'm {companionName || 'Aria'} ♡</h1>
          <p>
            I'm your AI companion — here to chat, listen, and make your day a little brighter.
            Tell me about yourself!
          </p>
          <div className="welcome-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="welcome-suggestion"
                onClick={() => onSend(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-container">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isSending && <TypingIndicator isSearching={isSearching} />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <MessageInput
        onSend={onSend}
        disabled={isSending || (rateLimit && rateLimit.remaining <= 0 && !rateLimit.bypassed)}
        placeholder={t('chat.typeMessage')}
      />
    </div>
  );
}
