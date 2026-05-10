/**
 * useStanceAnimation Hook
 */

import { useRef, useCallback } from 'react';
import * as THREE from 'three';

export function useStanceAnimation() {
  const state = useRef({
    time: 0,
    stanceTimer: 0,
    currentStance: 'neutral',
    targetStance: 'neutral',
    transition: 0,
    
    poses: {
      neutral: {
        lArm: [0, 0, 1.2],
        rArm: [0, 0, -1.2],
        lForearm: [0, 0.2, 0.3],
        rForearm: [0, -0.2, -0.3],
        lLeg: [0, 0, 0.05],
        rLeg: [0, 0, -0.05],
      },
      relaxed: {
        lArm: [0.2, 0.1, 1.0],
        rArm: [0.1, -0.1, -1.1],
        lForearm: [0.2, 0, 0],
        rForearm: [0.1, 0, 0],
        spine: [0, 0.05, 0.05],
        lLeg: [0, 0, 0.08],
        rLeg: [0, 0, -0.02],
      },
      attentive: {
        lArm: [0.1, 0.2, 1.3],
        rArm: [0.1, -0.2, -1.3],
        lForearm: [0.4, 0, 0],
        rForearm: [0.4, 0, 0],
        spine: [0.08, 0, 0], 
        lLeg: [0.03, 0, 0.05],
        rLeg: [0.03, 0, -0.05],
      },
      cute: {
        lArm: [0.5, 0.2, 1.4],
        rArm: [0.5, -0.2, -1.4],
        lForearm: [0.8, 0.4, 0.2],
        rForearm: [0.8, -0.4, -0.2],
        head: [0, 0, 0.4],
        spine: [0, 0, 0],
        lLeg: [0, 0, 0.12],
        rLeg: [0, 0, -0.12],
      },
      none: {
        lArm: [0, 0, 0],
        rArm: [0, 0, 0],
        lForearm: [0, 0, 0],
        rForearm: [0, 0, 0],
        spine: [0, 0, 0],
        lLeg: [0, 0, 0],
        rLeg: [0, 0, 0],
      }
    }
  });

  const updateStance = useCallback((vrm, deltaTime, autoAnimate = true) => {
    if (!vrm || !vrm.humanoid) return;
    const s = state.current;
    s.time += deltaTime;
    
    // Auto-cycling stances
    if (autoAnimate && s.currentStance !== 'none') {
      s.stanceTimer += deltaTime;
      if (s.stanceTimer > 8.0) {
        s.stanceTimer = 0;
        const stances = ['neutral', 'relaxed', 'attentive'];
        s.targetStance = stances[Math.floor(Math.random() * stances.length)];
      }
    }

    if (s.currentStance !== s.targetStance) {
      s.transition += deltaTime * 2.0; // Faster transition for resets
      if (s.transition >= 1.0) {
        s.currentStance = s.targetStance;
        s.transition = 0;
      }
    }

    const h = vrm.humanoid;
    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const lerpPose = (boneName, poseKey) => {
      const bone = getBone(boneName);
      if (!bone) return;

      const p1 = s.poses[s.currentStance][poseKey] || [0, 0, 0];
      const p2 = s.poses[s.targetStance][poseKey] || [0, 0, 0];
      
      const tx = THREE.MathUtils.lerp(p1[0], p2[0], s.transition);
      const ty = THREE.MathUtils.lerp(p1[1], p2[1], s.transition);
      const tz = THREE.MathUtils.lerp(p1[2], p2[2], s.transition);
      
      // Only add breathing/noise if not in 'none' stance
      const noise = s.targetStance === 'none' ? 0 : Math.sin(s.time * 0.5 + (boneName.length)) * 0.005;
      
      bone.rotation.set(tx + noise, ty, tz);
    };

    lerpPose('leftUpperArm', 'lArm');
    lerpPose('rightUpperArm', 'rArm');
    lerpPose('leftLowerArm', 'lForearm');
    lerpPose('rightLowerArm', 'rForearm');
    lerpPose('leftHand', 'lHand');
    lerpPose('rightHand', 'rHand');
    lerpPose('spine', 'spine');
    lerpPose('head', 'head');
    lerpPose('leftUpperLeg', 'lLeg');
    lerpPose('rightUpperLeg', 'rLeg');
  }, []);

  const triggerStance = useCallback((stance) => {
    if (state.current.poses[stance]) {
      console.log(`[Stance] Switching to: ${stance}`);
      state.current.targetStance = stance;
      // If none, stop auto-animate timer
      state.current.stanceTimer = stance === 'none' ? -999999 : -30.0;
      state.current.transition = 0;
    }
  }, []);

  return { updateStance, triggerStance };
}

export default useStanceAnimation;
