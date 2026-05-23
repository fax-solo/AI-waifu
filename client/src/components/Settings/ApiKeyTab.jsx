import { Key, Sparkles, Shield } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export default function ApiKeyTab({
  companion, setCompanion, GEMINI_MODELS, GROQ_MODELS,
  apiKeyInput, setApiKeyInput, hasCustomKey, handleSetApiKey, handleRemoveApiKey,
  groqApiKeyInput, setGroqApiKeyInput, hasGroqKey, handleSetGroqKey, handleRemoveGroqKey
}) {
  const { t } = useLanguage();
  const models = companion.llmProvider === 'groq' ? GROQ_MODELS : GEMINI_MODELS;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Sparkles size={18} className="icon" />
        {t('settings.apikey.modelSelectionTitle')}
      </div>
      <div className="form-group">
        <label>{t('settings.apikey.aiProvider')}</label>
        <div className="settings-provider-btns">
          <button
            className={`btn ${companion.llmProvider === 'gemini' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCompanion(p => ({ ...p, llmProvider: 'gemini', llmModel: 'gemini-3.1-flash-lite' }))}
          >
            {t('settings.apikey.googleGemini')}
          </button>
          <button
            className={`btn ${companion.llmProvider === 'groq' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCompanion(p => ({ ...p, llmProvider: 'groq', llmModel: 'llama-3.1-70b-versatile' }))}
          >
            {t('settings.apikey.groq')}
          </button>
        </div>
        <label htmlFor="llm-model">
          {t('settings.apikey.preferredModel').replace('{provider}', companion.llmProvider === 'groq' ? 'Groq' : 'Gemini')}
        </label>
        <select
          id="llm-model"
          value={companion.llmModel}
          onChange={(e) => setCompanion((p) => ({ ...p, llmModel: e.target.value }))}
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.name} {model.free ? '(Free)' : ''}
            </option>
          ))}
        </select>
        <div className="hint">{models.find(m => m.id === companion.llmModel)?.desc}</div>
      </div>

      <div className="settings-section-title" style={{ marginTop: 32 }}>
        <Key size={18} className="icon" />
        {t('settings.apikey.bringYourOwnKey')}
      </div>

      <div className="api-key-section">
        <div className="api-key-header">
          <img src="https://www.gstatic.com/lamda/images/favicon_v2_16x16.png" alt="Gemini" className="api-key-icon" />
          <span className="api-key-label">{t('settings.apikey.geminiKey')}</span>
        </div>
        <div className={`api-key-status ${hasCustomKey ? 'active' : 'inactive'}`}>
          <Shield size={16} />
          {hasCustomKey ? t('settings.apikey.customGeminiActive') : t('settings.apikey.defaultGeminiActive')}
        </div>
        {!hasCustomKey ? (
          <div className="settings-api-key-row">
            <input type="password" value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={t('settings.apikey.pasteGeminiKey')} />
            <button className="btn btn-primary" onClick={handleSetApiKey} disabled={!apiKeyInput.trim()}>
              {t('common.saveChanges')}
            </button>
          </div>
        ) : (
          <button className="btn btn-danger btn-full" onClick={handleRemoveApiKey}>
            {t('settings.apikey.removeGeminiKey')}
          </button>
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          {t('settings.apikey.getFreeKeyAt')} <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
        </div>
      </div>

      <div className="api-key-section" style={{ marginTop: 24 }}>
        <div className="api-key-header">
          <div className="groq-icon" />
          <span className="api-key-label">{t('settings.apikey.groqKey')}</span>
        </div>
        <div className={`api-key-status ${hasGroqKey ? 'active' : 'inactive'}`}>
          <Shield size={16} />
          {hasGroqKey ? t('settings.apikey.customGroqActive') : t('settings.apikey.defaultGroqActive')}
        </div>
        {!hasGroqKey ? (
          <div className="settings-api-key-row">
            <input type="password" value={groqApiKeyInput}
              onChange={(e) => setGroqApiKeyInput(e.target.value)}
              placeholder={t('settings.apikey.pasteGroqKey')} />
            <button className="btn btn-primary" onClick={handleSetGroqKey} disabled={!groqApiKeyInput.trim()}>
              {t('common.saveChanges')}
            </button>
          </div>
        ) : (
          <button className="btn btn-danger btn-full" onClick={handleRemoveGroqKey}>
            {t('settings.apikey.removeGroqKey')}
          </button>
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          {t('settings.apikey.getFreeKeyAt')} <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq Console</a>
        </div>
      </div>
    </div>
  );
}
