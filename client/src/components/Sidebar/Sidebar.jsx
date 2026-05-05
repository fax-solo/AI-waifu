import { MessageSquare, Plus, Trash2, Settings } from 'lucide-react';

export default function Sidebar({
  conversations,
  activeConversationId,
  isOpen,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onOpenSettings,
  onClose,
}) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 15,
            display: 'none',
          }}
          className="mobile-overlay"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">✦</div>
          <div>
            <div className="sidebar-title">Waifu</div>
            <div className="sidebar-subtitle">AI Companion</div>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          id="new-chat-button"
          className="new-chat-btn"
          onClick={onNewChat}
        >
          <Plus size={18} />
          New Chat
        </button>

        {/* Conversation List */}
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
            }}>
              <MessageSquare
                size={32}
                style={{ margin: '0 auto 12px', opacity: 0.3 }}
              />
              <p>No conversations yet</p>
              <p style={{ fontSize: '0.78rem', marginTop: 4 }}>
                Start a new chat to begin!
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectConversation(conv.id);
                  onClose?.();
                }}
              >
                <MessageSquare size={16} className="conv-icon" />
                <span className="conv-title">{conv.title}</span>
                <button
                  className="conv-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            id="settings-button"
            className="settings-btn"
            onClick={onOpenSettings}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .mobile-overlay {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}
