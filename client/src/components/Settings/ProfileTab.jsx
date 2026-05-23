import { useEffect } from 'react';
import { Globe, User, Palette } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const ACCENTS = [
  { name: 'Purple', primary: '#a882ff', light: '#c4a8ff', dark: '#7c5fd6' },
  { name: 'Blue', primary: '#60a5fa', light: '#93c5fd', dark: '#3b82f6' },
  { name: 'Green', primary: '#34d399', light: '#6ee7b7', dark: '#10b981' },
  { name: 'Pink', primary: '#f472b6', light: '#f9a8d4', dark: '#db2777' },
  { name: 'Orange', primary: '#fb923c', light: '#fdba74', dark: '#ea580c' },
  { name: 'Red', primary: '#f87171', light: '#fca5a5', dark: '#ef4444' },
];

function getAccent() {
  try { return JSON.parse(localStorage.getItem('waifu-accent') || 'null') || ACCENTS[0]; }
  catch { return ACCENTS[0]; }
}

export default function ProfileTab({ displayName, setDisplayName }) {
  const { t, language, setLanguage } = useLanguage();

  const currentAccent = getAccent();

  const setAccent = (accent) => {
    localStorage.setItem('waifu-accent', JSON.stringify(accent));
    document.documentElement.style.setProperty('--color-accent', accent.primary);
    document.documentElement.style.setProperty('--color-accent-light', accent.light);
    document.documentElement.style.setProperty('--color-accent-dark', accent.dark);
    document.documentElement.style.setProperty('--color-accent-glow', `${accent.primary}26`);
  };

  useEffect(() => {
    const saved = getAccent();
    document.documentElement.style.setProperty('--color-accent', saved.primary);
    document.documentElement.style.setProperty('--color-accent-light', saved.light);
    document.documentElement.style.setProperty('--color-accent-dark', saved.dark);
    document.documentElement.style.setProperty('--color-accent-glow', `${saved.primary}26`);
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Globe size={18} className="icon" />
        {t('settings.system.language')}
      </div>
      <div className="form-group">
        <label>{t('settings.system.selectLanguage')}</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">{t('settings.system.english')}</option>
          <option value="ar">{t('settings.system.arabic')}</option>
        </select>
      </div>

      <div className="settings-section-title">
        <User size={18} className="icon" />
        {t('settings.profile.title')}
      </div>
      <div className="form-group">
        <label htmlFor="display-name">{t('settings.profile.displayName')}</label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('settings.profile.displayNamePlaceholder')}
        />
        <div className="hint">{t('settings.profile.displayNameHint')}</div>
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>
        <Palette size={18} className="icon" />
        Accent Color
      </div>
      <div className="accent-picker">
        {ACCENTS.map((accent) => (
          <button
            key={accent.name}
            className={`accent-swatch ${currentAccent.name === accent.name ? 'active' : ''}`}
            style={{ background: accent.primary }}
            onClick={() => setAccent(accent)}
            title={accent.name}
            aria-label={`Set accent to ${accent.name}`}
          />
        ))}
      </div>
    </div>
  );
}
