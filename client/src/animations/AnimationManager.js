import { useCallback, useMemo, useRef } from 'react';
import { useBuiltinAnimations } from './useBuiltinAnimations.js';
import { useAnimationPlayer } from './useAnimationPlayer.js';

export function useAnimationManager() {
  const { updateBuiltins } = useBuiltinAnimations();
  const { playAnimation, stopAnimation, stopAllAnimations, listAnimations, updateAnimations: updatePlayer } = useAnimationPlayer();

  const lastEmotionRef = useRef('neutral');
  const autoAnimationsRef = useRef({});

  const updateAnimations = useCallback((vrm, deltaTime, state) => {
    if (!vrm) return;

    // Reset all bones to neutral
    applyBasePose(vrm);

    // Run built-in procedural animations (blink, breathing, eye tracking)
    updateBuiltins(vrm, deltaTime, {
      mouseX: state.mouseX || 0,
      mouseY: state.mouseY || 0,
      mouseMoving: state.mouseMoving || false,
    });

    // Run user-provided JSON animations from the player
    updatePlayer(vrm, deltaTime);

    // Auto-trigger facial animation when emotion changes
    const currentEmotion = state.emotion || 'neutral';
    if (currentEmotion !== lastEmotionRef.current && state.autoAnimate && !state.isTesting) {
      lastEmotionRef.current = currentEmotion;
      if (currentEmotion !== 'neutral') {
        const facialAnim = `facial/${currentEmotion}.json`;
        playAnimation('facial', `${currentEmotion}.json`, { blendSpeed: 10 });
        const bodyAnimFile = `${currentEmotion}.json`;
        const bodyAnims = {
          happy: 'jump.json',
          surprised: 'jump.json',
        };
        if (bodyAnims[currentEmotion]) {
          playAnimation('body', bodyAnims[currentEmotion], { blendSpeed: 8 });
        }
      }
    }

    // Auto-play talking gestures when talking
    if (state.isTalking) {
      if (!autoAnimationsRef.current.talking) {
        autoAnimationsRef.current.talking = playAnimation('body', 'talking_gestures.json', { blendSpeed: 6 });
      }
    } else if (autoAnimationsRef.current.talking) {
      stopAnimation(autoAnimationsRef.current.talking);
      autoAnimationsRef.current.talking = null;
    }

    // Auto-play thinking when thinking
    if (state.isThinking) {
      if (!autoAnimationsRef.current.thinking) {
        autoAnimationsRef.current.thinking = playAnimation('body', 'thinking.json', { blendSpeed: 8 });
      }
    } else if (autoAnimationsRef.current.thinking) {
      stopAnimation(autoAnimationsRef.current.thinking);
      autoAnimationsRef.current.thinking = null;
    }

    vrm.update(deltaTime);

    if (vrm.springBoneManager) {
      vrm.springBoneManager.update(deltaTime);
    }
  }, [updateBuiltins, updatePlayer, playAnimation, stopAnimation]);

  const triggerAnimation = useCallback((type, filename, options = {}) => {
    return playAnimation(type, filename, options);
  }, [playAnimation]);

  return useMemo(() => ({
    updateAnimations,
    triggerAnimation,
    listAnimations,
    stopAnimation,
    stopAllAnimations,
  }), [updateAnimations, triggerAnimation, listAnimations, stopAnimation, stopAllAnimations]);
}

function applyBasePose(vrm) {
  if (!vrm || !vrm.humanoid) return;

  const bones = [
    'hips', 'spine', 'chest', 'neck', 'head',
    'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
    'leftShoulder', 'rightShoulder',
    'leftClavicle', 'rightClavicle',
  ];

  bones.forEach(b => {
    const node = vrm.humanoid.getNormalizedBoneNode
      ? vrm.humanoid.getNormalizedBoneNode(b)
      : vrm.humanoid.getBoneNode(b);

    if (node) {
      node.rotation.set(0, 0, 0);
      if (b === 'leftUpperArm') node.rotation.z = 1.2;
      if (b === 'rightUpperArm') node.rotation.z = -1.2;
      if (b === 'leftLowerArm') node.rotation.x = 0.2;
      if (b === 'rightLowerArm') node.rotation.x = 0.2;
      node.scale.set(1, 1, 1);
      if (b === 'hips') {
        node.position.set(0, 0, 0);
      }
      if (b === 'chest' || b === 'upperChest') {
        node.position.set(0, 0, 0);
      }
    }
  });

  const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
  fingers.forEach(f => {
    ['Proximal', 'Intermediate', 'Distal'].forEach(j => {
      ['left', 'right'].forEach(side => {
        const boneName = `${side}${f}${j}`;
        const node = vrm.humanoid.getNormalizedBoneNode
          ? vrm.humanoid.getNormalizedBoneNode(boneName)
          : vrm.humanoid.getBoneNode(boneName);
        if (node) node.rotation.set(0, 0, 0);
      });
    });
  });

  if (vrm.scene) vrm.scene.visible = true;
}

export default useAnimationManager;
