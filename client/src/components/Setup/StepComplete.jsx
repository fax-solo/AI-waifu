import { useSetup } from './SetupProvider.jsx';

export default function StepComplete({ t }) {
  const { state: { config, selectedEngine, selectedPackageIds }, completeSetup } = useSetup();

  return (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-4 text-center px-2">
      <div className="text-5xl mb-1">🎉</div>
      <h1 className="text-2xl font-bold text-white">{t('setup.complete.title')}</h1>
      <p className="text-gray-400 max-w-md text-xs">{t('setup.complete.subtitle')}</p>

      <div className="bg-white/5 rounded-lg p-4 max-w-xs w-full text-left space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">{t('setup.complete.companionName')}</span>
          <span className="text-white font-medium">{config.companionName}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">{t('setup.complete.language')}</span>
          <span className="text-white font-medium">{config.language === 'ar' ? 'العربية' : 'English'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">{t('setup.complete.engine')}</span>
          <span className="text-white font-medium">{selectedEngine === 'gpu' ? 'GPU (CUDA)' : 'CPU'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">{t('setup.complete.tts')}</span>
          <span className="text-white font-medium">{config.ttsEnabled ? 'Yes' : 'No'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">{t('setup.complete.packagesInstalled')}</span>
          <span className="text-white font-medium">{selectedPackageIds.length}</span>
        </div>
      </div>

      <button onClick={completeSetup} className="px-6 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-sm mt-1">
        {t('setup.complete.start')}
      </button>
    </div>
  );
}
