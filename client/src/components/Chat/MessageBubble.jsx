import ReactMarkdown from 'react-markdown';
import { memo, useState } from 'react';
import { Pencil, Bot, Loader2, Monitor } from 'lucide-react';

function highlightText(text, query) {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? `<mark class="search-highlight">${part}</mark>`
      : part
  ).join('');
}

const MessageBubble = memo(function MessageBubble({ message, onRegenerate, onCopy, onRequestEdit, searchQuery }) {
  const [hovered, setHovered] = useState(false);
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (message.isStreaming && !message.content && !message.isAgentRunning) return null;

  const isAssistant = message.role === 'assistant';
  const isAgentGoal = message.isAgentGoal;
  const isAgentMessage = message.isAgentRunning || message.agentStatus;
  const isAgentRunning = message.isAgentRunning;

  if (isAgentGoal) {
    return (
      <div className="message user agent-goal">
        <div className="message-avatar" aria-hidden="true"><Bot size={16} /></div>
        <div>
          <div className="message-bubble agent-goal-bubble">
            <div className="agent-goal-label">Agent Goal</div>
            <p>{message.content.replace('🤖 Agent Goal: ', '')}</p>
          </div>
          <div className="message-info">
            <span className="message-time">{time}</span>
          </div>
        </div>
      </div>
    );
  }

  if (isAgentMessage) {
    return (
      <div className="message assistant agent-message">
        <div className="message-avatar" aria-hidden="true"><Monitor size={16} /></div>
        <div>
          <div className="message-bubble agent-bubble">
            {isAgentRunning && (
              <div className="agent-running-indicator">
                <Loader2 size={14} className="spin" />
                <span>Agent working...</span>
              </div>
            )}
            <div className="agent-status-badge" data-status={message.agentStatus || 'running'}>
              {message.agentStatus === 'done' ? '✅ Complete' : message.agentStatus === 'error' ? '❌ Failed' : '⚙️ Running'}
            </div>
            <ReactMarkdown
              components={{
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                code: ({ children }) => <code>{children}</code>,
              }}
            >
              {message.content || ''}
            </ReactMarkdown>

            {message.agentIterations && message.agentIterations.length > 0 && (
              <details className="agent-iterations-details" open={isAgentRunning}>
                <summary>Steps ({message.agentIterations.length})</summary>
                <div className="agent-iterations-list">
                  {message.agentIterations.map((step, i) => (
                    <div key={i} className={`agent-iteration ${step.action === 'done' ? 'done' : step.action === 'error' ? 'error' : ''}`}>
                      <span className="agent-iteration-num">{i + 1}.</span>
                      <span className="agent-iteration-action">{step.action}</span>
                      {step.reasoning && <span className="agent-iteration-reason">— {step.reasoning}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {message.agentScreenshot && !isAgentRunning && (
              <div className="agent-screenshot-preview">
                <img src={`data:image/png;base64,${message.agentScreenshot}`} alt="Agent view" />
              </div>
            )}
          </div>
          <div className="message-info">
            <span className="message-time">{time}</span>
            {!isAgentRunning && hovered && (
              <span className="message-actions">
                <button className="message-action-btn" onClick={() => onCopy?.(message.content)} title="Copy" aria-label="Copy message">📋</button>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

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
              {message.isStreaming ? message.content || '' : searchQuery ? highlightText(message.content, searchQuery) : message.content}
            </ReactMarkdown>
          ) : (
            <p dangerouslySetInnerHTML={{ __html: searchQuery ? highlightText(message.content, searchQuery) : message.content }} />
          )}
        </div>
        <div className="message-info">
          <span className="message-time">{time}</span>
          {!message.isStreaming && message.isSearching && (
            <span className="search-indicator">🔎 Using live web data</span>
          )}
          {!message.isStreaming && hovered && (
            <span className="message-actions">
              {!isAssistant && (
                <button
                  className="message-action-btn"
                  onClick={() => onRequestEdit?.(message.id, message.content)}
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <Pencil size={13} />
                </button>
              )}
              {isAssistant && (
                <>
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
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default MessageBubble;
