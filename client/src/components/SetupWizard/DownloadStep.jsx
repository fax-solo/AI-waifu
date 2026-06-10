import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const ALL_FILE_LABELS = {
  'kokoro_model': 'Kokoro ONNX Model',
  'kokoro_voices': 'Kokoro Voices',
};

const BACKENDS = [
  { id: 'cpu', label: 'CPU', desc: 'Universal — works on all systems' },
  { id: 'cuda', label: 'NVIDIA GPU (CUDA)', desc: 'Fastest on NVIDIA GPUs' },
  { id: 'vulkan', label: 'AMD GPU (ROCm)', desc: 'Optimized for AMD GPUs with ROCm' },
];

const ENGINES = [
  { id: 'kokoro', label: 'Kokoro ONNX', desc: 'Lightweight, 54 built-in voices (368 MB model files)' },
];

function logTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function getFileState(state) {
  if (!state) return { status: 'verifying', percent: 0 };
  if (typeof state === 'string') return { status: state, percent: 0 };
  return state;
}

export default function DownloadStep({ onNext, onSkip, backend: initialBackend }) {
  const [started, setStarted] = useState(false);
  const [fileStates, setFileStates] = useState({});
  const [allComplete, setAllComplete] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [connected, setConnected] = useState(true);
  const [logs, setLogs] = useState([]);
  const [backend, setBackend] = useState(initialBackend || 'cuda');
  const receivedComplete = useRef(false);
  const eventSourceRef = useRef(null);
  const logEndRef = useRef(null);

  const modelFiles = useMemo(() => {
    return [
      { key: 'kokoro_model', label: 'Kokoro ONNX Model', size: '325 MB' },
      { key: 'kokoro_voices', label: 'Kokoro Voices', size: '41 MB' },
    ];
  }, []);

  const files = useMemo(() => {
    const backendLabel = BACKENDS.find(b => b.id === backend)?.label || backend;
    return [
      ...modelFiles,
      { key: 'backend_package', label: `${backendLabel} Runtime`, size: '' },
    ];
  }, [modelFiles, backend]);

  function addLog(message) {
    setLogs(prev => [...prev, { time: logTime(), message }]);
  }

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const connect = useCallback((backendParam) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setAllComplete(false);
    receivedComplete.current = false;
    setConnected(true);

    const es = new EventSource('/api/setup/download?engine=kokoro');
    eventSourceRef.current = es;

    es.addEventListener('verify', (e) => {
      const { key, exists } = JSON.parse(e.data);
      if (exists) {
        setFileStates(prev => ({ ...prev, [key]: 'verified' }));
      } else {
        setFileStates(prev => ({ ...prev, [key]: 'missing' }));
      }
    });

    es.addEventListener('start', (e) => {
      const { key, size } = JSON.parse(e.data);
      setFileStates(prev => ({ ...prev, [key]: { status: 'downloading', percent: 0 } }));
      const label = ALL_FILE_LABELS[key] || key;
      addLog(`Downloading ${label}...`);
    });

    es.addEventListener('progress', (e) => {
      const { key, percent: rawPct } = JSON.parse(e.data);
      const percent = Math.min(rawPct, 100);
      setFileStates(prev => {
        const cur = prev[key];
        if (typeof cur === 'object' && cur.status === 'downloading') {
          return { ...prev, [key]: { ...cur, percent } };
        }
        return prev;
      });
    });

    es.addEventListener('done', (e) => {
      const { key, elapsed, size } = JSON.parse(e.data);
      setFileStates(prev => ({ ...prev, [key]: 'done' }));
      const label = ALL_FILE_LABELS[key] || key;
      addLog(`${label} done (${elapsed}s)`);
    });

    es.addEventListener('skip', (e) => {
      const { key } = JSON.parse(e.data);
      setFileStates(prev => ({ ...prev, [key]: 'verified' }));
    });

    es.addEventListener('retry', (e) => {
      const { key, attempt, maxRetries, reason } = JSON.parse(e.data);
      const label = ALL_FILE_LABELS[key] || key;
      addLog(`${label} stalled, retry ${attempt}/${maxRetries}`);
    });

    es.addEventListener('error', (e) => {
      const { key, error } = JSON.parse(e.data);
      setFileStates(prev => ({ ...prev, [key]: 'error' }));
      setHasFailed(true);
      addLog(`${ALL_FILE_LABELS[key] || key} failed: ${error}`);
    });

    es.addEventListener('complete', (e) => {
      const { downloaded, skipped, failed } = JSON.parse(e.data);
      receivedComplete.current = true;
      setAllComplete(true);
      const parts = [];
      if (downloaded?.length) parts.push(`${downloaded.length} downloaded`);
      if (skipped?.length) parts.push(`${skipped.length} verified`);
      if (failed?.length) parts.push(`${failed.length} failed`);
      addLog(`Done — ${parts.join(', ')}`);
    });

    es.onerror = () => {
      es.close();
      if (receivedComplete.current) return;
      setConnected(false);
      setHasFailed(true);
      addLog('Connection lost');
    };

    return es;
  }, []);

  function handleStart() {
    const backendLabel = BACKENDS.find(b => b.id === backend)?.label;
    addLog(`Backend: ${backendLabel}`);
    setFileStates({ backend_package: 'verified' });
    setStarted(true);
    connect(backend);
  }

  useEffect(() => {
    if (!started) return;
    const es = eventSourceRef.current;
    return () => { if (es) es.close(); };
  }, [started]);

  function retryFailed() {
    setFileStates({ backend_package: 'verified' });
    setHasFailed(false);
    addLog('Retrying...');
    connect(backend);
  }

  function handleContinue() {
    onNext({ backend });
  }

  const totalFiles = files.length;
  const doneCount = files.filter(f => {
    const s = getFileState(fileStates[f.key]);
    return s.status === 'done' || s.status === 'verified';
  }).length;

  const overallPercent = Math.min(100, Math.round(
    files.reduce((sum, f) => {
      const s = getFileState(fileStates[f.key]);
      if (s.status === 'done' || s.status === 'verified') return sum + 100;
      if (s.status === 'downloading') return sum + s.percent;
      if (s.status === 'missing' || s.status === 'verifying') return sum + 0;
      return sum;
    }, 0) / totalFiles
  ));

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-8 animate-hero px-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/20">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-white" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <h2 className="text-5xl font-extrabold tracking-tight">Downloading Resources</h2>
      <p className="text-base text-white/40 -mt-6">Downloading necessary model files for your hardware.</p>

      {/* Backend selector — shown before downloads start */}
      {!started && (
        <div className="w-full max-w-lg flex flex-col gap-6">
          <div>
          <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-3">Select your hardware</p>
          <div className="flex flex-col gap-2">
            {BACKENDS.map(b => (
              <button
                key={b.id}
                onClick={() => setBackend(b.id)}
                className="flex items-center gap-4 px-5 py-4 rounded-xl text-left transition-all duration-200"
                style={{
                  background: backend === b.id
                    ? 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(37,99,235,0.08))'
                    : 'rgba(255,255,255,0.03)',
                  border: backend === b.id
                    ? '1px solid rgba(6,182,212,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                  style={{
                    border: backend === b.id
                      ? '5px solid #06b6d4'
                      : '1.5px solid rgba(255,255,255,0.2)',
                  }}
                />
                <div>
                  <div className="text-sm font-semibold text-white">{b.label}</div>
                  <div className="text-xs text-white/40 mt-0.5">{b.desc}</div>
                </div>
              </button>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* Everything below only appears after starting */}
      {started && (
        <>
          {/* Overall progress bar */}
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-white/50">{doneCount} of {totalFiles} files</span>
              <span className="text-sm text-white/50">{overallPercent}%</span>
            </div>
            <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>

          {/* File list */}
          <div className="w-full max-w-lg flex flex-col gap-3">
            {files.map((file) => {
              const s = getFileState(fileStates[file.key]);
              const showPercent = s.status === 'downloading' && s.percent > 0;
              return (
                <div
                  key={file.key}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  s.status === 'done' || s.status === 'verified'
                    ? 'bg-emerald-500/10'
                    : s.status === 'error'
                      ? 'bg-red-500/10'
                      : s.status === 'downloading'
                        ? 'bg-cyan-500/10'
                        : 'bg-white/[0.04]'
                }`}>
                  {s.status === 'done' || s.status === 'verified' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : s.status === 'error' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-400">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : s.status === 'downloading' || s.status === 'verifying' || s.status === 'missing' ? (
                    <div className="w-4 h-4 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-white/[0.08]" />
                  )}
                </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{file.label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{file.size}</div>
                    </div>
                  </div>

                  {showPercent && (
                    <div className="w-24 ml-3">
                      <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${s.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

              <span className={`text-xs font-medium shrink-0 ml-3 ${
                s.status === 'done' ? 'text-emerald-400/60' :
                s.status === 'verified' ? 'text-emerald-400/60' :
                s.status === 'error' ? 'text-red-400/60' :
                s.status === 'downloading' && showPercent ? 'text-cyan-400/60' :
                s.status === 'downloading' ? 'text-cyan-400/60' :
                'text-white/30'
              }`}>
                {s.status === 'done' ? 'Complete' :
                 s.status === 'verified' ? 'Verified' :
                 s.status === 'error' ? 'Failed' :
                 s.status === 'downloading' && showPercent ? `${s.percent}%` :
                 s.status === 'downloading' ? '0%' :
                 s.status === 'missing' ? 'Needs download' :
                 'Verifying...'}
              </span>
                </div>
              );
            })}
          </div>

          {/* Log */}
          <div className="w-full max-w-lg rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-24 overflow-y-auto px-4 py-2.5 font-mono text-[12px] leading-relaxed">
              {logs.length === 0 && (
                <span className="text-white/20">Waiting...</span>
              )}
              {logs.map((log, i) => {
                let color = 'text-cyan-300/80';
                if (log.message.includes('failed') || log.message.includes('lost')) color = 'text-red-400/80';
                else if (log.message.includes('done') || log.message.includes('Done')) color = 'text-emerald-400/80';
                else if (log.message.includes('stalled') || log.message.includes('retry')) color = 'text-amber-400/80';
                return (
                  <div key={i} className={color}>
                    <span className="text-white/20">[{log.time}]</span> {log.message}
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

          {hasFailed && !allComplete && (
            <p className="text-sm text-red-400/60 -mt-4">Some files failed to download. You can retry or skip.</p>
          )}

          <div className="flex flex-col items-center gap-3">
            {hasFailed && !allComplete ? (
              <button
                onClick={retryFailed}
                className="inline-flex items-center justify-center gap-2 font-medium text-sm"
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                <span>Retry Failed</span>
              </button>
            ) : (
              <button
                onClick={handleContinue}
                disabled={!allComplete}
                className="inline-flex items-center justify-center gap-2 font-medium text-sm"
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                  color: 'white',
                  border: 'none',
                  cursor: allComplete ? 'pointer' : 'not-allowed',
                  opacity: allComplete ? 1 : 0.35,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { if (allComplete) e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'; }}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <span>{allComplete ? 'Continue' : 'Downloading...'}</span>
                {allComplete && <span>→</span>}
              </button>
            )}
            <button
              onClick={onSkip}
              className="text-white/30 hover:text-white/70 font-medium transition-colors duration-200 text-sm"
            >
              Skip Setup
            </button>
          </div>
        </>
      )}

      {/* "Start Download" button — shown before downloads begin */}
      {!started && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleStart}
            className="inline-flex items-center justify-center gap-2 font-medium text-sm"
            style={{
              padding: '8px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.2)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Start Download</span>
          </button>
          <button
            onClick={onSkip}
            className="text-white/30 hover:text-white/70 font-medium transition-colors duration-200 text-sm"
          >
            Skip Setup
          </button>
        </div>
      )}
    </div>
  );
}
