import { useRef, useCallback } from 'react';

export function useWalkingAnimation() {
  const state = useRef({
    time: 0,
    speed: 3.2, // Slightly slower for more weight
    spatialTime: 0,
    initialHipsPos: null,
    moveMode: 'forward',
    modeTimer: 0,
    wasWalking: false,
    strideLength: 0.24, // Smaller steps for more realism
  });

  const updateWalking = useCallback((vrm, deltaTime, isWalking) => {
    if (!vrm || !vrm.humanoid) return;
    const s = state.current;
    const h = vrm.humanoid;
    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);

    const hips = getBone('hips');

    if (!isWalking) {
      if (s.wasWalking && vrm.springBoneManager) vrm.springBoneManager.reset();
      s.wasWalking = false;
      s.time = 0; s.spatialTime = 0; s.modeTimer = 0;
      if (hips && s.initialHipsPos) {
        hips.position.copy(s.initialHipsPos);
        hips.rotation.set(0, 0, 0);
      }
      if (vrm.scene) vrm.scene.position.set(0, 0, 0);
      return;
    }

    if (!s.wasWalking) {
      if (vrm.springBoneManager) vrm.springBoneManager.reset();
      s.wasWalking = true;
      if (hips) s.initialHipsPos = hips.position.clone();
      s.initialSceneRot = vrm.scene?.rotation.y ?? 0;
    }

    s.modeTimer += deltaTime;
    if (s.modeTimer > 8.0) {
      s.modeTimer = 0;
      const modes = ['forward', 'backward', 'left', 'right'];
      s.moveMode = modes[Math.floor(Math.random() * modes.length)];
    }

    s.time += deltaTime * s.speed;
    s.spatialTime += deltaTime * 0.35;
    const t = s.time;
    const st = s.spatialTime;

    // --- 1. Legs & Feet (Reduced Bounce) ---
    const lLeg = getBone('leftUpperLeg');
    const rLeg = getBone('rightUpperLeg');
    const lKnee = getBone('leftLowerLeg');
    const rKnee = getBone('rightLowerLeg');
    const lFoot = getBone('leftFoot');
    const rFoot = getBone('rightFoot');

    if (lLeg && rLeg) {
      let swing = Math.sin(t) * s.strideLength;
      if (s.moveMode === 'backward') swing = -swing;

      lLeg.rotation.x = swing;
      rLeg.rotation.x = -swing;

      if (lKnee && rKnee) {
        // Lower legs follow with a slight delay
        lKnee.rotation.x = Math.max(0, -Math.sin(t - 0.7) * 0.5);
        rKnee.rotation.x = Math.max(0, Math.sin(t - 0.7) * 0.5);
      }
      if (lFoot && rFoot) {
        // Foot roll: Toe up when swinging forward, toe down when pushing back
        lFoot.rotation.x = Math.cos(t) * 0.25;
        rFoot.rotation.x = -Math.cos(t) * 0.25;
      }
    }

    // --- 2. Hips & Core (Weight, Not Bouncing) ---
    if (hips) {
      hips.rotation.y = Math.sin(t) * 0.12; 
      hips.rotation.z = Math.cos(t) * 0.04; 
      // Very subtle bob to represent weight shift, not a jump
      hips.position.y = s.initialHipsPos.y + Math.abs(Math.sin(t * 2)) * 0.012; 
    }

    const spine = getBone('spine');
    const chest = getBone('chest');
    if (spine) spine.rotation.y = -Math.sin(t) * 0.06;
    if (chest) chest.rotation.y = -Math.sin(t) * 0.04;

    // --- 3. Arms & Hands (Premium Motion) ---
    const lArm = getBone('leftUpperArm');
    const rArm = getBone('rightUpperArm');
    const lForearm = getBone('leftLowerArm');
    const rForearm = getBone('rightLowerArm');
    const lHand = getBone('leftHand');
    const rHand = getBone('rightHand');
    const lShoulder = getBone('leftShoulder');
    const rShoulder = getBone('rightShoulder');

    if (lArm && rArm) {
      const armSwing = Math.sin(t) * 0.28;
      lArm.rotation.x = -armSwing;
      rArm.rotation.x = armSwing;
      lArm.rotation.z = 1.15; rArm.rotation.z = -1.15;

      // Forearm lag (The "Whip" effect)
      if (lForearm && rForearm) {
        lForearm.rotation.x = 0.2 + Math.max(0, Math.sin(t - 0.5) * 0.3);
        rForearm.rotation.x = 0.2 + Math.max(0, -Math.sin(t - 0.5) * 0.3);
      }

      // Wrist rotation and hand curl
      if (lHand && rHand) {
        lHand.rotation.z = Math.sin(t) * 0.1;
        rHand.rotation.z = -Math.sin(t) * 0.1;
        // Fingers curl slightly as arms move
        const fingerCurl = 0.3 + Math.abs(Math.sin(t)) * 0.2;
        ['leftIndexProximal', 'rightIndexProximal'].forEach(f => {
          const bone = getBone(f);
          if (bone) bone.rotation.z = f.startsWith('left') ? fingerCurl : -fingerCurl;
        });
      }

      // Shoulder coordination
      if (lShoulder && rShoulder) {
        lShoulder.rotation.z = -Math.sin(t) * 0.04;
        rShoulder.rotation.z = Math.sin(t) * 0.04;
      }
    }

    // --- 4. Spatial Movement ---
    if (vrm.scene) {
      const radiusX = 0.6;
      vrm.scene.position.x = Math.sin(st) * radiusX;
      vrm.scene.rotation.y = s.initialSceneRot + (s.moveMode === 'backward' ? Math.PI : 0);
    }
  }, []);

  return { updateWalking };
}

export default useWalkingAnimation;
