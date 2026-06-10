import { useRef, useCallback } from 'react';
import * as THREE from 'three';

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

// These are TARGET values the system tries to reach by scaling the model's own original values.
// Each model has different baseline physics — we compute multipliers to hit these targets.
const SPRING_BONE_PRESETS = {
  [BoneGroup.LONG_HAIR_BACK]: {
    stiffness: 0.20,
    dragForce: 0.40,
    gravityPower: 0.10,
    hitRadius: 0.06,
    gravityDir: [0, -1, 0],
    centerBone: 'head',
    label: 'Long/Back Hair',
  },
  [BoneGroup.SHORT_HAIR_BANGS]: {
    stiffness: 0.35,
    dragForce: 0.35,
    gravityPower: 0.07,
    hitRadius: 0.05,
    gravityDir: [0, -1, 0],
    centerBone: 'head',
    label: 'Front Bangs / Short Hair',
  },
  [BoneGroup.SOFT_CLOTHING]: {
    stiffness: 0.04,
    dragForce: 0.25,
    gravityPower: 0.18,
    hitRadius: 0.15,
    gravityDir: [0, -1, 0],
    centerBone: 'hips',
    label: 'Soft Clothing / Skirts',
  },
  [BoneGroup.BUST]: {
    stiffness: 0.40,
    dragForce: 0.45,
    gravityPower: 0.06,
    hitRadius: 0.08,
    gravityDir: [0, -1, 0],
    centerBone: 'chest',
    label: 'Bust/Chest',
  },
  [BoneGroup.SKIRT]: {
    stiffness: 0.05,
    dragForce: 0.25,
    gravityPower: 0.18,
    hitRadius: 0.18,
    gravityDir: [0, -1, 0],
    centerBone: 'hips',
    label: 'Skirt',
  },
  [BoneGroup.COAT]: {
    stiffness: 0.18,
    dragForce: 0.35,
    gravityPower: 0.10,
    hitRadius: 0.10,
    gravityDir: [0, -1, 0],
    centerBone: 'chest',
    label: 'Coat/Long Jacket',
  },
  [BoneGroup.ACCESSORIES]: {
    stiffness: 0.25,
    dragForce: 0.40,
    gravityPower: 0.10,
    hitRadius: 0.04,
    gravityDir: [0, -1, 0],
    label: 'Ribbons, Tails, Accessories',
  },
  [BoneGroup.DEFAULT]: {
    stiffness: 0.15,
    dragForce: 0.30,
    gravityPower: 0.14,
    hitRadius: 0.10,
    gravityDir: [0, -1, 0],
    label: 'Default / Unmatched',
  },
};

export const EmotionPhysics = {
  NEUTRAL: {
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
    radiusMult: 1.0,
    joltAmount: 0,
    blendSpeed: 3.0,
  },
  HAPPY: {
    stiffnessMult: 1.6,
    dragMult: 1.25,
    gravityMult: 0.7,
    radiusMult: 1.12,
    joltAmount: 0,
    blendSpeed: 4.0,
  },
  EXCITED: {
    stiffnessMult: 2.0,
    dragMult: 1.35,
    gravityMult: 0.55,
    radiusMult: 1.2,
    joltAmount: 0,
    blendSpeed: 5.0,
  },
  SAD: {
    stiffnessMult: 0.45,
    dragMult: 1.4,
    gravityMult: 1.75,
    radiusMult: 0.85,
    joltAmount: 0,
    blendSpeed: 2.0,
  },
  TIRED: {
    stiffnessMult: 0.35,
    dragMult: 1.5,
    gravityMult: 2.0,
    radiusMult: 0.8,
    joltAmount: 0,
    blendSpeed: 1.5,
  },
  SURPRISED: {
    stiffnessMult: 1.15,
    dragMult: 1.0,
    gravityMult: 1.0,
    radiusMult: 1.2,
    joltAmount: 0.045,
    blendSpeed: 8.0,
  },
  FEAR: {
    stiffnessMult: 0.55,
    dragMult: 1.6,
    gravityMult: 1.4,
    radiusMult: 1.1,
    joltAmount: 0,
    blendSpeed: 3.0,
  },
  ANGRY: {
    stiffnessMult: 1.4,
    dragMult: 1.15,
    gravityMult: 0.9,
    radiusMult: 1.1,
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

  if (n.includes('skirt')) {
    return BoneGroup.SKIRT;
  }

  if (n.includes('coat') || n.includes('jacket') || n.includes('blazer')) {
    return BoneGroup.COAT;
  }

  // Loose/dangling fabric parts — hem, frill, lace, sleeve trim, etc.
  if (
    n.includes('hem') ||
    n.includes('frill') ||
    n.includes('lace') ||
    n.includes('sleeve') ||
    n.includes('cuff') ||
    n.includes('collar') ||
    n.includes('fabric') ||
    n.includes('drape') ||
    n.includes('train') ||
    n.includes('flounce')
  ) {
    return BoneGroup.SOFT_CLOTHING;
  }

  // Full-body garments
  if (
    n.includes('cloth') ||
    n.includes('dress') ||
    n.includes('gown') ||
    n.includes('robe') ||
    n.includes('apron') ||
    n.includes('cape') ||
    n.includes('cloak') ||
    n.includes('mantle') ||
    n.includes('tunic') ||
    n.includes('jumpsuit') ||
    n.includes('onesie') ||
    n.includes('overall')
  ) {
    return BoneGroup.SOFT_CLOTHING;
  }

  if (
    n.includes('ribbon') ||
    n.includes('bow') ||
    n.includes('tail') ||
    n.includes('accessory') ||
    n.includes('sash') ||
    n.includes('belt') ||
    n.includes('strap') ||
    n.includes('tie') ||
    n.includes('necklace')
  ) {
    return BoneGroup.ACCESSORIES;
  }

  if (n.includes('bust') || n.includes('breast') || n.includes('chest')) {
    return BoneGroup.BUST;
  }

  if (n.includes('hair')) {
    return BoneGroup.LONG_HAIR_BACK;
  }

  return BoneGroup.DEFAULT;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// ── Smart center bone finder ──
// Tries three strategies in order:
//   1. Direct humanoid bone node lookup
//   2. Walk parent chain for name match
//   3. World-position proximity — find the nearest standard body bone
//      that sits *above* the joint, so gravity pulls in local space.
function _findCenterBone(vrm, joint, preferredName) {
  // Strategy 1: direct humanoid bone lookup
  if (vrm.humanoid) {
    const direct =
      vrm.humanoid.getNormalizedBoneNode?.(preferredName) ??
      vrm.humanoid.getRawBoneNode?.(preferredName);
    if (direct) return direct;
  }

  // Strategy 2: walk parent chain looking for the preferred name
  {
    let node = joint.bone?.parent;
    for (let i = 0; i < 12 && node; i++) {
      const n = node.name?.toLowerCase() || '';
      if (n.includes(preferredName)) return node;
      node = node.parent;
    }
  }

  // Strategy 3: find the nearest standard body bone above the joint
  // by scanning all humanoid bones and picking the closest one that
  // sits higher (smaller y) in local space.
  if (vrm.humanoid) {
    const STANDARD_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'];
    const jointPos = new THREE.Vector3();
    const bonePos = new THREE.Vector3();
    joint.bone?.getWorldPosition(jointPos);

    let best = null;
    let bestDist = Infinity;
    for (const boneName of STANDARD_BONES) {
      const node =
        vrm.humanoid.getNormalizedBoneNode?.(boneName) ??
        vrm.humanoid.getRawBoneNode?.(boneName);
      if (!node) continue;
      bonePos.set(0, 0, 0);
      node.getWorldPosition(bonePos);
      if (bonePos.y >= jointPos.y - 0.05) {
        const dist = bonePos.distanceToSquared(jointPos);
        if (dist < bestDist) {
          bestDist = dist;
          best = node;
        }
      }
    }
    if (best) return best;
  }

  // Final fallback: walk all ancestors looking for any known body bone
  {
    const STANDARD_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'];
    let node = joint.bone?.parent;
    while (node) {
      const n = node.name?.toLowerCase() || '';
      if (STANDARD_BONES.some(b => n.includes(b))) return node;
      node = node.parent;
    }
  }

  return null;
}

export function useSpringBonePresets() {
  const vrmRef = useRef(null);
  const initializedRef = useRef(false);
  // Original model values read ONCE from the model. Never touched by init-tuning.
  // This prevents re-init corruption when init() is called multiple times.
  const originalJointValues = useRef(null);
  const baseJointState = useRef(new Map());
  const groupToJoints = useRef(new Map());
  const currentModifiers = useRef({
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
    radiusMult: 1.0,
  });
  const targetModifiers = useRef({
    stiffnessMult: 1.0,
    dragMult: 1.0,
    gravityMult: 1.0,
    radiusMult: 1.0,
  });
  const blendSpeedRef = useRef(3.0);
  const pendingJolt = useRef(null);
  const joltState = useRef({ active: false, velocity: 0, displacement: 0, phase: 0 });
  const unrecognizedBones = useRef(new Set());

  const init = useCallback((vrm) => {
    if (!vrm?.springBoneManager?.joints) {
      console.warn('[SpringBonePresets] No springBoneManager found on VRM');
      return;
    }

    // Idempotency guard: if we already initialized this VRM, skip.
    // Prevents re-reading of already-tuned values as "original" baselines.
    if (initializedRef.current && vrmRef.current === vrm) {
      console.log('[SpringBonePresets] Already initialized for this VRM');
      return;
    }
    initializedRef.current = true;
    vrmRef.current = vrm;
    baseJointState.current.clear();
    groupToJoints.current.clear();
    unrecognizedBones.current.clear();

    // Step 1: Read and cache ORIGINAL model values ONCE.
    // These are never mutated — always read fresh from here on re-init.
    if (!originalJointValues.current || vrmRef.current !== vrm) {
      const originals = [];
      for (const joint of vrm.springBoneManager.joints) {
        const s = joint.settings;
        originals.push({
          joint,
          stiffness: s.stiffness ?? 0.3,
          drag: s.dragForce ?? 0.5,
          gravity: s.gravityPower ?? 0.1,
          radius: s.hitRadius ?? 0.05,
        });
      }
      originalJointValues.current = originals;
    }

    // Step 2: Collect joints into groups, preserve original model values
    const groupEntries = {};
    let totalJoints = 0;

    for (const entry of originalJointValues.current) {
      const joint = entry.joint;
      const group = classifyJointByBoneName(joint.bone?.name || 'unnamed');

      if (group === BoneGroup.DEFAULT) {
        unrecognizedBones.current.add(joint.bone?.name || 'unnamed');
      }

      if (!groupEntries[group]) groupEntries[group] = [];
      groupEntries[group].push({ joint, orig: entry });
      totalJoints++;
    }

    // Step 2: For each group, compute multipliers relative to model's original values
    for (const [group, entries] of Object.entries(groupEntries)) {
      const preset = SPRING_BONE_PRESETS[group];
      const n = entries.length;

      // Compute group-wise averages of original values
      const avg = entries.reduce((a, e) => ({
        stiffness: a.stiffness + e.orig.stiffness / n,
        drag: a.drag + e.orig.drag / n,
        gravity: a.gravity + e.orig.gravity / n,
        radius: a.radius + e.orig.radius / n,
      }), { stiffness: 0, drag: 0, gravity: 0, radius: 0 });

      // Derive multipliers to reach preset targets from model baseline.
      // Clamp to reasonable range so we don't multiply a near-zero original to infinity.
      const multStiffness = clamp(preset.stiffness / Math.max(avg.stiffness, 0.01), 0.1, 8.0);
      const multDrag = clamp(preset.dragForce / Math.max(avg.drag, 0.01), 0.1, 8.0);
      const multGravity = clamp(preset.gravityPower / Math.max(avg.gravity, 0.001), 0.1, 10.0);
      const multRadius = clamp(preset.hitRadius / Math.max(avg.radius, 0.001), 0.1, 8.0);

      // Pre-allocate array for this group
      if (!groupToJoints.current.has(group)) {
        groupToJoints.current.set(group, []);
      }
      const groupArray = groupToJoints.current.get(group);

      for (const { joint, orig } of entries) {
        // Apply: tuned_value = original_value * group_multiplier
        const tunedStiffness = clamp(orig.stiffness * multStiffness, 0.01, 1.0);
        const tunedDrag = clamp(orig.drag * multDrag, 0.01, 0.95);
        const tunedGravity = clamp(orig.gravity * multGravity, 0.0, 2.0);
        const tunedRadius = clamp(orig.radius * multRadius, 0.01, 0.3);

        const settings = joint.settings;
        settings.stiffness = tunedStiffness;
        settings.dragForce = tunedDrag;
        settings.gravityPower = tunedGravity;
        settings.hitRadius = tunedRadius;

        // Apply per-group gravity direction
        if (preset.gravityDir) {
          const gd = settings.gravityDir;
          if (gd) {
            gd.set(preset.gravityDir[0], preset.gravityDir[1], preset.gravityDir[2]);
          }
        }

        // Set center bone for local-space physics stability.
        if (preset.centerBone) {
          let center = _findCenterBone(vrm, joint, preset.centerBone);
          if (center && joint.center !== center) {
            joint.center = center;
          }
        }

        // Store tuned values as the base (emotion modifiers multiply on top)
        baseJointState.current.set(joint, {
          group,
          baseStiffness: tunedStiffness,
          baseDrag: tunedDrag,
          baseGravity: tunedGravity,
          baseRadius: tunedRadius,
          originalStiffness: orig.stiffness,
          originalDrag: orig.drag,
          originalGravity: orig.gravity,
          originalRadius: orig.radius,
          stiffnessMult: multStiffness,
          dragMult: multDrag,
          gravityMult: multGravity,
          radiusMult: multRadius,
        });

        groupArray.push(joint);
      }
    }

    currentModifiers.current = { stiffnessMult: 1.0, dragMult: 1.0, gravityMult: 1.0, radiusMult: 1.0 };
    targetModifiers.current = { stiffnessMult: 1.0, dragMult: 1.0, gravityMult: 1.0, radiusMult: 1.0 };
    blendSpeedRef.current = 3.0;

    // Log unrecognized bones for debugging
    if (unrecognizedBones.current.size > 0) {
      console.log('[SpringBonePresets] Unrecognized spring bones (using DEFAULT):',
        [...unrecognizedBones.current].join(', '));
    }

    // Log per-group stats
    const stats = {};
    for (const [group, joints] of groupToJoints.current.entries()) {
      if (joints.length > 0) {
        stats[group] = { count: joints.length, ...SPRING_BONE_PRESETS[group] };
      }
    }
    console.log('[SpringBonePresets] Initialized', totalJoints, 'joints');
    for (const [g, s] of Object.entries(stats)) {
      const j = groupEntries[g];
      if (!j || j.length === 0) continue;
      const avg = j.reduce((a, e) => ({
        stiffness: a.stiffness + e.orig.stiffness / j.length,
        drag: a.drag + e.orig.drag / j.length,
        gravity: a.gravity + e.orig.gravity / j.length,
        radius: a.radius + e.orig.radius / j.length,
      }), { stiffness: 0, drag: 0, gravity: 0, radius: 0 });
      const mult = baseJointState.current.get(j[0].joint);
      console.log(`  ${s.label}: ${j.length} joints | orig: s=${avg.stiffness.toFixed(3)} d=${avg.drag.toFixed(3)} g=${avg.gravity.toFixed(3)} r=${avg.radius.toFixed(3)} | mult: ${mult?.stiffnessMult?.toFixed(2)}x/d${mult?.dragMult?.toFixed(2)}x/g${mult?.gravityMult?.toFixed(2)}x/r${mult?.radiusMult?.toFixed(2)}x`);
    }

    return { baseJointState: baseJointState.current, groupToJoints: groupToJoints.current };
  }, []);

  // ── Runtime tuning: update base values for a specific group ──
  // Instead of storing absolute target values, we update the baseStiffness/etc directly,
  // so emotion modifiers still stack on top.
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
      if (!state) continue;

      if (stiffness != null && !isNaN(stiffness)) {
        state.baseStiffness = stiffness;
        settings.stiffness = stiffness * currentModifiers.current.stiffnessMult;
      }
      if (dragForce != null && !isNaN(dragForce)) {
        state.baseDrag = dragForce;
        settings.dragForce = Math.min(0.95, dragForce * currentModifiers.current.dragMult);
      }
      if (gravityPower != null && !isNaN(gravityPower)) {
        state.baseGravity = gravityPower;
        settings.gravityPower = gravityPower * currentModifiers.current.gravityMult;
      }
      if (hitRadius != null && !isNaN(hitRadius)) {
        state.baseRadius = hitRadius;
        settings.hitRadius = hitRadius;
      }
      updated++;
    }

    return updated;
  }, []);

  const applyEmotionPhysics = useCallback((emotionName) => {
    const emotion = EMOTION_MAP[emotionName?.toLowerCase()] || EmotionPhysics.NEUTRAL;

    targetModifiers.current = {
      stiffnessMult: emotion.stiffnessMult,
      dragMult: emotion.dragMult,
      gravityMult: emotion.gravityMult,
      radiusMult: emotion.radiusMult,
    };
    blendSpeedRef.current = emotion.blendSpeed;

    if (emotion.joltAmount > 0) {
      pendingJolt.current = emotion.joltAmount;
    }
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
    if (Math.abs(cur.radiusMult - tgt.radiusMult) > 0.001) {
      cur.radiusMult += (tgt.radiusMult - cur.radiusMult) * lerpFactor;
      needsReapply = true;
    }

    // Jolt effect (hips bounce for surprised etc.)
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

    if (!needsReapply) return;

    // Only iterate joints that belong to tracked groups (not all joints)
    for (const [, joints] of groupToJoints.current.entries()) {
      for (const joint of joints) {
        const state = baseJointState.current.get(joint);
        if (!state) continue;

        const settings = joint.settings;
        settings.stiffness = state.baseStiffness * cur.stiffnessMult;
        settings.dragForce = Math.min(0.95, state.baseDrag * cur.dragMult);
        settings.gravityPower = state.baseGravity * cur.gravityMult;
        settings.hitRadius = clamp(state.baseRadius * cur.radiusMult, 0.01, 0.3);
      }
    }
  }, []);

  const getCurrentModifiers = useCallback(() => ({
    stiffnessMult: currentModifiers.current.stiffnessMult,
    dragMult: currentModifiers.current.dragMult,
    gravityMult: currentModifiers.current.gravityMult,
    radiusMult: currentModifiers.current.radiusMult,
  }), []);

  // Export the original values and multipliers for the tuning UI
  const getJointStats = useCallback(() => {
    const stats = {};
    for (const [group, joints] of groupToJoints.current.entries()) {
      if (joints.length > 0) {
        const firstState = baseJointState.current.get(joints[0]);
        stats[group] = {
          count: joints.length,
          label: SPRING_BONE_PRESETS[group]?.label || group,
          originalValues: firstState ? {
            stiffness: firstState.originalStiffness,
            drag: firstState.originalDrag,
            gravity: firstState.originalGravity,
            radius: firstState.originalRadius,
          } : null,
          tunedValues: firstState ? {
            stiffness: firstState.baseStiffness,
            drag: firstState.baseDrag,
            gravity: firstState.baseGravity,
            radius: firstState.baseRadius,
          } : null,
          multipliers: firstState ? {
            stiffness: firstState.stiffnessMult,
            drag: firstState.dragMult,
            gravity: firstState.gravityMult,
            radius: firstState.radiusMult,
          } : null,
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
    groupToJoints,
  };
}

export default useSpringBonePresets;
