/**
 * useEmoteAnimation Hook
 * 
 * Procedural emotes with cute physics.
 * 
 * IMPORTANT: This runs AFTER useStanceAnimation in the pipeline.
 * Stance uses .set() to establish arm rotations (e.g. rightUpperArm Z = -1.2).
 * This hook uses += to add offsets on top.
 * 
 * VRM Arm Directions (after stance sets arms at sides):
 *   Left  upper arm Z = +1.2  → To RAISE: subtract (negative offset)
 *   Right upper arm Z = -1.2  → To RAISE: add      (positive offset)
 *   X negative = arm goes FORWARD
 */

import { useRef, useCallback } from 'react';

const easeOutBounce = (t) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
};

const smoothPulse = (t) => Math.sin(t * Math.PI);

export function useEmoteAnimation() {
  const state = useRef({
    type: null,
    progress: 0,
    duration: 1.0,
    active: false,
  });

  const triggerEmote = useCallback((type, duration = 0.8) => {
    console.log(`[Emote] Triggering: ${type}`);
    state.current.type = type;
    state.current.duration = duration;
    state.current.progress = 0;
    state.current.active = true;
  }, []);

  const updateEmote = useCallback((vrm, deltaTime) => {
    if (!vrm || !state.current.active) return false;
    const s = state.current;
    
    s.progress += deltaTime / s.duration;
    if (s.progress >= 1.0) {
      s.active = false;
      return false;
    }

    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const t = s.progress;
    const neck = getBone('neck');
    const head = getBone('head');
    const spine = getBone('spine');
    const hips = getBone('hips');
    const expressionManager = vrm.expressionManager || vrm.blendShapeProxy;

    // ─── CUTE JUMP ──────────────────────────────────────────────
    if (s.type === 'happy_jump' || s.type === 'jump') {
      // CONTINUOUS jump arc: no teleporting between phases.
      //
      // Phase 1 (0.00 – 0.15): Squat down
      // Phase 2 (0.15 – 0.85): Single smooth arc (up and down)
      // Phase 3 (0.85 – 1.00): Landing dip + settle

      let jumpY = 0;
      let armRaise = 0;
      let legBend = 0;

      if (t < 0.15) {
        // Crouch down
        const p = t / 0.15;
        jumpY = -0.06 * p;
        legBend = 0.3 * p;
      } else if (t < 0.85) {
        // Main arc: perfectly continuous with squat phase
        const p = (t - 0.15) / 0.7; // 0 → 1
        // At p=0: jumpY = -0.06 (matches end of squat)
        // At p=0.5: jumpY ≈ 0.22 (peak)
        // At p=1: jumpY = 0 (landed)
        jumpY = -0.06 * (1 - p) + 0.25 * Math.sin(p * Math.PI);
        armRaise = Math.sin(p * Math.PI);
        legBend = 0.15 * Math.sin(p * Math.PI * 0.5); // Legs tuck up slightly
      } else {
        // Landing: small bounce dip
        const p = (t - 0.85) / 0.15;
        jumpY = -0.03 * Math.sin(p * Math.PI);
        legBend = 0.2 * (1 - p);
      }

      // Apply
      if (hips) hips.position.y += jumpY;
      if (spine) spine.rotation.x += (t < 0.15 ? 0.05 * (t/0.15) : 0);

      // Arms raise: left arm -Z, right arm +Z
      const lUpperArm = getBone('leftUpperArm');
      const rUpperArm = getBone('rightUpperArm');
      const lLowerArm = getBone('leftLowerArm');
      const rLowerArm = getBone('rightLowerArm');

      if (lUpperArm) lUpperArm.rotation.z += armRaise * -0.9;
      if (rUpperArm) rUpperArm.rotation.z += armRaise * 0.9;
      if (lUpperArm) lUpperArm.rotation.x += armRaise * -0.1;
      if (rUpperArm) rUpperArm.rotation.x += armRaise * -0.1;
      if (lLowerArm) lLowerArm.rotation.x += armRaise * -0.5;
      if (rLowerArm) rLowerArm.rotation.x += armRaise * -0.5;

      // Legs
      const lUL = getBone('leftUpperLeg');
      const rUL = getBone('rightUpperLeg');
      const lLL = getBone('leftLowerLeg');
      const rLL = getBone('rightLowerLeg');
      if (lUL) lUL.rotation.x += -legBend;
      if (rUL) rUL.rotation.x += -legBend;
      if (lLL) lLL.rotation.x += legBend * 2;
      if (rLL) rLL.rotation.x += legBend * 2;

      // Head: gentle tilt (smooth, no vibration)
      if (head) {
        head.rotation.z += smoothPulse(t) * 0.05;
        head.rotation.x += -smoothPulse(t) * 0.04;
      }

      // Expression
      if (expressionManager) {
        const h = smoothPulse(t);
        expressionManager.setValue('happy', h);
        expressionManager.setValue('Joy', h);
      }

    // ─── NOD ────────────────────────────────────────────────────
    } else if (s.type === 'nod' && neck && head) {
      const amount = Math.sin(t * Math.PI * 4) * 0.25 * (1 - t);
      neck.rotation.x += amount * 0.6;
      head.rotation.x += amount * 0.4;

    // ─── SHAKE ──────────────────────────────────────────────────
    } else if (s.type === 'shake' && neck && head) {
      const amount = Math.sin(t * Math.PI * 6) * 0.25 * (1 - t);
      neck.rotation.y += amount * 0.5;
      head.rotation.y += amount * 0.5;

    // ─── TILT ───────────────────────────────────────────────────
    } else if (s.type === 'tilt' && neck && head) {
      const p = smoothPulse(t) * 0.3;
      neck.rotation.z += p * 0.6;
      head.rotation.z += p * 0.4;
      head.rotation.y += p * 0.3;

    // ─── WINK ───────────────────────────────────────────────────
    } else if (s.type === 'wink') {
      const w = smoothPulse(t);
      if (expressionManager) {
        expressionManager.setValue('blinkRight', w);
        expressionManager.setValue('Blink_R', w);
        expressionManager.setValue('happy', w * 0.4);
      }
      if (head) head.rotation.z += w * 0.08;

    // ─── POUT ───────────────────────────────────────────────────
    } else if (s.type === 'pout') {
      const p = smoothPulse(t);
      if (head) head.rotation.x += p * 0.12;
      if (expressionManager) {
        expressionManager.setValue('angry', p * 0.5);
        expressionManager.setValue('Angry', p * 0.5);
      }

    // ─── SURPRISED ──────────────────────────────────────────────
    } else if (s.type === 'surprised' && head) {
      const p = smoothPulse(t);
      head.rotation.x += -p * 0.2;
      if (expressionManager) {
        expressionManager.setValue('surprised', p);
        expressionManager.setValue('Surprised', p);
      }

    // ─── ANGRY ──────────────────────────────────────────────────
    } else if (s.type === 'angry' && head) {
      const p = smoothPulse(t);
      head.rotation.x += p * 0.12;
      if (expressionManager) {
        expressionManager.setValue('angry', p);
        expressionManager.setValue('Angry', p);
      }

    // ─── SAD ────────────────────────────────────────────────────
    } else if (s.type === 'sad' && head) {
      const p = smoothPulse(t);
      head.rotation.x += p * 0.25;
      if (neck) neck.rotation.x += p * 0.1;
      if (spine) spine.rotation.x += p * 0.08;
      if (expressionManager) {
        expressionManager.setValue('sad', p);
        expressionManager.setValue('Sorrow', p);
      }

    // ─── KAWAII ──────────────────────────────────────────────────
    } else if (s.type === 'kawaii') {
      const p = smoothPulse(t);
      if (head) {
        head.rotation.z += p * 0.25;
        head.rotation.y += p * 0.1;
      }
      if (expressionManager) {
        expressionManager.setValue('happy', p);
        expressionManager.setValue('Joy', p);
        expressionManager.setValue('blinkRight', p > 0.35 ? 1 : 0);
      }
    }
    
    return true;
  }, []);

  return { updateEmote, triggerEmote };
}

export default useEmoteAnimation;
