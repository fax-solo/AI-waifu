/**
 * useThinkingAnimation Hook
 * 
 * Procedural thinking animation:
 * - Head tilts slightly to the side
 * - Eyes look slightly up or to the side
 * - Hand-to-chin (optional/simulated with shoulder tilt)
 */

import { useRef, useCallback } from 'react';

export function useThinkingAnimation() {
  const state = useRef({
    intensity: 0,
    targetIntensity: 0,
    timer: 0,
    lookX: 0,
    lookY: 0,
  });

  const updateThinking = useCallback((vrm, deltaTime, isThinking) => {
    if (!vrm) return;
    const s = state.current;

    // Transition intensity
    s.targetIntensity = isThinking ? 1 : 0;
    s.intensity += (s.targetIntensity - s.intensity) * deltaTime * 2.0;

    if (s.intensity < 0.01 && !isThinking) return;

    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');
    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    const lookAt = vrm.lookAt;

    if (neck && head) {
      // Tilt head to the side (Z axis) and up (X axis)
      const tiltZ = s.intensity * 0.15;
      const tiltX = s.intensity * -0.1;
      
      neck.rotation.z += tiltZ;
      head.rotation.x += tiltX;
    }

    if (lookAt) {
      // Look up and to the side
      if (isThinking) {
        s.timer += deltaTime;
        if (s.timer > 2.0) {
          s.timer = 0;
          s.lookX = (Math.random() - 0.5) * 20;
          s.lookY = 10 + Math.random() * 15;
        }
        lookAt.applier.lookAt(s.lookX * s.intensity, s.lookY * s.intensity);
      }
    }
  }, []);

  return { updateThinking };
}

export default useThinkingAnimation;
