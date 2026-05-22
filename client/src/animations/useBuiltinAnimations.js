import { useRef, useCallback } from 'react';

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

const BLINK_CLOSE_DURATION = 0.06;
const BLINK_OPEN_DURATION = 0.10;
const BLINK_HOLD_DURATION = 0.04;

export function useBuiltinAnimations() {
  const blinkState = useRef({
    timer: 0,
    nextBlinkAt: 3.0,
    phase: 'waiting',
    progress: 0,
    holdTimer: 0,
    doubleBlink: false,
  });

  const eyeState = useRef({
    timer: 0,
    nextEyeMove: 2.0,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
  });

  const breathState = useRef({
    phase: 0,
  });

  const blendMapRef = useRef(new Map());
  const BLEND_BONES = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
    'leftShoulder', 'rightShoulder',
    'leftClavicle', 'rightClavicle',
  ];

  const updateBuiltins = useCallback((vrm, deltaTime, { mouseX = 0, mouseY = 0, mouseMoving = false }) => {
    if (!vrm) return;

    updateBlink(vrm, deltaTime);
    updateEyes(vrm, deltaTime, mouseX, mouseY, mouseMoving);
    updateBreathing(vrm, deltaTime);
    applyBlendBuffer(vrm, deltaTime);
  }, []);

  function updateBlink(vrm, deltaTime) {
    const em = vrm.expressionManager || vrm.blendShapeProxy;
    if (!em) return;
    const s = blinkState.current;

    const eyeClosingExpressions = ['blinkLeft', 'blinkRight', 'Blink_L', 'Blink_R', 'happy', 'Joy', 'sad', 'Sorrow'];
    for (const expr of eyeClosingExpressions) {
      try {
        const val = em.getValue(expr);
        if (val && val > 0.3) {
          s.phase = 'waiting'; s.progress = 0; s.timer = 0; s.holdTimer = 0; s.doubleBlink = false;
          s.nextBlinkAt = 1 + Math.random() * 2;
          return;
        }
      } catch (e) {}
    }

    s.timer += deltaTime;

    if (s.phase === 'waiting') {
      if (s.timer >= s.nextBlinkAt) {
        s.phase = 'closing'; s.progress = 0; s.holdTimer = 0;
        s.doubleBlink = Math.random() < 0.12;
      }
    } else if (s.phase === 'closing') {
      s.progress += deltaTime / BLINK_CLOSE_DURATION;
      if (s.progress >= 1.0) { s.progress = 1.0; s.phase = 'hold'; }
      em.setValue('blink', easeOutCubic(s.progress));
    } else if (s.phase === 'hold') {
      s.holdTimer += deltaTime;
      if (s.holdTimer >= BLINK_HOLD_DURATION) s.phase = 'opening';
      em.setValue('blink', 1.0);
    } else {
      s.progress -= deltaTime / BLINK_OPEN_DURATION;
      if (s.progress <= 0) {
        s.progress = 0;
        if (s.doubleBlink) { s.doubleBlink = false; s.phase = 'closing'; s.timer = 0; }
        else { s.phase = 'waiting'; s.timer = 0; s.nextBlinkAt = 2.5 + Math.random() * 5; }
      }
      em.setValue('blink', easeInCubic(s.progress));
    }
  }

  function updateEyes(vrm, deltaTime, mouseX, mouseY, mouseMoving) {
    const lookAt = vrm.lookAt;
    if (!lookAt) return;
    const s = eyeState.current;

    if (mouseMoving) {
      s.currentX += (mouseX * 6 - s.currentX) * deltaTime * 8;
      s.currentY += (mouseY * 4 - s.currentY) * deltaTime * 8;
      lookAt.yaw = s.currentX;
      lookAt.pitch = s.currentY;
    } else {
      s.timer += deltaTime;
      if (s.timer >= s.nextEyeMove) {
        s.timer = 0;
        if (Math.random() < 0.7) {
          s.targetX = 0; s.targetY = 0;
          s.nextEyeMove = 1.5 + Math.random() * 3;
        } else {
          s.targetX = (Math.random() - 0.5) * 5;
          s.targetY = (Math.random() - 0.5) * 3;
          s.nextEyeMove = 0.3 + Math.random() * 0.6;
        }
      }
      s.currentX += (s.targetX - s.currentX) * deltaTime * 10;
      s.currentY += (s.targetY - s.currentY) * deltaTime * 10;
      lookAt.yaw = s.currentX;
      lookAt.pitch = s.currentY;
    }
  }

  function updateBreathing(vrm, deltaTime) {
    const getBone = (name) => vrm.humanoid?.getNormalizedBoneNode
      ? vrm.humanoid.getNormalizedBoneNode(name)
      : vrm.humanoid?.getBoneNode(name);

    const s = breathState.current;
    s.phase += deltaTime * 0.35 * Math.PI * 2;
    const inhale = (Math.sin(s.phase) * 0.5 + 0.5);

    const chest = getBone('chest');
    const upperChest = getBone('upperChest') || chest;
    if (upperChest && upperChest !== chest) {
      upperChest.position.z += -inhale * 0.004;
      upperChest.position.y += inhale * 0.003;
      upperChest.rotation.x += (inhale - 0.5) * 0.015;
    } else if (chest) {
      chest.position.z += -inhale * 0.003;
      chest.position.y += inhale * 0.002;
    }

    const leftClavicle = getBone('leftClavicle');
    const rightClavicle = getBone('rightClavicle');
    if (leftClavicle && rightClavicle) {
      leftClavicle.rotation.x += -inhale * 0.035;
      rightClavicle.rotation.x += -inhale * 0.035;
    }

    const leftShoulder = getBone('leftShoulder');
    const rightShoulder = getBone('rightShoulder');
    if (leftShoulder && rightShoulder) {
      const shrug = inhale * 0.02;
      leftShoulder.rotation.z += shrug;
      rightShoulder.rotation.z -= shrug;
      leftShoulder.rotation.x += (inhale - 0.5) * 0.01;
      rightShoulder.rotation.x += (inhale - 0.5) * 0.01;
    }

    const spine = getBone('spine');
    if (spine) {
      spine.rotation.x += (inhale - 0.5) * 0.005;
    }

    const hips = getBone('hips');
    if (hips) {
      hips.position.y += (inhale - 0.5) * 0.001;
    }
  }

  function applyBlendBuffer(vrm, deltaTime) {
    const blendSpeed = 14;
    const lerpFactor = Math.min(1, deltaTime * blendSpeed);
    const getBone = (name) => vrm.humanoid?.getNormalizedBoneNode
      ? vrm.humanoid.getNormalizedBoneNode(name)
      : vrm.humanoid?.getBoneNode(name);

    for (const boneName of BLEND_BONES) {
      const bone = getBone(boneName);
      if (!bone) continue;
      const prev = blendMapRef.current.get(boneName);
      if (prev) {
        bone.rotation.x = prev.x + (bone.rotation.x - prev.x) * lerpFactor;
        bone.rotation.y = prev.y + (bone.rotation.y - prev.y) * lerpFactor;
        bone.rotation.z = prev.z + (bone.rotation.z - prev.z) * lerpFactor;
      }
      blendMapRef.current.set(boneName, {
        x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z,
      });
    }
  }

  return { updateBuiltins };
}

export default useBuiltinAnimations;
