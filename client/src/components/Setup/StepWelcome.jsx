import { useSetup } from './SetupProvider.jsx';

const features = [
  { icon: '🤖', titleKey: 'setup.welcome.feature1Title', descKey: 'setup.welcome.feature1Desc' },
  { icon: '💬', titleKey: 'setup.welcome.feature2Title', descKey: 'setup.welcome.feature2Desc' },
  { icon: '🎤', titleKey: 'setup.welcome.feature3Title', descKey: 'setup.welcome.feature3Desc' },
  { icon: '🎮', titleKey: 'setup.welcome.feature4Title', descKey: 'setup.welcome.feature4Desc' },
];

export default function StepWelcome({ t }) {
  const { nextStep, skipSetup } = useSetup();

  return (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-4 text-center px-2">
      <div className="text-5xl mb-1">✨</div>
      <h1 className="text-2xl font-bold text-white">{t('setup.welcome.title')}</h1>
      <p className="text-gray-400 max-w-md text-sm">{t('setup.welcome.subtitle')}</p>

      <div className="grid grid-cols-2 gap-2.5 max-w-md w-full mt-3">
        {features.map((f, i) => (
          <div key={i} className="bg-white/5 rounded-lg p-3 text-left hover:bg-white/10 transition-colors">
            <div className="text-xl mb-0.5">{f.icon}</div>
            <div className="text-xs font-semibold text-white">{t(f.titleKey)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{t(f.descKey)}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={skipSetup} className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors text-xs">
          {t('setup.welcome.skip')}
        </button>
        <button onClick={nextStep} className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-sm">
          {t('setup.welcome.getStarted')}
        </button>
      </div>
    </div>
  );
}
