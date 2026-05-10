import { useRef, useCallback } from 'react';

// ─── Animation Config ──────────────────────────────────────────
const BLINK_DURATION = 0.12;
const BREATH_SPEED = 0.35;
const BREATH_AMPLITUDE = 0.001;

const WEIGHT_SHIFT_INTERVAL = 6.0; 

export function useIdleAnimation() {
  const state = useRef({
    elapsed: 0,
    blinkTimer: 0,
    nextBlinkAt: 3.0,
    blinkPhase: 'waiting',
    blinkProgress: 0,

    eyeTimer: 0,
    nextEyeMove: 2.0,
    eyeTargetX: 0,
    eyeTargetY: 0,
    currentEyeX: 0,
    currentEyeY: 0,

    weightShiftTime: 0,
    targetWeightX: 0.08,
    currentWeightX: 0,
    initialHipsPos: null,
  });

  const updateIdle = useCallback((vrm, deltaTime, emotion = 'neutral', faceOnly = false) => {
    if (!vrm) return;
    const s = state.current;
    s.elapsed += deltaTime;

    // ─── 1. Blinking & Eyes ───
    updateBlink(vrm, deltaTime, s);
    updateEyes(vrm, deltaTime, s);

    // ─── 2. Cute Body Language (Idle 2.1) ───
    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const t = s.elapsed;
    const hips = getBone('hips');
    const spine = getBone('spine');
    const head = getBone('head');
    const neck = getBone('neck');

    if (!s.initialHipsPos && hips) {
      s.initialHipsPos = hips.position.clone();
    }

    // Weight Shifting
    s.weightShiftTime += deltaTime;
    if (s.weightShiftTime > WEIGHT_SHIFT_INTERVAL) {
      s.weightShiftTime = 0;
      s.targetWeightX = (Math.random() - 0.5) * 0.2; 
    }
    s.currentWeightX += (s.targetWeightX - s.currentWeightX) * deltaTime * 0.8;

    const swayZ = Math.sin(t * 1.1) * 0.04 + s.currentWeightX; 
    const swayX = Math.cos(t * 0.9) * 0.02;

    if (hips && s.initialHipsPos) {
      hips.rotation.z += swayZ;  // ADDITIVE
      hips.rotation.x += swayX;  // ADDITIVE
    }

    const breath = Math.sin(t * Math.PI * 2 * BREATH_SPEED);
    if (spine) {
      spine.rotation.x += breath * BREATH_AMPLITUDE; // ADDITIVE
      spine.rotation.z += -swayZ * 0.6; // ADDITIVE
    }
    
    const lShoulder = getBone('leftShoulder');
    const rShoulder = getBone('rightShoulder');
    if (lShoulder && rShoulder) {
      const shrug = Math.max(0, Math.sin(t * 0.8)) * 0.05; 
      lShoulder.rotation.z += shrug;
      rShoulder.rotation.z -= shrug;
    }

    if (head) {
      let baseTilt = 0;
      let baseNod = 0;
      if (emotion === 'happy' || emotion === 'excited') baseTilt = 0.15;
      if (emotion === 'sad') baseNod = 0.2;
      if (emotion === 'angry') baseNod = -0.15;
      
      const tilt = baseTilt + Math.sin(t * 0.6) * 0.1;
      const nod = baseNod + Math.sin(t * 1.3) * 0.03;
      head.rotation.z += tilt; // ADDITIVE
      head.rotation.x += nod; // ADDITIVE
    }
    if (neck) {
      neck.rotation.y += Math.sin(t * 0.4) * 0.08; // ADDITIVE
    }

    // Arms: Add some gentle breathing sway to the stance
    const lArm = getBone('leftUpperArm');
    const rArm = getBone('rightUpperArm');
    if (lArm && rArm) {
      const armSway = breath * 0.005;
      lArm.rotation.z += armSway;
      rArm.rotation.z -= armSway;
      lArm.rotation.x += Math.sin(t * 0.5) * 0.02;
      rArm.rotation.x += Math.sin(t * 0.5) * 0.02;
    }

    const lLeg = getBone('leftUpperLeg');
    const rLeg = getBone('rightUpperLeg');
    if (lLeg && rLeg) {
      lLeg.rotation.z += -swayZ * 0.8;
      rLeg.rotation.z += -swayZ * 0.8;
    }

  }, []);

  return { updateIdle };
}

function updateBlink(vrm, deltaTime, s) {
  const em = vrm.expressionManager || vrm.blendShapeProxy;
  if (!em) return;
  s.blinkTimer += deltaTime;
  if (s.blinkPhase === 'waiting') {
    if (s.blinkTimer >= s.nextBlinkAt) {
      s.blinkPhase = 'closing';
      s.blinkProgress = 0;
    }
  } else if (s.blinkPhase === 'closing') {
    s.blinkProgress += deltaTime / BLINK_DURATION;
    if (s.blinkProgress >= 1.0) {
      s.blinkProgress = 1.0;
      s.blinkPhase = 'opening';
    }
    em.setValue('blink', s.blinkProgress);
  } else {
    s.blinkProgress -= deltaTime / BLINK_DURATION;
    if (s.blinkProgress <= 0) {
      s.blinkProgress = 0;
      s.blinkPhase = 'waiting';
      s.blinkTimer = 0;
      s.nextBlinkAt = 2 + Math.random() * 4;
    }
    em.setValue('blink', s.blinkProgress);
  }
}

function updateEyes(vrm, deltaTime, s) {
  const lookAt = vrm.lookAt;
  if (!lookAt) return;
  s.eyeTimer += deltaTime;
  if (s.eyeTimer >= s.nextEyeMove) {
    s.eyeTimer = 0;
    if (Math.random() < 0.7) {
      s.eyeTargetX = 0; s.eyeTargetY = 0; 
      s.nextEyeMove = 1 + Math.random() * 3;
    } else {
      s.eyeTargetX = (Math.random() - 0.5) * 6;
      s.eyeTargetY = (Math.random() - 0.5) * 4;
      s.nextEyeMove = 0.2 + Math.random() * 0.8;
    }
  }
  s.currentEyeX += (s.eyeTargetX - s.currentEyeX) * deltaTime * 10;
  s.currentEyeY += (s.eyeTargetY - s.currentEyeY) * deltaTime * 10;
  lookAt.yaw = s.currentEyeX;
  lookAt.pitch = s.currentEyeY;
}
