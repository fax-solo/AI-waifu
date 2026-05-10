/**
 * useBodyMotion Hook
 * 
 * Procedural body movement:
 * - Weight shifting (hips side-to-side)
 * - Shoulder breathing (shrugging slightly)
 * - Hand/Arm subtle sway
 */

import { useRef, useCallback } from 'react';

export function useBodyMotion() {
  const state = useRef({
    time: 0,
    weightShiftTimer: 0,
    targetWeight: 0,
    currentWeight: 0,
    initialHipsPos: null,
  });

  const updateBody = useCallback((vrm, deltaTime, autoAnimate = true) => {
    if (!vrm || !vrm.humanoid) return;
    const s = state.current;
    s.time += deltaTime;

    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    // --- 1. Weight Shifting (Hips) ---
    s.weightShiftTimer += deltaTime;
    if (s.weightShiftTimer > 4.0) {
      s.weightShiftTimer = 0;
      s.targetWeight = (Math.random() - 0.5) * 2; // -1 to 1
    }
    s.currentWeight += (s.targetWeight - s.currentWeight) * deltaTime * 0.2;

    const hips = getBone('hips');
    if (hips) {
      // Capture initial position once
      if (!s.initialHipsPos) {
        s.initialHipsPos = { x: hips.position.x, y: hips.position.y, z: hips.position.z };
      }

      // Subtle hip tilt (rotation only)
      hips.rotation.z = s.currentWeight * 0.02;
    }

    // --- 2. Shoulder Breathing ---
    // Shoulders rise slightly when breathing in
    const leftShoulder = getBone('leftShoulder');
    const rightShoulder = getBone('rightShoulder');
    if (leftShoulder && rightShoulder) {
      const breath = Math.sin(s.time * 0.4 * Math.PI * 2); // Sync with idle breathing speed
      const shrug = (breath * 0.5 + 0.5) * 0.02;
      leftShoulder.rotation.z += shrug;
      rightShoulder.rotation.z -= shrug;
    }

    // --- 3. Arm/Hand Sway ---
    // Arms sway slightly out of sync with body
    const leftUpperArm = getBone('leftUpperArm');
    const rightUpperArm = getBone('rightUpperArm');
    if (leftUpperArm && rightUpperArm) {
      const sway = Math.sin(s.time * 0.3) * 0.02;
      leftUpperArm.rotation.x += sway;
      rightUpperArm.rotation.x += sway;
    }
  }, []);

  return { updateBody };
}

export default useBodyMotion;
