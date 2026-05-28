import { useSetup } from './SetupProvider.jsx';

const STATUS_COLORS = {
  downloading: 'bg-blue-500',
  installing: 'bg-yellow-500',
  verifying: 'bg-purple-500',
  done: 'bg-green-500',
  error: 'bg-red-500',
  skipped: 'bg-gray-500',
};

const STATUS_ICONS = {
  downloading: '⬇',
  installing: '⚙',
  verifying: '✓',
  done: '✓',
  error: '✗',
  skipped: '—',
};

function ProgressBar({ progress = 0, status = 'downloading', speed, eta, pkg }) {
  const pct = Math.min(Math.max(progress || 0), 100);

  return (
    <div className="bg-white/5 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`text-xs ${status === 'error' ? 'text-red-400' : status === 'done' ? 'text-green-400' : 'text-blue-400'}`}>
          {STATUS_ICONS[status] || '○'}
        </div>
        <div className="text-xs text-white flex-1 truncate">{pkg}</div>
        <div className="text-[11px] text-gray-400">{Math.round(pct)}%</div>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${STATUS_COLORS[status] || 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {speed > 0 && (
        <div className="flex justify-between mt-1 text-[10px] text-gray-500">
          <span>{formatSpeed(speed)}</span>
          {eta > 0 && <span>~{formatEta(eta)}</span>}
        </div>
      )}
    </div>
  );
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps < 1) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${mbps.toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default function InstallProgress({ t }) {
  const {
    state: { installProgress, packages, selectedPackageIds },
    retryInstall, abortInstall, nextStep,
  } = useSetup();

  const isActive = installProgress && !installProgress.isFinished && !installProgress.error;
  const isDone = installProgress?.isFinished;
  const hasError = installProgress?.error;

  const getPkgName = (id) => {
    const pkg = packages?.packages?.find(p => p.id === id);
    return pkg?.name || id;
  };

  return (
    <div className="flex flex-col min-h-[250px] gap-4 px-2 py-4">
      <h2 className="text-xl font-bold text-white text-center">{t('setup.install.title')}</h2>
      {isActive && <p className="text-gray-400 text-xs text-center">{t('setup.install.inProgress')}</p>}
      {isDone && <p className="text-green-400 text-xs text-center">{t('setup.install.done')}</p>}
      {hasError && <p className="text-red-400 text-xs text-center">{t('setup.install.error')}</p>}

      {installProgress && (
        <div className="w-full max-w-sm mx-auto space-y-1.5">
          {selectedPackageIds.map((id) => {
            const prog = installProgress.progresses?.[id];
            return (
              <ProgressBar
                key={id}
                pkg={getPkgName(id)}
                progress={prog?.progress}
                status={prog?.status || (hasError ? 'error' : isDone ? 'done' : 'downloading')}
                speed={prog?.speed}
                eta={prog?.eta}
              />
            );
          })}
        </div>
      )}

      {installProgress?.logs?.length > 0 && (
        <div className="w-full max-w-sm mx-auto max-h-32 overflow-y-auto bg-black/30 rounded-lg p-2 space-y-0.5">
          {installProgress.logs.slice(-50).map((log, i) => (
            <div key={i} className={`text-[10px] font-mono ${
              log.type === 'error' ? 'text-red-400' :
              log.type === 'success' ? 'text-green-400' :
              log.type === 'warn' ? 'text-yellow-400' : 'text-gray-400'
            }`}>
              [{log.time}] {log.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center gap-2 mt-1">
        {hasError && (
          <button onClick={retryInstall} className="px-5 py-1.5 rounded-lg bg-yellow-600 text-white font-medium hover:bg-yellow-500 transition-colors text-xs">
            {t('setup.install.retry')}
          </button>
        )}
        {isActive && (
          <button onClick={abortInstall} className="px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300 transition-colors text-xs">
            {t('setup.install.cancel')}
          </button>
        )}
        {isDone && (
          <button onClick={nextStep} className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-xs">
            {t('common.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
