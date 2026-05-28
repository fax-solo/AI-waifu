import { useState, useEffect } from 'react';
import { useSetup } from './SetupProvider.jsx';

const formatSize = (bytes) => {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
};

export default function PackageSelection({ t }) {
  const {
    state: { packages, selectedPackageIds, selectedEngine },
    loadPackages, togglePackage, nextStep, prevStep, canGoPrev,
  } = useSetup();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPackages().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-gray-400 animate-pulse text-xs">{t('common.loading')}</div>
      </div>
    );
  }

  const allItems = packages?.packages || [];
  const totalSize = selectedPackageIds.reduce((sum, id) => {
    const pkg = allItems.find(p => p.id === id);
    return sum + (pkg?.size || 0);
  }, 0);

  return (
    <div className="flex flex-col min-h-[280px] gap-4 px-2 py-4">
      <h2 className="text-xl font-bold text-white text-center">{t('setup.components.title')}</h2>
      <p className="text-gray-400 text-xs text-center">{t('setup.components.subtitle')}</p>

      <div className="w-full max-w-sm mx-auto space-y-1.5">
        {allItems.map((pkg) => {
          const selected = selectedPackageIds.includes(pkg.id);
          const disabled = pkg.required;
          return (
            <button
              key={pkg.id}
              onClick={() => !disabled && togglePackage(pkg.id)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all ${
                selected ? 'bg-indigo-600/20 border border-indigo-500/40' : 'bg-white/5 border border-transparent hover:bg-white/10'
              } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                selected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-500'
              }`}>
                {selected && <div className="w-2 h-2 bg-white rounded-sm" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white flex items-center gap-1.5">
                  {pkg.icon && <span>{pkg.icon}</span>}
                  {pkg.name}
                  {disabled && <span className="text-[10px] text-gray-500">({t('setup.components.required')})</span>}
                </div>
                <div className="text-[11px] text-gray-400 truncate">{pkg.description || ''}</div>
              </div>
              <div className="text-[11px] text-gray-500 flex-shrink-0">
                {pkg.type === 'python-env' && (selectedEngine === 'gpu' ? 'CUDA' : 'CPU')}
                {pkg.type !== 'python-env' && formatSize(pkg.size)}
              </div>
            </button>
          );
        })}
      </div>

      {totalSize > 0 && (
        <div className="text-center text-xs text-gray-400">
          {t('setup.components.totalSize')}: {formatSize(totalSize)}
        </div>
      )}

      <div className="flex justify-center gap-2 mt-1">
        <button onClick={prevStep} disabled={!canGoPrev} className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white transition-colors text-xs disabled:opacity-30">
          {t('common.back')}
        </button>
        <button
          onClick={nextStep}
          disabled={selectedPackageIds.length === 0}
          className="px-5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-xs disabled:opacity-30"
        >
          {t('setup.components.startInstall')} ({selectedPackageIds.length})
        </button>
      </div>
    </div>
  );
}
