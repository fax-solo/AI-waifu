import { Film, RefreshCw, Upload, Play, FolderOpen } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

export default function AnimationsTab({
  animations, animLoading, animSearch, setAnimSearch,
  loadAnimations, handleTestAnimation, handleDeleteAnimation,
  handleUploadAnimation, testStatus, animFileInputRef
}) {
  const { t } = useLanguage();

  const filterAnims = (list) =>
    list.filter(a => !animSearch || a.name.toLowerCase().includes(animSearch.toLowerCase()));

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Film size={18} className="icon" />
        {t('settings.animations.title')}
      </div>
      <p className="settings-hint">{t('settings.animations.hint')}</p>

      <div className="settings-anim-actions-row">
        <button className="btn btn-primary" onClick={loadAnimations} disabled={animLoading}>
          <RefreshCw size={14} />
          {t('settings.animations.refresh')}
        </button>
        <button className="btn btn-primary" onClick={() => animFileInputRef.current?.click()} disabled={animLoading}>
          <Upload size={14} />
          {t('settings.animations.upload')}
        </button>
        <input ref={animFileInputRef} type="file" accept=".json,.bvh" multiple
          style={{ display: 'none' }} onChange={handleUploadAnimation} />
      </div>

      <input className="avatar-browse-search" type="text"
        placeholder={t('common.search')} value={animSearch}
        onChange={(e) => setAnimSearch(e.target.value)} />

      <div style={{ marginBottom: 20 }}>
        <h4 className="settings-subtitle">{t('settings.animations.facial')}</h4>
        {filterAnims(animations.facial).length === 0 ? (
          <div className="settings-empty">
            {animSearch ? 'No matching facial animations.' : t('settings.animations.empty')}
          </div>
        ) : (
          <div className="settings-anim-list">
            {filterAnims(animations.facial).map((anim) => (
              <div key={anim.filename} className="settings-anim-item">
                <div className="settings-anim-info">
                  <span className="settings-anim-name">{anim.name}</span>
                  <span className="settings-anim-meta">{anim.duration.toFixed(1)}s {anim.loop ? '(loop)' : ''}</span>
                </div>
                <div className="settings-anim-actions">
                  <button className="btn btn-primary btn-small"
                    onClick={() => handleTestAnimation('facial', anim.filename)}
                    disabled={testStatus[`facial/${anim.filename}`] === 'playing'}>
                    <Play size={12} />
                    {testStatus[`facial/${anim.filename}`] === 'playing' ? t('common.playing') : t('common.test')}
                  </button>
                  <button className="btn btn-danger btn-small"
                    onClick={() => handleDeleteAnimation('facial', anim.filename)}>
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="settings-subtitle">{t('settings.animations.body')}</h4>
        {filterAnims(animations.body).length === 0 ? (
          <div className="settings-empty">
            {animSearch ? 'No matching body animations.' : t('settings.animations.empty')}
          </div>
        ) : (
          <div className="settings-anim-list">
            {filterAnims(animations.body).map((anim) => (
              <div key={anim.filename} className="settings-anim-item">
                <div className="settings-anim-info">
                  <span className="settings-anim-name">
                    {anim.name}
                    {anim.format === 'bvh' && <span className="tag">BVH</span>}
                  </span>
                  <span className="settings-anim-meta">
                    {anim.duration.toFixed(1)}s {anim.loop ? '(loop)' : ''} {anim.format === 'bvh' ? '| motion capture' : ''}
                  </span>
                </div>
                <div className="settings-anim-actions">
                  <button className="btn btn-primary btn-small"
                    onClick={() => handleTestAnimation('body', anim.filename)}
                    disabled={testStatus[`body/${anim.filename}`] === 'playing'}>
                    <Play size={12} />
                    {testStatus[`body/${anim.filename}`] === 'playing' ? t('common.playing') : t('common.test')}
                  </button>
                  <button className="btn btn-danger btn-small"
                    onClick={() => handleDeleteAnimation('body', anim.filename)}>
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-folder-hint">
        <FolderOpen size={20} />
        <p>{t('settings.animations.folderHint')}</p>
      </div>
    </div>
  );
}
