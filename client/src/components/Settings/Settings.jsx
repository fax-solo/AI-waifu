import { useState, useEffect, useRef, useCallback } from 'react';
import { X, User, Sparkles, Key, Brain, Shield, Image, Volume2, Camera, Plus, Trash2, Cpu, Globe, Film, RefreshCw, Play, Upload, FolderOpen } from 'lucide-react';
import * as api from '../../utils/api.js';
import { useTTS } from '../../hooks/useTTS.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const VOICES = [
  { id: 'af_bella', name: 'Bella (US Female)', desc: 'Friendly & clear' },
  { id: 'af_sarah', name: 'Sarah (US Female)', desc: 'Soft & calm' },
  { id: 'af_sky', name: 'Sky (US Female)', desc: 'Bright & energetic' },
  { id: 'af_nicole', name: 'Nicole (US Female)', desc: 'Professional' },
  { id: 'am_adam', name: 'Adam (US Male)', desc: 'Deep & steady' },
  { id: 'am_michael', name: 'Michael (US Male)', desc: 'Natural' },
  { id: 'bf_emma', name: 'Emma (UK Female)', desc: 'British accent' },
  { id: 'bm_george', name: 'George (UK Male)', desc: 'British accent' },
];

const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', desc: 'Next-gen efficiency (Newest)', free: true },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', desc: 'Advanced generation', free: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Highly capable & stable', free: true },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', desc: 'Ultra lightweight', free: true },
];

const GROQ_MODELS = [
  { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', desc: 'High intelligence (Powerful)', free: true },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', desc: 'Ultra fast responses', free: true },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', desc: 'Large context expert', free: true },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B', desc: 'Google lightweight model', free: true },
];

export default function Settings({ onClose, onVRMFileSelected, avatarRef }) {
  const { t, language, setLanguage } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [companion, setCompanion] = useState({
    name: '',
    tone: '',
    personality: '',
    backstory: '',
    ttsEnabled: true,
    ttsVoice: 'af_bella',
    audioInputDevice: 'default',
    audioOutputDevice: 'default',
    ttsDevice: 'cpu',
    ttsEngine: 'onnx',
    llmModel: 'gemini-3.1-flash-lite',
    llmProvider: 'gemini'
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [groqApiKeyInput, setGroqApiKeyInput] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [memories, setMemories] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [animations, setAnimations] = useState({ facial: [], body: [] });
  const [animLoading, setAnimLoading] = useState(false);
  const [testStatus, setTestStatus] = useState({});
  const [currentVRMName, setCurrentVRMName] = useState(null);
  
  // {t('settings.avatar.title')} State
  const [avatars, setAvatars] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    vrmFile: null,
    pfpFile: null,
    pfpPreview: null
  });

  const fileInputRef = useRef(null);
  const pfpInputRef = useRef(null);
  const animFileInputRef = useRef(null);

  // Audio Devices State
  const [audioDevices, setAudioDevices] = useState({
    inputs: [],
    outputs: []
  });
  
  // Voice Tester State
  const [testText, setTestText] = useState("Hello! How do I sound?");
  const { speak, isPlaying: isTestingVoice } = useTTS();

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      
      setAudioDevices({
        inputs: inputs.map(d => ({ id: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0,5)}` })),
        outputs: outputs.map(d => ({ id: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0,5)}` }))
      });
    } catch (err) {
      console.warn('Failed to load audio devices:', err);
    }
  };

  const [ttsStatus, setTtsStatus] = useState({ status: 'unknown', device: 'cpu' });

  // Load settings
  useEffect(() => {
    async function load() {
      try {
        const data = await api.getSettings();
        setSettings(data);
        setDisplayName(data.user.displayName || '');
        setCompanion({
          name: data.companion.name,
          tone: data.companion.tone,
          personality: data.companion.personality,
          backstory: data.companion.backstory,
          ttsEnabled: data.companion.ttsEnabled ?? true,
          ttsVoice: data.companion.ttsVoice ?? 'af_bella',
          audioInputDevice: data.companion.audioInputDevice ?? 'default',
          audioOutputDevice: data.companion.audioOutputDevice ?? 'default',
          ttsDevice: data.companion.ttsDevice ?? 'cpu',
          ttsEngine: data.companion.ttsEngine ?? 'onnx',
          llmModel: data.companion.llmModel ?? 'gemini-3.1-flash-lite',
          llmProvider: data.companion.llmProvider ?? 'gemini'
        });
        setHasCustomKey(data.hasCustomApiKey);
        setHasGroqKey(data.hasGroqApiKey);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }

    async function checkTTS(retries = 5) {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:5000/health?t=${Date.now()}`, { cache: 'no-store' });
          const data = await res.json();
          setTtsStatus(data);
          return; // Success, stop retrying
        } catch (err) {
          if (i < retries - 1) {
            // TTS server still booting, wait before retrying
            await new Promise(r => setTimeout(r, 3000));
          } else {
            setTtsStatus({ status: 'offline', device: 'none' });
          }
        }
      }
    }

    load();
    checkTTS();
    loadMemories();
    loadAudioDevices();
    
    // Listen for device changes
    navigator.mediaDevices.ondevicechange = loadAudioDevices;
    
    // Check for saved VRM name
    const savedName = localStorage.getItem('waifu-vrm-name');
    if (savedName) {
      setCurrentVRMName(savedName);
    }
    
    return () => {
      navigator.mediaDevices.ondevicechange = null;
    };
  }, []);

  const loadAnimations = useCallback(async () => {
    setAnimLoading(true);
    try {
      const data = await api.getAnimations();
      setAnimations(data);
    } catch (e) {
      console.error('Failed to load animations:', e);
    }
    setAnimLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'animations') loadAnimations();
  }, [activeTab, loadAnimations]);

  const handleTestAnimation = (type, filename) => {
    const key = `${type}/${filename}`;
    setTestStatus((p) => ({ ...p, [key]: 'playing' }));
    if (avatarRef?.current?.triggerAnimation) {
      avatarRef.current.triggerAnimation(type, filename, { blendSpeed: 8 });
    }
    setTimeout(() => {
      setTestStatus((p) => ({ ...p, [key]: 'idle' }));
    }, 2000);
  };

  const handleDeleteAnimation = async (type, filename) => {
    try {
      await api.deleteAnimation(type, filename);
      loadAnimations();
    } catch (e) {
      console.error('Failed to delete animation:', e);
    }
  };

  const handleUploadAnimation = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAnimLoading(true);
    for (const file of files) {
      try {
        await api.uploadAnimation('body', file);
      } catch (err) {
        console.error('Failed to upload animation:', err);
      }
    }
    loadAnimations();
    e.target.value = '';
    setAnimLoading(false);
  };

  const loadMemories = async () => {
    try {
      const data = await api.getMemories();
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
    }
  };

  const loadAvatars = async () => {
    try {
      const data = await api.getAvatars();
      setAvatars(data);
    } catch (err) {
      console.error('Failed to load avatars:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'avatar') {
      loadAvatars();
    }
  }, [activeTab]);

  const handleUploadAvatar = async () => {
    if (!uploadForm.vrmFile || !uploadForm.name) {
      setSaveMessage('Please provide both a name and a VRM file.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadForm.name);
      formData.append('vrm', uploadForm.vrmFile);
      if (uploadForm.pfpFile) {
        formData.append('pfp', uploadForm.pfpFile);
      }

      const newAvatar = await api.uploadAvatar(formData);
      setAvatars([newAvatar, ...avatars]);
      setSaveMessage('Avatar saved to library! ✨');
      setShowUploadForm(false);
      setUploadForm({ name: '', vrmFile: null, pfpFile: null, pfpPreview: null });
      
      // Auto-select the newly uploaded avatar
      handleSelectAvatar(newAvatar);
    } catch (err) {
      setSaveMessage('Failed to upload avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectAvatar = async (avatar) => {
    try {
      const url = api.getUploadUrl(avatar.file_path);
      if (onVRMFileSelected) {
        // We pass the URL string now
        onVRMFileSelected(url);
      }
      setCurrentVRMName(avatar.name);
      localStorage.setItem('waifu-vrm-name', avatar.name);
      localStorage.setItem('waifu-vrm-id', avatar.id);
      setSaveMessage(`Switched to ${avatar.name}!`);
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to load selected avatar.');
    }
  };

  const handleRemoveVRM = () => {
    if (onVRMFileSelected) onVRMFileSelected(null);
    setCurrentVRMName(null);
    localStorage.removeItem('waifu-vrm-name');
    localStorage.removeItem('waifu-vrm-id');
  };

  const handleDeleteAvatar = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this avatar?')) return;
    try {
      await api.deleteAvatar(id);
      setAvatars(avatars.filter(a => a.id !== id));
      if (localStorage.getItem('waifu-vrm-id') === id) {
        handleRemoveVRM();
      }
    } catch (err) {
      setSaveMessage('Failed to delete avatar.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings({ displayName, companion });
      setSaveMessage('Settings saved! ✨');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await api.setApiKey(apiKeyInput.trim());
      setHasCustomKey(true);
      setApiKeyInput('');
      setSaveMessage('Gemini API key saved securely! 🔐');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage(err.data?.error || 'Failed to save Gemini API key.');
      setTimeout(() => setSaveMessage(''), 4000);
    }
  };

  const handleSetGroqKey = async () => {
    if (!groqApiKeyInput.trim()) return;
    try {
      await api.fetchApi('/api/settings/groq-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: groqApiKeyInput.trim() })
      });
      setHasGroqKey(true);
      setGroqApiKeyInput('');
      setSaveMessage('Groq API key saved securely! 🔐');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage(err.data?.error || 'Failed to save Groq API key.');
      setTimeout(() => setSaveMessage(''), 4000);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!window.confirm('Are you sure you want to remove your custom Gemini key?')) return;
    try {
      await api.removeApiKey();
      setHasCustomKey(false);
      setSaveMessage('Gemini API key removed.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to remove Gemini API key.');
    }
  };

  const handleRemoveGroqKey = async () => {
    if (!window.confirm('Are you sure you want to remove your custom Groq key?')) return;
    try {
      await api.fetchApi('/api/settings/groq-key', { method: 'DELETE' });
      setHasGroqKey(false);
      setSaveMessage('Groq API key removed.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to remove Groq API key.');
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    try {
      await api.deleteMemory(memoryId);
      setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };


  const tabs = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'companion', label: t('settings.tabs.companion'), icon: Sparkles },
    { id: 'avatar', label: t('settings.tabs.avatar'), icon: Image },
    { id: 'voice', label: t('settings.tabs.voice'), icon: Volume2 },
    { id: 'apikey', label: t('settings.tabs.apikey'), icon: Key },
    { id: 'memories', label: t('settings.tabs.memories'), icon: Brain },
    { id: 'animations', label: t('settings.tabs.animations'), icon: Film },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '12px 24px 0',
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                background: activeTab === tab.id ? 'var(--color-accent-glow)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                borderRadius: '8px 8px 0 0',
                color: activeTab === tab.id ? 'var(--color-accent-light)' : 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.82rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Globe size={18} className="icon" />
                {t('settings.system.language')}
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label>{t('settings.system.selectLanguage')}</label>
                <select 
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="en">{t('settings.system.english')}</option>
                  <option value="ar">{t('settings.system.arabic')}</option>
                </select>
              </div>

              <div className="settings-section-title">
                <User size={18} className="icon" />
                {t('settings.profile.title')}
              </div>
              <div className="form-group">
                <label htmlFor="display-name">Display Name</label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="What should I call you?"
                />
                <div className="hint">Your companion will address you by this name.</div>
              </div>
              <button className="btn btn-primary btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Companion Tab */}
          {activeTab === 'companion' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Sparkles size={18} className="icon" />
                {t('settings.companion.title')}
              </div>
              <div className="form-group">
                <label htmlFor="companion-name">Companion Name</label>
                <input
                  id="companion-name"
                  type="text"
                  value={companion.name}
                  onChange={(e) => setCompanion((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Aria, Luna, Sakura..."
                />
              </div>
              <div className="form-group">
                <label htmlFor="companion-tone">Tone & Style</label>
                <input
                  id="companion-tone"
                  type="text"
                  value={companion.tone}
                  onChange={(e) => setCompanion((p) => ({ ...p, tone: e.target.value }))}
                  placeholder="e.g., cute, friendly, emotional, witty..."
                />
                <div className="hint">Comma-separated list of personality traits.</div>
              </div>
              <div className="form-group">
                <label htmlFor="companion-personality">Core Personality</label>
                <textarea
                  id="companion-personality"
                  value={companion.personality}
                  onChange={(e) => setCompanion((p) => ({ ...p, personality: e.target.value }))}
                  placeholder="Describe the core personality..."
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label htmlFor="companion-backstory">Backstory</label>
                <textarea
                  id="companion-backstory"
                  value={companion.backstory}
                  onChange={(e) => setCompanion((p) => ({ ...p, backstory: e.target.value }))}
                  placeholder="Give your companion a backstory..."
                  rows={3}
                />
              </div>
              <button className="btn btn-primary btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Personality'}
              </button>
            </div>
          )}

          {/* Avatar Tab */}
          {activeTab === 'avatar' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Image size={18} className="icon" />
                {t('settings.avatar.title')}
                <button 
                  className="btn btn-secondary" 
                  style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '0.75rem' }}
                  onClick={() => setShowUploadForm(!showUploadForm)}
                >
                  {showUploadForm ? 'Cancel' : <><Plus size={14} style={{ marginRight: 4 }} /> Add New</>}
                </button>
              </div>

              {showUploadForm ? (
                <div className="upload-form" style={{ 
                  background: 'var(--color-bg-secondary)', 
                  padding: '16px', 
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    {/* PFP Upload */}
                    <div 
                      onClick={() => pfpInputRef.current?.click()}
                      style={{ 
                        width: '80px', 
                        height: '80px', 
                        borderRadius: '12px', 
                        background: 'var(--color-surface)',
                        border: '2px dashed var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      {uploadForm.pfpPreview ? (
                        <img src={uploadForm.pfpPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <>
                          <Camera size={20} style={{ color: 'var(--color-text-muted)', marginBottom: 4 }} />
                          <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>Icon</span>
                        </>
                      )}
                      <input 
                        ref={pfpInputRef}
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setUploadForm({ ...uploadForm, pfpFile: file, pfpPreview: URL.createObjectURL(file) });
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div className="form-group" style={{ marginBottom: 12 }}>
                        <label>Companion Name</label>
                        <input 
                          type="text" 
                          value={uploadForm.name}
                          onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                          placeholder="e.g. Aria"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label>VRM Model File</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ flex: 1, fontSize: '0.75rem' }}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploadForm.vrmFile ? uploadForm.vrmFile.name : 'Select .vrm File'}
                          </button>
                          <input 
                            ref={fileInputRef}
                            type="file" 
                            accept=".vrm"
                            onChange={(e) => setUploadForm({ ...uploadForm, vrmFile: e.target.files?.[0] })}
                            style={{ display: 'none' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', marginTop: '16px' }}
                    onClick={handleUploadAvatar}
                    disabled={isUploading || !uploadForm.vrmFile || !uploadForm.name}
                  >
                    {isUploading ? 'Uploading...' : 'Save to Library'}
                  </button>
                </div>
              ) : (
                <div className="avatar-grid" style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
                  gap: '12px',
                  marginTop: '12px'
                }}>
                  {avatars.length === 0 ? (
                    <div style={{ 
                      gridColumn: '1 / -1', 
                      padding: '40px 20px', 
                      textAlign: 'center', 
                      background: 'var(--color-bg-secondary)', 
                      borderRadius: '12px',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.85rem'
                    }}>
                      <Image size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                      <p>Your library is empty.<br/>Upload your first VRM model!</p>
                    </div>
                  ) : (
                    avatars.map((avatar) => (
                      <div 
                        key={avatar.id}
                        className={`avatar-card ${currentVRMName === avatar.name ? 'active' : ''}`}
                        onClick={() => handleSelectAvatar(avatar)}
                        style={{
                          background: 'var(--color-surface)',
                          border: `2px solid ${currentVRMName === avatar.name ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          borderRadius: '16px',
                          padding: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          position: 'relative'
                        }}
                      >
                        <div style={{ 
                          width: '70px', 
                          height: '70px', 
                          borderRadius: '50%', 
                          background: 'var(--color-bg-secondary)',
                          marginBottom: '8px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid var(--color-border)'
                        }}>
                          {avatar.pfp_path ? (
                            <img src={api.getUploadUrl(avatar.pfp_path)} alt={avatar.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <User size={30} style={{ opacity: 0.3 }} />
                          )}
                        </div>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          textAlign: 'center',
                          color: currentVRMName === avatar.name ? 'var(--color-accent-light)' : 'var(--color-text)'
                        }}>{avatar.name}</span>
                        
                        <button 
                          onClick={(e) => handleDeleteAvatar(avatar.id, e)}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            background: 'rgba(255,0,0,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ff4d4d',
                            cursor: 'pointer',
                            opacity: 0.5
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = 1}
                          onMouseLeave={(e) => e.target.style.opacity = 0.5}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="hint" style={{ marginTop: 16 }}>
                Once saved, your models stay in the app library. Click a card to switch companions.
              </div>
            </div>
          )}

          {/* Voice Tab */}
          {activeTab === 'voice' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Volume2 size={18} className="icon" />
                {t('settings.voice.title')}
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="tts-enabled" 
                  checked={companion.ttsEnabled}
                  onChange={(e) => setCompanion({ ...companion, ttsEnabled: e.target.checked })}
                />
                <label htmlFor="tts-enabled" style={{ margin: 0 }}>{t('settings.voice.enableTTS')}</label>
              </div>

              {companion.ttsEnabled && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div className="form-group">
                      <label>{t('settings.voice.mic')}</label>
                      <select 
                        value={companion.audioInputDevice} 
                        onChange={(e) => setCompanion({ ...companion, audioInputDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="default">{t('settings.voice.systemDefault')}</option>
                        {audioDevices.inputs.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{t('settings.voice.speaker')}</label>
                      <select 
                        value={companion.audioOutputDevice} 
                        onChange={(e) => setCompanion({ ...companion, audioOutputDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="default">{t('settings.voice.systemDefault')}</option>
                        {audioDevices.outputs.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{t('settings.voice.hardwareAccel')}</label>
                      <select 
                        value={companion.ttsDevice} 
                        onChange={(e) => setCompanion({ ...companion, ttsDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="cpu">{t('settings.voice.cpuStandard')}</option>
                        <option value="gpu">{t('settings.voice.gpuAccel')}</option>
                      </select>
                      <div className="hint">
                        {ttsStatus.device.includes('gpu') || ttsStatus.device === 'cuda'
                          ? `✅ GPU {t('settings.voice.hardwareAccel')} ACTIVE (${ttsStatus.device}).`
                          : ttsStatus.status === 'offline'
                          ? "❌ TTS Server Offline."
                          : "⚠️ GPU NOT FOUND. PyTorch is running on CPU."}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>{t('settings.voice.ttsEngine')}</label>
                      <select 
                        value={companion.ttsEngine} 
                        onChange={(e) => setCompanion({ ...companion, ttsEngine: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="onnx">{t('settings.voice.onnxStandard')}</option>
                        <option value="torch">{t('settings.voice.torchFull')}</option>
                      </select>
                      <div className="hint">
                        {companion.ttsEngine === 'torch' 
                          ? "Using full PyTorch engine. Needs 'torch' and 'kokoro' installed."
                          : "Using high-speed ONNX engine (Recommended)."}
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label>{t('settings.voice.testVoice')}</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="Type something to test..."
                        style={{ flex: 1 }}
                      />
                      <button 
                        className="btn btn-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          speak(testText, {
                            enabled: true,
                            voice: companion.ttsVoice,
                            outputDeviceId: companion.audioOutputDevice,
                            device: companion.ttsDevice,
                            engine: companion.ttsEngine
                          });
                        }}
                        disabled={isTestingVoice || !testText.trim()}
                        style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
                      >
                        {isTestingVoice ? 'Playing...' : '▶ Test'}
                      </button>
                    </div>
                  </div>

                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>{t('settings.voice.availableVoices')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {VOICES.map((v) => (
                      <div 
                        key={v.id} 
                        onClick={() => setCompanion({ ...companion, ttsVoice: v.id })}
                        style={{
                          padding: '12px',
                          background: companion.ttsVoice === v.id ? 'var(--color-accent-glow)' : 'var(--color-surface)',
                          border: `1px solid ${companion.ttsVoice === v.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>{v.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{v.desc}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              
              <button className="btn btn-primary btn-save" onClick={handleSave} disabled={saving} style={{ marginTop: '24px' }}>
                {saving ? 'Saving...' : t('settings.voice.save')}
              </button>
            </div>
          )}

           {/* API Key Tab */}
          {activeTab === 'apikey' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Sparkles size={18} className="icon" />
                {t('settings.apikey.modelSelectionTitle')}
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label>{t('settings.apikey.aiProvider')}</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button 
                    className={`btn ${companion.llmProvider === 'gemini' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => setCompanion(p => ({ ...p, llmProvider: 'gemini', llmModel: 'gemini-3.1-flash-lite' }))}
                  >
                    Google Gemini
                  </button>
                  <button 
                    className={`btn ${companion.llmProvider === 'groq' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => setCompanion(p => ({ ...p, llmProvider: 'groq', llmModel: 'llama-3.1-70b-versatile' }))}
                  >
                    Groq (Super Fast)
                  </button>
                </div>

                <label htmlFor="llm-model">{t('settings.apikey.preferredModel').replace('{provider}', companion.llmProvider === 'groq' ? 'Groq' : 'Gemini')}</label>
                <select
                  id="llm-model"
                  value={companion.llmModel}
                  onChange={(e) => setCompanion((p) => ({ ...p, llmModel: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: '0.85rem'
                  }}
                >
                  {(companion.llmProvider === 'groq' ? GROQ_MODELS : GEMINI_MODELS).map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.free ? '(Free)' : ''}
                    </option>
                  ))}
                </select>
                <div className="hint" style={{ marginTop: 8 }}>
                  {(companion.llmProvider === 'groq' ? GROQ_MODELS : GEMINI_MODELS).find(m => m.id === companion.llmModel)?.desc}
                </div>
                <button 
                  className="btn btn-primary btn-save" 
                  style={{ marginTop: 12, width: 'auto', padding: '6px 16px' }}
                  onClick={handleSave} 
                  disabled={saving}
                >
                  {saving ? 'Saving...' : t('settings.apikey.updateModel')}
                </button>
              </div>

              <div className="settings-section-title" style={{ marginTop: 32 }}>
                <Key size={18} className="icon" />
                {t('settings.apikey.bringYourOwnKey')}
              </div>
              <div className="api-key-section" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <img src="https://www.gstatic.com/lamda/images/favicon_v2_16x16.png" alt="Gemini" style={{ width: 16, height: 16 }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('settings.apikey.geminiKey')}</span>
                </div>
                
                <div className={`api-key-status ${hasCustomKey ? 'active' : 'inactive'}`} style={{ marginBottom: 12 }}>
                  <Shield size={16} />
                  {hasCustomKey
                    ? t('settings.apikey.customGeminiActive')
                    : t('settings.apikey.defaultGeminiActive')
                  }
                </div>

                {!hasCustomKey ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={t("settings.apikey.pasteGeminiKey")}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSetApiKey} disabled={saving || !apiKeyInput.trim()}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-danger" onClick={handleRemoveApiKey} style={{ width: '100%' }}>
                    {t('settings.apikey.removeGeminiKey')}
                  </button>
                )}
                <div className="hint" style={{ marginTop: 8 }}>
                  {t('settings.apikey.getFreeKeyAt')} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
                </div>
              </div>

              <div className="api-key-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: 16, height: 16, background: '#f55036', borderRadius: '4px' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('settings.apikey.groqKey')}</span>
                </div>

                <div className={`api-key-status ${hasGroqKey ? 'active' : 'inactive'}`} style={{ marginBottom: 12 }}>
                  <Shield size={16} />
                  {hasGroqKey
                    ? t('settings.apikey.customGroqActive')
                    : t('settings.apikey.defaultGroqActive')
                  }
                </div>

                {!hasGroqKey ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="password"
                      value={groqApiKeyInput}
                      onChange={(e) => setGroqApiKeyInput(e.target.value)}
                      placeholder={t("settings.apikey.pasteGroqKey")}
                      style={{ flex: 1 }}
                    />
                    <button className="btn btn-primary" onClick={handleSetGroqKey} disabled={saving || !groqApiKeyInput.trim()}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-danger" onClick={handleRemoveGroqKey} style={{ width: '100%' }}>
                    {t('settings.apikey.removeGroqKey')}
                  </button>
                )}
                <div className="hint" style={{ marginTop: 8 }}>
                  {t('settings.apikey.getFreeKeyAt')} <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Console</a>
                </div>
              </div>
            </div>
          )}

          {/* Memories Tab */}
          {activeTab === 'memories' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Brain size={18} className="icon" />
                {t('settings.memories.title')}
              </div>
              {memories.length === 0 ? (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.85rem',
                }}>
                  <Brain size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p>{t('settings.memories.empty')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {memories.map((memory) => (
                    <div
                      key={memory.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <span style={{ flex: 1 }}>💭 {memory.content}</span>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleDeleteMemory(memory.id)}
                      >
                        Forget
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Animations Tab */}
          {activeTab === 'animations' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Film size={18} className="icon" />
                {t('settings.animations.title')}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                {t('settings.animations.hint')}
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-primary" onClick={loadAnimations} disabled={animLoading} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  <RefreshCw size={14} style={{ marginRight: 6 }} />
                  {t('settings.animations.refresh')}
                </button>
                <button className="btn btn-primary" onClick={() => animFileInputRef.current?.click()} disabled={animLoading} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  <Upload size={14} style={{ marginRight: 6 }} />
                  {t('settings.animations.upload')}
                </button>
                <input
                  ref={animFileInputRef}
                  type="file"
                  accept=".json,.bvh"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleUploadAnimation}
                />
              </div>

              {/* Facial Expressions */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  {t('settings.animations.facial')}
                </h4>
                {animations.facial.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                    {t('settings.animations.empty')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {animations.facial.map((anim) => (
                      <div key={anim.filename} className="animation-card">
                        <div className="animation-card-info">
                          <span className="animation-card-name">{anim.name}</span>
                          <span className="animation-card-meta">{anim.duration.toFixed(1)}s {anim.loop ? '(loop)' : ''}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => handleTestAnimation('facial', anim.filename)}
                            disabled={testStatus[`facial/${anim.filename}`] === 'playing'}>
                            <Play size={12} style={{ marginRight: 4 }} />
                            {testStatus[`facial/${anim.filename}`] === 'playing' ? t('common.playing') : t('common.test')}
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteAnimation('facial', anim.filename)}>
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Body Animations */}
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  {t('settings.animations.body')}
                </h4>
                {animations.body.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                    {t('settings.animations.empty')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {animations.body.map((anim) => (
                      <div key={anim.filename} className="animation-card">
                        <div className="animation-card-info">
                          <span className="animation-card-name">
                            {anim.name}
                            {anim.format === 'bvh' && (
                              <span style={{ marginLeft: 6, fontSize: '0.65rem', fontWeight: 600, color: '#a78bfa', background: 'rgba(167,139,250,0.15)', padding: '1px 6px', borderRadius: 4, verticalAlign: 'middle' }}>BVH</span>
                            )}
                          </span>
                          <span className="animation-card-meta">{anim.duration.toFixed(1)}s {anim.loop ? '(loop)' : ''} {anim.format === 'bvh' ? '| motion capture' : ''}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => handleTestAnimation('body', anim.filename)}
                            disabled={testStatus[`body/${anim.filename}`] === 'playing'}>
                            <Play size={12} style={{ marginRight: 4 }} />
                            {testStatus[`body/${anim.filename}`] === 'playing' ? t('common.playing') : t('common.test')}
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteAnimation('body', anim.filename)}>
                            {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20, padding: 12, background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)', textAlign: 'center' }}>
                <FolderOpen size={20} style={{ opacity: 0.4, marginBottom: 4 }} />
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  {t('settings.animations.folderHint')}
                </p>
              </div>
            </div>
          )}

          {/* Save Status */}
          {saveMessage && <div className="save-status">{saveMessage}</div>}
        </div>
      </div>
    </div>
  );
}
