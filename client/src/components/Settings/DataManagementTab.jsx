import { Database, Trash2, Download, Upload, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import * as api from '../../utils/api.js';
import { useState, useEffect } from 'react';

export default function DataManagementTab({
  memories, handleExport, handleImport,
  handleClearMemories, handleClearConversations
}) {
  const { t } = useLanguage();
  const [backups, setBackups] = useState([]);
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    api.getBackups().then(data => setBackups(data.backups || [])).catch(() => {});
  }, []);

  const handleBackup = async () => {
    try {
      const data = await api.triggerBackup();
      setBackups(data.backups || []);
      setBackupMsg('Backup created!');
      setTimeout(() => setBackupMsg(''), 3000);
    } catch (e) {
      setBackupMsg('Backup failed: ' + e.message);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Database size={18} className="icon" />
        {t('settings.data.title')}
      </div>

      <div className="data-section">
        <h4 className="data-section-title">{t('settings.data.exportImport')}</h4>
        <div className="data-actions">
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={14} />
            {t('settings.data.exportSettings')}
          </button>
          <button className="btn btn-secondary" onClick={handleImport}>
            <Upload size={14} />
            {t('settings.data.importSettings')}
          </button>
        </div>
        <div className="hint">{t('settings.data.exportHint')}</div>
      </div>

      <div className="data-section">
        <h4 className="data-section-title">{t('settings.data.clearData')}</h4>
        <div className="data-actions">
          <button className="btn btn-danger" onClick={handleClearMemories} disabled={memories.length === 0}>
            <Trash2 size={14} />
            {t('settings.data.clearMemories')} ({memories.length})
          </button>
          <button className="btn btn-danger" onClick={handleClearConversations}>
            <Trash2 size={14} />
            {t('settings.data.clearConversations')}
          </button>
        </div>
        <div className="hint">{t('settings.data.cannotUndo')}</div>
      </div>

      <div className="data-section">
        <h4 className="data-section-title">Database Backups</h4>
        <div className="data-actions">
          <button className="btn btn-primary" onClick={handleBackup}>
            <Save size={14} />
            Create Backup Now
          </button>
        </div>
        {backupMsg && <div className="hint" style={{ color: 'var(--color-success)', marginTop: 8 }}>{backupMsg}</div>}
        {backups.length > 0 && (
          <div className="backup-list">
            <div className="hint" style={{ marginTop: 8 }}>
              Auto-backups run every 30 min. Last {backups.length} backups kept.
            </div>
            <div className="backup-items">
              {backups.slice(0, 5).map(b => (
                <div key={b.name} className="backup-item">
                  <span className="backup-name">{b.name.replace('waifu_', '').replace('.db', '')}</span>
                  <span className="backup-size">{(b.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
