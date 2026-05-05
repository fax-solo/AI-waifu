import { useState, useEffect } from 'react';
import { useChat } from './hooks/useChat.js';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import ChatWindow from './components/Chat/ChatWindow.jsx';
import Settings from './components/Settings/Settings.jsx';
import * as api from './utils/api.js';

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

  // Load companion name
  useEffect(() => {
    async function loadName() {
      try {
        const data = await api.getSettings();
        setCompanionName(data.companion.name || 'Aria');
      } catch (err) {
        // Ignore - will use default
      }
    }
    loadName();
  }, [showSettings]); // Reload when settings close

  const handleNewChat = async () => {
    await createConversation();
    setSidebarOpen(false);
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    loadRateLimit();
  };

  return (
    <div className="app-layout">
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

      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        isSending={isSending}
        error={error}
        rateLimit={rateLimit}
        messagesEndRef={messagesEndRef}
        companionName={companionName}
        onSend={sendMessage}
        onError={setError}
        onToggleSidebar={() => setSidebarOpen((p) => !p)}
      />

      {showSettings && (
        <Settings onClose={handleSettingsClose} />
      )}
    </div>
  );
}
