import { useState, useCallback, useRef } from 'react';

const TTS_URL = '/api/tts';

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|(?<=[。！？])\s*|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const playbackActiveRef = useRef(false);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodesRef = useRef(new Map());

  const initAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    for (const [el, source] of sourceNodesRef.current.entries()) {
      try { source.disconnect(); } catch {}
      el.pause();
      el.src = '';
    }
    sourceNodesRef.current.clear();
    playbackActiveRef.current = false;
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text, options = {}) => {
    const {
      enabled = true,
      voice = 'default',
      speed = 1.0,
      pitch = 1.0,
      volume = 1.0,
      outputDeviceId = 'default',
      device = 'cpu',
      emotion = 'neutral',
      intensity = 0.5,
      maxChars = 500,
    } = options;

    if (!enabled || !text || text.trim().length === 0) return;
    if (text.length > maxChars) return;

    initAudioCtx();
    stop();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    playbackActiveRef.current = true;

    const sentences = splitSentences(text);
    if (sentences.length === 0) return;

    const timeoutMs = 30000;

    const fetchPromises = sentences.map((sentence, idx) => {
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, voice, speed, pitch, volume, device, emotion, intensity }),
        signal: controller.signal,
      })
        .finally(() => clearTimeout(timeoutId))
        .then(async (res) => {
          if (!res.ok) return null;
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.crossOrigin = "anonymous";
          audio.preload = 'auto';
          audio.muted = false;
          if (outputDeviceId !== 'default' && audio.setSinkId) {
            audio.setSinkId(outputDeviceId).catch(() => {});
          }
          if (audioCtxRef.current && analyserRef.current) {
            const source = audioCtxRef.current.createMediaElementSource(audio);
            source.connect(analyserRef.current);
            sourceNodesRef.current.set(audio, source);
          }
          return { url, audio, order: idx };
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error(`[TTS] Fetch failed for sentence ${idx}:`, err);
          }
          return null;
        });
    });

    setIsPlaying(true);

    for (let i = 0; i < fetchPromises.length; i++) {
      if (!playbackActiveRef.current) break;

      const result = await fetchPromises[i];
      if (!result || !playbackActiveRef.current) continue;

      const { url, audio } = result;

      await new Promise((resolve) => {
        currentAudioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          currentAudioRef.current = null;
          resolve();
        };
        audio.play().catch(resolve);
      });
    }

    if (playbackActiveRef.current) {
      playbackActiveRef.current = false;
      setIsPlaying(false);
    }
  }, [stop, initAudioCtx]);

  return {
    speak,
    stop,
    isPlaying,
    analyser: analyserRef.current
  };
}
