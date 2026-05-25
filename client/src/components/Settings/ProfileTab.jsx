import { useEffect, useCallback } from 'react';
import { Globe, User, Palette } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

// Companion colors are auto-derived from accent via hue shift (~30°)
const ACCENTS = [
  { name: 'Purple', primary: '#a882ff', light: '#c4a8ff', dark: '#7c5fd6' },
  { name: 'Blue', primary: '#60a5fa', light: '#93c5fd', dark: '#3b82f6' },
  { name: 'Green', primary: '#34d399', light: '#6ee7b7', dark: '#10b981' },
  { name: 'Pink', primary: '#f472b6', light: '#f9a8d4', dark: '#db2777' },
  { name: 'Orange', primary: '#fb923c', light: '#fdba74', dark: '#ea580c' },
  { name: 'Red', primary: '#f87171', light: '#fca5a5', dark: '#ef4444' },
];

function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return { r: parseInt(c.substring(0, 2), 16), g: parseInt(c.substring(2, 4), 16), b: parseInt(c.substring(4, 6), 16) };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function hueShift(hex, degrees) {
  const { r, g, b } = hexToRgb(hex);
  const r2 = r / 255, g2 = g / 255, b2 = b / 255;
  const max = Math.max(r2, g2, b2), min = Math.min(r2, g2, b2);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r2: h = ((g2 - b2) / d + (g2 < b2 ? 6 : 0)) * 60; break;
      case g2: h = ((b2 - r2) / d + 2) * 60; break;
      default: h = ((r2 - g2) / d + 4) * 60; break;
    }
  }
  h = ((h + degrees) % 360 + 360) % 360;
  const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p2 = 2 * l - q2;
  const h2 = h / 360;
  return rgbToHex(hue2rgb(p2, q2, h2 + 1/3) * 255, hue2rgb(p2, q2, h2) * 255, hue2rgb(p2, q2, h2 - 1/3) * 255);
}

function getAccent() {
  try { return JSON.parse(localStorage.getItem('waifu-accent') || 'null') || ACCENTS[0]; }
  catch { return ACCENTS[0]; }
}

export default function ProfileTab({ displayName, setDisplayName }) {
  const { t, language, setLanguage } = useLanguage();

  const currentAccent = getAccent();

  const setAccent = useCallback((accent) => {
    localStorage.setItem('waifu-accent', JSON.stringify(accent));
    const companion = hueShift(accent.primary, 30);
    const companionLight = hueShift(accent.light, 30);
    const companionDark = hueShift(accent.dark, 30);
    document.documentElement.style.setProperty('--color-accent', accent.primary);
    document.documentElement.style.setProperty('--color-accent-light', accent.light);
    document.documentElement.style.setProperty('--color-accent-dark', accent.dark);
    document.documentElement.style.setProperty('--color-accent-glow', `${accent.primary}26`);
    document.documentElement.style.setProperty('--color-companion', companion);
    document.documentElement.style.setProperty('--color-companion-light', companionLight);
    document.documentElement.style.setProperty('--color-companion-dark', companionDark);
    document.documentElement.style.setProperty('--color-companion-glow', `${companion}1e`);
  }, []);

  useEffect(() => {
    const saved = getAccent();
    setAccent(saved);
  }, [setAccent]);

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
        {t('settings.system.accentColor')}
      </div>
      <div className="accent-picker">
        {ACCENTS.map((accent) => {
          const accentLabel = t(`settings.system.${accent.name.toLowerCase()}`);
          return (
            <button
              key={accent.name}
              className={`accent-swatch ${currentAccent.name === accent.name ? 'active' : ''}`}
              style={{ background: accent.primary }}
              onClick={() => setAccent(accent)}
              title={accentLabel}
              aria-label={accentLabel}
            />
          );
        })}
      </div>
    </div>
  );
}
