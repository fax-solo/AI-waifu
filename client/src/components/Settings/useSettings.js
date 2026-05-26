import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../utils/api.js';
import { useTTS } from '../../hooks/useTTS.js';
import { DEFAULT_SHORTCUTS } from '../../hooks/useShortcuts.js';
import { version as APP_VERSION } from '../../../../package.json';

const VOICES = [
  { id: 'af_bella', name: 'Bella (US Female)', desc: 'Friendly & clear' },
  { id: 'af_sarah', name: 'Sarah (US Female)', desc: 'Soft & calm' },
  { id: 'af_sky', name: 'Sky (US Female)', desc: 'Bright & energetic' },
  { id: 'af_nicole', name: 'Nicole (US Female)', desc: 'Professional' },
  { id: 'am_adam', name: 'Adam (US Male)', desc: 'Deep & steady' },
  { id: 'am_michael', name: 'Michael (US Male)', desc: 'Natural' },
  { id: 'bf_emma', name: 'Emma (UK Female)', desc: 'British accent' },
  { id: 'bm_george', name: 'George (UK Male)', desc: 'British accent' },
  { id: 'jf_alpha', name: 'Alpha (JP Female)', desc: 'Cute anime-style' },
  { id: 'jf_gongitsune', name: 'Gongitsune (JP Female)', desc: 'Sweet & playful' },
  { id: 'jf_nezumi', name: 'Nezumi (JP Female)', desc: 'High-pitched & adorable' },
  { id: 'jf_tebukuro', name: 'Tebukuro (JP Female)', desc: 'Soft & gentle' },
  { id: 'jm_kumo', name: 'Kumo (JP Male)', desc: 'Calm & composed' },
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

const GITHUB_REPO = 'fax-solo/AI-waifu';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function useSettings({ onShortcutsChange, onVRMFileSelected, avatarRef: extAvatarRef }) {
  const { speak, isPlaying: isTestingVoice } = useTTS();
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
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
    ttsSpeed: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    llmModel: 'gemini-3.1-flash-lite',
    llmProvider: 'gemini',
    shortcuts: DEFAULT_SHORTCUTS
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [groqApiKeyInput, setGroqApiKeyInput] = useState('');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [memories, setMemories] = useState([]);
  const [shortcuts, setShortcuts] = useState(DEFAULT_SHORTCUTS);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const [recordingAction, setRecordingAction] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('idle');
  const [latestVersion, setLatestVersion] = useState('');
  const [updateUrl, setUpdateUrl] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [updateProgress, setUpdateProgress] = useState(0);

  const originalRef = useRef(null);
  const [dirty, setDirty] = useState(false);

  const [currentVRMName, setCurrentVRMName] = useState(null);
  const [avatars, setAvatars] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: '', vrmFile: null, textureFiles: [], pfpFile: null, pfpPreview: null
  });
  const [showGallery, setShowGallery] = useState(false);
  const [galleryAvatars, setGalleryAvatars] = useState([]);
  const [downloadingGalleryId, setDownloadingGalleryId] = useState(null);
  const [showGalleryUpload, setShowGalleryUpload] = useState(false);
  const [galleryUploadForm, setGalleryUploadForm] = useState({
    name: '', modelFile: null, textureFiles: [], pfpFile: null, pfpPreview: null
  });
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);

  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });
  const [testText, setTestText] = useState("Hello! How do I sound?");
  const [micTestStatus, setMicTestStatus] = useState('idle');
  const [ttsStatus, setTtsStatus] = useState({ status: 'unknown', device: 'cpu' });
  const [setupStatus, setSetupStatus] = useState(null);

  const [activeTab, setActiveTab] = useState('profile');
  const [settingsSearch, setSettingsSearch] = useState('');

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingCloseRef = useRef(null);

  const fileInputRef = useRef(null);
  const pfpInputRef = useRef(null);
  const textureInputRef = useRef(null);
  const galleryModelInputRef = useRef(null);
  const galleryTextureInputRef = useRef(null);
  const galleryPfpInputRef = useRef(null);
  const animFileInputRef = useRef(null);
  const [animations, setAnimations] = useState({ facial: [], body: [] });
  const [animLoading, setAnimLoading] = useState(false);
  const [animSearch, setAnimSearch] = useState('');
  const [testStatus, setTestStatus] = useState({});

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const markDirty = useCallback(() => setDirty(true), []);

  const compareVersions = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  };

  const requestClose = useCallback((onClose) => {
    if (dirty) {
      pendingCloseRef.current = onClose;
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [dirty]);

  const handleUnsavedConfirm = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingCloseRef.current?.();
    pendingCloseRef.current = null;
  }, []);

  const handleUnsavedCancel = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingCloseRef.current = null;
  }, []);

  // Load settings
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function load() {
      try {
        const data = await api.getSettings();
        if (cancelled) return;
        setSettings(data);
        setSettingsLoading(false);
        setDisplayName(data.user.displayName || '');
        const loadedShortcuts = data.companion.shortcuts;
        const hasCustomShortcuts = loadedShortcuts && Object.keys(loadedShortcuts).length > 0;
        const comp = {
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
          ttsSpeed: data.companion.ttsSpeed ?? 1.0,
          ttsPitch: data.companion.ttsPitch ?? 1.0,
          ttsVolume: data.companion.ttsVolume ?? 1.0,
          llmModel: data.companion.llmModel ?? 'gemini-3.1-flash-lite',
          llmProvider: data.companion.llmProvider ?? 'gemini',
          shortcuts: hasCustomShortcuts ? loadedShortcuts : DEFAULT_SHORTCUTS
        };
        setCompanion(comp);
        originalRef.current = JSON.stringify({ displayName: data.user.displayName || '', companion: comp });
        if (hasCustomShortcuts) {
          setShortcuts(loadedShortcuts);
        }
        setHasCustomKey(data.hasCustomApiKey);
        setHasGroqKey(data.hasGroqApiKey || false);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load settings:', err);
        setSettingsLoading(false);
      }
    }

    async function checkSetupStatus() {
      try {
        const data = await api.fetchApi('/setup/status');
        if (!cancelled) setSetupStatus(data);
      } catch {
        if (!cancelled) setSetupStatus(null);
      }
    }

    async function checkTTS() {
      while (!cancelled) {
        try {
          const res = await fetch(`http://127.0.0.1:5000/health?t=${Date.now()}`, { signal: abortController.signal, cache: 'no-store' });
          if (cancelled) return;
          const data = await res.json();
          if (!cancelled) setTtsStatus(data);
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          if (!cancelled) setTtsStatus({ status: 'offline', device: 'none' });
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    load();
    checkSetupStatus();
    checkTTS();
    loadMemories();
    loadAudioDevices();

    const savedName = localStorage.getItem('waifu-vrm-name');
    if (savedName) setCurrentVRMName(savedName);

    navigator.mediaDevices.ondevicechange = loadAudioDevices;

    // Listen for electron updater events
    if (window.electronAPI) {
      window.electronAPI.onUpdateEvent((event) => {
        switch (event.type) {
          case 'checking':
            setUpdateStatus('checking');
            break;
          case 'available':
            setLatestVersion(event.info.version || 'New Version');
            setUpdateStatus('available');
            break;
          case 'not-available':
            setUpdateStatus('uptodate');
            break;
          case 'error':
            setUpdateError(event.error);
            setUpdateStatus('error');
            break;
          case 'progress':
            setUpdateStatus('downloading');
            setUpdateProgress(event.progressObj.percent || 0);
            break;
          case 'downloaded':
            setUpdateStatus('downloaded');
            break;
        }
      });
    }

    return () => {
      cancelled = true;
      abortController.abort();
      navigator.mediaDevices.ondevicechange = null;
      if (JSON.stringify(shortcutsRef.current) !== JSON.stringify(DEFAULT_SHORTCUTS)) {
        onShortcutsChange?.(shortcutsRef.current);
      }
      if (window.electronAPI) {
        window.electronAPI.removeUpdateListeners();
      }
    };
  }, []);

  // Track dirty state
  useEffect(() => {
    if (!originalRef.current) return;
    const current = JSON.stringify({ displayName, companion: { ...companion, shortcuts } });
    setDirty(current !== originalRef.current);
  }, [displayName, companion, shortcuts]);

  const handleSave = async (customData) => {
    setSaving(true);
    try {
      const data = customData || { displayName, companion: { ...companion, shortcuts } };
      await api.updateSettings(data);
      onShortcutsChange?.(shortcuts);
      originalRef.current = JSON.stringify({ displayName, companion: { ...companion, shortcuts } });
      setDirty(false);
      showToast('Settings saved!');
    } catch (err) {
      showToast('Failed to save settings.', 'error');
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
      showToast('Gemini API key saved securely!');
    } catch (err) {
      showToast(err.data?.error || 'Failed to save Gemini API key.', 'error');
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
      showToast('Groq API key saved securely!');
    } catch (err) {
      showToast(err.data?.error || 'Failed to save Groq API key.', 'error');
    }
  };

  const handleRemoveApiKey = async () => {
    if (!window.confirm('Are you sure you want to remove your custom Gemini key?')) return;
    try {
      await api.removeApiKey();
      setHasCustomKey(false);
      showToast('Gemini API key removed.');
    } catch (err) {
      showToast('Failed to remove Gemini API key.', 'error');
    }
  };

  const handleRemoveGroqKey = async () => {
    if (!window.confirm('Are you sure you want to remove your custom Groq key?')) return;
    try {
      await api.fetchApi('/api/settings/groq-key', { method: 'DELETE' });
      setHasGroqKey(false);
      showToast('Groq API key removed.');
    } catch (err) {
      showToast('Failed to remove Groq API key.', 'error');
    }
  };

  const loadMemories = async () => {
    try {
      const data = await api.getMemories();
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
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

  const loadAvatars = async () => {
    try {
      const data = await api.getAvatars();
      setAvatars(data);
    } catch (err) {
      console.error('Failed to load avatars:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'avatar') loadAvatars();
    if (activeTab === 'animations') loadAnimations();
  }, [activeTab]);

  const handleUploadAvatar = async () => {
    if (!uploadForm.vrmFile || !uploadForm.name) {
      showToast('Please provide both a name and a VRM file.', 'error');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadForm.name);
      formData.append('vrm', uploadForm.vrmFile);
      if (uploadForm.pfpFile) formData.append('pfp', uploadForm.pfpFile);
      for (const tex of uploadForm.textureFiles) {
        formData.append('textures', tex);
      }
      const newAvatar = await api.uploadAvatar(formData);
      setAvatars([newAvatar, ...avatars]);
      showToast('Avatar saved to library!');
      setShowUploadForm(false);
      setUploadForm({ name: '', vrmFile: null, textureFiles: [], pfpFile: null, pfpPreview: null });
      handleSelectAvatar(newAvatar);
    } catch (err) {
      showToast('Failed to upload avatar.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectAvatar = async (avatar) => {
    try {
      const url = api.getUploadUrl(avatar.file_path);
      if (onVRMFileSelected) onVRMFileSelected(url);
      setCurrentVRMName(avatar.name);
      localStorage.setItem('waifu-vrm-name', avatar.name);
      localStorage.setItem('waifu-vrm-id', avatar.id);
      showToast(`Switched to ${avatar.name}!`);
    } catch (err) {
      showToast('Failed to load selected avatar.', 'error');
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
    const confirmed = await new Promise((resolve) => {
      if (window.confirm('Are you sure you want to delete this avatar?')) resolve(true);
      else resolve(false);
    });
    if (!confirmed) return;
    try {
      await api.deleteAvatar(id);
      setAvatars(avatars.filter(a => a.id !== id));
      if (localStorage.getItem('waifu-vrm-id') === id) handleRemoveVRM();
    } catch (err) {
      showToast('Failed to delete avatar.', 'error');
    }
  };

  const loadGalleryAvatars = async () => {
    try {
      const data = await api.getGalleryAvatars();
      setGalleryAvatars(data);
    } catch (err) {
      console.error('Failed to load gallery avatars:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'avatar' && showGallery) loadGalleryAvatars();
  }, [activeTab, showGallery]);

  const handleDownloadGalleryAvatar = async (galleryModel) => {
    setDownloadingGalleryId(galleryModel.id);
    try {
      const newAvatar = await api.downloadGalleryAvatar(galleryModel.id);
      setAvatars([newAvatar, ...avatars]);
      showToast(`"${galleryModel.name}" added to your library!`);
    } catch (err) {
      showToast('Failed to download model.', 'error');
    } finally {
      setDownloadingGalleryId(null);
    }
  };

  const handleUploadGalleryModel = async () => {
    if (!galleryUploadForm.modelFile || !galleryUploadForm.name) {
      showToast('Please provide both a name and a model file.', 'error');
      return;
    }
    setIsGalleryUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', galleryUploadForm.name);
      formData.append('model', galleryUploadForm.modelFile);
      if (galleryUploadForm.pfpFile) formData.append('pfp', galleryUploadForm.pfpFile);
      for (const tex of galleryUploadForm.textureFiles) {
        formData.append('textures', tex);
      }
      const result = await api.uploadGalleryModel(formData);
      setGalleryAvatars([result, ...galleryAvatars]);
      showToast(`"${galleryUploadForm.name}" uploaded to gallery!`);
      setShowGalleryUpload(false);
      setGalleryUploadForm({ name: '', modelFile: null, textureFiles: [], pfpFile: null, pfpPreview: null });
    } catch (err) {
      showToast(err.data?.error || 'Failed to upload to gallery.', 'error');
    } finally {
      setIsGalleryUploading(false);
    }
  };

  const checkForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateError('');
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.checkForUpdates();
        if (!res.success) throw new Error(res.error);
      } else {
        // Fallback for web mode
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (res.status === 404) { setUpdateStatus('uptodate'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const latest = data.tag_name.replace(/^v/, '');
        setLatestVersion(latest);
        setUpdateUrl(data.html_url);
        setUpdateStatus(compareVersions(latest, APP_VERSION) > 0 ? 'available' : 'uptodate');
      }
    } catch (err) {
      setUpdateStatus('error');
      setUpdateError(err.message);
    }
  };

  const downloadUpdate = async () => {
    if (window.electronAPI) {
      setUpdateStatus('downloading');
      setUpdateProgress(0);
      await window.electronAPI.downloadUpdate();
    }
  };

  const installUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  const handleTestMic = useCallback(async () => {
    if (micTestStatus !== 'idle') return;
    setMicTestStatus('recording');
    try {
      const constraints = companion.audioInputDevice !== 'default'
        ? { audio: { deviceId: { exact: companion.audioInputDevice } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); setMicTestStatus('idle'); };
        audio.play().then(() => setMicTestStatus('playing')).catch(() => setMicTestStatus('idle'));
      };
      mediaRecorder.start();
      setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 3000);
    } catch (err) {
      console.error('Mic test failed:', err);
      setMicTestStatus('idle');
      alert('Microphone access failed. Check permissions.');
    }
  }, [companion.audioInputDevice, micTestStatus]);

  const loadAudioDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices({
        inputs: devices.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0,5)}` })),
        outputs: devices.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0,5)}` }))
      });
    } catch (err) {
      console.warn('Failed to load audio devices:', err);
    }
  };

  // Shortcut recording
  useEffect(() => {
    if (!recordingAction) return;
    const handler = (e) => {
      if (e.key === 'Escape') { setRecordingAction(null); return; }
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.metaKey) parts.push('Meta');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const key = e.key;
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        setShortcuts(prev => ({ ...prev, [recordingAction]: parts.join('+') }));
        setRecordingAction(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [recordingAction]);

  // Export/Import
  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      displayName,
      companion: { ...companion, shortcuts },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waifu-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Settings exported!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.displayName) setDisplayName(data.displayName);
        if (data.companion) {
          setCompanion(data.companion);
          if (data.companion.shortcuts) setShortcuts(data.companion.shortcuts);
        }
        showToast('Settings imported! Save to persist.');
      } catch (err) {
        showToast('Failed to import settings. Invalid file.', 'error');
      }
    };
    input.click();
  };

  // Data management
  const handleClearMemories = async () => {
    if (!window.confirm('Delete ALL memories? This cannot be undone.')) return;
    try {
      for (const m of memories) await api.deleteMemory(m.id);
      setMemories([]);
      showToast('All memories cleared.');
    } catch (err) {
      showToast('Failed to clear memories.', 'error');
    }
  };

  const handleClearConversations = async () => {
    if (!window.confirm('Delete ALL conversations? This cannot be undone.')) return;
    try {
      const convs = await api.fetchApi('/api/conversations');
      for (const c of convs) await api.fetchApi(`/api/conversations/${c.id}`, { method: 'DELETE' });
      showToast('All conversations cleared.');
    } catch (err) {
      showToast('Failed to clear conversations.', 'error');
    }
  };

  const loadAnimations = useCallback(async () => {
    setAnimLoading(true);
    try {
      const data = await api.getAnimations();
      setAnimations({ facial: data.facial || [], body: data.body || [] });
    } catch (err) {
      showToast('Failed to load animations.', 'error');
    } finally {
      setAnimLoading(false);
    }
  }, [showToast]);

  const handleTestAnimation = useCallback((type, filename) => {
    const key = `${type}/${filename}`;
    setTestStatus(prev => ({ ...prev, [key]: 'playing' }));
    setTimeout(() => setTestStatus(prev => ({ ...prev, [key]: 'idle' })), 3000);
    const ref = extAvatarRef || avatarRef;
    if (ref?.current?.triggerAnimation) {
      ref.current.triggerAnimation(type, filename, {});
    }
  }, [extAvatarRef]);

  const handleDeleteAnimation = useCallback(async (type, filename) => {
    if (!window.confirm(`Delete ${filename}?`)) return;
    try {
      await api.deleteAnimation(type, filename);
      showToast(`${filename} deleted.`);
      loadAnimations();
    } catch (err) {
      showToast('Failed to delete animation.', 'error');
    }
  }, [showToast, loadAnimations]);

  const handleUploadAnimation = useCallback(async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      for (const file of files) {
        const type = file.name.endsWith('.json') ? 'facial' : 'body';
        await api.uploadAnimation(type, file);
      }
      showToast(`${files.length} file(s) uploaded.`);
      loadAnimations();
    } catch (err) {
      showToast('Upload failed.', 'error');
    }
    e.target.value = '';
  }, [showToast, loadAnimations]);

  return {
    // State
    settings, settingsLoading, displayName, companion,
    apiKeyInput, groqApiKeyInput, hasCustomKey, hasGroqKey,
    saving, toast, memories, shortcuts, recordingAction,
    updateStatus, latestVersion, updateUrl, updateError, updateProgress,
    currentVRMName, avatars, isUploading, showUploadForm, uploadForm,
    showGallery, galleryAvatars, downloadingGalleryId,
    showGalleryUpload, galleryUploadForm, isGalleryUploading,
    audioDevices, testText, micTestStatus, ttsStatus, setupStatus,
    activeTab, settingsSearch, dirty, showUnsavedDialog,
    isTestingVoice,
    animations, animLoading, animSearch, testStatus,

    // Refs
    fileInputRef, pfpInputRef, textureInputRef,
    galleryModelInputRef, galleryTextureInputRef, galleryPfpInputRef,
    animFileInputRef,

    // Setters
    setDisplayName, setCompanion, setApiKeyInput, setGroqApiKeyInput,
    setShortcuts, setRecordingAction,
    setShowUploadForm, setUploadForm, setShowGallery,
    setShowGalleryUpload, setGalleryUploadForm,
    setTestText, setActiveTab, setSettingsSearch, setAnimSearch,

    // Constants
    VOICES, GEMINI_MODELS, GROQ_MODELS, GITHUB_REPO,

    // Functions
    showToast, markDirty, handleSave,
    handleSetApiKey, handleSetGroqKey, handleRemoveApiKey, handleRemoveGroqKey,
    loadMemories, handleDeleteMemory,
    loadAvatars, handleUploadAvatar, handleSelectAvatar, handleDeleteAvatar,
    loadGalleryAvatars, handleDownloadGalleryAvatar, handleUploadGalleryModel,
    handleRemoveVRM, checkForUpdates, downloadUpdate, installUpdate, handleTestMic, loadAudioDevices,
    handleExport, handleImport,
    handleClearMemories, handleClearConversations,
    loadAnimations, handleTestAnimation, handleDeleteAnimation, handleUploadAnimation,
    requestClose, handleUnsavedConfirm, handleUnsavedCancel,
    compareVersions,
    speak,
  };
}
