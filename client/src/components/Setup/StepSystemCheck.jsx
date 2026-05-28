import { useState, useEffect } from 'react';
import { useSetup } from './SetupProvider.jsx';

const CHECK_LABELS = {
  python: { icon: '🐍', labelKey: 'setup.systemCheck.python' },
  gpu: { icon: '🖥️', labelKey: 'setup.systemCheck.gpu' },
  disk: { icon: '💾', labelKey: 'setup.systemCheck.disk' },
  os: { icon: '🖥️', labelKey: 'setup.systemCheck.os' },
  network: { icon: '🌐', labelKey: 'setup.systemCheck.network' },
};

const STATUS_ICONS = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
  pending: '○',
  checking: '⟳',
};

const STATUS_COLORS = {
  pass: 'text-green-400',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
  pending: 'text-gray-500',
  checking: 'text-blue-400',
};

export default function StepSystemCheck({ t }) {
  const { state: { checks }, runSystemCheck, nextStep, prevStep, canGoPrev } = useSetup();
  const [animatedChecks, setAnimatedChecks] = useState({});
  const [isRunning, setIsRunning] = useState(false);

  const runChecks = async () => {
    setIsRunning(true);
    setAnimatedChecks({});
    const keys = ['python', 'gpu', 'disk', 'os', 'network'];
    for (const key of keys) {
      await new Promise(r => setTimeout(r, 150 + Math.random() * 200));
      if (!checks || !checks[key])
        setAnimatedChecks(prev => ({ ...prev, [key]: { status: 'checking', message: '' } }));
    }
    const result = await runSystemCheck();
    setAnimatedChecks(result || {});
    setIsRunning(false);
  };

  useEffect(() => {
    if (!checks) runChecks();
    else setAnimatedChecks(checks);
  }, []);

  const allPassed = !Object.values(animatedChecks).some(c => c?.status === 'fail');

  return (
    <div className="flex flex-col items-center min-h-[280px] gap-4 px-2 py-4">
      <h2 className="text-xl font-bold text-white">{t('setup.systemCheck.title')}</h2>
      <p className="text-gray-400 text-xs">{t('setup.systemCheck.subtitle')}</p>

      <div className="w-full max-w-sm space-y-2 mt-1">
        {Object.entries(CHECK_LABELS).map(([key, meta]) => {
          const c = animatedChecks[key] || { status: 'pending', message: '', detail: '' };
          return (
            <div key={key} className={`bg-white/5 rounded-lg px-3 py-2 flex items-center gap-2.5 transition-all ${c.status === 'checking' ? 'animate-pulse' : ''}`}>
              <div className={`text-base ${STATUS_COLORS[c.status]} transition-colors`}>
                {STATUS_ICONS[c.status]}
              </div>
              <div className="text-xs text-white flex-1">{t(meta.labelKey)}</div>
              <div className="text-[11px] text-gray-400">{c.detail || c.message}</div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={prevStep} disabled={!canGoPrev} className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors text-xs disabled:opacity-30">
          {t('common.back')}
        </button>
        <button onClick={runChecks} disabled={isRunning} className="px-3 py-1.5 rounded-lg text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-30">
          {isRunning ? t('setup.systemCheck.running') : t('setup.systemCheck.retry')}
        </button>
        <button onClick={nextStep} disabled={!allPassed || isRunning} className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-xs disabled:opacity-30">
          {t('common.continue')}
        </button>
      </div>
    </div>
  );
}
