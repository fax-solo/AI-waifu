import { Volume2, Upload, Play } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useState } from 'react';

const SAMPLE_TEXT = 'Hello! I am your AI companion. How can I help you today?';

export default function VoiceTab({
  companion, setCompanion, VOICES, audioDevices, micTestStatus,
  testText, setTestText, ttsStatus, isTestingVoice, speak, handleTestMic
}) {
  const { t } = useLanguage();
  const [previewingVoice, setPreviewingVoice] = useState(null);

  const previewVoice = (voiceId) => {
    setPreviewingVoice(voiceId);
    speak(SAMPLE_TEXT, {
      enabled: true,
      voice: voiceId,
      speed: companion.ttsSpeed ?? 1.0,
      pitch: companion.ttsPitch ?? 1.0,
      volume: companion.ttsVolume ?? 1.0,
      outputDeviceId: companion.audioOutputDevice,
      device: companion.ttsDevice,
    });
    setTimeout(() => setPreviewingVoice(null), 2000);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Volume2 size={18} className="icon" />
        {t('settings.voice.title')}
      </div>

      <div className="form-group switch-group">
        <input
          type="checkbox"
          id="tts-enabled"
          checked={companion.ttsEnabled}
          onChange={(e) => setCompanion({ ...companion, ttsEnabled: e.target.checked })}
        />
        <label htmlFor="tts-enabled" className="switch-label">{t('settings.voice.enableTTS')}</label>
      </div>

      <div className="form-group switch-group">
        <input
          type="checkbox"
          id="lip-sync-enabled"
          checked={companion.lipSyncEnabled}
          onChange={(e) => setCompanion({ ...companion, lipSyncEnabled: e.target.checked })}
        />
        <label htmlFor="lip-sync-enabled" className="switch-label">{t('settings.voice.enableLipSync')}</label>
      </div>

      {companion.ttsEnabled && (
        <>
          <div className="settings-voice-grid">
            <div className="form-group">
              <label>{t('settings.voice.mic')}</label>
              <select
                value={companion.audioInputDevice}
                onChange={(e) => setCompanion({ ...companion, audioInputDevice: e.target.value })}
              >
                <option value="default">{t('settings.voice.systemDefault')}</option>
                {audioDevices.inputs.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <button
                className="btn btn-secondary btn-full"
                onClick={handleTestMic}
                disabled={micTestStatus !== 'idle'}
              >
                {micTestStatus === 'recording' ? '🔴 Recording... (3s)' : micTestStatus === 'playing' ? '▶ Playing back...' : '🎤 Test Microphone'}
              </button>
            </div>

            <div className="form-group">
              <label>{t('settings.voice.speaker')}</label>
              <select
                value={companion.audioOutputDevice}
                onChange={(e) => setCompanion({ ...companion, audioOutputDevice: e.target.value })}
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
              >
                <option value="cpu">{t('settings.voice.cpuStandard')}</option>
                <option value="gpu">{t('settings.voice.gpuAccel')}</option>
              </select>
              <div className="hint">
                {ttsStatus.status === 'loading'
                  ? '⏳ TTS Engine loading...'
                  : ttsStatus.device === 'cuda'
                    ? `✅ GPU Acceleration ACTIVE (CUDA).`
                    : ttsStatus.status === 'offline'
                      ? '❌ TTS Server Offline.'
                      : '⚠️ GPU NOT FOUND. Running on CPU.'}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>{t('settings.voice.speed')}: {companion.ttsSpeed?.toFixed(2) ?? 1.00}x</label>
            <input
              type="range" min="0.5" max="2.0" step="0.05"
              value={companion.ttsSpeed ?? 1.0}
              onChange={(e) => setCompanion({ ...companion, ttsSpeed: parseFloat(e.target.value) })}
            />
            <div className="hint">{t('settings.voice.speedHint')}</div>
          </div>

          <div className="form-group">
            <label>{t('settings.voice.pitch')}: {companion.ttsPitch?.toFixed(2) ?? 1.00}</label>
            <input
              type="range" min="0.5" max="2.0" step="0.05"
              value={companion.ttsPitch ?? 1.0}
              onChange={(e) => setCompanion({ ...companion, ttsPitch: parseFloat(e.target.value) })}
            />
            <div className="hint">{t('settings.voice.pitchHint')}</div>
          </div>

          <div className="form-group">
            <label>{t('settings.voice.volume')}: {companion.ttsVolume?.toFixed(2) ?? 1.00}</label>
            <input
              type="range" min="0.0" max="2.0" step="0.05"
              value={companion.ttsVolume ?? 1.0}
              onChange={(e) => setCompanion({ ...companion, ttsVolume: parseFloat(e.target.value) })}
            />
            <div className="hint">{t('settings.voice.volumeHint')}</div>
          </div>

          <div className="form-group">
            <label>Max TTS Characters: {companion.ttsMaxChars ?? 500}</label>
            <input
              type="range" min="100" max="5000" step="100"
              value={companion.ttsMaxChars ?? 500}
              onChange={(e) => setCompanion({ ...companion, ttsMaxChars: parseInt(e.target.value) })}
            />
            <div className="hint">Responses longer than this limit will skip TTS playback.</div>
          </div>

          <div className="form-group">
            <label>{t('settings.voice.testVoice')}</label>
            <div className="settings-test-row">
              <input
                type="text" value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder={t('settings.voice.testPlaceholder')}
              />
              <button
                className="btn btn-primary"
                onClick={() => speak(testText, {
                  enabled: true, voice: companion.ttsVoice,
                  speed: companion.ttsSpeed ?? 1.0, pitch: companion.ttsPitch ?? 1.0,
                  volume: companion.ttsVolume ?? 1.0,
                  outputDeviceId: companion.audioOutputDevice,
                  device: companion.ttsDevice,
                })}
                disabled={isTestingVoice || !testText.trim()}
              >
                {isTestingVoice ? t('common.playing') : '▶ ' + t('common.test')}
              </button>
            </div>
          </div>

          <label className="settings-label">{t('settings.voice.availableVoices')} (Kokoro)</label>
          <div className="settings-voice-cards">
            {VOICES.map((v) => (
              <div
                key={`kokoro-${v.id}`}
                className={`settings-voice-card ${companion.ttsVoice === v.id ? 'active' : ''}`}
                onClick={() => setCompanion({ ...companion, ttsVoice: v.id })}
              >
                <div className="voice-card-header">
                  <div className="settings-voice-card-name">{v.name}</div>
                  <button
                    className="voice-preview-btn"
                    onClick={(e) => { e.stopPropagation(); previewVoice(v.id); }}
                    title={`Preview ${v.name} voice`}
                    aria-label={`Preview ${v.name} voice`}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </div>
                <div className="settings-voice-card-desc">
                  {v.id === 'default' ? t('settings.voice.defaultVoiceDesc') : v.path || v.id}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
