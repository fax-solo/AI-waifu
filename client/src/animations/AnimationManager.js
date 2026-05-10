/**
 * AnimationManager
 * 
 * Orchestrates all procedural animations for the VRM model.
 * This is the central point for adding new animations without cluttering the viewport.
 */

import { useCallback, useMemo, useRef } from 'react';
console.log('[AnimationManager] Module Loaded');
import { useBasePose } from './useBasePose.js';
import { useThinkingAnimation } from './useThinkingAnimation.js';
import { useTalkingAnimation } from './useTalkingAnimation.js';
import { useEmoteAnimation } from './useEmoteAnimation.js';
import { useWalkingAnimation } from './useWalkingAnimation.js';
import { useStanceAnimation } from './useStanceAnimation.js';
import { useBodyMotion } from './useBodyMotion.js';
import { useIdleAnimation } from '../components/Avatar/useIdleAnimation.js';
import { useEmotionAnimation } from '../components/Avatar/useEmotionAnimation.js';

export function useAnimationManager() {
  const { applyBasePose } = useBasePose();
  const { updateThinking } = useThinkingAnimation();
  const { updateTalking } = useTalkingAnimation();
  const { updateEmote, triggerEmote } = useEmoteAnimation();
  const { updateWalking } = useWalkingAnimation();
  const { updateStance, triggerStance } = useStanceAnimation();
  const { updateBody } = useBodyMotion();
  const { updateIdle } = useIdleAnimation();
  const { updateEmotion } = useEmotionAnimation();

  const currentVrmRef = useRef(null);
  const lastEmotionRef = useRef('neutral');

  const updateAnimations = useCallback((vrm, deltaTime, state) => {
    if (!vrm) return;

    // --- Smart Emotional Context System ---
    const currentEmotion = state.emotion || 'neutral';
    if (currentEmotion !== lastEmotionRef.current && state.autoAnimate && !state.isTesting) {
      // Ignore rapid fluctuations during "thinking" to prevent "shaking"
      if (!state.isThinking || Math.random() > 0.7) {
        console.log(`[AnimationManager] Emotion changed: ${lastEmotionRef.current} -> ${currentEmotion}`);
        
        // Trigger context-aware animations
        if (currentEmotion === 'surprised') {
          triggerEmote('surprised', 0.6);
        } else if (currentEmotion === 'angry') {
          triggerEmote('angry', 0.8);
        } else if (currentEmotion === 'sad') {
          triggerEmote('sad', 1.2);
        } else if (currentEmotion === 'happy') {
          triggerEmote('happy_jump', 0.7);
        } else if (currentEmotion === 'relaxed') {
          triggerEmote('tilt', 1.0);
        }
        
        lastEmotionRef.current = currentEmotion;
      }
    }
    
    // Reset to base
    applyBasePose(vrm);

    // Always update stance and body layers to keep a natural pose
    updateStance(vrm, deltaTime, state.autoAnimate);
    updateBody(vrm, deltaTime, state.autoAnimate);
    updateWalking(vrm, deltaTime, state.isWalking);
    
    // The new 2.1 Idle handles everything (eyes, breath, sway, weight shift)
    updateIdle(vrm, deltaTime, state.emotion || 'neutral', state.isTesting);

    updateThinking(vrm, deltaTime, state.isThinking);
    updateTalking(vrm, deltaTime, state.isTalking, state.analyser);
    
    // Only update base emotion if:
    // - No active procedural emote is modifying expressions
    // - Model is NOT talking (lip sync needs exclusive control of the mouth)
    const emoteActive = updateEmote(vrm, deltaTime);
    
    if (!emoteActive && !state.isTalking) {
      updateEmotion(vrm, state.emotion, deltaTime);
    }
    
    vrm.update(deltaTime);
  }, [applyBasePose, updateThinking, updateTalking, updateEmote, updateWalking, updateStance, updateBody, updateIdle, updateEmotion]);

  return useMemo(() => ({
    updateAnimations,
    triggerEmote,
    triggerStance
  }), [updateAnimations, triggerEmote, triggerStance]);
}

export default useAnimationManager;
