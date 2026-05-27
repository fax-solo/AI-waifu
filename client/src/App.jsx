import { useLanguage } from './contexts/LanguageContext.jsx';
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useChat } from './hooks/useChat.js';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
const Settings = lazy(() => import('./components/Settings/Settings.jsx'));
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
    ttsVoice: 'default',
    audioInputDevice: 'default',
    audioOutputDevice: 'default',
    ttsAlpha: 0.3,
    ttsBeta: 0.7,
    ttsDiffusionSteps: 5,
    ttsEmbeddingScale: 1.0,
    shortcuts: DEFAULT_SHORTCUTS
  });
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [mouthExpression, setMouthExpression] = useState(null);
  const [eyeExpression, setEyeExpression] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotError, setScreenshotError] = useState('');
  const [avatarCollapsed, setAvatarCollapsed] = useState(false);
  const { speak, isPlaying, analyser } = useTTS();
  const messageInputRef = useRef(null);
  
  // Resizing state — use ref during drag to avoid re-renders
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('waifu-panel-width');
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const pendingWidthRef = useRef(null);
  
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

  // Resizing logic — updates ref during drag, commits to state + localStorage on mouseup
  const startResizing = useCallback((e) => {
    e.preventDefault();
    panelWidthRef.current = panelWidth;
    setIsResizing(true);
  }, [panelWidth]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (pendingWidthRef.current !== null) {
      setPanelWidth(pendingWidthRef.current);
      localStorage.setItem('waifu-panel-width', pendingWidthRef.current.toString());
      pendingWidthRef.current = null;
    }
  }, []);

  const resize = useCallback((e) => {
    if (!isResizing) return;
    const sidebarWidth = sidebarOpen ? 300 : 0;
    const newWidth = e.clientX - sidebarWidth;
    if (newWidth >= MIN_PANEL_WIDTH && newWidth <= window.innerWidth * 0.7) {
      panelWidthRef.current = newWidth;
      pendingWidthRef.current = newWidth;
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
    const currentScreenshot = screenshot;
    if (currentScreenshot) {
      clearScreenshot();
    }

    const result = await sendMessage(message, currentScreenshot);

    if (result?.animation && avatarRef.current) {
      avatarRef.current.triggerAnimation('body', result.animation, { loop: result.loopAnimation ?? false });
    }
    
    if (result?.emotion) {
      setCurrentEmotion(result.emotion);
    }
    if (result?.mouthExpression) {
      setMouthExpression(result.mouthExpression);
    }
    if (result?.eyeExpression) {
      setEyeExpression(result.eyeExpression);
    }

    if (result?.message) {
      if (companionSettings.ttsEnabled) {
        speak(result.message, {
          enabled: companionSettings.ttsEnabled,
          voice: companionSettings.ttsVoice || 'default',
          speed: companionSettings.ttsSpeed ?? 1.0,
          pitch: companionSettings.ttsPitch ?? 1.0,
          volume: companionSettings.ttsVolume ?? 1.0,
          outputDeviceId: companionSettings.audioOutputDevice,
          device: companionSettings.ttsDevice || 'cpu',
          engine: companionSettings.ttsEngine || 'styletts2',
          alpha: companionSettings.ttsAlpha ?? 0.3,
          beta: companionSettings.ttsBeta ?? 0.7,
          diffusionSteps: companionSettings.ttsDiffusionSteps ?? 5,
          embeddingScale: companionSettings.ttsEmbeddingScale ?? 1.0,
        });
      }
    }
  };

  const captureScreenshot = useCallback(async (dataUrl) => {
    if (typeof dataUrl === 'string') {
      setScreenshot(dataUrl);
      return;
    }

    try {
      setScreenshotError('');

      // Try Electron main-process capturePage via IPC
      if (typeof window.electronAPI?.captureScreenshot === 'function') {
        const result = await window.electronAPI.captureScreenshot();
        if (!result.error) {
          setScreenshot(`data:image/png;base64,${result.data}`);
          return;
        }
      }

      // Fallback: use the standard Screen Capture API
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Wait a frame for the video to load
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.currentTime = 0;
          video.onseeked = resolve;
        };
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      // Stop all tracks to dismiss the screen picker
      stream.getTracks().forEach((t) => t.stop());

      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setScreenshot(e.target.result);
        };
        reader.readAsDataURL(blob);
      }, 'image/png');
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('cancel')) {
        setScreenshotError('Screen capture cancelled.');
      } else {
        setScreenshotError('Failed to capture screen: ' + err.message);
      }
      setTimeout(() => setScreenshotError(''), 4000);
    }
  }, []);

  const clearScreenshot = useCallback(() => {
    setScreenshot(null);
    setScreenshotError('');
  }, []);

  // Listen for global shortcut screenshots from the main process
  useEffect(() => {
    const cleanup = window.electronAPI?.onScreenshot?.((result) => {
      if (result.data) {
        setScreenshot(`data:image/png;base64,${result.data}`);
      } else if (result.error) {
        setScreenshotError(result.error);
        setTimeout(() => setScreenshotError(''), 4000);
      }
    });
    return () => cleanup?.();
  }, []);

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
      captureScreenshot,
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
        onSkip={() => setShowSetup(false)}
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
            mouthExpression={mouthExpression}
            eyeExpression={eyeExpression}
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
          screenshot={screenshot}
          screenshotError={screenshotError}
          onCaptureScreenshot={captureScreenshot}
          onClearScreenshot={clearScreenshot}
        />
      </div>

      {showSettings && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
}
