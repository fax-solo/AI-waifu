import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from './hooks/useChat.js';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import Settings from './components/Settings/Settings.jsx';
import AvatarViewport from './components/Avatar/AvatarViewport.jsx';
import { useTTS } from './hooks/useTTS.js';
import * as api from './utils/api.js';

const MIN_PANEL_WIDTH = 250;
const DEFAULT_PANEL_WIDTH = 400;

export default function App() {
  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isSending,
    error,
    rateLimit,
    messagesEndRef,
    selectConversation,
    createConversation,
    sendMessage,
    removeConversation,
    setError,
    loadRateLimit,
  } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companionName, setCompanionName] = useState('Aria');
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [avatarCollapsed, setAvatarCollapsed] = useState(false);
  const { speak } = useTTS();
  
  // Resizing state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('waifu-panel-width');
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  
  const avatarRef = useRef(null);
  const resizerRef = useRef(null);

  // Load companion name
  useEffect(() => {
    async function loadName() {
      try {
        const data = await api.getSettings();
        setCompanionName(data.companion.name || 'Aria');
      } catch (err) {
        // Ignore
      }
    }
    loadName();
  }, [showSettings]);

  // Resizing logic
  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (!isResizing) return;
    
    // Calculate new width (X position of mouse - sidebar width if it's fixed, but here we just need relative to window)
    const newWidth = e.clientX - (sidebarOpen ? 300 : 0);
    
    if (newWidth >= MIN_PANEL_WIDTH && newWidth <= window.innerWidth * 0.7) {
      setPanelWidth(newWidth);
      localStorage.setItem('waifu-panel-width', newWidth.toString());
    }
  }, [isResizing, sidebarOpen]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleNewChat = async () => {
    await createConversation();
    setSidebarOpen(false);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    loadRateLimit();
  };

  const handleVRMFileSelected = (file) => {
    if (avatarRef.current) {
      avatarRef.current.loadFile(file);
    }
  };

  const handleSendMessage = async (message) => {
    const result = await sendMessage(message);
    if (result?.emotion) {
      setCurrentEmotion(result.emotion);
    }
    if (result?.message) {
      speak(result.message);
    }
  };

  return (
    <div className={`app-layout ${isResizing ? 'resizing' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onSelectConversation={selectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={removeConversation}
        onOpenSettings={() => setShowSettings(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        {/* Avatar Panel */}
        <div 
          className={`avatar-panel ${avatarCollapsed ? 'collapsed' : ''}`}
          style={{ width: avatarCollapsed ? 0 : panelWidth }}
        >
          <AvatarViewport
            ref={avatarRef}
            emotion={currentEmotion}
          />
        </div>

        {/* Floating Collapse/Expand Button */}
        <button
          className={`avatar-collapse-btn ${avatarCollapsed ? 'is-collapsed' : ''}`}
          onClick={() => setAvatarCollapsed(!avatarCollapsed)}
          style={{ left: avatarCollapsed ? '0px' : `${panelWidth - 16}px` }}
          title={avatarCollapsed ? 'Show avatar' : 'Hide avatar'}
        >
          {avatarCollapsed ? '▶' : '◀'}
        </button>

        {/* Resizer Handle */}
        {!avatarCollapsed && (
          <div 
            className={`layout-resizer ${isResizing ? 'dragging' : ''}`}
            onMouseDown={startResizing}
          />
        )}

        {/* Chat Panel */}
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          isSending={isSending}
          error={error}
          rateLimit={rateLimit}
          messagesEndRef={messagesEndRef}
          companionName={companionName}
          onSend={handleSendMessage}
          onError={setError}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
        />
      </div>

      {showSettings && (
        <Settings
          onClose={handleSettingsClose}
          onVRMFileSelected={handleVRMFileSelected}
        />
      )}
    </div>
  );
}
