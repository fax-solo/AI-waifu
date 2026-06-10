import { Brain } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export default function MemoriesTab({ memories, handleDeleteMemory }) {
  const { t } = useLanguage();

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Brain size={18} className="icon" />
        {t('settings.memories.title')}
      </div>
      {memories.length === 0 ? (
        <div className="settings-empty">
          <Brain size={32} className="settings-empty-icon" />
          <p>{t('settings.memories.empty')}</p>
        </div>
      ) : (
        <div className="settings-anim-list">
          {memories.map((memory) => (
            <div key={memory.id} className="settings-anim-item">
              <span className="memory-content">💭 {memory.content}</span>
              <button
                className="btn btn-danger btn-small"
                onClick={() => handleDeleteMemory(memory.id)}
              >
                {t('settings.memories.forget')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
