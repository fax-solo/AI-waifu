import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, XCircle, Terminal, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const LOG_HEIGHT = 224;

export default function InstallProgress({
  packages,
  installProgress,
  startInstall,
  abortInstall,
  retryInstall,
  onNext,
}) {
  const { t } = useLanguage();
  const [showAbortModal, setShowAbortModal] = useState(false);
  const logEndRef = useRef(null);
  const startedRef = useRef(false);
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    if (!startedRef.current && packages.length > 0) {
      startedRef.current = true;
      const timer = setTimeout(() => {
        setPreparing(false);
        startInstall();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [packages, startInstall]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [installProgress?.logs]);

  const progresses = installProgress?.progresses || {};
  const currentIndex = installProgress?.currentIndex ?? 0;
  const isFinished = installProgress?.isFinished ?? false;
  const aborted = installProgress?.aborted ?? false;
  const installError = installProgress?.error;
  const logs = installProgress?.logs || [];

  const totalWeight = packages.length * 100;
  const currentWeight = packages.reduce((acc, pkg) => acc + (progresses[pkg.id] || 0), 0);
  const overallProgress = packages.length === 0 ? 0 : Math.floor((currentWeight / totalWeight) * 100);

  const handleAbort = () => {
    abortInstall();
    setShowAbortModal(false);
  };

  const hasStarted = installProgress !== null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-6">
          {!hasStarted && preparing && (
            <>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-100">
                  {t('setup.preparingInstall')}
                </h2>
                <p className="text-gray-400 mt-1.5 text-sm">
                  {t('setup.confirmDesc')}
                </p>
              </div>
              <div className="flex items-center justify-center py-8">
                <Loader2 size={32} className="text-cyan-400 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                {packages.map(pkg => (
                  <div key={pkg.id} className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-800 bg-gray-900/40 animate-pulse">
                    <div className="w-5 h-5 rounded-full bg-gray-800" />
                    <div className="flex-1">
                      <div className="h-4 w-48 rounded bg-gray-800" />
                    </div>
                    <div className="h-3 w-12 rounded bg-gray-800" />
                  </div>
                ))}
              </div>
            </>
          )}

          {hasStarted && !isFinished && (
            <>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-100">
                  {t('setup.installingComponents')}
                </h2>
                <p className="text-gray-400 mt-1.5 text-sm">
                  {t('setup.confirmDesc')}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">{t('setup.total')}</span>
                  <span className="text-xl font-mono tabular-nums text-cyan-400 font-medium">
                    {overallProgress}%
                  </span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${overallProgress}%` }}
                    role="progressbar"
                    aria-valuenow={overallProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Installation ${overallProgress}% complete`}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {packages.map((pkg, idx) => {
                  const pkgProgress = progresses[pkg.id] || 0;
                  const status = idx < currentIndex ? 'done' : idx === currentIndex ? 'active' : 'waiting';

                  return (
                    <div
                      key={pkg.id}
                      className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-300
                        ${status === 'active' ? 'border-gray-700 bg-gray-800/80' : ''}
                        ${status === 'done' ? 'border-green-400/20 bg-green-400/5 opacity-70' : ''}
                        ${status === 'waiting' ? 'border-gray-800 bg-gray-900/40' : ''}
                      `}
                    >
                      <div className="shrink-0">
                        {status === 'active' ? (
                          <div className="w-5 h-5 border-2 border-gray-600 border-t-cyan-400 rounded-full animate-spin" role="status" aria-label="Installing" />
                        ) : status === 'done' ? (
                          <CheckCircle size={20} className="text-green-400" aria-hidden="true" />
                        ) : (
                          <Clock size={20} className="text-gray-600" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-200 truncate">{pkg.name}</div>
                        {status === 'active' && (
                          <div className="mt-2">
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                                style={{ width: `${Math.floor(pkgProgress)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-xs font-mono tabular-nums">
                        {status === 'active' && (
                          <span className="text-cyan-400">{Math.floor(pkgProgress)}%</span>
                        )}
                        {status === 'done' && (
                          <span className="text-green-400">{t('setup.installed')}</span>
                        )}
                        {status === 'waiting' && (
                          <span className="text-gray-500">{t('setup.installStatusWaiting')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {installError && (
                <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-red-400/20 bg-red-400/5">
                  <XCircle size={20} className="text-red-400 shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-red-400">{t('setup.failed')}</div>
                    <div className="text-sm text-red-400/70 mt-0.5 truncate">{installError}</div>
                  </div>
                  <button
                    className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-red-400/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                    onClick={retryInstall}
                  >
                    {t('setup.retry')}
                  </button>
                </div>
              )}
            </>
          )}

          {hasStarted && isFinished && aborted && (
            <div className="flex flex-col items-center gap-5 py-8">
              <AlertTriangle size={48} className="text-yellow-400" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-100">{t('setup.abortTitle')}</h2>
              <p className="text-gray-400 text-sm text-center max-w-sm">{t('setup.abortDesc')}</p>
              <button
                className="px-6 py-2.5 rounded-xl bg-gray-800 text-gray-200 font-medium text-sm hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
                onClick={retryInstall}
              >
                {t('setup.resume')}
              </button>
            </div>
          )}

          {hasStarted && isFinished && !aborted && !installError && (
            <div className="flex flex-col items-center gap-5 py-8">
              <div className="w-20 h-20 rounded-full bg-green-400/10 flex items-center justify-center">
                <CheckCircle size={44} className="text-green-400" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-100">{t('setup.readyToLaunch')}</h2>
              <p className="text-gray-400 text-sm text-center max-w-md">{t('setup.readyDesc')}</p>
              <button
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-400 text-gray-950 font-semibold text-sm hover:bg-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                onClick={onNext}
              >
                {t('setup.launchApp')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between shrink-0 mt-6 pt-5 border-t border-gray-800">
        {hasStarted && !isFinished && !installError && (
          <button
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 rounded-xl px-3 py-1.5"
            onClick={() => setShowAbortModal(true)}
          >
            {t('setup.cancelInstall')}
          </button>
        )}
        {(isFinished || installError) && !aborted && <div />}

        {hasStarted && (
          <button
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40 rounded-xl px-3 py-1.5"
            onClick={() => setLogOpen(prev => !prev)}
          >
            <Terminal size={16} aria-hidden="true" />
            {logOpen ? t('setup.hideLog') : t('setup.showLog')}
            {logOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${logOpen ? 'mt-4' : 'mt-0'}`}
        style={{ maxHeight: logOpen ? `${LOG_HEIGHT + 40}px` : '0px' }}
      >
        <div className="h-56 bg-gray-950 rounded-xl border border-gray-800 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">{t('setup.consoleOutput')}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed" role="log" aria-live="polite">
            {logs.length === 0 && (
              <div className="text-gray-600">{t('setup.waitingOutput')}</div>
            )}
            {logs.map((log, i) => (
              <div key={i} className="mb-0.5">
                <span className="text-gray-600 mr-2 select-none">[{log.time}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  log.type === 'error' ? 'text-red-400' :
                  'text-blue-400'
                }>{log.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {showAbortModal && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60"
          onClick={() => setShowAbortModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('setup.abortTitle')}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-gray-800 p-6 max-w-sm mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle size={32} className="text-yellow-400 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-gray-100 mb-2">{t('setup.abortTitle')}</h3>
            <p className="text-sm text-gray-400 mb-6">{t('setup.abortDesc')}</p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-400 border border-gray-700 hover:bg-gray-800 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
                onClick={() => setShowAbortModal(false)}
              >
                {t('setup.resume')}
              </button>
              <button
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-400/30 hover:bg-red-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                onClick={handleAbort}
              >
                {t('setup.confirmAbort')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
