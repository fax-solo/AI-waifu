import { useState, useEffect, useRef } from 'react';
import { X, User, Sparkles, Key, Brain, Shield, Image, Volume2, Camera, Plus, Trash2 } from 'lucide-react';
import * as api from '../../utils/api.js';
import { useTTS } from '../../hooks/useTTS.js';

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
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'Fast & efficient (Recommended)', free: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: 'Complex reasoning & intelligence', free: true },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', desc: 'Next-gen capabilities', free: true },
  { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', desc: 'Legacy stable model', free: true },
];

export default function Settings({ onClose, onVRMFileSelected }) {
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
    llmModel: 'gemini-1.5-flash'
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [memories, setMemories] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [currentVRMName, setCurrentVRMName] = useState(null);
  
  // Avatar Library State
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
          llmModel: data.companion.llmModel ?? 'gemini-1.5-flash'
        });
        setHasCustomKey(data.hasCustomApiKey);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }

    async function checkTTS() {
      try {
        const res = await fetch('http://127.0.0.1:5000/health');
        const data = await res.json();
        setTtsStatus(data);
      } catch (err) {
        setTtsStatus({ status: 'offline', device: 'none' });
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
      setSaveMessage('API key saved securely! 🔐');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage(err.data?.error || 'Failed to save API key.');
      setTimeout(() => setSaveMessage(''), 4000);
    }
  };

  const handleRemoveApiKey = async () => {
    try {
      await api.removeApiKey();
      setHasCustomKey(false);
      setSaveMessage('API key removed.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage('Failed to remove API key.');
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
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'companion', label: 'Companion', icon: Sparkles },
    { id: 'avatar', label: 'Avatar', icon: Image },
    { id: 'voice', label: 'Voice', icon: Volume2 },
    { id: 'apikey', label: 'API Key', icon: Key },
    { id: 'memories', label: 'Memories', icon: Brain },
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
                <User size={18} className="icon" />
                Your Profile
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
                Companion Personality
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
                Avatar Library
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
                Text-to-Speech Voice
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="tts-enabled" 
                  checked={companion.ttsEnabled}
                  onChange={(e) => setCompanion({ ...companion, ttsEnabled: e.target.checked })}
                />
                <label htmlFor="tts-enabled" style={{ margin: 0 }}>Enable Voice Synthesizer</label>
              </div>

              {companion.ttsEnabled && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div className="form-group">
                      <label>Microphone (Input)</label>
                      <select 
                        value={companion.audioInputDevice} 
                        onChange={(e) => setCompanion({ ...companion, audioInputDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="default">System Default</option>
                        {audioDevices.inputs.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Speaker (Output)</label>
                      <select 
                        value={companion.audioOutputDevice} 
                        onChange={(e) => setCompanion({ ...companion, audioOutputDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="default">System Default</option>
                        {audioDevices.outputs.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Hardware Acceleration</label>
                      <select 
                        value={companion.ttsDevice} 
                        onChange={(e) => setCompanion({ ...companion, ttsDevice: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="cpu">CPU (Standard)</option>
                        <option value="gpu">GPU (Hardware Accelerated)</option>
                      </select>
                      <div className="hint">
                        {ttsStatus.device === 'cuda' 
                          ? "✅ GPU Hardware Acceleration ACTIVE (CUDA)."
                          : ttsStatus.status === 'offline'
                          ? "❌ TTS Server Offline."
                          : "⚠️ GPU NOT FOUND. PyTorch is running on CPU."}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>TTS Engine</label>
                      <select 
                        value={companion.ttsEngine} 
                        onChange={(e) => setCompanion({ ...companion, ttsEngine: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                      >
                        <option value="onnx">ONNX (Standard)</option>
                        <option value="torch">PyTorch (Requires torch)</option>
                      </select>
                      <div className="hint">
                        {companion.ttsEngine === 'torch' 
                          ? "Using full PyTorch engine. Needs 'torch' and 'kokoro' installed."
                          : "Using high-speed ONNX engine (Recommended)."}
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label>Test Voice Model</label>
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

                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Available Voices</label>
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
                {saving ? 'Saving...' : 'Save Voice Settings'}
              </button>
            </div>
          )}

           {/* API Key Tab */}
          {activeTab === 'apikey' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Sparkles size={18} className="icon" />
                AI Model Selection
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label htmlFor="llm-model">Preferred Gemini Model</label>
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
                  {GEMINI_MODELS.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.free ? '(Free)' : ''}
                    </option>
                  ))}
                </select>
                <div className="hint" style={{ marginTop: 8 }}>
                  {GEMINI_MODELS.find(m => m.id === companion.llmModel)?.desc}
                </div>
                <button 
                  className="btn btn-primary btn-save" 
                  style={{ marginTop: 12, width: 'auto', padding: '6px 16px' }}
                  onClick={handleSave} 
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Update Model'}
                </button>
              </div>

              <div className="settings-section-title" style={{ marginTop: 32 }}>
                <Key size={18} className="icon" />
                Bring Your Own API Key
              </div>
              <div className="api-key-section">
                <div className={`api-key-status ${hasCustomKey ? 'active' : 'inactive'}`}>
                  <Shield size={16} />
                  {hasCustomKey
                    ? 'Custom API key is active — no message limits!'
                    : 'Using default server key (limited messages per day)'
                  }
                </div>

                {!hasCustomKey ? (
                  <>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <input
                        id="api-key-input"
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Paste your Gemini API key..."
                      />
                      <div className="hint">
                        Get a free key at{' '}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--color-accent-light)' }}
                        >
                          Google AI Studio
                        </a>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={handleSetApiKey}>
                      Save API Key
                    </button>
                  </>
                ) : (
                  <div className="api-key-actions">
                    <button className="btn btn-danger" onClick={handleRemoveApiKey}>
                      Remove API Key
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Memories Tab */}
          {activeTab === 'memories' && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Brain size={18} className="icon" />
                What I Remember About You
              </div>
              {memories.length === 0 ? (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.85rem',
                }}>
                  <Brain size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p>No memories yet! Chat with me and I'll start remembering things about you.</p>
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

          {/* Save Status */}
          {saveMessage && <div className="save-status">{saveMessage}</div>}
        </div>
      </div>
    </div>
  );
}
