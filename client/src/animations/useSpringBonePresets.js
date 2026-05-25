/**
 * useSpringBonePresets - Dynamic VRM Spring Bone Preset Manager
 *
 * Implements the first pillar:
 * - Distinct physics profiles for Long Hair, Short Hair, Soft Clothing
 * - Emotion-driven modifier system
 * - UpdateSpringProperties runtime API
 * - Smooth blending between physics states
 */

import { useRef, useCallback } from 'react';

export const BoneGroup = {
  LONG_HAIR_BACK: 'longHairBack',
  SHORT_HAIR_BANGS: 'shortHairBangs',
  SOFT_CLOTHING: 'softClothing',
  BUST: 'bust',
  SKIRT: 'skirt',
  COAT: 'coat',
  ACCESSORIES: 'accessories',
  DEFAULT: 'default',
};

const SPRING_BONE_PRESETS = {
  [BoneGroup.LONG_HAIR_BACK]: {
    stiffness: 0.18,
    dragForce: 0.85,
    gravityPower: 0.015,
    hitRadius: 0.06,
    label: 'Long/Back Hair',
  },
  [BoneGroup.SHORT_HAIR_BANGS]: {
    stiffness: 0.68,
    dragForce: 0.72,
    gravityPower: 0.10,
    hitRadius: 0.05,
    label: 'Front Bangs / Short Hair',
  },
  [BoneGroup.SOFT_CLOTHING]: {
    stiffness: 0.18,
    dragForce: 0.62,
    gravityPower: 0.40,
    hitRadius: 0.10,
    label: 'Soft Clothing / Skirts',
  },
  [BoneGroup.BUST]: {
    stiffness: 0.45,
    dragForce: 0.55,
    gravityPower: 0.12,
    hitRadius: 0.10,
    label: 'Bust/Chest',
  },
  [BoneGroup.SKIRT]: {
    stiffness: 0.18,
    dragForce: 0.65,
    gravityPower: 0.45,
    hitRadius: 0.14,
    label: 'Skirt',
  },
  [BoneGroup.COAT]: {
    stiffness: 0.55,
    dragForce: 0.60,
    gravityPower: 0.15,
    hitRadius: 0.12,
    label: 'Coat/Long Jacket',
  },
  [BoneGroup.ACCESSORIES]: {
    stiffness: 0.40,
    dragForce: 0.65,
    gravityPower: 0.25,
    hitRadius: 0.04,
    label: 'Ribbons, Tails, Accessories',
  },
  [BoneGroup.DEFAULT]: {
    stiffness: 0.55,
    dragForce: 0.60,
    gravityPower: 0.15,
    hitRadius: 0.08,
    label: 'Default / Unmatched',
  },
};

export const EmotionPhysics = {
  NEUTRAL: {
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
    joltAmount: 0,
    blendSpeed: 3.0,
  },
  HAPPY: {
    stiffnessMult: 1.6,
    dragMult: 1.25,
    gravityMult: 0.7,
    joltAmount: 0,
    blendSpeed: 4.0,
  },
  EXCITED: {
    stiffnessMult: 2.0,
    dragMult: 1.35,
    gravityMult: 0.55,
    joltAmount: 0,
    blendSpeed: 5.0,
  },
  SAD: {
    stiffnessMult: 0.45,
    dragMult: 1.4,
    gravityMult: 1.75,
    joltAmount: 0,
    blendSpeed: 2.0,
  },
  TIRED: {
    stiffnessMult: 0.35,
    dragMult: 1.5,
    gravityMult: 2.0,
    joltAmount: 0,
    blendSpeed: 1.5,
  },
  SURPRISED: {
    stiffnessMult: 1.15,
    dragMult: 1.0,
    gravityMult: 1.0,
    joltAmount: 0.045,
    blendSpeed: 8.0,
  },
  FEAR: {
    stiffnessMult: 0.55,
    dragMult: 1.6,
    gravityMult: 1.4,
    joltAmount: 0,
    blendSpeed: 3.0,
  },
  ANGRY: {
    stiffnessMult: 1.4,
    dragMult: 1.15,
    gravityMult: 0.9,
    joltAmount: 0,
    blendSpeed: 5.0,
  },
};

const EMOTION_MAP = {
  neutral: EmotionPhysics.NEUTRAL,
  happy: EmotionPhysics.HAPPY,
  excited: EmotionPhysics.EXCITED,
  sad: EmotionPhysics.SAD,
  tired: EmotionPhysics.TIRED,
  sleepy: EmotionPhysics.TIRED,
  surprised: EmotionPhysics.SURPRISED,
  shock: EmotionPhysics.SURPRISED,
  fear: EmotionPhysics.FEAR,
  scared: EmotionPhysics.FEAR,
  angry: EmotionPhysics.ANGRY,
  annoyed: EmotionPhysics.ANGRY,
  love: EmotionPhysics.HAPPY,
  affectionate: EmotionPhysics.HAPPY,
  playful: EmotionPhysics.EXCITED,
  smug: EmotionPhysics.HAPPY,
  proud: EmotionPhysics.HAPPY,
  confused: EmotionPhysics.NEUTRAL,
  thoughtful: EmotionPhysics.NEUTRAL,
  relaxed: EmotionPhysics.NEUTRAL,
  nervous: EmotionPhysics.FEAR,
  worried: EmotionPhysics.SAD,
  embarrassment: EmotionPhysics.HAPPY,
  embarrassed: EmotionPhysics.HAPPY,
  disgusted: EmotionPhysics.SAD,
  disgust: EmotionPhysics.SAD,
};

function classifyJointByBoneName(boneName) {
  const n = (boneName || '').toLowerCase();

  if (
    n.includes('hair_back') ||
    n.includes('back_hair') ||
    n.includes('longhair') ||
    (n.includes('hair') && (n.includes('_b_') || n.includes('_back')))
  ) {
    return BoneGroup.LONG_HAIR_BACK;
  }

  if (
    n.includes('bangs') ||
    n.includes('front_hair') ||
    n.includes('hair_front') ||
    n.includes('shorthair') ||
    (n.includes('hair') && (n.includes('_f_') || n.includes('_front'))) ||
    n.includes('ahoge')
  ) {
    return BoneGroup.SHORT_HAIR_BANGS;
  }

  if (n.includes('ribbon') || n.includes('tail') || n.includes('accessory')) {
    return BoneGroup.ACCESSORIES;
  }

  if (n.includes('bust') || n.includes('breast') || n.includes('chest')) {
    return BoneGroup.BUST;
  }

  if (n.includes('skirt')) {
    return BoneGroup.SKIRT;
  }

  if (n.includes('coat') || n.includes('jacket')) {
    return n.includes('skirt') ? BoneGroup.COAT : BoneGroup.COAT;
  }

  if (n.includes('cloth') || n.includes('dress')) {
    return BoneGroup.SOFT_CLOTHING;
  }

  if (n.includes('hair')) {
    return BoneGroup.LONG_HAIR_BACK;
  }

  return BoneGroup.DEFAULT;
}

export function useSpringBonePresets() {
  const vrmRef = useRef(null);
  const baseJointState = useRef(new Map());
  const groupToJoints = useRef(new Map());
  const currentModifiers = useRef({
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
  });
  const targetModifiers = useRef({
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
  });
  const blendSpeedRef = useRef(3.0);
  const pendingJolt = useRef(null);
  const joltState = useRef({ active: false, velocity: 0, displacement: 0, phase: 0 });

  const init = useCallback((vrm) => {
    if (!vrm?.springBoneManager?.joints) {
      console.warn('[SpringBonePresets] No springBoneManager found on VRM');
      return;
    }

    vrmRef.current = vrm;
    baseJointState.current.clear();
    groupToJoints.current.clear();

    for (const group of Object.values(BoneGroup)) {
      groupToJoints.current.set(group, []);
    }

    const joints = vrm.springBoneManager.joints;
    let tunedCount = 0;
    const groupStats = {};

    for (const joint of joints) {
      const settings = joint.settings;
      const boneName = joint.bone?.name || 'unnamed';
      const group = classifyJointByBoneName(boneName);
      const preset = SPRING_BONE_PRESETS[group];

      groupStats[group] = (groupStats[group] || 0) + 1;

      const originalStiffness = settings.stiffness ?? preset.stiffness;
      const originalDrag = settings.dragForce ?? preset.dragForce;
      const originalGravity = settings.gravityPower ?? preset.gravityPower;
      const originalRadius = settings.hitRadius ?? preset.hitRadius;

      settings.stiffness = preset.stiffness;
      settings.dragForce = preset.dragForce;
      settings.gravityPower = preset.gravityPower;
      settings.hitRadius = preset.hitRadius;

      baseJointState.current.set(joint, {
        group,
        baseStiffness: preset.stiffness,
        baseDrag: preset.dragForce,
        baseGravity: preset.gravityPower,
        baseRadius: preset.hitRadius,
        originalStiffness,
        originalDrag,
        originalGravity,
        originalRadius,
      });

      const groupJoints = groupToJoints.current.get(group) || [];
      groupJoints.push(joint);
      groupToJoints.current.set(group, groupJoints);

      tunedCount++;
    }

    currentModifiers.current = { stiffnessMult: 1.0, dragMult: 1.0, gravityMult: 1.0 };
    targetModifiers.current = { stiffnessMult: 1.0, dragMult: 1.0, gravityMult: 1.0 };
    blendSpeedRef.current = 3.0;

    console.log(`[SpringBonePresets] Initialized ${tunedCount} joints:`,
      Object.entries(groupStats).map(([g, c]) => `${SPRING_BONE_PRESETS[g]?.label || g}: ${c}`).join(', '));

    return { baseJointState: baseJointState.current, groupToJoints: groupToJoints.current };
  }, []);

  const updateSpringProperties = useCallback((boneGroup, stiffness, dragForce, gravityPower, hitRadius) => {
    const joints = groupToJoints.current.get(boneGroup);
    if (!joints || joints.length === 0) {
      console.warn(`[SpringBonePresets] No joints found for group: ${boneGroup}`);
      return 0;
    }

    let updated = 0;
    for (const joint of joints) {
      const state = baseJointState.current.get(joint);
      const settings = joint.settings;

      if (stiffness != null && !isNaN(stiffness)) {
        settings.stiffness = stiffness;
        if (state) state.baseStiffness = stiffness;
      }
      if (dragForce != null && !isNaN(dragForce)) {
        settings.dragForce = dragForce;
        if (state) state.baseDrag = dragForce;
      }
      if (gravityPower != null && !isNaN(gravityPower)) {
        settings.gravityPower = gravityPower;
        if (state) state.baseGravity = gravityPower;
      }
      if (hitRadius != null && !isNaN(hitRadius)) {
        settings.hitRadius = hitRadius;
        if (state) state.baseRadius = hitRadius;
      }

      updated++;
    }

    console.log(`[SpringBonePresets] Updated ${updated} joints in group: ${boneGroup}`);
    return updated;
  }, []);

  const applyEmotionPhysics = useCallback((emotionName) => {
    const emotion = EMOTION_MAP[emotionName?.toLowerCase()] || EmotionPhysics.NEUTRAL;

    targetModifiers.current = {
      stiffnessMult: emotion.stiffnessMult,
      dragMult: emotion.dragMult,
      gravityMult: emotion.gravityMult,
    };
    blendSpeedRef.current = emotion.blendSpeed;

    if (emotion.joltAmount > 0) {
      pendingJolt.current = emotion.joltAmount;
    }

    console.log(`[SpringBonePresets] Applied emotion: ${emotionName || 'neutral'}`,
      `-> stiffness×${emotion.stiffnessMult}, drag×${emotion.dragMult}, gravity×${emotion.gravityMult}`);
  }, []);

  const update = useCallback((deltaTime, vrm) => {
    if (!vrm?.springBoneManager?.joints) return;

    const dt = Math.min(Math.max(deltaTime, 0), 0.05);
    const blendSpeed = blendSpeedRef.current;
    const lerpFactor = Math.min(1, dt * blendSpeed);

    const cur = currentModifiers.current;
    const tgt = targetModifiers.current;

    let needsReapply = false;
    if (Math.abs(cur.stiffnessMult - tgt.stiffnessMult) > 0.001) {
      cur.stiffnessMult += (tgt.stiffnessMult - cur.stiffnessMult) * lerpFactor;
      needsReapply = true;
    }
    if (Math.abs(cur.dragMult - tgt.dragMult) > 0.001) {
      cur.dragMult += (tgt.dragMult - cur.dragMult) * lerpFactor;
      needsReapply = true;
    }
    if (Math.abs(cur.gravityMult - tgt.gravityMult) > 0.001) {
      cur.gravityMult += (tgt.gravityMult - cur.gravityMult) * lerpFactor;
      needsReapply = true;
    }

    const jolt = joltState.current;
    if (pendingJolt.current != null) {
      jolt.active = true;
      jolt.velocity = pendingJolt.current * 12;
      jolt.displacement = 0;
      jolt.phase = 0;
      pendingJolt.current = null;
    }

    if (jolt.active) {
      const springK = 190;
      const damping = 8;
      const acceleration = -springK * jolt.displacement - damping * jolt.velocity;
      jolt.velocity += acceleration * dt;
      jolt.displacement += jolt.velocity * dt;
      jolt.phase += dt;

      const hips = vrm.humanoid?.getNormalizedBoneNode?.('hips') ||
                   vrm.humanoid?.getRawBoneNode?.('hips');
      if (hips) {
        hips.position.y += jolt.displacement;
      }

      if (jolt.phase > 0.8 && Math.abs(jolt.displacement) < 0.0001) {
        jolt.active = false;
        jolt.displacement = 0;
        jolt.velocity = 0;
      }
    }

    if (!needsReapply || baseJointState.current.size === 0) return;

    const joints = vrm.springBoneManager.joints;
    for (const joint of joints) {
      const state = baseJointState.current.get(joint);
      if (!state) continue;

      const settings = joint.settings;

      settings.stiffness = state.baseStiffness * cur.stiffnessMult;
      settings.dragForce = Math.min(0.95, state.baseDrag * cur.dragMult);
      settings.gravityPower = state.baseGravity * cur.gravityMult;
    }
  }, []);

  const getCurrentModifiers = useCallback(() => ({ ...currentModifiers.current }), []);

  const getJointStats = useCallback(() => {
    const stats = {};
    for (const [group, joints] of groupToJoints.current.entries()) {
      if (joints.length > 0) {
        stats[group] = {
          count: joints.length,
          preset: SPRING_BONE_PRESETS[group],
        };
      }
    }
    return stats;
  }, []);

  return {
    init,
    update,
    updateSpringProperties,
    applyEmotionPhysics,
    getCurrentModifiers,
    getJointStats,
    BoneGroup,
    SPRING_BONE_PRESETS,
  };
}

export default useSpringBonePresets;
