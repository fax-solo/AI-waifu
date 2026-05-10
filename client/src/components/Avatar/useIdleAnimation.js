import { useRef, useCallback } from 'react';

// ─── Animation Config ──────────────────────────────────────────
const BLINK_DURATION = 0.12;

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
  });

  const updateIdle = useCallback((vrm, deltaTime, emotion = 'neutral', faceOnly = false) => {
    if (!vrm) return;
    const s = state.current;
    s.elapsed += deltaTime;

    // ─── 1. Blinking & Eyes ───
    updateBlink(vrm, deltaTime, s);
    updateEyes(vrm, deltaTime, s);

    // ─── 2. Head & Neck Micro-Movements ───
    // (Body/hips/arms/legs are handled by useBodyMotion to avoid conflicts)
    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const t = s.elapsed;
    const head = getBone('head');
    const neck = getBone('neck');

    if (head) {
      // Emotion-driven head posture
      let baseTilt = 0;
      let baseNod = 0;
      if (emotion === 'happy' || emotion === 'excited') baseTilt = 0.12;
      if (emotion === 'sad') baseNod = 0.15;
      if (emotion === 'angry') baseNod = -0.1;
      if (emotion === 'relaxed') baseTilt = 0.08;
      
      // Natural micro-movements (slower, softer frequencies for realism)
      const tilt = baseTilt + Math.sin(t * 0.4) * 0.06;
      const nod = baseNod + Math.sin(t * 0.7) * 0.02;
      const turn = Math.sin(t * 0.25) * 0.03;
      head.rotation.z += tilt; // ADDITIVE
      head.rotation.x += nod;  // ADDITIVE
      head.rotation.y += turn; // ADDITIVE - subtle head turn
    }
    if (neck) {
      // Neck follows with damped, delayed motion
      neck.rotation.y += Math.sin(t * 0.3) * 0.05;  // ADDITIVE
      neck.rotation.x += Math.sin(t * 0.5) * 0.01;  // ADDITIVE
    }

  }, []);

  return { updateIdle };
}

function updateBlink(vrm, deltaTime, s) {
  const em = vrm.expressionManager || vrm.blendShapeProxy;
  if (!em) return;

  // Check if eyes are already being controlled by an expression/emote
  // If any of these are significantly active, skip the automatic blink
  const eyeClosingExpressions = ['blinkLeft', 'blinkRight', 'Blink_L', 'Blink_R', 'happy', 'Joy', 'sad', 'Sorrow'];
  let eyesAlreadyControlled = false;
  for (const expr of eyeClosingExpressions) {
    try {
      const val = em.getValue(expr);
      if (val && val > 0.3) {
        eyesAlreadyControlled = true;
        break;
      }
    } catch (e) { /* expression doesn't exist on this model */ }
  }

  if (eyesAlreadyControlled) {
    // Reset blink state so it doesn't resume mid-blink when the expression ends
    s.blinkPhase = 'waiting';
    s.blinkProgress = 0;
    s.blinkTimer = 0;
    s.nextBlinkAt = 1 + Math.random() * 2; // Short delay after expression ends
    return;
  }

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
