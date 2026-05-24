import { useLanguage } from './contexts/LanguageContext.jsx';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from './hooks/useChat.js';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import Settings from './components/Settings/Settings.jsx';
import AvatarViewport from './components/Avatar/AvatarViewport.jsx';
import SetupUI from './components/Setup/SetupUI.jsx';
import { useTTS } from './hooks/useTTS.js';
import useShortcuts, { DEFAULT_SHORTCUTS } from './hooks/useShortcuts.js';
import * as api from './utils/api.js';

const MIN_PANEL_WIDTH = 250;
const DEFAULT_PANEL_WIDTH = 400;

export default function App() {
  const { t } = useLanguage();
  const [showSetup, setShowSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [systemInfo, setSystemInfo] = useState(null);

  const {
    conversations,
    activeConversationId,
    messages,
    isLoading,
    isSending,
    isSearching,
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
    audioOutputDevice: 'default',
    shortcuts: DEFAULT_SHORTCUTS
  });
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [avatarCollapsed, setAvatarCollapsed] = useState(false);
  const { speak, isPlaying, analyser } = useTTS();
  const messageInputRef = useRef(null);
  
  // Resizing state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('waifu-panel-width');
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  
  const avatarRef = useRef(null);
  const settingsReqId = useRef(0);
  const shortcutsOverridden = useRef(false);

  // Sidebar controls
  const handleToggleSidebar = () => setSidebarOpen(prev => !prev);
  const resizerRef = useRef(null);

  useEffect(() => {
    const reqId = ++settingsReqId.current;

    async function loadSettings() {
      try {
        const data = await api.getSettings();
        if (reqId !== settingsReqId.current) return; // stale response
        setCompanionSettings(prev => {
          if (shortcutsOverridden.current) {
            shortcutsOverridden.current = false;
            return { ...data.companion, shortcuts: prev.shortcuts };
          }
          return data.companion;
        });
      } catch (err) {
        // Ignore
      }
    }

    async function checkSetup(retries = 10, delay = 500) {
      try {
        // Use the centralized API client which correctly handles port 3001
        const data = await api.fetchApi('/setup/status');
        setSystemInfo(data);
        if (data.setupRequired) {
          setShowSetup(true);
        }
        setCheckingSetup(false);
      } catch (err) {
        if (retries > 0) {
          console.log(`Setup check failed, retrying in ${delay}ms... (${retries} left)`);
          setTimeout(() => checkSetup(retries - 1, delay), delay);
        } else {
          console.error('Failed to check setup status after retries:', err);
          setCheckingSetup(false);
        }
      }
    }

    checkSetup();
    loadSettings();
  }, [loadRateLimit]);

  // Load last used avatar
  useEffect(() => {
    async function loadActiveAvatar() {
      const savedId = localStorage.getItem('waifu-vrm-id');

      try {
        const avatars = await api.getAvatars();
        if (avatars.length === 0) return;

        let active = null;
        if (savedId) {
          active = avatars.find(a => a.id === savedId);
        }

        // Fallback: If no saved avatar or saved avatar was deleted, use the first one from the list
        if (!active) {
          active = avatars[0];
          localStorage.setItem('waifu-vrm-id', active.id);
          localStorage.setItem('waifu-vrm-name', active.name);
        }

        if (active && avatarRef.current) {
          const url = api.getUploadUrl(active.file_path);
          avatarRef.current.loadFile(url);
        }
      } catch (err) {
        console.error('Failed to auto-load avatar:', err);
      }
    }
    
    // Small delay to ensure AvatarViewport is ready
    const timer = setTimeout(loadActiveAvatar, 500);
    return () => clearTimeout(timer);
  }, []);

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

  const handleResizerKeyDown = useCallback((e) => {
    const step = e.shiftKey ? 20 : 5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPanelWidth(prev => Math.max(MIN_PANEL_WIDTH, prev - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPanelWidth(prev => Math.min(window.innerWidth * 0.7, prev + step));
    }
  }, []);

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

  const handleShortcutsChange = (shortcuts) => {
    shortcutsOverridden.current = true;
    setCompanionSettings(prev => ({ ...prev, shortcuts }));
  };

  const handleVRMFileSelected = (file) => {
    if (avatarRef.current) {
      avatarRef.current.loadFile(file);
    }
  };

  const handleSendMessage = async (message) => {
    const result = await sendMessage(message);

    if (result?.animation && avatarRef.current) {
      avatarRef.current.triggerAnimation('body', result.animation, { loop: result.loopAnimation ?? false });
    }
    
    if (result?.emotion) {
      setCurrentEmotion(result.emotion);
    }

    if (result?.message) {
      if (companionSettings.ttsEnabled) {
        speak(result.message, {
          enabled: companionSettings.ttsEnabled,
          voice: companionSettings.ttsVoice,
          speed: companionSettings.ttsSpeed ?? 1.0,
          pitch: companionSettings.ttsPitch ?? 1.0,
          volume: companionSettings.ttsVolume ?? 1.0,
          outputDeviceId: companionSettings.audioOutputDevice,
          device: companionSettings.ttsDevice || 'cpu',
          engine: companionSettings.ttsEngine || 'onnx'
        });
      }
    }
  };

  const handleToggleTTS = async () => {
    const newState = !companionSettings.ttsEnabled;
    const updated = { ...companionSettings, ttsEnabled: newState };
    setCompanionSettings(updated);
    
    try {
      await api.updateSettings({ companion: { ttsEnabled: newState } });
    } catch (err) {
      console.error('Failed to save TTS setting:', err);
    }
  };

  useShortcuts(
    Object.keys(companionSettings.shortcuts || {}).length > 0 ? companionSettings.shortcuts : DEFAULT_SHORTCUTS,
    {
      toggleMic: () => messageInputRef.current?.toggleMic?.(),
      toggleSidebar: handleToggleSidebar,
      newChat: handleNewChat,
      toggleSettings: () => setShowSettings(prev => !prev),
      toggleTTS: handleToggleTTS,
    }
  );

  if (checkingSetup) {
    return (
      <div className="app-splash">
        <div className="app-splash-logo">✦</div>
        <div className="app-splash-title">Waifu</div>
        <div className="app-splash-spinner" />
      </div>
    );
  }

  if (showSetup) {
    return (
      <SetupUI
        onComplete={async () => {
          try {
            await api.fetchApi('/setup/complete', { method: 'POST' });
          } catch {
            // non-critical
          }
          try {
            const data = await api.fetchApi('/setup/status');
            setSystemInfo(data);
          } catch {
            // Ignore — keep stale systemInfo
          }
          setShowSetup(false);
        }}
        onCancel={() => setShowSetup(false)}
        systemInfo={systemInfo}
      />
    );
  }

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
            isThinking={isSending}
            isTalking={isPlaying}
            analyser={analyser}
          />
        </div>

        {/* Floating Collapse/Expand Button */}
        <button
          className={`avatar-collapse-btn ${avatarCollapsed ? 'is-collapsed' : ''}`}
          onClick={() => setAvatarCollapsed(!avatarCollapsed)}
          style={{ left: avatarCollapsed ? '0px' : `${panelWidth - 16}px` }}
          title={avatarCollapsed ? 'Show avatar' : 'Hide avatar'}
          aria-label={avatarCollapsed ? 'Show avatar panel' : 'Hide avatar panel'}
          aria-expanded={!avatarCollapsed}
        >
          {avatarCollapsed ? '▶' : '◀'}
        </button>

        {/* Resizer Handle */}
        {!avatarCollapsed && (
          <div 
            className={`layout-resizer ${isResizing ? 'dragging' : ''}`}
            onMouseDown={startResizing}
            onKeyDown={handleResizerKeyDown}
            tabIndex={0}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize avatar panel"
            aria-valuenow={panelWidth}
            aria-valuemin={MIN_PANEL_WIDTH}
          />
        )}

        {/* Chat Panel */}
        <ChatWindow
          ref={messageInputRef}
          messages={messages}
          isLoading={isLoading}
          isSending={isSending}
          isSearching={isSearching}
          error={error}
          rateLimit={rateLimit}
          messagesEndRef={messagesEndRef}
          companionName={companionSettings.name}
          onSend={handleSendMessage}
          onError={setError}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          ttsEnabled={companionSettings.ttsEnabled}
          onToggleTTS={handleToggleTTS}
          audioInputDevice={companionSettings.audioInputDevice}
        />
      </div>

      {showSettings && (
        <Settings
          onClose={handleSettingsClose}
          onVRMFileSelected={handleVRMFileSelected}
          avatarRef={avatarRef}
          onShortcutsChange={handleShortcutsChange}
          onTriggerSetup={() => {
            setShowSettings(false);
            setShowSetup(true);
          }}
        />
      )}
    </div>
  );
}
