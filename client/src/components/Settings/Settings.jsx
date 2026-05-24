import { useRef, useCallback } from 'react';
import { X, Search, User, Sparkles, Image, Volume2, Key, Keyboard, Brain, Film, Download, Info, Database } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import useSettings from './useSettings.js';
import Toast from './Toast.jsx';
import ProfileTab from './ProfileTab.jsx';
import CompanionTab from './CompanionTab.jsx';
import VoiceTab from './VoiceTab.jsx';
import ApiKeyTab from './ApiKeyTab.jsx';
import ShortcutsTab from './ShortcutsTab.jsx';
import MemoriesTab from './MemoriesTab.jsx';
import AnimationsTab from './AnimationsTab.jsx';
import UpdatesTab from './UpdatesTab.jsx';
import AvatarTab from './AvatarTab.jsx';
import AboutTab from './AboutTab.jsx';
import DataManagementTab from './DataManagementTab.jsx';
import SystemStatusBanner from './SystemStatusBanner.jsx';

const TAB_CONFIG = [
  { id: 'profile', icon: User, labelKey: 'settings.tabs.profile' },
  { id: 'companion', icon: Sparkles, labelKey: 'settings.tabs.companion' },
  { id: 'avatar', icon: Image, labelKey: 'settings.tabs.avatar' },
  { id: 'voice', icon: Volume2, labelKey: 'settings.tabs.voice' },
  { id: 'apikey', icon: Key, labelKey: 'settings.tabs.apikey' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'settings.shortcuts.title' },
  { id: 'memories', icon: Brain, labelKey: 'settings.tabs.memories' },
  { id: 'animations', icon: Film, labelKey: 'settings.tabs.animations' },
  { id: 'updates', icon: Download, labelKey: 'settings.tabs.updates' },
  { id: 'about', icon: Info, labelKey: 'About' },
  { id: 'data', icon: Database, labelKey: 'Data' },
];

export default function Settings({ onClose, onVRMFileSelected, avatarRef, onShortcutsChange, onTriggerSetup }) {
  const { t } = useLanguage();
  const settings = useSettings({ onShortcutsChange, onVRMFileSelected, avatarRef });
  const {
    activeTab, setActiveTab, settingsSearch, setSettingsSearch,
    displayName, setDisplayName, companion, setCompanion,
    dirty, saving, toast, showToast, handleSave,
    handleExport, handleImport, handleClearMemories, handleClearConversations,
    memories, shortcuts, setShortcuts, recordingAction, setRecordingAction,
    handleDeleteMemory, loadMemories, loadAnimations,
    animations, animLoading, animSearch, setAnimSearch,
    handleTestAnimation, handleDeleteAnimation, handleUploadAnimation,
    testStatus, animFileInputRef,
    avatars, loadAvatars, currentVRMName, handleSelectAvatar, handleDeleteAvatar,
    showUploadForm, setShowUploadForm, uploadForm, setUploadForm, isUploading, handleUploadAvatar,
    showGallery, setShowGallery, galleryAvatars, downloadingGalleryId, handleDownloadGalleryAvatar,
    loadGalleryAvatars, fileInputRef, pfpInputRef,
    audioDevices, testText, setTestText, micTestStatus, ttsStatus, setupStatus, isTestingVoice, speak, handleTestMic,
    hasCustomKey, hasGroqKey, apiKeyInput, setApiKeyInput, groqApiKeyInput, setGroqApiKeyInput,
    handleSetApiKey, handleSetGroqKey, handleRemoveApiKey, handleRemoveGroqKey,
    updateStatus, latestVersion, updateUrl, updateError, updateProgress, checkForUpdates,
    downloadUpdate, installUpdate,
    VOICES, GEMINI_MODELS, GROQ_MODELS,
    settingsLoading, requestClose,
    showUnsavedDialog, handleUnsavedConfirm, handleUnsavedCancel,
  } = settings;

  const overlayRef = useRef(null);
  const closeButtonRef = useRef(null);

  const handleOverlayKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      requestClose(onClose);
      return;
    }
    if (e.key === 'Tab') {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const focusable = overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [requestClose, onClose]);

  const filteredTabs = TAB_CONFIG.filter(tab => {
    const label = tab.labelKey.startsWith('settings.') ? t(tab.labelKey) : tab.labelKey;
    return label.toLowerCase().includes(settingsSearch.toLowerCase());
  });

  const renderTabContent = () => {
    if (settingsLoading) {
      return (
        <div className="settings-skeleton">
          <div className="skeleton-line wide" />
          <div className="skeleton-line medium" />
          <div className="skeleton-block" />
          <div className="skeleton-line narrow" />
          <div className="skeleton-line wide" />
          <div className="skeleton-block" />
          <div className="skeleton-line medium" />
        </div>
      );
    }

    switch (activeTab) {
      case 'profile':
        return <ProfileTab displayName={displayName} setDisplayName={setDisplayName} />;
      case 'companion':
        return <CompanionTab companion={companion} setCompanion={setCompanion} />;
      case 'voice':
        return <VoiceTab companion={companion} setCompanion={setCompanion}
          VOICES={VOICES} audioDevices={audioDevices} micTestStatus={micTestStatus}
          testText={testText} setTestText={setTestText} ttsStatus={ttsStatus}
          isTestingVoice={isTestingVoice} speak={speak} handleTestMic={handleTestMic} />;
      case 'apikey':
        return <ApiKeyTab companion={companion} setCompanion={setCompanion}
          GEMINI_MODELS={GEMINI_MODELS} GROQ_MODELS={GROQ_MODELS}
          apiKeyInput={apiKeyInput} setApiKeyInput={setApiKeyInput}
          hasCustomKey={hasCustomKey} handleSetApiKey={handleSetApiKey} handleRemoveApiKey={handleRemoveApiKey}
          groqApiKeyInput={groqApiKeyInput} setGroqApiKeyInput={setGroqApiKeyInput}
          hasGroqKey={hasGroqKey} handleSetGroqKey={handleSetGroqKey} handleRemoveGroqKey={handleRemoveGroqKey} />;
      case 'shortcuts':
        return <ShortcutsTab shortcuts={shortcuts} setShortcuts={setShortcuts}
          recordingAction={recordingAction} setRecordingAction={setRecordingAction} />;
      case 'memories':
        return <MemoriesTab memories={memories} handleDeleteMemory={handleDeleteMemory} />;
      case 'animations':
        return <AnimationsTab animations={animations} animLoading={animLoading}
          animSearch={animSearch} setAnimSearch={setAnimSearch}
          loadAnimations={loadAnimations} handleTestAnimation={handleTestAnimation}
          handleDeleteAnimation={handleDeleteAnimation} handleUploadAnimation={handleUploadAnimation}
          testStatus={testStatus} animFileInputRef={animFileInputRef} />;
      case 'avatar':
        return <AvatarTab avatars={avatars} loadAvatars={loadAvatars}
          currentVRMName={currentVRMName} handleSelectAvatar={handleSelectAvatar}
          handleDeleteAvatar={handleDeleteAvatar}
          showUploadForm={showUploadForm} setShowUploadForm={setShowUploadForm}
          uploadForm={uploadForm} setUploadForm={setUploadForm}
          isUploading={isUploading} handleUploadAvatar={handleUploadAvatar}
          showGallery={showGallery} setShowGallery={setShowGallery}
          galleryAvatars={galleryAvatars} downloadingGalleryId={downloadingGalleryId}
          handleDownloadGalleryAvatar={handleDownloadGalleryAvatar}
          loadGalleryAvatars={loadGalleryAvatars}
          fileInputRef={fileInputRef} pfpInputRef={pfpInputRef} />;
      case 'updates':
        return <UpdatesTab updateStatus={updateStatus} latestVersion={latestVersion}
          updateUrl={updateUrl} updateError={updateError} updateProgress={updateProgress}
          checkForUpdates={checkForUpdates} downloadUpdate={downloadUpdate} installUpdate={installUpdate}
          onTriggerSetup={onTriggerSetup} />;
      case 'about':
        return <AboutTab />;
      case 'data':
        return <DataManagementTab memories={memories}
          handleExport={handleExport} handleImport={handleImport}
          handleClearMemories={handleClearMemories} handleClearConversations={handleClearConversations} />;
      default:
        return null;
    }
  };

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) requestClose(onClose); }}
      onKeyDown={handleOverlayKeyDown} ref={overlayRef} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-panel settings-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={() => requestClose(onClose)}
            ref={closeButtonRef} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>

        <SystemStatusBanner
          setupStatus={setupStatus}
          ttsStatus={ttsStatus}
          hasCustomKey={hasCustomKey}
          hasGroqKey={hasGroqKey}
        />

        <div className="settings-layout">
          <div className="settings-sidebar">
            <div className="settings-search-wrapper">
              <Search size={14} className="settings-search-icon" />
              <input type="text" className="settings-search-input"
                placeholder="Search settings..."
                value={settingsSearch} onChange={(e) => setSettingsSearch(e.target.value)} />
              {settingsSearch && (
                <button className="settings-search-clear" onClick={() => setSettingsSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="settings-sidebar-tabs">
              {filteredTabs.map((tab) => {
                const Icon = tab.icon;
                const label = tab.labelKey.startsWith('settings.') ? t(tab.labelKey) : tab.labelKey;
                return (
                  <button key={tab.id}
                    className={`settings-sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}>
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-content">
            {renderTabContent()}
          </div>
        </div>

        <div className="settings-footer">
          {dirty && <span className="unsaved-badge">Unsaved changes</span>}
          <Toast message={toast?.message} type={toast?.type} onDismiss={() => showToast(null)} />
          <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {showUnsavedDialog && (
        <div className="unsaved-dialog-overlay">
          <div className="unsaved-dialog">
            <h3>Unsaved Changes</h3>
            <p>You have unsaved changes. Do you want to discard them?</p>
            <div className="unsaved-dialog-actions">
              <button className="btn btn-secondary" onClick={handleUnsavedCancel}>Keep Editing</button>
              <button className="btn btn-danger" onClick={handleUnsavedConfirm}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
