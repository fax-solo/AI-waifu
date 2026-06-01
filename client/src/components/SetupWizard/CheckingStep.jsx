import { useState, useEffect, useRef } from 'react';
import { runSetupCheck } from '../../utils/api.js';

const CHECKS = [
  { key: 'gpu', label: 'GPU Acceleration', icon: 'gpu' },
  { key: 'python', label: 'Python Environment', icon: 'python' },
  { key: 'tts', label: 'TTS Models', icon: 'tts' },
];

function CheckIcon({ name }) {
  if (name === 'gpu') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function statusText(check) {
  if (!check) return 'Waiting...';
  if (check.status === 'ok') return 'Ready';
  if (check.status === 'partial') return `${check.found?.length || 0} of ${(check.found?.length || 0) + (check.missing?.length || 0)}`;
  return 'Not detected';
}

export default function CheckingStep({ onNext, onSkip }) {
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState([]);
  const revealedRef = useRef([]);

  const checkDataRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    runSetupCheck()
      .then(data => {
        if (!cancelled) {
          setResults(data.checks);
          checkDataRef.current = data;
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  function handleContinue() {
    const data = checkDataRef.current || {};
    onNext({ checks: data.checks, recommendedEnv: data.recommendedEnv });
  }

  const allDone = results || error;

  useEffect(() => {
    if (!results) return;
    const keys = Object.keys(results);
    keys.forEach((key, i) => {
      setTimeout(() => {
        if (!revealedRef.current.includes(key)) {
          revealedRef.current = [...revealedRef.current, key];
          setRevealed([...revealedRef.current]);
        }
      }, 500 + i * 600);
    });
  }, [results]);

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-12 animate-hero px-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-white" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <h2 className="text-5xl font-extrabold tracking-tight">Checking Your System</h2>
      <p className="text-base text-white/40 -mt-8">Verifying GPU, Python, and TTS models.</p>

      <div className="w-full max-w-lg flex flex-col gap-4">
        {CHECKS.map((check) => {
          const checkResult = results?.[check.key];
          const isRevealed = revealed.includes(check.key);
          const isLoading = !results && !error;

          return (
            <div
              key={check.key}
              className={`bg-white/[0.03] border border-white/[0.06] rounded-xl px-6 py-5 flex items-center justify-between transition-all duration-500 ${
                isRevealed ? 'opacity-100' : isLoading ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isRevealed && checkResult?.status === 'ok'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : isRevealed && checkResult?.status === 'partial'
                      ? 'bg-amber-500/10 text-amber-400'
                      : isRevealed
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-white/[0.04] text-white/30'
                }`}>
                  <CheckIcon name={check.icon} />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">{check.label}</div>
                  <div className="text-sm text-white/30 mt-1">
                    {isRevealed && checkResult
                      ? statusText(checkResult)
                      : isLoading
                        ? 'Scanning...'
                        : 'Pending'}
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
                ) : !isRevealed ? (
                  <div className="w-5 h-5 rounded-full bg-white/[0.06]" />
                ) : checkResult?.status === 'ok' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : checkResult?.status === 'partial' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-400">
                    <line x1="12" y1="5" x2="12" y2="12" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-400">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-red-400/60 -mt-4">Connection error — results unavailable</p>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleContinue}
          disabled={!allDone}
          className="inline-flex items-center justify-center gap-2 font-medium text-sm"
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
            color: 'white',
            border: 'none',
            cursor: allDone ? 'pointer' : 'not-allowed',
            opacity: allDone ? 1 : 0.35,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { if (allDone) e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'; }}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
        >
          <span>{allDone ? 'Continue' : 'Checking...'}</span>
          {allDone && <span>→</span>}
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
