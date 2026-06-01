import { useState, useEffect, useRef, memo } from 'react';
import { MessageSquare, Plus, Trash2, Settings, Pin, PinOff, Search } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import * as api from '../../utils/api.js';

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
  onToggleTheme,
  theme,
  onClose,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(loadPinned);
  const debounceRef = useRef(null);

  useEffect(() => { savePinned(pinnedIds); }, [pinnedIds]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchConversations(search.trim());
        setSearchResults(results);
      } catch (e) {
        console.error('Search failed:', e);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const displayList = searchResults !== null ? searchResults : conversations;
  const isSearchingMode = searchResults !== null;

  const sorted = isSearchingMode
    ? displayList
    : [...displayList].sort((a, b) => {
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
      {isOpen && (
        <div
          className="sidebar-overlay mobile-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">✦</div>
          <div>
            <div className="sidebar-title">{t('sidebar.waifu')}</div>
            <div className="sidebar-subtitle">{t('sidebar.aiCompanion')}</div>
          </div>
        </div>

        <button
          id="new-chat-button"
          className="new-chat-btn"
          onClick={onNewChat}
        >
          <Plus size={18} />
          {t('common.newChat')}
        </button>

        <div className="sidebar-search-wrapper">
          <Search size={14} className="sidebar-search-icon" />
          <input
            className="sidebar-search"
            type="text"
            placeholder="Search conversations & messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="sidebar-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="conversation-list">
          {!search && conversations.length === 0 ? (
            <div className="sidebar-empty">
              <MessageSquare size={32} className="sidebar-empty-icon" />
              <p>{t('sidebar.noConversations')}</p>
              <p className="sidebar-empty-sub">{t('sidebar.startNewChat')}</p>
            </div>
          ) : isSearching ? (
            <div className="sidebar-empty">
              <p>Searching...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="sidebar-empty">
              <Search size={24} className="sidebar-empty-icon" />
              <p>{search ? `No matches for "${search}"` : 'No conversations'}</p>
            </div>
          ) : (
            sorted.map((conv) => {
              const isPinned = !isSearchingMode && pinnedIds.includes(conv.id);
              return (
                <div
                  key={conv.id}
                  className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    setSearch('');
                    setSearchResults(null);
                    onClose?.();
                  }}
                >
                  {!isSearchingMode && (
                    <button
                      className={`conv-pin ${isPinned ? 'pinned' : ''}`}
                      onClick={(e) => togglePin(conv.id, e)}
                      title={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                      aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
                    >
                      {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </button>
                  )}
                  <MessageSquare size={16} className="conv-icon" />
                  <div className="conv-content">
                    <span className="conv-title">{conv.title}</span>
                    {isSearchingMode && conv.match_preview && (
                      <span className="conv-match-preview">{conv.match_preview.slice(0, 80)}</span>
                    )}
                  </div>
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

        <div className="sidebar-footer">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
