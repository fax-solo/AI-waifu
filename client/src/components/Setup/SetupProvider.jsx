import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import * as api from '../../utils/api.js';

const STEPS = ['welcome', 'system-check', 'components', 'install', 'config', 'complete'];

const initialState = {
  step: 0,
  systemInfo: null,
  checks: null,
  packages: null,
  selectedEngine: 'cpu',
  selectedPackageIds: [],
  installProgress: null,
  config: { companionName: 'Aria', language: 'en', ttsEnabled: true },
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: Math.max(0, Math.min(action.value, STEPS.length - 1)) };
    case 'NEXT_STEP':
      return { ...state, step: Math.min(state.step + 1, STEPS.length - 1) };
    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 0) };
    case 'SET_CHECKS':
      return { ...state, checks: action.value };
    case 'SET_SYSTEM_INFO':
      return { ...state, systemInfo: action.value };
    case 'SET_PACKAGES':
      return { ...state, packages: action.value };
    case 'SET_ENGINE':
      return { ...state, selectedEngine: action.value };
    case 'SET_SELECTED_PACKAGES':
      return { ...state, selectedPackageIds: action.value };
    case 'SET_INSTALL_PROGRESS':
      return { ...state, installProgress: action.value };
    case 'UPDATE_INSTALL_PROGRESS':
      return { ...state, installProgress: { ...state.installProgress, ...action.value } };
    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.value } };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

const SetupContext = createContext(null);

export function SetupProvider({ children, systemInfo: initialInfo, onComplete, onSkip }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    systemInfo: initialInfo || null,
  });

  const eventSourceRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const runSystemCheck = useCallback(async () => {
    try {
      const data = await api.getSetupStatus();
      if (!mountedRef.current) return null;
      dispatch({ type: 'SET_SYSTEM_INFO', value: data });

      const results = {
        python: {
          status: data.pythonMissing ? 'fail' : 'pass',
          message: data.pythonMissing ? 'Missing' : 'Ready',
          detail: '',
        },
        gpu: {
          status: 'pass',
          message: data.gpuInfo?.hasNvidia ? data.gpuInfo.name : 'CPU',
          detail: data.gpuInfo?.hasNvidia ? 'CUDA accelerated' : 'No NVIDIA GPU',
        },
        disk: {
          status: data.diskInfo && !data.diskInfo.enough ? 'warn' : 'pass',
          message: data.diskInfo ? `${data.diskInfo.freeGB} GB` : '',
          detail: data.diskInfo?.enough ? '' : 'Low space',
        },
        os: {
          status: data.osInfo?.supported === false ? 'fail' : 'pass',
          message: data.osInfo?.label || '',
          detail: data.osInfo?.supported === false ? 'Unsupported OS' : '',
        },
        network: {
          status: data.network?.reachable === false ? 'fail' : 'pass',
          message: data.network?.reachable === false ? 'Unreachable' : 'Connected',
          detail: data.network?.reachable === false ? 'Cannot reach download servers' : '',
        },
      };
      dispatch({ type: 'SET_CHECKS', value: results });
      return results;
    } catch {
      if (!mountedRef.current) return null;
      dispatch({ type: 'SET_CHECKS', value: {
        python: { status: 'fail', message: 'Server unreachable', detail: 'Check backend on port 3005' },
        gpu: { status: 'fail', message: 'Server unreachable', detail: 'Check backend on port 3005' },
        disk: { status: 'fail', message: 'Server unreachable', detail: 'Check backend on port 3005' },
        os: { status: 'fail', message: 'Server unreachable', detail: 'Check backend on port 3005' },
        network: { status: 'fail', message: 'Server unreachable', detail: 'Check backend on port 3005' },
      }});
      return null;
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      const data = await api.getSetupPackages();
      if (!mountedRef.current) return;
      dispatch({ type: 'SET_PACKAGES', value: data });

      const hasNvidia = data.gpuInfo?.hasNvidia;
      const engine = hasNvidia ? 'gpu' : 'cpu';
      dispatch({ type: 'SET_ENGINE', value: engine });

      // Auto-select required packages
      const ids = [];
      ids.push(hasNvidia ? 'python-env-gpu' : 'python-env-cpu');
      ids.push('tts-model', 'tts-voices');
      if (data.hasGalleryAvatars === false) ids.push('gallery-avatars');
      dispatch({ type: 'SET_SELECTED_PACKAGES', value: ids });
    } catch {}
  }, []);

  const togglePackage = useCallback((id) => {
    dispatch({ type: 'SET_SELECTED_PACKAGES', value: state.selectedPackageIds.includes(id)
      ? state.selectedPackageIds.filter(p => p !== id)
      : [...state.selectedPackageIds, id]
    });
  }, [state.selectedPackageIds]);

  const initInstall = useCallback(() => {
    dispatch({ type: 'SET_INSTALL_PROGRESS', value: {
      progresses: {},
      currentIndex: 0,
      isFinished: false,
      logs: [],
      error: null,
      aborted: false,
      speed: 0,
      eta: 0,
    }});
  }, []);

  const addLog = useCallback((text, type = 'info') => {
    if (!mountedRef.current) return;
    dispatch({ type: 'UPDATE_INSTALL_PROGRESS', value: {
      logs: [...(state.installProgress?.logs || []), {
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        text, type,
      }],
    }});
  }, [state.installProgress]);

  const updateProgress = useCallback((id, data) => {
    if (!mountedRef.current) return;
    dispatch({ type: 'UPDATE_INSTALL_PROGRESS', value: {
      progresses: { ...(state.installProgress?.progresses || {}), [id]: data },
    }});
  }, [state.installProgress]);

  const startInstall = useCallback(() => {
    initInstall();
    const selected = state.selectedPackageIds;

    api.startSetup(selected, state.selectedEngine).then(({ sessionId }) => {
      const url = api.getSetupStreamUrl(sessionId, selected);
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('log', (e) => {
        try {
          const data = JSON.parse(e.data);
          addLog(data.text, data.type);
        } catch {}
      });

      eventSource.addEventListener('progress', (e) => {
        try {
          const data = JSON.parse(e.data);
          updateProgress(data.id, { progress: data.progress, speed: data.speed, eta: data.eta });
        } catch {}
      });

      eventSource.addEventListener('done', () => {
        addLog('All packages installed successfully.', 'success');
        dispatch({ type: 'UPDATE_INSTALL_PROGRESS', value: { isFinished: true } });
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener('error', (e) => {
        let msg = 'Connection lost or stream ended unexpectedly.';
        if (e.data) { try { msg = JSON.parse(e.data).text; } catch { msg = e.data; } }
        addLog(msg, 'error');
        dispatch({ type: 'UPDATE_INSTALL_PROGRESS', value: { error: msg } });
        eventSource.close();
        eventSourceRef.current = null;
      });
    }).catch((err) => {
      addLog(`Failed to start installation: ${err.message}`, 'error');
      dispatch({ type: 'UPDATE_INSTALL_PROGRESS', value: { error: err.message } });
    });
  }, [state.selectedPackageIds, state.selectedEngine, initInstall, addLog, updateProgress]);

  const retryInstall = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    startInstall();
  }, [startInstall]);

  const abortInstall = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (mountedRef.current) {
      api.cancelSetup(null, true).catch(() => {});
      dispatch({ type: 'SET_INSTALL_PROGRESS', value: null });
    }
  }, []);

  const updateConfig = useCallback((key, value) => {
    dispatch({ type: 'SET_CONFIG', value: { [key]: value } });
  }, []);

  const completeSetup = useCallback(async () => {
    try {
      await api.completeSetup(state.config);
      await onComplete?.();
    } catch {
      await onComplete?.();
    }
  }, [state.config, onComplete]);

  const skipSetup = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  const canProceedFromCheck = state.checks && !Object.values(state.checks).some(c => c.status === 'fail');

  const value = {
    state,
    dispatch,
    stepName: STEPS[state.step],
    totalSteps: STEPS.length,
    nextStep: () => dispatch({ type: 'NEXT_STEP' }),
    prevStep: () => dispatch({ type: 'PREV_STEP' }),
    setStep: (s) => dispatch({ type: 'SET_STEP', value: s }),
    canGoNext: state.step < STEPS.length - 1,
    canGoPrev: state.step > 0,
    isFirstStep: state.step === 0,
    isLastStep: state.step === STEPS.length - 1,
    runSystemCheck,
    loadPackages,
    canProceedFromCheck,
    togglePackage,
    startInstall,
    retryInstall,
    abortInstall,
    updateConfig,
    completeSetup,
    skipSetup,
  };

  return (
    <SetupContext.Provider value={value}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup() {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error('useSetup must be used within SetupProvider');
  return ctx;
}
