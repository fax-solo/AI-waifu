/**
 * useBodyMotion Hook
 * 
 * Premium procedural body movement with natural physics:
 * - Smooth weight shifting with inertia (hips)
 * - Spine/chest counter-rotation for realistic balance
 * - Shoulder breathing with subtle rise
 * - Arm pendulum sway with damping
 * - Micro finger curling for life-like hands
 * - Knee micro-bend for weight distribution
 */

import { useRef, useCallback } from 'react';

// Smooth interpolation with damping (critically damped spring)
function damp(current, target, speed, dt) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

export function useBodyMotion() {
  const state = useRef({
    time: 0,
    weightShiftTimer: 0,
    targetWeight: 0,
    currentWeight: 0,
    velocityWeight: 0, // For inertia
    initialHipsPos: null,
    breathPhase: 0,
  });

  const updateBody = useCallback((vrm, deltaTime, autoAnimate = true) => {
    if (!vrm || !vrm.humanoid) return;
    const s = state.current;
    s.time += deltaTime;

    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const t = s.time;

    // --- 1. Weight Shifting (Hips) with inertia ---
    s.weightShiftTimer += deltaTime;
    if (s.weightShiftTimer > 5.0 + Math.random() * 3.0) {
      s.weightShiftTimer = 0;
      s.targetWeight = (Math.random() - 0.5) * 1.5; // Softer range
    }
    
    // Critically damped spring for smooth, organic weight shift
    const prevWeight = s.currentWeight;
    s.currentWeight = damp(s.currentWeight, s.targetWeight, 0.8, deltaTime);
    s.velocityWeight = (s.currentWeight - prevWeight) / Math.max(deltaTime, 0.001);

    const hips = getBone('hips');
    const spine = getBone('spine');
    const chest = getBone('chest');

    if (hips) {
      if (!s.initialHipsPos) {
        s.initialHipsPos = { x: hips.position.x, y: hips.position.y, z: hips.position.z };
      }
      // Primary hip tilt from weight shift
      hips.rotation.z += s.currentWeight * 0.025;
      // Subtle forward/back micro-sway (breathing influence)
      hips.rotation.x += Math.sin(t * 0.7) * 0.005;
    }

    // --- 2. Spine/Chest Counter-Rotation ---
    // When hips tilt, the spine compensates to keep the head centered (realistic balance)
    if (spine) {
      spine.rotation.z += -s.currentWeight * 0.015; // Counter the hip tilt
      spine.rotation.x += Math.sin(t * 0.35 * Math.PI * 2) * 0.003; // Breathing
    }
    if (chest) {
      chest.rotation.z += -s.currentWeight * 0.008; // Further compensation
      chest.rotation.x += Math.sin(t * 0.35 * Math.PI * 2 + 0.3) * 0.002; // Breathing lag
    }

    // --- 3. Shoulder Breathing ---
    const leftShoulder = getBone('leftShoulder');
    const rightShoulder = getBone('rightShoulder');
    if (leftShoulder && rightShoulder) {
      s.breathPhase += deltaTime * 0.35 * Math.PI * 2;
      const breath = Math.sin(s.breathPhase);
      const shrug = (breath * 0.5 + 0.5) * 0.015; // Subtle rise on inhale
      leftShoulder.rotation.z += shrug;
      rightShoulder.rotation.z -= shrug;
      // Slight forward roll on exhale
      leftShoulder.rotation.x += breath * 0.003;
      rightShoulder.rotation.x += breath * 0.003;
    }

    // --- 4. Arm Pendulum Sway ---
    // Arms swing with slight delay and damping like natural pendulums
    const leftUpperArm = getBone('leftUpperArm');
    const rightUpperArm = getBone('rightUpperArm');
    if (leftUpperArm && rightUpperArm) {
      const armSwayX = Math.sin(t * 0.25) * 0.015;
      const armSwayZ = Math.cos(t * 0.18) * 0.008;
      leftUpperArm.rotation.x += armSwayX;
      rightUpperArm.rotation.x += armSwayX;
      leftUpperArm.rotation.z += armSwayZ;
      rightUpperArm.rotation.z -= armSwayZ;
    }

    // Lower arms: subtle secondary swing
    const leftLowerArm = getBone('leftLowerArm');
    const rightLowerArm = getBone('rightLowerArm');
    if (leftLowerArm && rightLowerArm) {
      const forearmSway = Math.sin(t * 0.3 + 0.5) * 0.008;
      leftLowerArm.rotation.x += forearmSway;
      rightLowerArm.rotation.x += forearmSway;
    }

    // --- 5. Micro Finger Curling ---
    // Fingers gently curl and uncurl at slightly different rates for life-like hands
    const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
    fingers.forEach((finger, i) => {
      const curl = Math.sin(t * (0.15 + i * 0.03) + i * 1.2) * 0.08 + 0.05;
      ['Proximal', 'Intermediate'].forEach(joint => {
        const left = vrm.humanoid.getNormalizedBoneNode ? 
                     vrm.humanoid.getNormalizedBoneNode(`left${finger}${joint}`) :
                     vrm.humanoid.getBoneNode(`left${finger}${joint}`);
        const right = vrm.humanoid.getNormalizedBoneNode ? 
                      vrm.humanoid.getNormalizedBoneNode(`right${finger}${joint}`) :
                      vrm.humanoid.getBoneNode(`right${finger}${joint}`);
        if (left) left.rotation.z += curl;
        if (right) right.rotation.z -= curl;
      });
    });

    // --- 6. Knee Micro-Bend (Weight Distribution) ---
    // The leg bearing more weight bends very slightly
    const leftUpperLeg = getBone('leftUpperLeg');
    const rightUpperLeg = getBone('rightUpperLeg');
    const leftLowerLeg = getBone('leftLowerLeg');
    const rightLowerLeg = getBone('rightLowerLeg');
    if (leftUpperLeg && rightUpperLeg) {
      const weightOnLeft = Math.max(0, s.currentWeight) * 0.02;
      const weightOnRight = Math.max(0, -s.currentWeight) * 0.02;
      leftUpperLeg.rotation.x += -weightOnLeft;
      rightUpperLeg.rotation.x += -weightOnRight;
      if (leftLowerLeg) leftLowerLeg.rotation.x += weightOnLeft * 1.5;
      if (rightLowerLeg) rightLowerLeg.rotation.x += weightOnRight * 1.5;
    }
  }, []);

  return { updateBody };
}

export default useBodyMotion;
