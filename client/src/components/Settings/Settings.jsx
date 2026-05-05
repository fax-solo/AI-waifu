import { useState, useEffect } from 'react';
import { X, User, Sparkles, Key, Brain, Shield } from 'lucide-react';
import * as api from '../../utils/api.js';

export default function Settings({ onClose }) {
  const [settings, setSettings] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [companion, setCompanion] = useState({
    name: '',
    tone: '',
    personality: '',
    backstory: '',
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [memories, setMemories] = useState([]);
  const [activeTab, setActiveTab] = useState('profile');

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
        });
        setHasCustomKey(data.hasCustomApiKey);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
    load();
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      const data = await api.getMemories();
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
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

          {/* API Key Tab */}
          {activeTab === 'apikey' && (
            <div className="settings-section">
              <div className="settings-section-title">
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
