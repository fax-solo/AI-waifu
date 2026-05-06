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
  const [companionSettings, setCompanionSettings] = useState({
    name: 'Aria',
    backstory: 'A cheerful AI companion who loves chatting, learning about the user, and making their day brighter.',
    ttsEnabled: true,
    ttsVoice: 'af_bella',
    audioInputDevice: 'default',
    audioOutputDevice: 'default'
  });
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

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/settings', {
          headers: { 'x-user-id': 'current-user' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.displayName) setDisplayName(data.displayName);
          if (data.companion) setCompanionSettings(data.companion);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);
  const resizerRef = useRef(null);

  // Load companion settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await api.getSettings();
        setCompanionSettings(data.companion);
      } catch (err) {
        // Ignore
      }
    }
    loadSettings();
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
    
    // Calculate new width
    const sidebarWidth = sidebarOpen ? 300 : 0;
    const newWidth = e.clientX - sidebarWidth;
    
    if (newWidth >= MIN_PANEL_WIDTH && newWidth <= window.innerWidth * 0.7) {
      setPanelWidth(newWidth);
    }
  }, [isResizing, sidebarOpen]);

  useEffect(() => {
    if (!isResizing) {
      localStorage.setItem('waifu-panel-width', panelWidth.toString());
    }
  }, [isResizing, panelWidth]);

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
      if (companionSettings.ttsEnabled) {
        speak(result.message, {
          enabled: companionSettings.ttsEnabled,
          voice: companionSettings.ttsVoice,
          outputDeviceId: companionSettings.audioOutputDevice
        });
      }
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
          companionName={companionSettings.name}
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
