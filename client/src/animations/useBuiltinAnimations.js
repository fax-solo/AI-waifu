import { useRef, useCallback } from 'react';
import { LookAtController } from './LookAtController.js';

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

  const updateBuiltins = useCallback((vrm, deltaTime, {
    mouseX = 0,
    mouseY = 0,
    mouseMoving = false,
    proxy = null,
    queue = null,
    lookAtController = null,
  } = {}) => {
    if (!vrm) return;
    if (isNaN(deltaTime) || deltaTime <= 0 || !isFinite(deltaTime)) return;

    updateBlink(vrm, deltaTime, proxy, queue);
    updateEyes(vrm, deltaTime, mouseX, mouseY, mouseMoving, lookAtController);
    updateBreathing(vrm, deltaTime);
    applyBlendBuffer(vrm, deltaTime);
  }, []);

  function updateBlink(vrm, deltaTime, proxy, queue) {
    const em = vrm.expressionManager || vrm.blendShapeProxy;
    if (!em) return;
    const s = blinkState.current;

    const eyeClosingPresets = ['blinkLeft', 'blinkRight', 'joy', 'sorrow'];
    const shouldSm = proxy
      ? eyeClosingPresets.some(p => proxy.getWeight(p) > 0.3)
      : false;
    if (shouldSm) {
      s.phase = 'waiting'; s.progress = 0; s.timer = 0; s.holdTimer = 0; s.doubleBlink = false;
      s.nextBlinkAt = 1 + Math.random() * 2;
      if (queue && s.phase !== 'waiting') queue.onBlinkEnd();
      return;
    }

    s.timer += deltaTime;

    if (s.phase === 'waiting' && s.timer >= s.nextBlinkAt) {
      if (queue) queue.onBlinkStart();
      s.phase = 'closing'; s.progress = 0; s.holdTimer = 0;
      s.doubleBlink = Math.random() < 0.12;
    }

    const setBlink = (val) => {
      if (proxy) proxy.setWeight('blink', val);
      else em.setValue('blink', val);
    };

    if (s.phase === 'closing') {
      s.progress += deltaTime / BLINK_CLOSE_DURATION;
      if (s.progress >= 1.0) { s.progress = 1.0; s.phase = 'hold'; }
      setBlink(easeOutCubic(s.progress));
    } else if (s.phase === 'hold') {
      s.holdTimer += deltaTime;
      if (s.holdTimer >= BLINK_HOLD_DURATION) s.phase = 'opening';
      setBlink(1.0);
    } else if (s.phase === 'opening') {
      s.progress -= deltaTime / BLINK_OPEN_DURATION;
      if (s.progress <= 0) {
        s.progress = 0;
        if (queue) queue.onBlinkEnd();
        if (s.doubleBlink) {
          s.doubleBlink = false;
          if (queue) queue.onBlinkStart();
          s.phase = 'closing'; s.timer = 0;
        } else {
          s.phase = 'waiting'; s.timer = 0; s.nextBlinkAt = 2.5 + Math.random() * 5;
        }
      }
      setBlink(easeInCubic(s.progress));
    }

    if (queue) queue.update(deltaTime);
  }

  function updateEyes(vrm, deltaTime, mouseX, mouseY, mouseMoving, lookAtController) {
    const lookAt = vrm.lookAt;
    if (!lookAt) return;
    const s = eyeState.current;

    if (mouseMoving) {
      if (lookAtController) {
        lookAtController.update(deltaTime, mouseX, mouseY, true, lookAt);
      } else {
        s.currentX += (mouseX * 6 - s.currentX) * deltaTime * 8;
        s.currentY += (mouseY * 4 - s.currentY) * deltaTime * 8;
        lookAt.yaw = s.currentX;
        lookAt.pitch = s.currentY;
      }
      s.timer = 0;
    } else {
      s.timer += deltaTime;
      if (s.timer >= s.nextEyeMove) {
        s.timer = 0;
        if (lookAtController) {
          if (Math.random() < 0.7) {
            lookAtController.setTarget(0, 0);
            s.nextEyeMove = 1.5 + Math.random() * 3;
          } else {
            const rangeYaw = lookAtController.getMaxYaw() * 0.4;
            const rangePitch = lookAtController.getMaxPitch() * 0.4;
            lookAtController.setTarget(
              (Math.random() - 0.5) * rangeYaw * 2,
              (Math.random() - 0.5) * rangePitch * 2
            );
            s.nextEyeMove = 0.3 + Math.random() * 0.6;
          }
        } else {
          if (Math.random() < 0.7) {
            s.targetX = 0; s.targetY = 0;
            s.nextEyeMove = 1.5 + Math.random() * 3;
          } else {
            s.targetX = (Math.random() - 0.5) * 5;
            s.targetY = (Math.random() - 0.5) * 3;
            s.nextEyeMove = 0.3 + Math.random() * 0.6;
          }
        }
      }
      if (lookAtController) {
        lookAtController.update(deltaTime, 0, 0, false, lookAt);
      } else {
        s.currentX += (s.targetX - s.currentX) * deltaTime * 10;
        s.currentY += (s.targetY - s.currentY) * deltaTime * 10;
        lookAt.yaw = s.currentX;
        lookAt.pitch = s.currentY;
      }
    }
  }

  function getBone(vrm, name) {
    if (vrm.humanoid) return vrm.humanoid.getNormalizedBoneNode?.(name) ?? null;
    if (vrm.boneMap?.[name]) return vrm.boneMap[name];
    const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let found = null;
    vrm.scene?.traverse?.((child) => {
      if (!found && child.isBone) {
        const n = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (n === lower || n.endsWith(lower)) found = child;
      }
    });
    return found;
  }

  function updateBreathing(vrm, deltaTime) {
    const s = breathState.current;
    s.phase += deltaTime * 0.35 * Math.PI * 2;
    const inhale = (Math.sin(s.phase) * 0.5 + 0.5);

    const chest = getBone(vrm, 'chest');
    const upperChest = getBone(vrm, 'upperChest') || chest;
    if (upperChest && upperChest !== chest) {
      upperChest.position.z += -inhale * 0.004;
      upperChest.position.y += inhale * 0.003;
      upperChest.rotation.x += (inhale - 0.5) * 0.015;
    } else if (chest) {
      chest.position.z += -inhale * 0.003;
      chest.position.y += inhale * 0.002;
    }

    const leftClavicle = getBone(vrm, 'leftClavicle');
    const rightClavicle = getBone(vrm, 'rightClavicle');
    if (leftClavicle && rightClavicle) {
      leftClavicle.rotation.x += -inhale * 0.035;
      rightClavicle.rotation.x += -inhale * 0.035;
    }

    const leftShoulder = getBone(vrm, 'leftShoulder');
    const rightShoulder = getBone(vrm, 'rightShoulder');
    if (leftShoulder && rightShoulder) {
      const shrug = inhale * 0.02;
      leftShoulder.rotation.z += shrug;
      rightShoulder.rotation.z -= shrug;
      leftShoulder.rotation.x += (inhale - 0.5) * 0.01;
      rightShoulder.rotation.x += (inhale - 0.5) * 0.01;
    }

    const spine = getBone(vrm, 'spine');
    if (spine) {
      spine.rotation.x += (inhale - 0.5) * 0.005;
    }

    const hips = getBone(vrm, 'hips');
    if (hips) {
      hips.position.y += (inhale - 0.5) * 0.001;
    }
  }

  function applyBlendBuffer(vrm, deltaTime) {
    const blendSpeed = 14;
    const lerpFactor = Math.min(1, deltaTime * blendSpeed);

    for (const boneName of BLEND_BONES) {
      const bone = getBone(vrm, boneName);
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
