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
  const audioRef = useRef(null);

  const speak = useCallback(async (text) => {
    if (!text || text.trim().length === 0) return;

    try {
      setIsPlaying(true);
      
      // Stop current audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text,
          voice: 'af_bella', // Default high-quality female voice
          speed: 1.0
        }),
      });

      if (!response.ok) {
        throw new Error('TTS server error');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.error('[TTS] Playback failed:', err);
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  return { speak, stop, isPlaying };
}
