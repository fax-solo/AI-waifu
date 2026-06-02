import { useState, useRef, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

function StarSVG({ style }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12"
      style={style}
      aria-hidden="true"
      className="theme-star"
    >
      <path
        d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloudSVG({ style }) {
  return (
    <svg
      width="36" height="18" viewBox="0 0 36 18"
      style={style}
      aria-hidden="true"
      className="theme-cloud"
    >
      <path
        d="M8 16 C8 12 10 8 14 8 C14 4 17 2 21 3 C24 1 28 2 30 6 C33 6 35 9 34 13 C33 15 30 16 8 16 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  const btnRef = useRef(null);
  const [squishing, setSquishing] = useState(false);

  const triggerFade = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';

    const probe = document.createElement('div');
    probe.setAttribute('data-theme', newTheme);
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const newBg = getComputedStyle(probe).getPropertyValue('--color-bg-primary').trim() || '#f5f3fa';
    document.body.removeChild(probe);

    const overlay = document.createElement('div');
    overlay.className = 'theme-fade-overlay';
    overlay.style.background = newBg;
    document.body.appendChild(overlay);

    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
  }, [theme]);

  const handleClick = (e) => {
    triggerFade();
    setSquishing(true);
    setTimeout(() => setSquishing(false), 450);
    onToggle();
  };

  return (
    <button
      ref={btnRef}
      className={`theme-toggle ${isDark ? 'dark' : 'light'}`}
      onClick={handleClick}
      role="switch"
      aria-checked={!isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <div className="theme-toggle-track">
        <div className="theme-toggle-decor">
          <StarSVG style={{ '--x': '14%', '--y': '28%', '--d': '0.1s', '--s': '10px' }} />
          <StarSVG style={{ '--x': '28%', '--y': '55%', '--d': '0.3s', '--s': '6px' }} />
          <StarSVG style={{ '--x': '8%', '--y': '68%', '--d': '0.2s', '--s': '8px' }} />
          <StarSVG style={{ '--x': '22%', '--y': '18%', '--d': '0.4s', '--s': '5px' }} />
          <StarSVG style={{ '--x': '38%', '--y': '42%', '--d': '0.15s', '--s': '7px' }} />

          <CloudSVG style={{ '--x': '62%', '--y': '50%', '--d': '0.1s', '--s': '1' }} />
          <CloudSVG style={{ '--x': '82%', '--y': '35%', '--d': '0.3s', '--s': '0.7' }} />
        </div>

        <Moon size={15} className="theme-toggle-icon moon" />
        <Sun size={15} className="theme-toggle-icon sun" />

        <div className={`theme-toggle-thumb ${isDark ? 'dark' : 'light'}${squishing ? ' squish' : ''}`}>
          <div className="theme-toggle-knob">
            <div className="theme-knob-icon">
              <Moon size={16} className="knob-moon" />
              <Sun size={16} className="knob-sun" />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
