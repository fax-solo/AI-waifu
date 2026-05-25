import { useState, useEffect, memo } from 'react';
import { MessageSquare, Plus, Trash2, Settings, Pin, PinOff, Search } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

function loadPinned() {
  try {
    return JSON.parse(localStorage.getItem('waifu-pinned-convs') || '[]');
  } catch { return []; }
}

function savePinned(ids) {
  localStorage.setItem('waifu-pinned-convs', JSON.stringify(ids));
}

function Sidebar({
  conversations,
  activeConversationId,
  isOpen,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onOpenSettings,
  onClose,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [pinnedIds, setPinnedIds] = useState(loadPinned);

  useEffect(() => { savePinned(pinnedIds); }, [pinnedIds]);

  const filtered = conversations
    .filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });

  const togglePin = (id, e) => {
    e.stopPropagation();
    setPinnedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay mobile-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">✦</div>
          <div>
            <div className="sidebar-title">{t('sidebar.waifu')}</div>
            <div className="sidebar-subtitle">{t('sidebar.aiCompanion')}</div>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          id="new-chat-button"
          className="new-chat-btn"
          onClick={onNewChat}
        >
          <Plus size={18} />
          {t('common.newChat')}
        </button>

        {/* Search Bar */}
        <div className="sidebar-search-wrapper">
          <Search size={14} className="sidebar-search-icon" />
          <input
            className="sidebar-search"
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="sidebar-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Conversation List */}
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="sidebar-empty">
              <MessageSquare size={32} className="sidebar-empty-icon" />
              <p>{t('sidebar.noConversations')}</p>
              <p className="sidebar-empty-sub">
                {t('sidebar.startNewChat')}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sidebar-empty">
              <Search size={24} className="sidebar-empty-icon" />
              <p>No conversations match "{search}"</p>
            </div>
          ) : (
            filtered.map((conv) => {
              const isPinned = pinnedIds.includes(conv.id);
              return (
                <div
                  key={conv.id}
                  className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onClose?.();
                  }}
                >
                  <button
                    className={`conv-pin ${isPinned ? 'pinned' : ''}`}
                    onClick={(e) => togglePin(conv.id, e)}
                    title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                  >
                    {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </button>
                  <MessageSquare size={16} className="conv-icon" />
                  <span className="conv-title">{conv.title}</span>
                  <button
                    className="conv-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    title="Delete conversation"
                    aria-label={`Delete conversation: ${conv.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
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
            {t('common.settings')}
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

export default memo(Sidebar);
