/**
 * useTTS Hook
 *
 * Handles generating and playing speech audio from text.
 * Connects to the local Python TTS sidecar.
 * 
 * Strategy: Fire ALL sentence TTS requests in parallel immediately,
 * then play them back in order as they resolve. This eliminates the
 * sequential wait (8s x N sentences) and instead only waits for the
 * first sentence before playback starts.
 */

import { useState, useCallback, useRef } from 'react';

const TTS_URL = '/api/tts';

/** Split text into speakable sentences */
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
  
  // ─── Audio Analysis Setup ─────────────────────────────────────
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodesRef = useRef(new Map()); // Map of Audio elements to their source nodes

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
    // Signal all ongoing fetches to abort
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Stop currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
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
      alpha = 0.3,
      beta = 0.7,
      diffusionSteps = 5,
      embeddingScale = 1.0,
    } = options;

    if (!enabled || !text || text.trim().length === 0) return;

    // Initialize audio context on user interaction
    initAudioCtx();

    // Stop any previous speech
    stop();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    playbackActiveRef.current = true;

    const sentences = splitSentences(text);
    if (sentences.length === 0) return;

    // Launch ALL TTS fetch requests in parallel immediately
    const fetchPromises = sentences.map((sentence, idx) =>
      fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence, voice, speed, pitch, volume, device, alpha, beta, diffusion_steps: diffusionSteps, embedding_scale: embeddingScale }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.crossOrigin = "anonymous"; // Required for Web Audio API
          audio.preload = 'auto';
          
          if (outputDeviceId !== 'default' && audio.setSinkId) {
            audio.setSinkId(outputDeviceId).catch(() => {});
          }

          // Setup Audio Node Connection
          if (audioCtxRef.current && analyserRef.current) {
            const source = audioCtxRef.current.createMediaElementSource(audio);
            source.connect(analyserRef.current);
          }

          return { url, audio, order: idx };
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error(`[TTS] Fetch failed for sentence ${idx}:`, err);
          }
          return null;
        })
    );

    setIsPlaying(true);

    // Play each sentence in ORDER as it becomes ready
    for (let i = 0; i < fetchPromises.length; i++) {
      if (!playbackActiveRef.current) break;

      const result = await fetchPromises[i];
      if (!result || !playbackActiveRef.current) continue;

      const { url, audio } = result;

      // Wait for this sentence to finish playing
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
