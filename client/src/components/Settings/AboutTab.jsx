import { Info, Github, Heart } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { version as APP_VERSION } from '../../../package.json';

export default function AboutTab() {
  const { t } = useLanguage();

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Info size={18} className="icon" />
        About
      </div>

      <div className="about-card">
        <div className="about-logo">✦</div>
        <h3 className="about-app-name">Waifu</h3>
        <p className="about-desc">AI Companion Chat</p>
      </div>

      <div className="about-info-list">
        <div className="about-info-row">
          <span className="about-label">Version</span>
          <span className="about-value">{APP_VERSION}</span>
        </div>
        <div className="about-info-row">
          <span className="about-label">Framework</span>
          <span className="about-value">React 19 + Three.js</span>
        </div>
        <div className="about-info-row">
          <span className="about-label">Backend</span>
          <span className="about-value">Express + SQLite</span>
        </div>
        <div className="about-info-row">
          <span className="about-label">TTS Engine</span>
          <span className="about-value">Kokoro (ONNX / PyTorch)</span>
        </div>
      </div>

      <a
        href="https://github.com/fax-solo/AI-waifu"
        target="_blank"
        rel="noopener noreferrer"
        className="about-github-link"
      >
        <Github size={16} />
        View on GitHub
      </a>

      <div className="about-credits">
        <Heart size={14} className="heart-icon" />
        <span>Built with love for the AI community</span>
      </div>
    </div>
  );
}
