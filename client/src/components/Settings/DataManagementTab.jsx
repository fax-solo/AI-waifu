import { Database, Trash2, Download, Upload } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export default function DataManagementTab({
  memories, handleExport, handleImport,
  handleClearMemories, handleClearConversations
}) {
  const { t } = useLanguage();

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
    </div>
  );
}
