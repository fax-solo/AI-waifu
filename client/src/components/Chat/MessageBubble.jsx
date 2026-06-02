import ReactMarkdown from 'react-markdown';
import { useState } from 'react';

export default function MessageBubble({ message, onRegenerate, onCopy }) {
  const [hovered, setHovered] = useState(false);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (message.isStreaming && !message.content) return null;

  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={`message ${message.role}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="message-avatar" aria-hidden="true">
        {isAssistant ? '✦' : '◆'}
      </div>
      <div>
        <div className="message-bubble">
          {isAssistant ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                em: ({ children }) => <em>{children}</em>,
                ul: ({ children }) => <ul>{children}</ul>,
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                code: ({ children }) => <code>{children}</code>,
                pre: ({ children }) => <pre>{children}</pre>,
                a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
                blockquote: ({ children }) => <blockquote>{children}</blockquote>,
              }}
            >
              {message.isStreaming ? message.content || '' : message.content}
            </ReactMarkdown>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
        <div className="message-info">
          <span className="message-time">{time}</span>
          {!message.isStreaming && message.isSearching && (
            <span className="search-indicator">🔎 Using live web data</span>
          )}
          {isAssistant && !message.isStreaming && hovered && (
            <span className="message-actions">
              <button
                className="message-action-btn"
                onClick={() => onCopy?.(message.content)}
                title="Copy"
                aria-label="Copy message"
              >
                📋
              </button>
              <button
                className="message-action-btn"
                onClick={() => onRegenerate?.(message.id)}
                title="Regenerate"
                aria-label="Regenerate response"
              >
                ↻
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
