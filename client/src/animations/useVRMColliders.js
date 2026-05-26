import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere,
} from '@pixiv/three-vrm-springbone';

// ─── Bone type classification (mirrors useSpringBonePresets) ───
const BoneGroup = {
  SKIRT: 'skirt',
  LONG_HAIR_BACK: 'longHairBack',
  SHORT_HAIR_BANGS: 'shortHairBangs',
  SOFT_CLOTHING: 'softClothing',
  BUST: 'bust',
  COAT: 'coat',
  ACCESSORIES: 'accessories',
  DEFAULT: 'default',
};

function classifyJoint(boneName) {
  const n = (boneName || '').toLowerCase();
  if (n.includes('skirt')) return BoneGroup.SKIRT;
  if (n.includes('coat') || n.includes('jacket')) return BoneGroup.COAT;
  if (n.includes('cloth') || n.includes('dress')) return BoneGroup.SOFT_CLOTHING;
  if (n.includes('bust') || n.includes('breast')) return BoneGroup.BUST;
  if (n.includes('ribbon') || n.includes('tail') || n.includes('accessory')) return BoneGroup.ACCESSORIES;
  if (
    n.includes('hair_back') || n.includes('back_hair') || n.includes('longhair') ||
    (n.includes('hair') && (n.includes('_b_') || n.includes('_back')))
  ) return BoneGroup.LONG_HAIR_BACK;
  if (
    n.includes('bangs') || n.includes('front_hair') || n.includes('hair_front') ||
    n.includes('shorthair') || (n.includes('hair') && (n.includes('_f_') || n.includes('_front'))) ||
    n.includes('ahoge')
  ) return BoneGroup.SHORT_HAIR_BANGS;
  if (n.includes('hair')) return BoneGroup.LONG_HAIR_BACK;
  return BoneGroup.DEFAULT;
}

// ─── Collider index map per bone group ───
// Indices into the built BODY_COLLIDER_GROUPS array
const COLLIDER_MAP = {
  [BoneGroup.SKIRT]: [0, 1, 2, 3, 4, 5, 6], // hips, leftThigh, rightThigh, leftShin, rightShin, leftShinLow, rightShinLow
  [BoneGroup.LONG_HAIR_BACK]: [7, 8, 9, 10, 11, 12], // head, neck, chest, upperChest, spineLow, spineMid
  [BoneGroup.SHORT_HAIR_BANGS]: [7, 8, 9, 10], // head, neck, chest, upperChest
  [BoneGroup.COAT]: [9, 10, 13, 14, 15, 16, 17, 18], // chest, upperChest, leftShoulder, rightShoulder, leftUpperArm, rightUpperArm, leftElbow, rightElbow
  [BoneGroup.SOFT_CLOTHING]: [9, 10, 0, 1, 2], // chest, upperChest, hips, leftThigh, rightThigh
  [BoneGroup.ACCESSORIES]: [7, 9], // head, chest
  [BoneGroup.BUST]: [9, 10], // chest, upperChest
  [BoneGroup.DEFAULT]: [], // no body colliders
};

// ─── Body collider definitions ───
const BODY_COLLIDER_DEFS = [
  // 0-2: Hips / Pelvis
  {
    bone: 'hips',
    spheres: [
      { radius: 0.10, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.08, offsetX: 0, offsetY: -0.08, offsetZ: 0 },
    ],
    label: 'Pelvis/Hips',
    fallback: 'pelvis',
  },
  // 1: Left Upper Leg
  {
    bone: 'leftUpperLeg',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.055, offsetX: 0, offsetY: -0.10, offsetZ: 0 },
    ],
    label: 'Left Thigh',
    fallback: null,
  },
  // 2: Right Upper Leg
  {
    bone: 'rightUpperLeg',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.055, offsetX: 0, offsetY: -0.10, offsetZ: 0 },
    ],
    label: 'Right Thigh',
    fallback: null,
  },
  // 3: Left Lower Leg (prevents skirt clipping below thigh)
  {
    bone: 'leftLowerLeg',
    spheres: [
      { radius: 0.055, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.045, offsetX: 0, offsetY: -0.12, offsetZ: 0 },
    ],
    label: 'Left Shin',
    fallback: null,
  },
  // 4: Right Lower Leg
  {
    bone: 'rightLowerLeg',
    spheres: [
      { radius: 0.055, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.045, offsetX: 0, offsetY: -0.12, offsetZ: 0 },
    ],
    label: 'Right Shin',
    fallback: null,
  },
  // 5: Left Lower Leg extra low (for long skirts)
  {
    bone: 'leftLowerLeg',
    spheres: [
      { radius: 0.04, offsetX: 0, offsetY: -0.25, offsetZ: 0 },
    ],
    label: 'Left Shin Low',
    fallback: null,
  },
  // 6: Right Lower Leg extra low
  {
    bone: 'rightLowerLeg',
    spheres: [
      { radius: 0.04, offsetX: 0, offsetY: -0.25, offsetZ: 0 },
    ],
    label: 'Right Shin Low',
    fallback: null,
  },
  // 7: Head
  {
    bone: 'head',
    spheres: [
      { radius: 0.07, offsetX: 0, offsetY: 0.04, offsetZ: 0 },
    ],
    label: 'Head',
  },
  // 8: Neck
  {
    bone: 'neck',
    spheres: [
      { radius: 0.04, offsetX: 0, offsetY: 0.02, offsetZ: 0 },
    ],
    label: 'Neck',
    fallback: 'head',
  },
  // 9: Chest
  {
    bone: 'chest',
    spheres: [
      { radius: 0.09, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.08, offsetX: 0, offsetY: 0.05, offsetZ: -0.02 },
    ],
    label: 'Chest',
  },
  // 10: Upper Chest
  {
    bone: 'upperChest',
    spheres: [
      { radius: 0.08, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Upper Chest',
    fallback: 'chest',
  },
  // 11: Spine low (back, for hair collision)
  {
    bone: 'spine',
    spheres: [
      { radius: 0.07, offsetX: 0, offsetY: 0.02, offsetZ: 0.06 },
    ],
    label: 'Spine Low',
    fallback: 'hips',
  },
  // 12: Spine mid (mid-back, for hair collision)
  {
    bone: 'chest',
    spheres: [
      { radius: 0.07, offsetX: 0, offsetY: -0.06, offsetZ: 0.04 },
    ],
    label: 'Spine Mid',
  },
  // 13: Left Shoulder
  {
    bone: 'leftShoulder',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Left Shoulder',
  },
  // 14: Right Shoulder
  {
    bone: 'rightShoulder',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Right Shoulder',
  },
  // 15: Left Upper Arm
  {
    bone: 'leftUpperArm',
    spheres: [
      { radius: 0.05, offsetX: 0, offsetY: -0.06, offsetZ: 0 },
      { radius: 0.045, offsetX: 0, offsetY: -0.14, offsetZ: 0 },
    ],
    label: 'Left Upper Arm',
  },
  // 16: Right Upper Arm
  {
    bone: 'rightUpperArm',
    spheres: [
      { radius: 0.05, offsetX: 0, offsetY: -0.06, offsetZ: 0 },
      { radius: 0.045, offsetX: 0, offsetY: -0.14, offsetZ: 0 },
    ],
    label: 'Right Upper Arm',
  },
  // 17: Left Elbow (for sleeve/hair collision)
  {
    bone: 'leftLowerArm',
    spheres: [
      { radius: 0.04, offsetX: 0, offsetY: -0.08, offsetZ: 0 },
    ],
    label: 'Left Elbow',
    fallback: 'leftUpperArm',
  },
  // 18: Right Elbow
  {
    bone: 'rightLowerArm',
    spheres: [
      { radius: 0.04, offsetX: 0, offsetY: -0.08, offsetZ: 0 },
    ],
    label: 'Right Elbow',
    fallback: 'rightUpperArm',
  },
];

function getBone(vrm, name) {
  if (!vrm) return null;
  if (vrm.humanoid) {
    return vrm.humanoid.getNormalizedBoneNode?.(name) ?? vrm.humanoid.getRawBoneNode?.(name) ?? null;
  }
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

function getBoneWorldScale(vrm, name) {
  const bone = getBone(vrm, name);
  if (!bone) return 1;
  const scale = new THREE.Vector3();
  bone.getWorldScale(scale);
  return (scale.x + scale.y + scale.z) / 3;
}

function scaleDefSpheres(def, scale) {
  return def.spheres.map((s) => ({
    radius: s.radius * scale,
    offsetX: (s.offsetX ?? 0) * scale,
    offsetY: (s.offsetY ?? 0) * scale,
    offsetZ: (s.offsetZ ?? 0) * scale,
  }));
}

function createSphereCollider(bone, params) {
  const shape = new VRMSpringBoneColliderShapeSphere({
    offset: new THREE.Vector3(params.offsetX ?? 0, params.offsetY ?? 0, params.offsetZ ?? 0),
    radius: params.radius,
  });
  const collider = new VRMSpringBoneCollider(shape);
  bone.add(collider);
  return collider;
}

function colliderGroupFromDef(bone, def, scale) {
  const scaled = scaleDefSpheres(def, scale);
  const colliders = scaled.map((s) => createSphereCollider(bone, s));
  return { colliders, node: bone };
}

export function useVRMColliders() {
  const vrmRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  const raycaster = useRef(new THREE.Raycaster());
  const cursorWorldPos = useRef(new THREE.Vector3(0, 1.0, 0));
  const cursorSmoothPos = useRef(new THREE.Vector3(0, 1.0, 0));
  const cursorColliderGroup = useRef(null);
  const cursorDummyNode = useRef(null);

  const bodyColliderGroups = useRef([]);
  const debugMesh = useRef(null);
  const hasCustomColliders = useRef(false);

  // ── Build body colliders with proper VRMSpringBoneCollider instances ──
  function setupBodyColliders(vrm) {
    bodyColliderGroups.current = [];
    let addedCount = 0;

    for (const def of BODY_COLLIDER_DEFS) {
      let bone = getBone(vrm, def.bone);
      if (!bone && def.fallback) {
        bone = getBone(vrm, def.fallback);
      }
      if (!bone) {
        console.log(`[VRMColliders] Skipping ${def.label} — bone not found`);
        continue;
      }

      const scale = getBoneWorldScale(vrm, def.bone);
      const group = colliderGroupFromDef(bone, def, scale);
      bodyColliderGroups.current.push(group);
      addedCount++;
      hasCustomColliders.current = true;
      console.log(`[VRMColliders] Added ${def.label} collider (${def.spheres.length} sphere(s), scale=${scale.toFixed(2)})`);
    }

    return addedCount;
  }

  // ── Assign body colliders to relevant joints ──
  function assignCollidersToJoints(manager) {
    let assigned = 0;
    for (const joint of manager.joints) {
      const boneName = joint.bone.name;
      const group = classifyJoint(boneName);
      const indices = COLLIDER_MAP[group] || [];
      for (const idx of indices) {
        const cg = bodyColliderGroups.current[idx];
        if (cg && !joint.colliderGroups.includes(cg)) {
          joint.colliderGroups.push(cg);
          assigned++;
        }
      }
    }
    return assigned;
  }

  // ── Assign cursor collider to all joints ──
  function assignCursorToAllJoints(manager, cursorGroup) {
    let assigned = 0;
    for (const joint of manager.joints) {
      if (!joint.colliderGroups.includes(cursorGroup)) {
        joint.colliderGroups.push(cursorGroup);
        assigned++;
      }
    }
    return assigned;
  }

  // ── Full init (with scene/camera for cursor) ──
  const init = useCallback((vrm, scene, camera) => {
    if (!vrm) return;
    vrmRef.current = vrm;
    sceneRef.current = scene;
    cameraRef.current = camera;

    setupBodyColliders(vrm);
    setupCursorCollider(vrm);

    if (vrm.springBoneManager) {
      assignCollidersToJoints(vrm.springBoneManager);
      console.log(`[VRMColliders] Initialized: ${bodyColliderGroups.current.length} body collider groups`);
    } else {
      console.warn('[VRMColliders] No springBoneManager available');
    }

    return true;
  }, []);

  // ── Cursor collider setup ──
  function setupCursorCollider(vrm) {
    const cursorNode = new THREE.Object3D();
    cursorNode.name = 'CursorColliderRoot';
    cursorDummyNode.current = cursorNode;
    cursorWorldPos.current.set(0, 1.0, 0);
    cursorSmoothPos.current.set(0, 1.0, 0);

    const shape = new VRMSpringBoneColliderShapeSphere({
      offset: new THREE.Vector3(0, 0, 0),
      radius: 0.08,
    });
    const collider = new VRMSpringBoneCollider(shape);
    cursorNode.add(collider);

    const group = {
      colliders: [collider],
      node: cursorNode,
    };
    cursorColliderGroup.current = group;

    if (vrm.springBoneManager && sceneRef.current) {
      sceneRef.current.add(cursorNode);
      assignCursorToAllJoints(vrm.springBoneManager, group);
    }
  }

  // ── Cursor update ──
  const updateCursorFromScreen = useCallback((mouseX, mouseY, camera, targetDistance = 2.5) => {
    if (!cursorDummyNode.current) return;
    const ray = raycaster.current;
    ray.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const centerRay = new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()).normalize());
    const lookAtPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    lookAtPlane.normal.copy(centerRay.direction).negate();
    lookAtPlane.constant = -centerRay.direction.dot(centerRay.at(targetDistance, new THREE.Vector3()));
    const targetPoint = new THREE.Vector3();
    ray.ray.intersectPlane(lookAtPlane, targetPoint);
    if (targetPoint) {
      const dist = camera.position.distanceTo(targetPoint);
      if (dist > 0.5 && dist < 10.0) {
        cursorWorldPos.current.copy(targetPoint);
      }
    }
  }, []);

  const update = useCallback((deltaTime, vrm, { mouseX = 0, mouseY = 0, mouseMoving = false, camera = null } = {}) => {
    if (!vrm) return;
    const dt = Math.min(Math.max(deltaTime, 0), 0.05);
    const cam = camera || cameraRef.current;
    if (mouseMoving && cam) {
      updateCursorFromScreen(mouseX, mouseY, cam);
    }
    const smoothSpeed = mouseMoving ? 15.0 : 10.0;
    const lerpFactor = Math.min(1, dt * smoothSpeed);
    cursorSmoothPos.current.lerp(cursorWorldPos.current, lerpFactor);
    if (cursorDummyNode.current) {
      cursorDummyNode.current.position.copy(cursorSmoothPos.current);
      cursorDummyNode.current.updateMatrixWorld(true);
    }
    if (debugMesh.current) {
      debugMesh.current.position.copy(cursorSmoothPos.current);
    }

    // Re-assign cursor collider to any new joints that don't have it
    if (vrm.springBoneManager && cursorColliderGroup.current) {
      let needsReassign = false;
      for (const joint of vrm.springBoneManager.joints) {
        if (!joint.colliderGroups.includes(cursorColliderGroup.current)) {
          needsReassign = true;
          break;
        }
      }
      // Only re-assign if the cursor got dropped by a model reset
      if (needsReassign) {
        assignCursorToAllJoints(vrm.springBoneManager, cursorColliderGroup.current);
      }
    }
  }, [updateCursorFromScreen]);

  const setCursorRadius = useCallback((radius) => {
    if (cursorColliderGroup.current?.colliders?.[0]?.shape) {
      const c = cursorColliderGroup.current.colliders[0];
      c.shape.radius = radius;
      console.log(`[VRMColliders] Cursor collider radius: ${radius.toFixed(3)}`);
    }
    if (debugMesh.current) {
      debugMesh.current.scale.setScalar(radius / 0.08);
    }
  }, []);

  const toggleDebugVisualization = useCallback((enabled) => {
    if (!sceneRef.current) return;
    if (enabled && !debugMesh.current) {
      const geo = new THREE.SphereGeometry(0.08, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, transparent: true, opacity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      sceneRef.current.add(mesh);
      debugMesh.current = mesh;
      console.log('[VRMColliders] Debug visualization enabled');
    } else if (!enabled && debugMesh.current) {
      sceneRef.current.remove(debugMesh.current);
      debugMesh.current.geometry?.dispose?.();
      debugMesh.current.material?.dispose?.();
      debugMesh.current = null;
    }
  }, []);

  const getCursorWorldPosition = useCallback(() => ({
    x: cursorSmoothPos.current.x,
    y: cursorSmoothPos.current.y,
    z: cursorSmoothPos.current.z,
  }), []);

  const dispose = useCallback(() => {
    if (debugMesh.current && sceneRef.current) {
      sceneRef.current.remove(debugMesh.current);
      debugMesh.current.geometry?.dispose?.();
      debugMesh.current.material?.dispose?.();
      debugMesh.current = null;
    }
    if (cursorDummyNode.current && sceneRef.current) {
      sceneRef.current.remove(cursorDummyNode.current);
    }
    cursorColliderGroup.current = null;
    cursorDummyNode.current = null;
    bodyColliderGroups.current = [];
    vrmRef.current = null;
  }, []);

  // ── initFromVRM for model-load-time init (no cursor) ──
  const initFromVRM = useCallback((vrm) => {
    if (!vrm?.springBoneManager) {
      console.warn('[VRMColliders] initFromVRM: no springBoneManager');
      return;
    }

    const count = setupBodyColliders(vrm);
    assignCollidersToJoints(vrm.springBoneManager);

    console.log(`[VRMColliders] initFromVRM: added ${count} body collider groups`);
  }, []);

  return {
    init,
    update,
    dispose,
    setCursorRadius,
    toggleDebugVisualization,
    getCursorWorldPosition,
    initFromVRM,
    hasCustomColliders,
  };
}

export default useVRMColliders;
