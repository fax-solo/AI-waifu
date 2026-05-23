import { Download, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { version as APP_VERSION } from '../../../package.json';

export default function UpdatesTab({ updateStatus, latestVersion, updateUrl, updateError, checkForUpdates }) {
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
          <div className="settings-empty update-available">
            <Download size={24} className="update-icon" />
            <p className="update-text">{t('settings.updates.available')}</p>
            <p>{t('settings.updates.latestVersion')}: {latestVersion}</p>
            <a href={updateUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <Download size={14} />
              {t('settings.updates.install')}
            </a>
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
    </div>
  );
}
