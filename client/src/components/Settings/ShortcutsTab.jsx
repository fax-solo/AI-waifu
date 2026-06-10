import { Keyboard } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS } from '../../hooks/useShortcuts.js';

const CONFLICTING_KEYS = ['F12', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+U', 'F11'];

export default function ShortcutsTab({ shortcuts, setShortcuts, recordingAction, setRecordingAction, handleSave }) {
  const { t } = useLanguage();

  const hasConflict = (combo) => CONFLICTING_KEYS.includes(combo);

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Keyboard size={18} className="icon" />
        {t('settings.shortcuts.title')}
      </div>
      <p className="settings-hint">{t('settings.shortcuts.hint')}</p>

      <div className="settings-shortcuts-list">
        {Object.entries(SHORTCUT_LABELS).map(([action, label]) => {
          const combo = shortcuts[action];
          const conflict = hasConflict(combo);
          return (
            <div key={action} className={`settings-shortcut-item ${conflict ? 'has-conflict' : ''}`}>
              <span className="settings-shortcut-label">{label}</span>
              <div className="settings-shortcut-actions">
                <button
                  className={`settings-shortcut-key ${recordingAction === action ? 'recording' : ''}`}
                  onClick={() => setRecordingAction(recordingAction === action ? null : action)}
                >
                  {recordingAction === action ? t('settings.shortcuts.recording') : (combo || '—')}
                </button>
                {combo !== DEFAULT_SHORTCUTS[action] && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setShortcuts(prev => ({ ...prev, [action]: DEFAULT_SHORTCUTS[action] }))}
                  >
                    {t('settings.shortcuts.reset')}
                  </button>
                )}
              </div>
              {conflict && <span className="shortcut-warning">⚠️ Conflict with browser shortcut</span>}
            </div>
          );
        })}
      </div>

      {Object.keys(shortcuts).some(k => shortcuts[k] !== DEFAULT_SHORTCUTS[k]) && (
        <button
          className="btn btn-secondary btn-full"
          onClick={() => setShortcuts(DEFAULT_SHORTCUTS)}
        >
          {t('settings.shortcuts.resetAll')}
        </button>
      )}
    </div>
  );
}
