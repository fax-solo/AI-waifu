/**
 * useTTS Hook
 *
 * Handles generating and playing speech audio from text.
 * Connects to the local Python TTS sidecar.
 */

import { useState, useCallback, useRef } from 'react';

const TTS_URL = 'http://127.0.0.1:5000/tts';

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioQueueRef = useRef([]); // Items: { audio: AudioObject, url: string }
  const currentAudioRef = useRef(null);
  const isProcessingQueueRef = useRef(false);
  const abortControllerRef = useRef(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    // Clean up all pre-loaded URLs
    audioQueueRef.current.forEach(item => URL.revokeObjectURL(item.url));
    audioQueueRef.current = [];
    isProcessingQueueRef.current = false;
    setIsPlaying(false);
  }, []);

  const processQueue = async () => {
    if (isProcessingQueueRef.current) return;
    
    isProcessingQueueRef.current = true;
    setIsPlaying(true);

    while (audioQueueRef.current.length > 0) {
      const { audio, url } = audioQueueRef.current.shift();
      currentAudioRef.current = audio;

      await new Promise((resolve) => {
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
        
        // Start playing the pre-loaded audio
        audio.play().catch(resolve);
      });
    }

    isProcessingQueueRef.current = false;
    
    // Check if new items arrived while finishing the loop
    if (audioQueueRef.current.length > 0) {
      processQueue();
    } else {
      setIsPlaying(false);
    }
  };

  const speak = useCallback(async (text, options = {}) => {
    const { 
      enabled = true, 
      voice = 'af_bella', 
      speed = 1.0,
      outputDeviceId = 'default'
    } = options;

    if (!enabled || !text || text.trim().length === 0) return;

    // Stop currently playing audio and cancel ongoing requests
    stop();
    abortControllerRef.current = new AbortController();

    // Splitting regex: split by punctuation followed by space, or just punctuation
    const sentences = text.split(/(?<=[.!?:\n])\s+|(?<=[.!?:\n])(?=[^\s])/).filter(s => s.trim().length > 0);

    for (let sentence of sentences) {
      try {
        const response = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: sentence.trim(),
            voice: voice,
            speed: speed
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) continue;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // PRE-LOAD the audio object immediately
        const audio = new Audio(url);
        
        // Set output device if supported
        if (outputDeviceId !== 'default' && audio.setSinkId) {
          audio.setSinkId(outputDeviceId).catch(() => {});
        }

        // Force the browser to start loading the audio metadata/buffer
        audio.load();
        
        audioQueueRef.current.push({ audio, url });
        
        if (!isProcessingQueueRef.current) {
          processQueue();
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[TTS] Fetch failed for chunk:', err);
        }
        break;
      }
    }
  }, [stop]);

  return { speak, stop, isPlaying };
}
