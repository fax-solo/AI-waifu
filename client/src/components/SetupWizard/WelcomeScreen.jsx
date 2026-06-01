import { useState } from 'react';
import WelcomeStep from './WelcomeStep.jsx';
import CheckingStep from './CheckingStep.jsx';
import DownloadStep from './DownloadStep.jsx';
import ResultsStep from './ResultsStep.jsx';
import './setup-animations.css';

const STEPS = ['Welcome', 'Checking', 'Download', 'Results'];

const STEP_COMPONENTS = [WelcomeStep, CheckingStep, DownloadStep, ResultsStep];

const BACKEND_MAP = {
  'python-env-gpu': 'cuda',
  'python-env-rocm': 'vulkan',
  'python-env-cpu': 'cpu',
};

export default function WelcomeScreen({ onSkip, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [backend, setBackend] = useState('cuda');
  const [checkResults, setCheckResults] = useState(null);

  function goNext(data) {
    if (data?.recommendedEnv && BACKEND_MAP[data.recommendedEnv]) {
      setBackend(BACKEND_MAP[data.recommendedEnv]);
    }
    if (data?.checks) {
      setCheckResults(data.checks);
    }
    if (data?.backend) setBackend(data.backend);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(c => c + 1);
    }
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="relative h-screen w-full bg-[#080c18] text-white flex flex-col overflow-hidden font-sans select-none before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(ellipse_1000px_600px_at_50%_200px,rgba(6,182,212,0.08),transparent_70%)]">
      <header className="relative z-10 w-full flex items-center justify-between px-12 py-6 border-b border-white/[0.06] bg-[#0a0e1a]/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl w-10 h-10 flex items-center justify-center text-white text-xl leading-none">
            ✦
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Waifu</span>
        </div>
        <div className="flex items-center gap-3">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                i <= currentStep ? 'bg-cyan-400/70' : 'bg-white/[0.2]'
              }`}
            />
          ))}
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 w-full flex flex-col overflow-y-auto">
        <div className="shrink-0 px-12 pt-8 pb-4">
          <div className="relative flex items-center justify-between w-full">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] bg-white/[0.06]" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
            {STEPS.map((label, i) => {
              const isActive = i === currentStep;
              const isCompleted = i < currentStep;
              return (
                <div key={i} className="flex flex-col items-center gap-2 relative z-10">
                  <div
                    className={`rounded-full transition-all duration-500 ${
                      isActive
                        ? 'w-3.5 h-3.5 bg-cyan-400 ring-4 ring-cyan-400/20'
                        : isCompleted
                          ? 'w-3 h-3 bg-cyan-400/50'
                          : 'w-3 h-3 bg-white/[0.2]'
                    }`}
                    aria-current={isActive ? 'step' : undefined}
                  />
                  <span className={`text-xs uppercase tracking-widest font-semibold transition-colors duration-300 ${
                    isActive ? 'text-cyan-300' : 'text-white/[0.55]'
                  }`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <StepComponent
          onNext={goNext}
          onSkip={onSkip}
          onComplete={onComplete}
          backend={backend}
        />
      </main>
    </div>
  );
}
