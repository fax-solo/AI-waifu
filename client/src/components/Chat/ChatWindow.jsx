import { useEffect, useState, forwardRef, memo } from 'react';
import { Menu, Volume2, VolumeX, AudioLines, Search, X as XIcon, Bot, Monitor } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import MessageBubble from './MessageBubble.jsx';
import MessageInput from './MessageInput.jsx';
import AgentInput from './AgentInput.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import ImageResults from './ImageResults.jsx';

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
  onEditMessage,
  onError,
  onToggleSidebar,
  ttsEnabled,
  onToggleTTS,
  lipSyncEnabled,
  onToggleLipSync,
  audioInputDevice,
  screenshot,
  screenshotError,
  onCaptureScreenshot,
  onClearScreenshot,
  onRegenerate,
  onCopy,
  images,
  searchQuery: aiSearchQuery,
  onClearImages,
  agentMode,
  onToggleAgentMode,
  onSendAgentGoal,
}, ref) {
  const { t } = useLanguage();
  const [showError, setShowError] = useState(false);
  const [editMessage, setEditMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

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

  const handleRequestEdit = (id, content) => {
    setEditMessage({ id, text: content });
  };

  const handleEdit = (id, newText) => {
    if (id && newText) onEditMessage?.(id, newText);
    setEditMessage(null);
  };

  const handleCancelEdit = () => {
    setEditMessage(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && messages.length > 0) {
        e.preventDefault();
        setShowSearch(p => !p);
        if (!showSearch) setSearchQuery('');
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages.length, showSearch]);

  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

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
          {messages.length > 0 && (
            <button
              className={`chat-search-toggle ${showSearch ? 'active' : ''}`}
              onClick={() => setShowSearch(p => !p)}
              title="Search messages (Ctrl+F)"
              aria-label="Toggle message search"
            >
              <Search size={16} />
            </button>
          )}
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

          <button
            className={`tts-toggle-btn ${lipSyncEnabled ? 'enabled' : 'disabled'}`}
            onClick={onToggleLipSync}
            title={lipSyncEnabled ? 'Disable lip sync' : 'Enable lip sync'}
            aria-label={lipSyncEnabled ? 'Disable lip sync animation' : 'Enable lip sync animation'}
            aria-pressed={lipSyncEnabled}
          >
            <AudioLines size={18} />
          </button>

          <button
            className={`agent-mode-btn ${agentMode ? 'active' : ''}`}
            onClick={onToggleAgentMode}
            title={agentMode ? 'Switch to chat mode' : 'Switch to desktop agent mode'}
            aria-label={agentMode ? 'Switch to chat mode' : 'Switch to desktop agent mode'}
            aria-pressed={agentMode}
          >
            <Bot size={18} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="chat-search-bar">
          <Search size={14} className="chat-search-bar-icon" />
          <input
            className="chat-search-bar-input"
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <span className="chat-search-bar-count">
            {searchQuery.trim() ? `${filteredMessages.length}/${messages.length}` : `${messages.length}`}
          </span>
          <button
            className="chat-search-bar-close"
            onClick={() => { setShowSearch(false); setSearchQuery(''); }}
            aria-label="Close search"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Error Toast */}
      {showError && error && (
        <div className="error-toast" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Messages or Welcome or Loading Skeleton */}
      {isLoading && messages.length === 0 ? (
        <div className="messages-container" role="status" aria-label="Loading messages">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`message skeleton-message ${i % 2 === 0 ? 'assistant' : 'user'}`}>
              <div className="message-avatar skeleton-pulse" aria-hidden="true" />
              <div className="message-bubble skeleton-pulse" style={{ width: `${60 + i * 10}%`, height: 48 }} />
            </div>
          ))}
        </div>
      ) : messages.length === 0 && !isLoading ? (
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
          {filteredMessages.length === 0 && searchQuery.trim() ? (
            <div className="messages-search-empty">No messages match "{searchQuery}"</div>
          ) : (
            filteredMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRegenerate={onRegenerate}
                onCopy={onCopy}
                onRequestEdit={handleRequestEdit}
                searchQuery={searchQuery}
              />
            ))
          )}
          {isSending && <TypingIndicator isSearching={isSearching} />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {images && images.length > 0 && (
        <ImageResults
            images={images}
            searchQuery={aiSearchQuery}
            onClear={onClearImages}
        />
      )}

      {/* Input */}
      {agentMode ? (
        <AgentInput
          onSendGoal={onSendAgentGoal}
          isSending={isSending}
          disabled={isSending}
        />
      ) : (
        <MessageInput
          ref={ref}
          onSend={onSend}
          onEdit={handleEdit}
          editMessage={editMessage}
          isSending={isSending}
          disabled={isSending || (rateLimit && rateLimit.remaining <= 0 && !rateLimit.bypassed)}
          placeholder={t('chat.typeMessage')}
          audioInputDevice={audioInputDevice}
          screenshot={screenshot}
          screenshotError={screenshotError}
          onCaptureScreenshot={onCaptureScreenshot}
          onClearScreenshot={onClearScreenshot}
        />
      )}
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';
export default memo(ChatWindow);
