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
        Data Management
      </div>

      <div className="data-section">
        <h4 className="data-section-title">Export / Import</h4>
        <div className="data-actions">
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={14} />
            Export Settings
          </button>
          <button className="btn btn-secondary" onClick={handleImport}>
            <Upload size={14} />
            Import Settings
          </button>
        </div>
        <div className="hint">Export your companion profile, personality, and shortcuts as JSON.</div>
      </div>

      <div className="data-section">
        <h4 className="data-section-title">Clear Data</h4>
        <div className="data-actions">
          <button className="btn btn-danger" onClick={handleClearMemories} disabled={memories.length === 0}>
            <Trash2 size={14} />
            Clear Memories ({memories.length})
          </button>
          <button className="btn btn-danger" onClick={handleClearConversations}>
            <Trash2 size={14} />
            Clear Conversations
          </button>
        </div>
        <div className="hint">These actions cannot be undone.</div>
      </div>
    </div>
  );
}
