export default function TypingIndicator({ isSearching }) {
  return (
    <div className="typing-indicator" style={{ flexDirection: 'column', alignItems: 'flex-start' }} role="status" aria-live="polite" aria-label={isSearching ? 'Searching the web and typing' : 'Companion is typing'}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="message-avatar" style={{
          background: 'linear-gradient(135deg, var(--color-companion-dark), var(--color-companion))',
          width: 32,
          height: 32,
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          boxShadow: '0 0 10px var(--color-companion-glow)',
        }}>
          ✦
        </div>
        <div className="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      {isSearching && (
        <div style={{ 
          fontSize: '0.75rem', 
          color: 'var(--color-accent-light)', 
          marginLeft: 44,
          marginTop: 4,
          animation: 'fade-in 0.3s ease'
        }}>
          🔎 Searching the web...
        </div>
      )}
    </div>
  );
}

