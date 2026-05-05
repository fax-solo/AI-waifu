/**
 * useEmotionAnimation
 *
 * Hook to apply VRM expressions (blendshapes) based on detected emotions.
 * Supports: neutral, happy, angry, sad, relaxed, surprised.
 */

import { useCallback, useRef, useEffect } from 'react';

// Maps our internal emotion names to VRM Expression names
// Standard VRM names: 'neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised'
const EMOTION_MAP = {
  neutral: 'neutral',
  happy: 'happy',
  angry: 'angry',
  sad: 'sad',
  relaxed: 'relaxed',
  surprised: 'surprised',
};

export function useEmotionAnimation() {
  const currentEmotionRef = useRef('neutral');
  const targetExpressionRef = useRef('neutral');

  const updateEmotion = useCallback((vrm, emotion, delta) => {
    if (!vrm || !vrm.expressionManager) return;

    const target = EMOTION_MAP[emotion] || 'neutral';
    
    // Smooth transition logic
    // We iterate through all mapped expressions and lerp them toward their targets
    Object.values(EMOTION_MAP).forEach((exprName) => {
      const currentWeight = vrm.expressionManager.getValue(exprName) || 0;
      const targetWeight = (exprName === target) ? 1.0 : 0.0;
      
      // If we're close enough, just snap it
      if (Math.abs(currentWeight - targetWeight) < 0.01) {
        vrm.expressionManager.setValue(exprName, targetWeight);
      } else {
        // Linear interpolation for smooth face changes (speed: 5.0 per sec)
        const newWeight = currentWeight + (targetWeight - currentWeight) * Math.min(delta * 5.0, 1.0);
        vrm.expressionManager.setValue(exprName, newWeight);
      }
    });

    vrm.expressionManager.update();
  }, []);

  return { updateEmotion };
}
