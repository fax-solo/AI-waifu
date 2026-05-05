export default function TypingIndicator() {
  return (
    <div className="typing-indicator">
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
  );
}
