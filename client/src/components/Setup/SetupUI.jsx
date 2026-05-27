import { useEffect, useRef, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import './setup-animations.css';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import useSetup from './useSetup.js';
import StepSystemCheck from './StepSystemCheck.jsx';
import PackageSelection from './PackageSelection.jsx';
import InstallProgress from './InstallProgress.jsx';
import StepQuickConfig from './StepQuickConfig.jsx';

const STEP_LABELS = [
  { key: 'setup.stepCheck' },
  { key: 'setup.stepChoose' },
  { key: 'setup.stepInstall' },
  { key: 'setup.stepConfig' },
];

function StepIndicator({ currentStep, totalSteps, t }) {
  return (
    <nav aria-label="Setup progress" className="flex items-center justify-center gap-0 py-4">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-300
                  ${isActive ? 'bg-cyan-400 border-cyan-400 text-gray-950 shadow-[0_0_10px_-2px_rgba(0,229,255,0.4)]' : ''}
                  ${isCompleted ? 'bg-green-400/10 border-green-400/60 text-green-400' : ''}
                  ${!isActive && !isCompleted ? 'bg-gray-800/60 border-gray-700 text-gray-500' : ''}
                `}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`${t(STEP_LABELS[i].key)}${isActive ? ' — current step' : ''}${isCompleted ? ' — completed' : ''}`}
              >
                {isCompleted ? (
                  <CheckCircle size={16} aria-hidden="true" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className={`text-xs hidden sm:inline transition-colors duration-300
                ${isActive ? 'text-gray-200 font-medium' : ''}
                ${isCompleted ? 'text-gray-400' : ''}
                ${!isActive && !isCompleted ? 'text-gray-600' : ''}
              `}>
                {t(STEP_LABELS[i].key)}
              </span>
            </div>
            {i < totalSteps - 1 && (
              <div className={`w-8 sm:w-12 h-px mx-1 sm:mx-2 transition-colors duration-300
                ${i < currentStep ? 'bg-green-400/40' : 'bg-gray-800'}
              `} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function SetupUI({ onComplete, onSkip, systemInfo }) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const announcementRef = useRef(null);

  const {
    currentStep, totalSteps, nextStep,
    checks, runSystemCheck, canProceedFromCheck,
    selectedPackages, setSelected,
    installProgress, startInstall, abortInstall, retryInstall,
    config, updateConfig, skipSetup, complete,
  } = useSetup({ onComplete, onSkip, systemInfo });

  const stepTitle = useMemo(() => t(STEP_LABELS[currentStep]?.key || ''), [currentStep, t]);

  useEffect(() => {
    containerRef.current?.focus();
    if (announcementRef.current) {
      announcementRef.current.textContent = `${stepTitle} — step ${currentStep + 1} of ${totalSteps}`;
    }
  }, [currentStep, stepTitle, totalSteps]);

  const handleInstallNext = () => nextStep();
  const handleConfigureSkip = () => skipSetup();

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepSystemCheck
            checks={checks}
            runSystemCheck={runSystemCheck}
            onNext={() => {
              if (canProceedFromCheck(checks)) nextStep();
            }}
          />
        );
      case 1:
        return (
          <PackageSelection
            systemInfo={systemInfo}
            selectedPackages={selectedPackages}
            setSelected={setSelected}
            onNext={nextStep}
          />
        );
      case 2:
        return (
          <InstallProgress
            packages={selectedPackages}
            installProgress={installProgress}
            startInstall={startInstall}
            abortInstall={abortInstall}
            retryInstall={retryInstall}
            onNext={handleInstallNext}
          />
        );
      case 3:
        return (
          <StepQuickConfig
            config={config}
            updateConfig={updateConfig}
            onComplete={complete}
            onSkip={handleConfigureSkip}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col bg-gray-950 text-gray-100"
      style={{
        overscrollBehavior: 'contain',
        touchAction: 'manipulation',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
      tabIndex={-1}
    >
      <div ref={announcementRef} role="status" aria-live="polite" className="sr-only" />

      <header className="shrink-0 border-b border-gray-800/60 px-12">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">✦</span>
            <span className="font-semibold text-gray-200 text-sm tracking-tight">Waifu</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">
            {t('setup.title')}
          </span>
        </div>
        <StepIndicator currentStep={currentStep} totalSteps={totalSteps} t={t} />
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto px-12 py-10">
        {renderStep()}
      </main>
    </div>
  );
}
