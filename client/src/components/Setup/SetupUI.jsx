import { useRef, useEffect, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import './setup-animations.css';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { SetupProvider, useSetup } from './SetupProvider.jsx';
import StepWelcome from './StepWelcome.jsx';
import StepSystemCheck from './StepSystemCheck.jsx';
import PackageSelection from './PackageSelection.jsx';
import InstallProgress from './InstallProgress.jsx';
import StepConfig from './StepConfig.jsx';
import StepComplete from './StepComplete.jsx';

const STEP_LABELS = [
  { key: 'setup.stepWelcome' },
  { key: 'setup.stepCheck' },
  { key: 'setup.stepChoose' },
  { key: 'setup.stepInstall' },
  { key: 'setup.stepConfig' },
  { key: 'setup.stepComplete' },
];

function StepIndicator({ currentStep, totalSteps, t }) {
  return (
    <nav aria-label="Setup progress" className="flex items-center justify-center py-3">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        return (
          <div key={i} className="flex items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-300 flex-shrink-0
                ${isActive ? 'bg-indigo-500 border-indigo-500 text-white shadow-[0_0_10px_-2px_rgba(99,102,241,0.4)]' : ''}
                ${isCompleted ? 'bg-green-400/10 border-green-400/60 text-green-400' : ''}
                ${!isActive && !isCompleted ? 'bg-gray-800/60 border-gray-700 text-gray-500' : ''}
              `}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${t(STEP_LABELS[i].key)}${isActive ? ' — current step' : ''}${isCompleted ? ' — completed' : ''}`}
            >
              {isCompleted ? (
                <CheckCircle size={14} aria-hidden="true" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            <span className={`ml-1.5 text-[11px] hidden sm:inline transition-colors duration-300
              ${isActive ? 'text-gray-200 font-medium' : ''}
              ${isCompleted ? 'text-gray-400' : ''}
              ${!isActive && !isCompleted ? 'text-gray-600' : ''}
            `}>
              {t(STEP_LABELS[i].key)}
            </span>
            {i < totalSteps - 1 && (
              <span className="mx-1.5 w-6 sm:w-8 block">
                <span className={`block h-[2px] rounded-full transition-colors duration-300
                  ${i < currentStep ? 'bg-green-400/40' : 'bg-gray-800'}`} />
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SetupContent({ onComplete, onSkip }) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const announcementRef = useRef(null);
  const { state: { step } } = useSetup();

  const stepTitle = useMemo(() => t(STEP_LABELS[step]?.key || ''), [step, t]);

  useEffect(() => {
    containerRef.current?.focus();
    if (announcementRef.current)
      announcementRef.current.textContent = `${stepTitle} — step ${step + 1} of ${STEP_LABELS.length}`;
  }, [step, stepTitle]);

  const renderStep = () => {
    switch (step) {
      case 0: return <StepWelcome t={t} />;
      case 1: return <StepSystemCheck t={t} />;
      case 2: return <PackageSelection t={t} />;
      case 3: return <InstallProgress t={t} />;
      case 4: return <StepConfig t={t} />;
      case 5: return <StepComplete t={t} />;
      default: return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col bg-gray-950 text-gray-100"
      style={{ overscrollBehavior: 'contain', touchAction: 'manipulation' }}
      tabIndex={-1}
    >
      <div ref={announcementRef} role="status" aria-live="polite" className="sr-only" />

      <header className="shrink-0 border-b border-gray-800/60 px-6 pt-1">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">✦</span>
            <span className="font-semibold text-gray-200 text-sm tracking-tight">Waifu</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">
            {t('setup.title')}
          </span>
        </div>
        <StepIndicator currentStep={step} totalSteps={STEP_LABELS.length} t={t} />
      </header>

      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 py-6">
        {renderStep()}
      </main>
    </div>
  );
}

export default function SetupUI({ onComplete, onSkip, systemInfo }) {
  return (
    <SetupProvider systemInfo={systemInfo} onComplete={onComplete} onSkip={onSkip}>
      <SetupContent onComplete={onComplete} onSkip={onSkip} />
    </SetupProvider>
  );
}
