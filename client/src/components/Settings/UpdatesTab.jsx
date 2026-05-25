import { Download, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { version as APP_VERSION } from '../../../../package.json';

export default function UpdatesTab({ updateStatus, latestVersion, updateUrl, updateError, updateProgress, checkForUpdates, downloadUpdate, installUpdate, onTriggerSetup }) {
  const { t } = useLanguage();

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Download size={18} className="icon" />
        {t('settings.updates.title')}
      </div>

      <div className="form-group">
        <div className="version-display">
          <span>{t('settings.updates.currentVersion')}: {APP_VERSION}</span>
        </div>

        <button className="btn btn-primary btn-full" onClick={checkForUpdates} disabled={updateStatus === 'checking'}>
          {updateStatus === 'checking' ? (
            t('settings.updates.checking')
          ) : (
            <><RefreshCw size={14} /> {t('settings.updates.check')}</>
          )}
        </button>

        {updateStatus === 'checking' && (
          <div className="settings-empty">
            <RefreshCw size={24} className="settings-empty-icon spin" />
            <p>{t('settings.updates.checking')}</p>
          </div>
        )}

        {updateStatus === 'uptodate' && (
          <div className="settings-empty">
            <Download size={24} className="settings-empty-icon" />
            <p>{t('settings.updates.uptodate')}</p>
            <p className="text-muted">{t('settings.updates.uptodateDesc')}</p>
          </div>
        )}

        {updateStatus === 'available' && (
          <div className="settings-empty update-available" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Download size={24} className="update-icon" />
            <p className="update-text">{t('settings.updates.available')}</p>
            <p>{t('settings.updates.latestVersion')}: {latestVersion}</p>
            {window.electronAPI ? (
              <button className="btn btn-primary" onClick={downloadUpdate}>
                <Download size={14} />
                Download Update
              </button>
            ) : (
              <a href={updateUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <Download size={14} />
                {t('settings.updates.install')}
              </a>
            )}
          </div>
        )}

        {updateStatus === 'downloading' && (
          <div className="settings-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Download size={24} className="update-icon" />
            <p>Downloading Update…</p>
            <div className="progress-bar-container" style={{ width: '100%', marginTop: '1rem' }}>
              <div className="progress-bar-fill" style={{ width: `${updateProgress}%` }}></div>
            </div>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>{Math.floor(updateProgress)}%</p>
          </div>
        )}

        {updateStatus === 'downloaded' && (
          <div className="settings-empty update-available" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Download size={24} className="update-icon" />
            <p className="update-text">Update Ready</p>
            <p>The update has been downloaded and is ready to install.</p>
            <button className="btn btn-primary" onClick={installUpdate}>
              Install and Restart
            </button>
          </div>
        )}

        {updateStatus === 'error' && (
          <div className="settings-empty update-error">
            <Download size={24} className="error-icon" />
            <p className="error-text">{t('settings.updates.error')}</p>
            <p className="text-muted">{updateError}</p>
          </div>
        )}
      </div>

      <div className="settings-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
        <div className="settings-section-title">
          <Download size={18} className="icon" />
          Component Setup Wizard
        </div>
        <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          Open the setup wizard to download missing components like the Text-to-Speech models, Python environment, or hardware accelerators.
        </p>
        <button className="btn btn-secondary btn-full" onClick={onTriggerSetup}>
          Open Setup Wizard
        </button>
      </div>
    </div>
  );
}
