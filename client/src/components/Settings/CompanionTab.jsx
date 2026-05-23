import { Sparkles } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export default function CompanionTab({ companion, setCompanion }) {
  const { t } = useLanguage();

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Sparkles size={18} className="icon" />
        {t('settings.companion.title')}
      </div>
      <div className="form-group">
        <label htmlFor="companion-name">{t('settings.companion.name')}</label>
        <input
          id="companion-name"
          type="text"
          value={companion.name}
          onChange={(e) => setCompanion((p) => ({ ...p, name: e.target.value }))}
          placeholder={t('settings.companion.namePlaceholder')}
        />
      </div>
      <div className="form-group">
        <label htmlFor="companion-tone">{t('settings.companion.tone')}</label>
        <input
          id="companion-tone"
          type="text"
          value={companion.tone}
          onChange={(e) => setCompanion((p) => ({ ...p, tone: e.target.value }))}
          placeholder={t('settings.companion.tonePlaceholder')}
        />
        <div className="hint">{t('settings.companion.toneHint')}</div>
      </div>
      <div className="form-group">
        <label htmlFor="companion-personality">{t('settings.companion.personality')}</label>
        <textarea
          id="companion-personality"
          value={companion.personality}
          onChange={(e) => setCompanion((p) => ({ ...p, personality: e.target.value }))}
          placeholder={t('settings.companion.personalityPlaceholder')}
          rows={3}
        />
      </div>
      <div className="form-group">
        <label htmlFor="companion-backstory">{t('settings.companion.backstory')}</label>
        <textarea
          id="companion-backstory"
          value={companion.backstory}
          onChange={(e) => setCompanion((p) => ({ ...p, backstory: e.target.value }))}
          placeholder={t('settings.companion.backstoryPlaceholder')}
          rows={3}
        />
      </div>
    </div>
  );
}
