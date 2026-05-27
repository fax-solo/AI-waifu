import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const MAX_NAME_LENGTH = 30;

export default function StepQuickConfig({ config, updateConfig, onComplete, onSkip }) {
  const { t, setLanguage } = useLanguage();
  const [nameError, setNameError] = useState('');

  const handleLanguageChange = (lang) => {
    updateConfig('language', lang);
    setLanguage(lang);
  };

  const handleNameChange = (value) => {
    if (value.length > MAX_NAME_LENGTH) {
      setNameError(t('setup.nameTooLong', { max: MAX_NAME_LENGTH }));
    } else {
      setNameError('');
    }
    updateConfig('companionName', value);
  };

  const handleSave = () => {
    const trimmed = config.companionName.trim();
    if (!trimmed) {
      setNameError(t('setup.nameRequired'));
      return;
    }
    updateConfig('companionName', trimmed);
    onComplete();
  };

  const canSave = config.companionName.trim().length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-100">
              {t('setup.complete')}
            </h2>
            <p className="text-gray-400 mt-1.5 text-sm">
              {t('setup.readyDesc')}
            </p>
          </div>

          <div className="bg-gray-900/60 rounded-xl border border-gray-800 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-cyan-400 text-xs font-bold">1</span>
              </div>
              <div className="flex-1">
                <label htmlFor="companion-name" className="block text-sm font-medium text-gray-200 mb-1.5">
                  {t('setup.companionName')}
                </label>
                <input
                  id="companion-name"
                  type="text"
                  value={config.companionName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('settings.companion.namePlaceholder')}
                  maxLength={MAX_NAME_LENGTH + 5}
                  className={`w-full bg-gray-800 border rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors ${
                    nameError
                      ? 'border-red-400/60 focus:ring-red-400/40 focus:border-red-400/60'
                      : 'border-gray-700 focus:ring-cyan-400/40 focus:border-cyan-400/60'
                  }`}
                  autoComplete="off"
                  spellCheck={false}
                />
                {nameError && (
                  <p className="text-xs text-red-400 mt-1">{nameError}</p>
                )}
                {!nameError && (
                  <p className="text-sm text-gray-500 mt-1.5">
                    Hi, I'm <span className="text-cyan-400 font-medium">{config.companionName.trim() || '...'}</span>!
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-cyan-400 text-xs font-bold">2</span>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-200 mb-1.5">
                  {t('settings.system.language')}
                </label>
                <select
                  value={config.language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400/60 transition-colors"
                >
                  <option value="en">{t('settings.system.english')}</option>
                  <option value="ar">{t('settings.system.arabic')}</option>
                </select>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-cyan-400 text-xs font-bold">3</span>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-200 mb-1.5">
                  {t('settings.voice.title')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="tts-enabled-config"
                    checked={config.ttsEnabled}
                    onChange={(e) => updateConfig('ttsEnabled', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-cyan-400 focus:ring-cyan-400/40 focus:ring-2"
                  />
                  <label htmlFor="tts-enabled-config" className="text-sm text-gray-300 cursor-pointer">
                    {t('settings.voice.enableTTS')}
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between shrink-0 mt-6 pt-5 border-t border-gray-800">
        <button
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 rounded-xl px-3 py-1.5"
          onClick={onSkip}
        >
          {t('setup.configureLater')}
        </button>
        <button
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-400 text-gray-950 font-semibold text-sm hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          onClick={handleSave}
          disabled={!canSave}
        >
          {t('setup.launchApp')}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
