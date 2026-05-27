import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Cpu, Monitor, HardDrive, Globe, RefreshCw, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const CHECKS = [
  { id: 'python', icon: Cpu, labelKey: 'setup.pythonLabel' },
  { id: 'gpu', icon: Monitor, labelKey: 'setup.gpuLabel' },
  { id: 'disk', icon: HardDrive, labelKey: 'setup.diskLabel' },
  { id: 'os', icon: Globe, labelKey: 'setup.osLabel' },
];

const STATUS_CONFIG = {
  pass: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
  warn: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  fail: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30' },
};

function SkeletonCard() {
  return (
    <div className="flex items-center gap-5 px-5 py-4 rounded-xl border border-gray-800 bg-gray-900/40 animate-pulse">
      <div className="w-[22px] h-[22px] rounded bg-gray-800 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-gray-800" />
        <div className="h-3 w-20 rounded bg-gray-800/60" />
      </div>
      <div className="w-[22px] h-[22px] rounded-full bg-gray-800 shrink-0" />
    </div>
  );
}

export default function StepSystemCheck({ checks, runSystemCheck, onNext }) {
  const { t } = useLanguage();
  const announcerRef = useRef(null);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setTimedOut(false);
    runSystemCheck();

    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
    }, 12000);

    return () => clearTimeout(timeoutRef.current);
  }, [runSystemCheck]);

  useEffect(() => {
    if (!checks) return;
    clearTimeout(timeoutRef.current);
    const statuses = Object.values(checks);
    const pass = statuses.filter(c => c.status === 'pass').length;
    const warn = statuses.filter(c => c.status === 'warn').length;
    const fail = statuses.filter(c => c.status === 'fail').length;
    if (announcerRef.current) {
      announcerRef.current.textContent = `${pass} passed, ${warn} warnings, ${fail} failed`;
    }
  }, [checks]);

  const allDone = checks && Object.values(checks).every(c => c.status);
  const hasFail = checks && Object.values(checks).some(c => c.status === 'fail');

  return (
    <div className="flex flex-col flex-1 min-h-0 animate-fade-slide-up">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-100">
              {t('setup.systemRequirements')}
            </h2>
            <p className="text-gray-400 mt-1.5 text-sm">
              {t('setup.systemRequirementsDesc')}
            </p>
          </div>

          <div aria-live="polite" ref={announcerRef} className="sr-only" />

          <div className="space-y-3" role="list">
            {!checks && CHECKS.map(({ id }) => <SkeletonCard key={id} />)}

            {checks && CHECKS.map(({ id, icon: Icon, labelKey }) => {
              const result = checks[id];
              const done = !!result?.status;
              const status = result?.status || 'pending';
              const StatusIcon = STATUS_CONFIG[status]?.icon || AlertTriangle;
              const colorClass = STATUS_CONFIG[status]?.color || 'text-gray-500';
              const bgClass = STATUS_CONFIG[status]?.bg || 'bg-gray-800/50';
              const borderClass = STATUS_CONFIG[status]?.border || 'border-gray-700/50';

              return (
                <div
                  key={id}
                  role="listitem"
                  className={`flex items-center gap-5 px-5 py-4 rounded-xl border ${borderClass} ${bgClass} transition-all duration-300 ${done ? 'opacity-100' : 'opacity-50'}`}
                  style={done ? { animation: 'checkPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' } : undefined}
                >
                  <Icon size={22} className="text-gray-400 shrink-0" aria-hidden="true" />

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-200">{t(labelKey)}</div>
                    {done && result.message && (
                      <div className={`text-sm mt-0.5 ${colorClass}`}>{result.message}</div>
                    )}
                    {done && result.detail && (
                      <div className="text-xs mt-0.5 text-gray-500">{result.detail}</div>
                    )}
                    {!done && (
                      <div className="text-sm mt-0.5 text-gray-500 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        {t('setup.checking')}
                      </div>
                    )}
                  </div>

                  <div className={`shrink-0 ${colorClass} transition-all duration-500`}
                    style={done ? { animation: 'checkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' } : undefined}
                  >
                    <StatusIcon size={22} aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>

          {timedOut && !allDone && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <p className="text-sm text-yellow-400">{t('setup.someWarnings')}</p>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
                onClick={() => { setTimedOut(false); runSystemCheck(); }}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {t('setup.retry')}
              </button>
            </div>
          )}

          {allDone && (
            <div className={`text-center text-sm pt-2 ${hasFail ? 'text-yellow-400' : 'text-green-400'}`}>
              {hasFail ? t('setup.someFailures') : t('setup.allMet')}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end shrink-0 mt-6">
        <button
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-400 text-gray-950 font-semibold text-sm hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          onClick={onNext}
          disabled={!allDone || hasFail}
        >
          {t('setup.nextStep')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
        </button>
      </div>
    </div>
  );
}
