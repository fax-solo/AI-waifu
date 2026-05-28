import { useState, useCallback, useMemo } from 'react';
import { Cpu, Mic } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext.jsx';

const PACKAGE_GROUPS = [
  {
    id: 'engine',
    titleKey: 'setup.aiEngine',
    exclusive: true,
    required: false,
    packages: [
      {
        id: 'python-env-cpu',
        name: () => 'Local AI Engine (CPU)',
        description: 'Installs the Python environment and ONNX Runtime tailored for CPU execution.',
        size: '180 MB',
        sizeBytes: 180 * 1024 * 1024,
        icon: Cpu,
      },
      {
        id: 'python-env-gpu',
        name: (systemInfo) => {
          const gpuName = systemInfo?.gpuInfo?.hasNvidia ? systemInfo.gpuInfo.name : null;
          return gpuName ? `Local AI Engine (${gpuName})` : 'Local AI Engine (NVIDIA GPU)';
        },
        description: 'Installs the Python environment and CUDA-enabled ONNX Runtime for fast execution on NVIDIA GPUs.',
        size: '250 MB',
        sizeBytes: 250 * 1024 * 1024,
        icon: Cpu,
      },
    ],
  },
  {
    id: 'voice',
    titleKey: 'setup.ttsModel',
    exclusive: false,
    required: true,
    packages: [
      {
        id: 'tts-model',
        name: () => 'Kokoro ONNX Engine',
        description: 'The core neural network model for the local Text-to-Speech system.',
        size: '310 MB',
        sizeBytes: 310 * 1024 * 1024,
        icon: Mic,
        required: true,
      },
      {
        id: 'tts-voices',
        name: () => 'Voice Pack (v1.0)',
        description: 'Binary voice definitions and latent weights for the Kokoro TTS engine.',
        size: '27 MB',
        sizeBytes: 27 * 1024 * 1024,
        icon: Mic,
        required: true,
      },
    ],
  },
  {
    id: 'avatars',
    titleKey: 'setup.galleryAvatars',
    exclusive: false,
    required: false,
    packages: [
      {
        id: 'gallery-avatars',
        name: () => '3D Gallery Avatars',
        description: 'Pre-installed anime-style avatars ready to use immediately.',
        size: '0 B (pre-installed)',
        sizeBytes: 0,
        icon: () => '🎭',
        isPreinstalled: true,
      },
    ],
  },
  {
    id: 'extras',
    titleKey: 'setup.optional',
    exclusive: false,
    required: false,
    packages: [],
  },
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PackageSelection({ systemInfo, selectedPackages, setSelected, onNext }) {
  const { t } = useLanguage();
  const gpuName = systemInfo?.gpuInfo?.hasNvidia ? systemInfo.gpuInfo.name : null;
  const hasGalleryAvatars = systemInfo?.hasGalleryAvatars ?? false;

  const initialIds = useMemo(() => {
    const ids = gpuName ? ['python-env-gpu'] : ['python-env-cpu'];
    ids.push('tts-model', 'tts-voices');
    return new Set(ids);
  }, [gpuName]);

  const [selectedIds, setSelectedIds] = useState(initialIds);

  const togglePackage = useCallback((pkgId, group) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(pkgId)) {
        if (group.required) return prev;
        if (group.exclusive) {
          const groupPkgs = group.packages.map(p => p.id);
          const count = groupPkgs.filter(id => next.has(id)).length;
          if (count <= 1) return prev;
        }
        next.delete(pkgId);
      } else {
        if (group.exclusive) {
          group.packages.forEach(p => next.delete(p.id));
        }
        next.add(pkgId);
      }
      return next;
    });
  }, []);

  // Filter out preinstalled avatars group if already present
  const visibleGroups = useMemo(() => {
    return PACKAGE_GROUPS.map(group => ({
      ...group,
      packages: group.packages.filter(pkg => {
        if (pkg.isPreinstalled) return !hasGalleryAvatars;
        return true;
      }),
    })).filter(group => group.packages.length > 0);
  }, [hasGalleryAvatars]);

  const totalBytes = useMemo(() => {
    const allPkgs = visibleGroups.flatMap(g => g.packages);
    return allPkgs.filter(p => selectedIds.has(p.id)).reduce((acc, p) => acc + p.sizeBytes, 0);
  }, [selectedIds, visibleGroups]);

  const handleNext = useCallback(() => {
    const allPkgs = PACKAGE_GROUPS.flatMap(g => g.packages);
    const selected = allPkgs.filter(p => selectedIds.has(p.id));
    setSelected(selected);
    onNext();
  }, [selectedIds, setSelected, onNext]);

  const handleInstallAll = useCallback(() => {
    const allIds = new Set(visibleGroups.flatMap(g => g.packages.map(p => p.id)));
    if (gpuName) allIds.delete('python-env-cpu');
    setSelectedIds(allIds);
    const allPkgs = visibleGroups.flatMap(g => g.packages);
    const selected = allPkgs.filter(p => allIds.has(p.id));
    setSelected(selected);
    onNext();
  }, [gpuName, visibleGroups, setSelected, onNext]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto space-y-8 pb-4">
<div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-100">
            {t('setup.selectComponents')}
          </h2>
          <p className="text-gray-400 mt-1.5 text-sm">
            {t('setup.selectDesc')}
          </p>
        </div>

        {visibleGroups.map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-medium text-gray-300">{t(group.titleKey)}</h3>
              {group.required && (
                <span className="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {t('common.active')}
                </span>
              )}
              {group.exclusive && (
                <span className="text-[10px] uppercase tracking-wider text-cyan-400/70 bg-cyan-400/5 border border-cyan-400/20 px-2 py-0.5 rounded">
                  {t('setup.recommended')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {group.packages.map(pkg => {
                const isSelected = selectedIds.has(pkg.id);
                const label = pkg.name(systemInfo);
                const Icon = pkg.icon;

                return (
                  <label
                    key={pkg.id}
                    title={pkg.required ? t('setup.requiredHint') : ''}
                    className={`relative flex flex-col gap-3 px-5 py-4 rounded-xl border cursor-pointer transition-all duration-200
                      ${isSelected
                        ? 'border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_15px_-3px_rgba(0,229,255,0.15)]'
                        : 'border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-800/60'
                      }
                      ${pkg.required ? 'cursor-default' : 'cursor-pointer'}
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40
                    `}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePackage(pkg.id, group); } }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePackage(pkg.id, group)}
                      disabled={pkg.required}
                      className="sr-only"
                      aria-label={label}
                    />

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors
                          ${isSelected ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-gray-800 border-gray-700 text-gray-400'}
                        `}>
                          <Icon size={20} aria-hidden="true" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-200">{label}</div>
                          <div className="text-xs text-gray-500 font-mono tabular-nums mt-0.5">{pkg.size}</div>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200 mt-0.5
                        ${isSelected ? 'bg-cyan-400 border-cyan-400' : 'border-gray-600 bg-transparent'}
                      `}>
                        {isSelected && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#0f1115" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 leading-relaxed">
                      {pkg.description}
                    </p>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between shrink-0 mt-6 pt-5 border-t border-gray-800">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {t('setup.total')}
          <strong className="text-gray-200 font-mono tabular-nums text-base">{formatBytes(totalBytes)}</strong>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-5 py-2 rounded-xl text-sm font-medium text-gray-400 border border-gray-800 hover:bg-gray-800 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/40"
            onClick={handleInstallAll}
          >
            {t('setup.installNow')}
          </button>
          <button
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-400 text-gray-950 font-semibold text-sm hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            onClick={handleNext}
            disabled={selectedIds.size === 0}
          >
            {t('setup.nextStep')}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
