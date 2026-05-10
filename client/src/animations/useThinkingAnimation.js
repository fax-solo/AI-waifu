/**
 * useThinkingAnimation Hook
 * 
 * During thinking: right hand to chin, head tilted, eyes searching.
 * 
 * Uses ABSOLUTE bone rotation overrides (not additive) to avoid
 * conflicts with stance/idle/body layers.
 * 
 * DEBUG: If the arm still goes behind the back, flip the Z target sign.
 * Current targets assume: Z closer to 0 = arm raised toward horizontal.
 */

import { useRef, useCallback } from 'react';

export function useThinkingAnimation() {
  const state = useRef({
    intensity: 0,
    targetIntensity: 0,
    timer: 0,
    phase: 0,
    lookX: 0,
    lookY: 0,
    lookTargetX: 12,
    lookTargetY: 15,
    headTiltTarget: 0.12,
    headTilt: 0,
    debugged: false,
  });

  const updateThinking = useCallback((vrm, deltaTime, isThinking) => {
    if (!vrm) return;
    const s = state.current;

    s.targetIntensity = isThinking ? 1 : 0;
    s.intensity += (s.targetIntensity - s.intensity) * deltaTime * (isThinking ? 2.5 : 5.0);

    if (s.intensity < 0.01 && !isThinking) return;

    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const I = s.intensity;
    const now = performance.now() * 0.001;

    // One-time debug: log what the stance set the right arm to
    if (isThinking && !s.debugged) {
      s.debugged = true;
      const rArm = getBone('rightUpperArm');
      const lArm = getBone('leftUpperArm');
      if (rArm) console.log('[Thinking] Right arm BEFORE override:', 
        `x=${rArm.rotation.x.toFixed(3)}, y=${rArm.rotation.y.toFixed(3)}, z=${rArm.rotation.z.toFixed(3)}`);
      if (lArm) console.log('[Thinking] Left arm BEFORE override:', 
        `x=${lArm.rotation.x.toFixed(3)}, y=${lArm.rotation.y.toFixed(3)}, z=${lArm.rotation.z.toFixed(3)}`);
    }

    // ── Periodic gaze changes ──
    s.timer += deltaTime;
    if (s.timer > 2.5 + Math.sin(now * 0.3) * 1.0) {
      s.timer = 0;
      s.phase = (s.phase + 1) % 4;
      switch (s.phase) {
        case 0: s.headTiltTarget = 0.10;  s.lookTargetX = 12;  s.lookTargetY = 15; break;
        case 1: s.headTiltTarget = -0.06; s.lookTargetX = -10; s.lookTargetY = 12; break;
        case 2: s.headTiltTarget = 0.12;  s.lookTargetX = 8;   s.lookTargetY = -3; break;
        case 3: s.headTiltTarget = 0.0;   s.lookTargetX = 0;   s.lookTargetY = 20; break;
      }
    }
    s.headTilt += (s.headTiltTarget - s.headTilt) * deltaTime * 1.5;
    s.lookX += (s.lookTargetX - s.lookX) * deltaTime * 2.5;
    s.lookY += (s.lookTargetY - s.lookY) * deltaTime * 2.5;

    // ── SPINE (additive — small) ──
    const spine = getBone('spine');
    if (spine) {
      spine.rotation.x += I * -0.03;
      spine.rotation.z += I * 0.02;
    }

    // ── HEAD & NECK (additive) ──
    const neck = getBone('neck');
    const head = getBone('head');
    const sway = Math.sin(now * 0.7) * 0.015;
    if (neck) {
      neck.rotation.z += I * (s.headTilt * 0.5 + sway);
      neck.rotation.x += I * -0.04;
    }
    if (head) {
      head.rotation.z += I * s.headTilt * 0.4;
      head.rotation.x += I * -0.05;
      head.rotation.y += I * s.headTilt * 0.3;
    }

    // ═══════════════════════════════════════════════════════════
    // RIGHT ARM → hand-to-chin pose
    // We set the FINAL rotation directly (blending with current).
    // 
    // In VRM normalized bones, the T-pose has Z=0 (horizontal).
    // The A-pose/stance sets Z=-1.2 (arm down at side).
    // To raise: Z should go TOWARD 0.
    // To bring forward: X should be NEGATIVE.
    // ═══════════════════════════════════════════════════════════
    const rUpperArm = getBone('rightUpperArm');
    const rLowerArm = getBone('rightLowerArm');
    const rHand = getBone('rightHand');

    if (rUpperArm) {
      // Target: arm raised to about 45° and forward
      rUpperArm.rotation.x = rUpperArm.rotation.x * (1 - I) + (-0.5) * I;
      rUpperArm.rotation.y = rUpperArm.rotation.y * (1 - I) + (0.3) * I;
      rUpperArm.rotation.z = rUpperArm.rotation.z * (1 - I) + (-0.4) * I;
    }
    if (rLowerArm) {
      // Elbow bent sharply to bring hand near face
      rLowerArm.rotation.x = rLowerArm.rotation.x * (1 - I) + (-1.4) * I;
      rLowerArm.rotation.y = rLowerArm.rotation.y * (1 - I) + (0.2) * I;
    }
    if (rHand) {
      rHand.rotation.x = rHand.rotation.x * (1 - I) + (0.1) * I;
    }

    // Right fingers
    const setFingerAbs = (side, finger, joint, targetX) => {
      const bone = getBone(`${side}${finger}${joint}`);
      if (bone) bone.rotation.x = bone.rotation.x * (1 - I) + targetX * I;
    };
    setFingerAbs('right', 'Index', 'Proximal', 0.15);
    setFingerAbs('right', 'Index', 'Intermediate', 0.05);
    ['Middle', 'Ring', 'Little'].forEach(f => {
      setFingerAbs('right', f, 'Proximal', 0.8);
      setFingerAbs('right', f, 'Intermediate', 0.6);
    });

    // ═══════════════════════════════════════════════════════════
    // LEFT ARM → mostly at rest (don't modify much)
    // Just leave the stance value as-is to prevent weird extension
    // ═══════════════════════════════════════════════════════════
    const lUpperArm = getBone('leftUpperArm');
    const lLowerArm = getBone('leftLowerArm');

    if (lUpperArm) {
      // Barely modify — keep near stance default
      lUpperArm.rotation.x = lUpperArm.rotation.x * (1 - I * 0.3) + (-0.1) * (I * 0.3);
    }
    if (lLowerArm) {
      lLowerArm.rotation.x = lLowerArm.rotation.x * (1 - I * 0.3) + (-0.3) * (I * 0.3);
    }

    // ── FACE ──
    const expressionManager = vrm.expressionManager || vrm.blendShapeProxy;
    if (expressionManager && expressionManager.setValue) {
      const pulse = Math.sin(now * 0.5) * 0.1 + 0.9;
      expressionManager.setValue('oh', I * 0.1 * pulse);
      expressionManager.setValue('O', I * 0.1 * pulse);
    }

    // ── EYES ──
    const lookAt = vrm.lookAt;
    if (lookAt && isThinking) {
      try {
        lookAt.applier.lookAt(s.lookX * I, s.lookY * I);
      } catch (e) {}
    }
    if (!isThinking) {
      s.lookX = 0;
      s.lookY = 0;
    }
  }, []);

  return { updateThinking };
}

export default useThinkingAnimation;
