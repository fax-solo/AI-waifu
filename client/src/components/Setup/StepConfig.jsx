import { useSetup } from './SetupProvider.jsx';

export default function StepConfig({ t }) {
  const {
    state: { config, selectedEngine },
    updateConfig, nextStep, prevStep, canGoPrev,
  } = useSetup();

  return (
    <div className="flex flex-col min-h-[280px] gap-4 px-2 py-4">
      <h2 className="text-xl font-bold text-white text-center">{t('setup.config.title')}</h2>
      <p className="text-gray-400 text-xs text-center">{t('setup.config.subtitle')}</p>

      <div className="w-full max-w-sm mx-auto space-y-3">
        <label className="block">
          <span className="text-xs text-gray-300 block mb-1">{t('setup.config.companionName')}</span>
          <input
            type="text"
            value={config.companionName}
            onChange={(e) => updateConfig('companionName', e.target.value)}
            maxLength={32}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Aria"
          />
        </label>

        <label className="block">
          <span className="text-xs text-gray-300 block mb-1">{t('setup.config.language')}</span>
          <select
            value={config.language}
            onChange={(e) => updateConfig('language', e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <div className={`w-9 h-4.5 rounded-full transition-colors relative ${config.ttsEnabled ? 'bg-indigo-600' : 'bg-gray-600'}`}>
            <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${config.ttsEnabled ? 'left-[19px]' : 'left-0.5'}`} />
          </div>
          <input
            type="checkbox"
            checked={config.ttsEnabled}
            onChange={(e) => updateConfig('ttsEnabled', e.target.checked)}
            className="hidden"
          />
          <span className="text-xs text-gray-300">{t('setup.config.ttsEnabled')}</span>
        </label>

        <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-lg px-3 py-2">
          <div className="text-[11px] text-indigo-300">{t('setup.config.engineLabel')}</div>
          <div className="text-xs text-white font-medium mt-0.5">
            {selectedEngine === 'gpu' ? 'GPU (CUDA)' : 'CPU'}
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-2 mt-2">
        <button onClick={prevStep} disabled={!canGoPrev} className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors text-xs disabled:opacity-30">
          {t('common.back')}
        </button>
        <button onClick={nextStep} className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-xs">
          {t('common.continue')}
        </button>
      </div>
    </div>
  );
}
