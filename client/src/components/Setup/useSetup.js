import { useState, useRef, useCallback, useEffect } from 'react';
import * as api from '../../utils/api.js';

const API_BASE = window.location.protocol === 'file:'
  ? 'http://127.0.0.1:3005/api'
  : '/api';

const STEPS = ['system-check', 'components', 'install', 'config'];

async function fetchWithTimeout(endpoint, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': api.getUserId(),
      },
    });
    if (!response.ok) {
      const err = new Error(`Request failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export default function useSetup({ onComplete, onSkip, systemInfo: initialSystemInfo }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [systemInfo, setSystemInfo] = useState(initialSystemInfo);
  const [checks, setChecks] = useState(null);
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [installProgress, setInstallProgress] = useState(null);
  const [config, setConfig] = useState({
    companionName: 'Aria',
    language: 'en',
    ttsVoice: 'default',
    ttsEnabled: true,
  });
  const eventSourceRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const runSystemCheck = useCallback(async () => {
    try {
      const data = await fetchWithTimeout('/setup/status');
      if (!mountedRef.current) return null;
      setSystemInfo(data);

      const disk = data.diskInfo;
      const osInfo = data.osInfo;
      const results = {
        python: {
          status: data.venvMissing ? 'fail' : 'pass',
          message: data.venvMissing ? 'Missing' : 'Ready',
          detail: !data.venvMissing ? '' : '',
        },
        gpu: {
          status: 'pass',
          message: data.gpuInfo?.name || 'CPU',
          detail: data.gpuInfo?.hasNvidia ? 'CUDA' : 'No NVIDIA GPU — using CPU (slower)',
        },
        disk: {
          status: disk && !disk.enough ? 'warn' : 'pass',
          message: disk ? `${disk.freeGB} GB` : '',
          detail: disk?.enough ? '' : 'Low space',
        },
        os: {
          status: osInfo?.supported === false ? 'fail' : 'pass',
          message: osInfo?.label || '',
          detail: osInfo?.supported === false ? 'Unsupported' : '',
        },
      };
      setChecks(results);
      return results;
    } catch {
      if (!mountedRef.current) return null;
      const results = {
        python: { status: 'fail', message: 'Server unreachable', detail: 'Check that the backend is running on port 3005' },
        gpu: { status: 'fail', message: 'Server unreachable', detail: 'Check that the backend is running on port 3005' },
        disk: { status: 'fail', message: 'Server unreachable', detail: 'Check that the backend is running on port 3005' },
        os: { status: 'fail', message: 'Server unreachable', detail: 'Check that the backend is running on port 3005' },
      };
      setChecks(results);
      return results;
    }
  }, []);

  const canProceedFromCheck = useCallback((checkResults) => {
    if (!checkResults) return false;
    return !Object.values(checkResults).some(c => c.status === 'fail');
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const setSelected = useCallback((packages) => {
    setSelectedPackages(packages);
  }, []);

  const addLog = useCallback((text, type = 'info') => {
    if (!mountedRef.current) return;
    setInstallProgress(prev => {
      if (!prev) return prev;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      return { ...prev, logs: [...prev.logs, { time: timestamp, text, type }] };
    });
  }, []);

  const updateProgress = useCallback((id, progress) => {
    if (!mountedRef.current) return;
    setInstallProgress(prev => {
      if (!prev) return prev;
      const progresses = { ...prev.progresses, [id]: progress };
      const pkgIndex = selectedPackages.findIndex(p => p.id === id);
      const currentIndex = pkgIndex > prev.currentIndex ? pkgIndex : prev.currentIndex;
      return { ...prev, progresses, currentIndex };
    });
  }, [selectedPackages]);

  const finishInstall = useCallback(() => {
    if (!mountedRef.current) return;
    setInstallProgress(prev => prev ? { ...prev, isFinished: true } : prev);
  }, []);

  const setInstallError = useCallback((error) => {
    if (!mountedRef.current) return;
    setInstallProgress(prev => prev ? { ...prev, error } : prev);
  }, []);

  const initInstall = useCallback(() => {
    setInstallProgress({
      progresses: {},
      currentIndex: 0,
      isFinished: false,
      logs: [],
      error: null,
    });
  }, []);

  const abortInstall = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (mountedRef.current) {
      setInstallProgress(prev => prev ? { ...prev, isFinished: true, aborted: true } : prev);
    }
  }, []);

  const startInstall = useCallback(() => {
    initInstall();

    const ids = selectedPackages.map(p => p.id).join(',');
    const eventSource = new EventSource(`${API_BASE}/setup/stream?packages=${ids}`);
    eventSourceRef.current = eventSource;

    let lastProgress = Date.now();
    const stallTimer = setInterval(() => {
      if (!mountedRef.current || !eventSourceRef.current) {
        clearInterval(stallTimer);
        return;
      }
      if (Date.now() - lastProgress > 30000) {
        const msg = 'Installation stalled — no progress for 30s';
        addLog(msg, 'error');
        setInstallError(msg);
        eventSource.close();
        eventSourceRef.current = null;
        clearInterval(stallTimer);
      }
    }, 5000);

    eventSource.addEventListener('log', (e) => {
      try { addLog(JSON.parse(e.data).text, JSON.parse(e.data).type); }
      catch {}
    });

    eventSource.addEventListener('progress', (e) => {
      lastProgress = Date.now();
      try {
        const data = JSON.parse(e.data);
        updateProgress(data.id, data.progress);
      } catch {}
    });

    eventSource.addEventListener('done', (e) => {
      clearInterval(stallTimer);
      try {
        const data = JSON.parse(e.data);
        addLog(data.text, 'success');
      } catch {}
      finishInstall();
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.addEventListener('error', (e) => {
      clearInterval(stallTimer);
      let msg = 'Connection lost or stream ended unexpectedly.';
      if (e.data) {
        try { msg = JSON.parse(e.data).text; } catch { msg = e.data; }
      }
      addLog(msg, 'error');
      setInstallError(msg);
      eventSource.close();
      eventSourceRef.current = null;
    });
  }, [selectedPackages, initInstall, addLog, updateProgress, finishInstall, setInstallError]);

  const retryInstall = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    startInstall();
  }, [startInstall]);

  const updateConfig = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const skipSetup = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  const complete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  return {
    currentStep,
    totalSteps: STEPS.length,
    nextStep,
    prevStep,
    canGoNext: currentStep < STEPS.length - 1,
    canGoPrev: currentStep > 0,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === STEPS.length - 1,
    stepName: STEPS[currentStep],

    systemInfo,
    checks,
    runSystemCheck,
    canProceedFromCheck,

    selectedPackages,
    setSelected,

    installProgress,
    startInstall,
    abortInstall,
    retryInstall,

    config,
    updateConfig,
    skipSetup,
    complete,
  };
}
