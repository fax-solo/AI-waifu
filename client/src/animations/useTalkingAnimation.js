/**
 * useTalkingAnimation Hook
 * 
 * Procedural mouth movement:
 * - Moves 'aa', 'ee', 'oo' expressions based on intensity
 * - Jiggles the jaw slightly
 */

import { useRef, useCallback } from 'react';

export function useTalkingAnimation() {
  const state = useRef({
    time: 0,
    frequency: 8.0,
    amplitude: 0.8,
  });

  const updateTalking = useCallback((vrm, deltaTime, isTalking) => {
    if (!vrm) return;
    const expressionManager = vrm.expressionManager;
    if (!expressionManager) return;

    const s = state.current;

    if (isTalking) {
      s.time += deltaTime;
      
      // Procedural vowels
      const openAmount = (Math.sin(s.time * s.frequency) * 0.5 + 0.5) * s.amplitude;
      const variation = Math.sin(s.time * 2.5) * 0.5 + 0.5;

      expressionManager.setValue('aa', openAmount * variation);
      expressionManager.setValue('ih', openAmount * (1 - variation) * 0.5);
      expressionManager.setValue('oh', openAmount * (1 - variation) * 0.5);
    } else {
      // Smoothly close mouth
      const currentAa = expressionManager.getValue('aa') || 0;
      expressionManager.setValue('aa', currentAa * Math.exp(-deltaTime * 10));
      expressionManager.setValue('ih', 0);
      expressionManager.setValue('oh', 0);
    }
  }, []);

  return { updateTalking };
}

export default useTalkingAnimation;
