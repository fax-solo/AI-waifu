import { Sparkles, Download, Upload } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import * as api from '../../utils/api.js';
import { useState, useRef } from 'react';

export default function CompanionTab({ companion, setCompanion }) {
  const { t } = useLanguage();
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef(null);

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
        <        textarea
          id="companion-backstory"
          value={companion.backstory}
          onChange={(e) => setCompanion((p) => ({ ...p, backstory: e.target.value }))}
          placeholder={t('settings.companion.backstoryPlaceholder')}
          rows={3}
        />
      </div>

      <div className="character-io">
        <button
          className="char-export-btn"
          onClick={async () => {
            try {
              const data = await api.exportCharacter();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${data.character.name.replace(/[^a-zA-Z0-9]/g, '_')}_character.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              setImportMsg('Export failed: ' + e.message);
            }
          }}
        >
          <Download size={16} />
          Export Character
        </button>
        <button
          className="char-import-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} />
          Import Character
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const data = JSON.parse(text);

              // Support both raw character data and wrapped { version, type, character } format
              const char = data.character || data;
              if (!char.name) throw new Error('Invalid character file: missing name');

              await api.importCharacter(char);
              setCompanion((p) => ({
                ...p,
                name: char.name || p.name,
                tone: char.tone || p.tone,
                personality: char.personality || p.personality,
                backstory: char.backstory || p.backstory,
              }));
              setImportMsg(`Character "${char.name}" imported!`);
            } catch (e) {
              setImportMsg('Import failed: ' + e.message);
            }
            e.target.value = '';
            setTimeout(() => setImportMsg(''), 3000);
          }}
        />
      </div>
      {importMsg && <div className="char-io-msg">{importMsg}</div>}
    </div>
  );
}
