import { useState } from 'react';
import { Shield, ShieldCheck, Eye, EyeOff, ExternalLink, XCircle, KeyRound } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const GeminiIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="provider-card-img">
    <defs>
      <linearGradient id="gem-grad" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#4285F4" />
        <stop offset="50%" stopColor="#9B72CB" />
        <stop offset="100%" stopColor="#8AB4F8" />
      </linearGradient>
    </defs>
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#gem-grad)" />
  </svg>
);

const GroqIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="provider-card-img">
    <circle cx="12" cy="12" r="11" fill="#F55036" />
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="system-ui">G</text>
  </svg>
);

function ProviderCard({ label, desc, icon, isActive, onSelect }) {
  const { t } = useLanguage();

  return (
    <div
      role="button"
      tabIndex={0}
      className={`provider-card ${isActive ? 'provider-card--active' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <div className="provider-card-info">
        {icon}
        <div>
          <div className="provider-card-name">{label}</div>
          <div className="provider-card-desc">{desc}</div>
        </div>
      </div>
      <div className={`provider-card-badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>
        {isActive ? t('common.active') : t('common.inactive')}
      </div>
    </div>
  );
}

function KeySection({ hasKey, keyInput, setKeyInput, onSave, onRemove, placeholder, statusActive, statusInactive, getKeyUrl, getKeyLabel, isGroq }) {
  const { t } = useLanguage();
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <div className="key-section">
      <div className="key-section-header">
        <KeyRound size={16} className="key-section-icon" />
        <span className="key-section-title">{t('settings.apikey.bringYourOwnKey')}</span>
      </div>

      <div className={`key-status ${hasKey ? 'key-status--active' : 'key-status--inactive'}`}>
        {hasKey ? (
          <><ShieldCheck size={16} /><span>{statusActive}</span></>
        ) : (
          <><Shield size={16} /><span>{statusInactive}</span></>
        )}
      </div>

      {!hasKey ? (
        <div className="key-input-row">
          <div className="key-input-wrapper">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={placeholder}
              className="key-input"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="key-visibility-toggle"
              onClick={() => setShowKey(!showKey)}
              tabIndex={-1}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            className="btn btn-primary key-save-btn"
            onClick={handleSave}
            disabled={!keyInput.trim() || saving}
          >
            {saving ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      ) : (
        <button className="btn btn-danger key-remove-btn" onClick={onRemove}>
          <XCircle size={16} />
          {isGroq ? t('settings.apikey.removeGroqKey') : t('settings.apikey.removeGeminiKey')}
        </button>
      )}

      <a
        href={getKeyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="key-external-link"
      >
        {t('settings.apikey.getFreeKeyAt')} {getKeyLabel}
        <ExternalLink size={12} />
      </a>
    </div>
  );
}

export default function ApiKeyTab({
  companion, setCompanion, GEMINI_MODELS, GROQ_MODELS,
  apiKeyInput, setApiKeyInput, hasCustomKey, handleSetApiKey, handleRemoveApiKey,
  groqApiKeyInput, setGroqApiKeyInput, hasGroqKey, handleSetGroqKey, handleRemoveGroqKey
}) {
  const { t } = useLanguage();
  const isGemini = companion.llmProvider === 'gemini';
  const models = isGemini ? GEMINI_MODELS : GROQ_MODELS;
  const activeModel = models.find(m => m.id === companion.llmModel) || models[0];

  return (
    <div className="settings-section">
      <div className="provider-cards">
        <ProviderCard
          label={t('settings.apikey.googleGemini')}
          desc="Gemini 3.1, 2.5 Flash & more"
          icon={<GeminiIcon />}
          isActive={isGemini}
          onSelect={() => setCompanion(p => ({ ...p, llmProvider: 'gemini', llmModel: 'gemini-3.1-flash-lite' }))}
        />
        <ProviderCard
          label={t('settings.apikey.groq')}
          desc="Llama 3.1, Mixtral, Gemma 2"
          icon={<GroqIcon />}
          isActive={!isGemini}
          onSelect={() => setCompanion(p => ({ ...p, llmProvider: 'groq', llmModel: 'llama-3.1-70b-versatile' }))}
        />
      </div>

      <div className="model-selector">
        <label className="model-selector-label">{t('settings.apikey.preferredModel').replace('{provider}', isGemini ? 'Gemini' : 'Groq')}</label>
        <select
          className="model-selector-input"
          value={companion.llmModel}
          onChange={(e) => setCompanion(p => ({ ...p, llmModel: e.target.value }))}
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <div className="model-selector-hint">{activeModel.desc}</div>
      </div>

      <div className="divider" />

      {isGemini ? (
        <KeySection
          hasKey={hasCustomKey}
          keyInput={apiKeyInput}
          setKeyInput={setApiKeyInput}
          onSave={handleSetApiKey}
          onRemove={handleRemoveApiKey}
          placeholder={t('settings.apikey.pasteGeminiKey')}
          statusActive={t('settings.apikey.customGeminiActive')}
          statusInactive={t('settings.apikey.defaultGeminiActive')}
          getKeyUrl="https://aistudio.google.com/app/apikey"
          getKeyLabel="Google AI Studio"
        />
      ) : (
        <KeySection
          hasKey={hasGroqKey}
          keyInput={groqApiKeyInput}
          setKeyInput={setGroqApiKeyInput}
          onSave={handleSetGroqKey}
          onRemove={handleRemoveGroqKey}
          placeholder={t('settings.apikey.pasteGroqKey')}
          statusActive={t('settings.apikey.customGroqActive')}
          statusInactive={t('settings.apikey.defaultGroqActive')}
          isGroq
          getKeyUrl="https://console.groq.com/keys"
          getKeyLabel="Groq Console"
        />
      )}
    </div>
  );
}
