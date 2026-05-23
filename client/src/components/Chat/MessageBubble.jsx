import ReactMarkdown from 'react-markdown';

export default function MessageBubble({ message }) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`message ${message.role}`}>
      <div className="message-avatar" aria-hidden="true">
        {message.role === 'assistant' ? '✦' : '◆'}
      </div>
      <div>
        <div className="message-bubble">
          {message.role === 'assistant' ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                em: ({ children }) => <em>{children}</em>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
        <div className="message-info">
          <span className="message-time">{time}</span>
          {message.isSearching && (
            <span className="search-indicator">🔎 Using live web data</span>
          )}
        </div>
      </div>
    </div>
  );
}
