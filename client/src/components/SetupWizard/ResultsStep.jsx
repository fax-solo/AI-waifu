import { useState } from 'react';
import { completeSetup } from '../../utils/api.js';

const SUMMARY_ITEMS = [
  { icon: 'gpu', label: 'GPU', detail: 'Hardware acceleration' },
  { icon: 'python', label: 'Python', detail: 'Environment ready' },
  { icon: 'tts', label: 'TTS Models', detail: 'Voice synthesis' },
];

function SummaryIcon({ name }) {
  if (name === 'gpu') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="9" cy="12" r="3" />
        <path d="M15 9h4" />
        <path d="M15 12h2" />
        <path d="M15 15h3" />
      </svg>
    );
  }
  if (name === 'python') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export default function ResultsStep({ onComplete, onSkip, backend }) {
  const [completing, setCompleting] = useState(false);

  async function handleFinish() {
    setCompleting(true);
    try {
      await completeSetup({ backend });
      onComplete();
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-12 animate-hero px-12">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-10 h-10 text-white" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="text-5xl font-extrabold tracking-tight">All Done!</h2>
      <p className="text-base text-white/40 -mt-8 max-w-md text-center leading-relaxed">
        Everything looks good. Waifu is ready to go.
      </p>

      <div className="w-full max-w-md bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
        <div className="flex flex-col gap-4">
          {SUMMARY_ITEMS.map(item => (
            <div key={item.label} className="flex items-center gap-3 text-base">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <SummaryIcon name={item.icon} />
              </span>
              <span className="text-white font-semibold">{item.label}</span>
              <span className="text-white/30 ml-auto">{item.detail}</span>
            </div>
          ))}
          {backend && (
            <div className="flex items-center gap-3 text-base pt-3 border-t border-white/[0.06]">
              <span className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 1v3" /><path d="M15 1v3" />
                  <path d="M9 20v3" /><path d="M15 20v3" />
                  <path d="M20 9h3" /><path d="M20 14h3" />
                  <path d="M1 9h3" /><path d="M1 14h3" />
                </svg>
              </span>
              <span className="text-white font-semibold">Backend</span>
              <span className="text-white/30 ml-auto capitalize">{backend}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleFinish}
          disabled={completing}
          className="inline-flex items-center justify-center gap-2 font-medium text-sm"
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
            color: 'white',
            border: 'none',
            cursor: completing ? 'not-allowed' : 'pointer',
            opacity: completing ? 0.35 : 1,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (!completing) e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'; }}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
        >
          {completing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Finish Setup</span>
              <span>→</span>
            </>
          )}
        </button>
        <button
          onClick={onSkip}
          className="text-white/30 hover:text-white/70 font-medium transition-colors duration-200 text-sm"
        >
          Skip Setup
        </button>
      </div>
    </div>
  );
}
