import { useLanguage } from './contexts/LanguageContext.jsx';
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useChat } from './hooks/useChat.js';
import { useToggles } from './hooks/useToggles.js';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import ScreenPreview from './components/Chat/ScreenPreview.jsx';
const Settings = lazy(() => import('./components/Settings/Settings.jsx'));
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useToast } from './contexts/ToastContext.jsx';
import AvatarViewport from './components/Avatar/AvatarViewport.jsx';
import { useTTS } from './hooks/useTTS.js';
import useShortcuts, { DEFAULT_SHORTCUTS } from './hooks/useShortcuts.js';
import * as api from './utils/api.js';
import { WelcomeScreen } from './components/SetupWizard/index.js';

const MIN_PANEL_WIDTH = 250;
const DEFAULT_PANEL_WIDTH = 400;

export default function App() {
  const [showSetup, setShowSetup] = useState(null);
  const [hasVRM, setHasVRM] = useState(false);
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
    sendMessageStream,
    sendAgentMessage,
    removeConversation,
    removeMessage,
    setError,
    loadRateLimit,
  } = useChat();

  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companionSettings, setCompanionSettings] = useState({});
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotError, setScreenshotError] = useState('');
  const { addToast } = useToast();
  const { speak, isPlaying, analyser } = useTTS();
  const messageInputRef = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('waifu-theme') || 'dark');
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [mouthExpression, setMouthExpression] = useState(null);
  const [eyeExpression, setEyeExpression] = useState(null);
  const [screenPreviewActive, setScreenPreviewActive] = useState(false);
  const [agentMode, setAgentMode] = useState(false);

  const handleToggleAgentMode = useCallback(() => {
    setAgentMode(prev => !prev);
  }, []);

  const handleSendAgentGoal = useCallback((goal) => {
    sendAgentMessage(goal, {
      onDone(action) {
        addToast(`Agent completed: ${action.summary || 'Done'}`, 'success', 4000);
      },
      onError(action) {
        addToast(`Agent error: ${action.message || 'Something went wrong'}`, 'error', 5000);
      },
    });
  }, [sendAgentMessage, addToast]);

  const captureScreenshotRef = useRef(null);

  const handleStartScreenPreview = useCallback(() => {
    setScreenPreviewActive(true);
  }, []);

  const handleStopScreenPreview = useCallback(() => {
    setScreenPreviewActive(false);
  }, []);

  const handleStartSTT = useCallback(() => {
    messageInputRef.current?.startSTT?.();
  }, []);

  const {
    activeToggles,
    images: toggleImages,
    searchQuery,
    processToggles,
    clearToggles,
  } = useToggles({
    onCaptureScreenshot: (...args) => captureScreenshotRef.current?.(...args),
    onStartSTT: handleStartSTT,
    onStartScreenPreview: handleStartScreenPreview,
    onStopScreenPreview: handleStopScreenPreview,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('waifu-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('waifu-accent'));
      if (saved && saved.primary) {
        document.documentElement.style.setProperty('--color-accent', saved.primary);
        document.documentElement.style.setProperty('--color-accent-light', saved.light);
        document.documentElement.style.setProperty('--color-accent-dark', saved.dark);
        document.documentElement.style.setProperty('--color-accent-glow', `${saved.primary}26`);
        document.documentElement.style.setProperty('--color-companion', saved.companion || saved.primary);
        document.documentElement.style.setProperty('--color-companion-light', saved.companionLight || saved.light);
        document.documentElement.style.setProperty('--color-companion-dark', saved.companionDark || saved.dark);
        document.documentElement.style.setProperty('--color-companion-glow', `${saved.companion || saved.primary}1e`);
      }
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Resizing state — use ref during drag to avoid re-renders
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('waifu-panel-width');
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  const pendingWidthRef = useRef(null);

  // Sidebar controls
  const handleToggleSidebar = () => setSidebarOpen(prev => !prev);
  const [avatarCollapsed, setAvatarCollapsed] = useState(false);

  const avatarRef = useRef(null);
  const settingsReqId = useRef(0);
  const shortcutsOverridden = useRef(false);

  // Resizing logic
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
          const ok = await avatarRef.current.loadFile(url);
          if (ok) {
            setHasVRM(true);
          } else {
            console.warn('Failed to load avatar, removing stale entry:', active.id);
            // Remove broken entry from server and clear localStorage
            try { await api.deleteAvatar(active.id); } catch {}
            if (localStorage.getItem('waifu-vrm-id') === active.id) {
              localStorage.removeItem('waifu-vrm-id');
              localStorage.removeItem('waifu-vrm-name');
            }
            // Try the next avatar if available
            const remaining = avatars.filter(a => a.id !== active.id);
            if (remaining.length > 0 && avatarRef.current) {
              const next = remaining[0];
              localStorage.setItem('waifu-vrm-id', next.id);
              localStorage.setItem('waifu-vrm-name', next.name);
              await avatarRef.current.loadFile(api.getUploadUrl(next.file_path));
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-load avatar:', err);
      }
    }
    
    // Small delay to ensure AvatarViewport is ready
    const timer = setTimeout(loadActiveAvatar, 500);
    return () => clearTimeout(timer);
  }, []);

  // Check if setup was completed on first launch
  useEffect(() => {
    api.checkSetupStatus().then(data => {
      if (!data.completed) setShowSetup(true);
      else setShowSetup(false);
    }).catch(() => setShowSetup(false));
  }, []);

  const handleNewChat = async () => {
    await createConversation();
    setSidebarOpen(false);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    setSettingsInitialTab(null);
    loadRateLimit();
    api.getSettings().then(data => {
      if (data?.companion) {
        setCompanionSettings(prev => {
          if (shortcutsOverridden.current) {
            shortcutsOverridden.current = false;
            return { ...data.companion, shortcuts: prev.shortcuts };
          }
          return data.companion;
        });
      }
    }).catch(() => {});
  };

  const handleShortcutsChange = (shortcuts) => {
    shortcutsOverridden.current = true;
    setCompanionSettings(prev => ({ ...prev, shortcuts }));
  };

  const handleVRMFileSelected = (file) => {
    if (!file) {
      setHasVRM(false);
      return;
    }
    setHasVRM(true);
    if (avatarRef.current) {
      avatarRef.current.loadFile(file);
    }
  };

  const handleSendMessage = async (message) => {
    const currentScreenshot = screenshot;
    if (currentScreenshot) {
      clearScreenshot();
    }

    const handleResponse = (result) => {
      if (result?.toggles) {
        processToggles(result.toggles, result.images, result.search_query);
      } else {
        clearToggles();
      }

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
      if (result?.message && companionSettings.ttsEnabled) {
        speak(result.message, {
          enabled: companionSettings.ttsEnabled,
          voice: companionSettings.ttsVoice || 'default',
          speed: companionSettings.ttsSpeed ?? 1.0,
          pitch: companionSettings.ttsPitch ?? 1.0,
          volume: companionSettings.ttsVolume ?? 1.0,
          outputDeviceId: companionSettings.audioOutputDevice,
          device: companionSettings.ttsDevice || 'cpu',
          emotion: result.emotion || 'neutral',
          intensity: companionSettings.ttsEmotionIntensity ?? 0.5,
          maxChars: companionSettings.ttsMaxChars ?? 500,
        });
      }
    };

    sendMessageStream(message, currentScreenshot, {
      onDone: handleResponse,
      onError(err) {
        console.warn('[App] All response methods failed:', err);
      },
    });
  };

  const handleRegenerate = useCallback((messageId) => {
    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return;

    let userContent = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userContent = messages[i].content;
        break;
      }
    }
    if (!userContent) return;

    removeMessage(messageId);

    const cleanText = userContent.replace(/\n\n\[📷 Screenshot attached\]$/, '');
    handleSendMessage(cleanText);
  }, [messages, removeMessage, handleSendMessage]);

  const handleEditMessage = useCallback((messageId, newText) => {
    removeMessage(messageId);
    handleSendMessage(newText);
  }, [removeMessage, handleSendMessage]);

  const handleCopy = useCallback((content) => {
    navigator.clipboard.writeText(content).then(() => {
      addToast('Copied to clipboard', 'success', 2000);
    }).catch(() => {
      addToast('Failed to copy', 'error', 2000);
    });
  }, [addToast]);

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

  captureScreenshotRef.current = captureScreenshot;

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

  const handleToggleLipSync = async () => {
    const newState = !companionSettings.lipSyncEnabled;
    const updated = { ...companionSettings, lipSyncEnabled: newState };
    setCompanionSettings(updated);
    try {
      await api.updateSettings({ companion: { lipSyncEnabled: newState } });
    } catch (err) {
      console.error('Failed to save lip sync setting:', err);
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

  const handleTriggerSetup = useCallback(() => {
    setShowSettings(false);
    setShowSetup(true);
  }, []);

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

  if (showSetup === null) {
    return <div className="h-screen w-full bg-[#080c18]" />;
  }

  if (showSetup) {
    return (
      <WelcomeScreen
        onSkip={() => setShowSetup(false)}
        onComplete={() => setShowSetup(false)}
      />
    );
  }

  return (
    <ErrorBoundary>
    <div className={`app-layout ${isResizing ? 'resizing' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onSelectConversation={selectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={removeConversation}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
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
            lipSyncEnabled={companionSettings.lipSyncEnabled}
            onOpenSettings={() => { setSettingsInitialTab('avatar'); setShowSettings(true); }}
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
          lipSyncEnabled={companionSettings.lipSyncEnabled}
          onToggleLipSync={handleToggleLipSync}
          audioInputDevice={companionSettings.audioInputDevice}
          screenshot={screenshot}
          screenshotError={screenshotError}
          onCaptureScreenshot={captureScreenshot}
          onClearScreenshot={clearScreenshot}
          onRegenerate={handleRegenerate}
          onEditMessage={handleEditMessage}
          onCopy={handleCopy}
          images={toggleImages}
          searchQuery={searchQuery}
          onClearImages={clearToggles}
          agentMode={agentMode}
          onToggleAgentMode={handleToggleAgentMode}
          onSendAgentGoal={handleSendAgentGoal}
        />
        {screenPreviewActive && (
          <ScreenPreview onClose={handleStopScreenPreview} />
        )}
      </div>

      {showSettings && (
        <Suspense fallback={null}>
          <Settings
            onClose={handleSettingsClose}
            onVRMFileSelected={handleVRMFileSelected}
            avatarRef={avatarRef}
            onShortcutsChange={handleShortcutsChange}
            onTriggerSetup={handleTriggerSetup}
            initialTab={settingsInitialTab}
          />
        </Suspense>
      )}
    </div>
    </ErrorBoundary>
  );
}
