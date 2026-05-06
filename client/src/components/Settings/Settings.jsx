import { useState, useEffect } from 'react';
import * as api from '../../utils/api.js';
import { useTTS } from '../../hooks/useTTS.js';

const TABS = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'companion', label: 'Companion', icon: '👤' },
  { id: 'avatar', label: 'Avatar', icon: '🎭' },
  { id: 'voice', label: 'Voice', icon: '🔊' },
  { id: 'memories', label: 'Memory', icon: '🧠' },
];

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

export default function Settings({ onClose, onVRMFileSelected }) {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Settings State
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
    ttsDevice: 'cpu'
  });
  const [apiKey, setApiKey] = useState('');
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);
  const [memories, setMemories] = useState([]);
  
  // Audio Devices State
  const [audioDevices, setAudioDevices] = useState({
    inputs: [],
    outputs: []
  });
  
  // Voice Tester State
  const [testText, setTestText] = useState("Hello! How do I sound?");
  const { speak, isPlaying: isTestingVoice } = useTTS();

  useEffect(() => {
    loadSettings();
    loadMemories();
    loadAudioDevices();
    
    // Listen for device changes
    navigator.mediaDevices.ondevicechange = loadAudioDevices;
    return () => {
      navigator.mediaDevices.ondevicechange = null;
    };
  }, []);

  const loadAudioDevices = async () => {
    try {
      // Request permissions first to get device names
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

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setDisplayName(data.user.displayName);
      setCompanion(data.companion);
      setHasCustomApiKey(data.hasCustomApiKey);
    } catch (err) {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const loadMemories = async () => {
    try {
      const data = await api.getMemories();
      setMemories(data);
    } catch (err) {
      // Ignore
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await api.updateSettings({
        displayName,
        companion: {
          ...companion,
        },
      });

      if (apiKey.trim()) {
        await api.setApiKey(apiKey.trim());
        setHasCustomApiKey(true);
        setApiKey('');
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!confirm('Are you sure you want to remove your custom API key?')) return;
    try {
      await api.removeApiKey();
      setHasCustomApiKey(false);
      setSuccess('API key removed.');
    } catch (err) {
      setError('Failed to remove API key.');
    }
  };

  const handleDeleteMemory = async (id) => {
    try {
      await api.deleteMemory(id);
      setMemories(memories.filter((m) => m.id !== id));
    } catch (err) {
      setError('Failed to delete memory.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onVRMFileSelected(file);
      setSuccess('Avatar model loaded!');
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal animate-in">
        <header className="settings-header">
          <div className="header-content">
            <h2>Settings</h2>
            <p>Customize your experience</p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>

          <main className="settings-content">
            {loading ? (
              <div className="settings-loading">
                <div className="spinner"></div>
                <p>Loading your preferences...</p>
              </div>
            ) : (
              <>
                {activeTab === 'general' && (
                  <section className="settings-section animate-fade-in">
                    <h3>⚙️ User Profile</h3>
                    <div className="settings-card">
                      <div className="form-group">
                        <label>Your Display Name</label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="What should she call you?"
                        />
                        <p className="help-text">Used by the AI to address you personally.</p>
                      </div>
                    </div>

                    <h3>🔑 API Configuration</h3>
                    <div className="settings-card">
                      <div className="form-group">
                        <label>Gemini API Key</label>
                        {hasCustomApiKey ? (
                          <div className="api-key-status">
                            <span className="status-badge active">Active</span>
                            <span className="status-text">Your custom key is being used.</span>
                            <button className="btn-link" onClick={handleRemoveApiKey}>Remove Key</button>
                          </div>
                        ) : (
                          <>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder="Enter your Gemini API key"
                            />
                            <p className="help-text">
                              Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {activeTab === 'companion' && (
                  <section className="settings-section animate-fade-in">
                    <h3>👤 Personality & Appearance</h3>
                    <div className="settings-card">
                      <div className="form-group">
                        <label>Companion Name</label>
                        <input
                          type="text"
                          value={companion.name}
                          onChange={(e) => setCompanion({ ...companion, name: e.target.value })}
                          placeholder="Aria"
                        />
                      </div>

                      <div className="form-group">
                        <label>Tone & Vibe</label>
                        <input
                          type="text"
                          value={companion.tone}
                          onChange={(e) => setCompanion({ ...companion, tone: e.target.value })}
                          placeholder="friendly, playful, empathetic"
                        />
                      </div>

                      <div className="form-group">
                        <label>Core Personality</label>
                        <textarea
                          value={companion.personality}
                          onChange={(e) => setCompanion({ ...companion, personality: e.target.value })}
                          rows={3}
                          placeholder="Who is she? (e.g. A helpful assistant, a witty friend...)"
                        />
                      </div>

                      <div className="form-group">
                        <label>Backstory</label>
                        <textarea
                          value={companion.backstory}
                          onChange={(e) => setCompanion({ ...companion, backstory: e.target.value })}
                          rows={3}
                          placeholder="What is her history?"
                        />
                      </div>
                    </div>
                  </section>
                )}

                {activeTab === 'avatar' && (
                  <section className="settings-section animate-fade-in">
                    <h3>Avatar Model</h3>
                    <div className="avatar-upload-card">
                      <div className="card-icon">🎭</div>
                      <h4>Change Model</h4>
                      <p>Upload a <code>.vrm</code> file to change your companion's appearance.</p>
                      <label className="btn btn-primary btn-block cursor-pointer">
                        Choose VRM File
                        <input type="file" accept=".vrm" onChange={handleFileChange} hidden />
                      </label>
                    </div>

                    <div className="resources-card">
                      <h5>Need a model?</h5>
                      <ul>
                        <li><a href="https://vroid.com/en/studio" target="_blank">VRoid Studio</a> - Create your own for free</li>
                        <li><a href="https://hub.vroid.com/" target="_blank">VRoid Hub</a> - Download community models</li>
                        <li><a href="https://booth.pm/en/browse/3D%20Models" target="_blank">Booth.pm</a> - High-quality premium models</li>
                      </ul>
                    </div>
                  </section>
                )}

                {activeTab === 'voice' && (
                  <section className="settings-section animate-fade-in">
                    <div className="settings-toggle-card">
                      <div className="toggle-info">
                        <h4>Enable Voice (TTS)</h4>
                        <p>Let your companion speak her responses out loud.</p>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={companion.ttsEnabled}
                          onChange={(e) => setCompanion({ ...companion, ttsEnabled: e.target.checked })}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>

                    <div className="settings-card">
                      <div className="form-group">
                        <label>Hardware Acceleration</label>
                        <select 
                          value={companion.ttsDevice} 
                          onChange={(e) => setCompanion({ ...companion, ttsDevice: e.target.value })}
                        >
                          <option value="cpu">CPU (Standard)</option>
                          <option value="gpu">GPU (Hardware Accelerated)</option>
                        </select>
                        <p className="help-text">
                          {companion.ttsDevice === 'gpu' 
                            ? "Using GPU acceleration (CUDA/DirectML)."
                            : "Using optimized INT8 model on your CPU."}
                        </p>
                      </div>

                      <div className="form-group">
                        <label>TTS Engine</label>
                        <select 
                          value={companion.ttsEngine || 'onnx'} 
                          onChange={(e) => setCompanion({ ...companion, ttsEngine: e.target.value })}
                        >
                          <option value="onnx">ONNX (Standard)</option>
                          <option value="torch">PyTorch (Requires torch)</option>
                        </select>
                        <p className="help-text">
                          {companion.ttsEngine === 'torch' 
                            ? "Using full PyTorch engine. Needs 'torch' and 'kokoro' installed."
                            : "Using high-speed ONNX engine (Recommended)."}
                        </p>
                      </div>

                      <div className="form-group">
                        <label>Microphone (Input)</label>
                        <select 
                          value={companion.audioInputDevice} 
                          onChange={(e) => setCompanion({ ...companion, audioInputDevice: e.target.value })}
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
                        >
                          <option value="default">System Default</option>
                          {audioDevices.outputs.map(d => (
                            <option key={d.id} value={d.id}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="voice-grid-header">
                      <h3>Available Voices</h3>
                      <p>Powered by local Kokoro TTS engine</p>
                    </div>

                    <div className="settings-card" style={{ padding: '16px', background: 'rgba(168, 130, 255, 0.05)' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
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
                            className="btn-primary"
                            onClick={(e) => {
                              e.preventDefault();
                              speak(testText, {
                                enabled: true,
                                voice: companion.ttsVoice,
                                outputDeviceId: companion.audioOutputDevice,
                                device: companion.ttsDevice || 'cpu',
                                engine: companion.ttsEngine || 'onnx'
                              });
                            }}
                            disabled={isTestingVoice || !testText.trim()}
                            style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
                          >
                            {isTestingVoice ? 'Playing...' : '▶ Test'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="voice-grid">
                      {VOICES.map((v) => (
                        <div 
                          key={v.id} 
                          className={`voice-card ${companion.ttsVoice === v.id ? 'selected' : ''}`}
                          onClick={() => setCompanion({ ...companion, ttsVoice: v.id })}
                        >
                          <div className="voice-status">
                            {companion.ttsVoice === v.id && <span className="check">✓</span>}
                          </div>
                          <div className="voice-info">
                            <span className="voice-name">{v.name}</span>
                            <span className="voice-desc">{v.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activeTab === 'memories' && (
                  <section className="settings-section animate-fade-in">
                    <div className="memory-header">
                      <h3>Long-term Memory</h3>
                      <p>Information she has learned about you over time.</p>
                    </div>
                    
                    <div className="memory-list">
                      {memories.length === 0 ? (
                        <div className="empty-state">
                          <p>No memories stored yet. Keep chatting!</p>
                        </div>
                      ) : (
                        memories.map((memory) => (
                          <div key={memory.id} className="memory-item">
                            <div className="memory-content">
                              <span className="category">{memory.category}</span>
                              <p>{memory.content}</p>
                            </div>
                            <button className="delete-btn" onClick={() => handleDeleteMemory(memory.id)}>&times;</button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>

        <footer className="settings-footer">
          {error && <div className="settings-alert error">{error}</div>}
          {success && <div className="settings-alert success">{success}</div>}
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
