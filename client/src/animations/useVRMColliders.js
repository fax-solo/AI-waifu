/**
 * useVRMColliders - Interactive Collider Pipeline
 *
 * Implements the second pillar:
 * - Mouse-to-Bone: Raycast cursor → 3D sphere collider for "petting" interaction
 * - Body Collision Setup: Auto-detect shoulders/chest/arms for anti-clipping colliders
 */

import { useRef, useCallback } from 'react';
import * as THREE from 'three';

// VRMSpringBoneManager.colliderGroups is getter-only — must mutate the internal
// array in-place rather than reassigning the property.
function replaceColliderGroups(manager, newGroups) {
  const arr = manager.colliderGroups;
  arr.length = 0;
  for (let i = 0; i < newGroups.length; i++) arr.push(newGroups[i]);
}

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

function makeColliderGroup(node, spheres) {
  return {
    node,
    colliders: spheres.map((s) => ({
      radius: s.radius,
      offset: new THREE.Vector3(s.offsetX ?? 0, s.offsetY ?? 0, s.offsetZ ?? 0),
      shape: 'sphere',
    })),
  };
}

function scaleDefSpheres(def, scale) {
  return def.spheres.map((s) => ({
    radius: s.radius * scale,
    offsetX: (s.offsetX ?? 0) * scale,
    offsetY: (s.offsetY ?? 0) * scale,
    offsetZ: (s.offsetZ ?? 0) * scale,
  }));
}

const BODY_COLLIDER_DEFS = [
  {
    bone: 'chest',
    spheres: [
      { radius: 0.12, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.10, offsetX: 0, offsetY: 0.05, offsetZ: -0.02 },
    ],
    label: 'Chest',
  },
  {
    bone: 'upperChest',
    spheres: [
      { radius: 0.11, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Upper Chest',
    fallback: 'chest',
  },
  {
    bone: 'leftShoulder',
    spheres: [
      { radius: 0.08, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Left Shoulder',
  },
  {
    bone: 'rightShoulder',
    spheres: [
      { radius: 0.08, offsetX: 0, offsetY: 0, offsetZ: 0 },
    ],
    label: 'Right Shoulder',
  },
  {
    bone: 'leftUpperArm',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: -0.06, offsetZ: 0 },
      { radius: 0.055, offsetX: 0, offsetY: -0.14, offsetZ: 0 },
    ],
    label: 'Left Upper Arm',
  },
  {
    bone: 'rightUpperArm',
    spheres: [
      { radius: 0.06, offsetX: 0, offsetY: -0.06, offsetZ: 0 },
      { radius: 0.055, offsetX: 0, offsetY: -0.14, offsetZ: 0 },
    ],
    label: 'Right Upper Arm',
  },
  {
    bone: 'neck',
    spheres: [
      { radius: 0.05, offsetX: 0, offsetY: 0.02, offsetZ: 0 },
    ],
    label: 'Neck',
    fallback: 'head',
  },
  {
    bone: 'head',
    spheres: [
      { radius: 0.09, offsetX: 0, offsetY: 0.04, offsetZ: -0.01 },
    ],
    label: 'Head',
  },
  {
    bone: 'hips',
    spheres: [
      { radius: 0.14, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.12, offsetX: 0, offsetY: -0.08, offsetZ: 0 },
    ],
    label: 'Pelvis/Hips',
    fallback: 'pelvis',
  },
  {
    bone: 'leftThigh',
    spheres: [
      { radius: 0.08, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.07, offsetX: 0, offsetY: -0.10, offsetZ: 0 },
    ],
    label: 'Left Thigh',
    fallback: 'leftUpperLeg',
  },
  {
    bone: 'rightThigh',
    spheres: [
      { radius: 0.08, offsetX: 0, offsetY: 0, offsetZ: 0 },
      { radius: 0.07, offsetX: 0, offsetY: -0.10, offsetZ: 0 },
    ],
    label: 'Right Thigh',
    fallback: 'rightUpperLeg',
  },
];

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
  const originalColliderGroups = useRef(null);
  const ourColliderCount = useRef(0);

  const debugMesh = useRef(null);

  const init = useCallback((vrm, scene, camera) => {
    if (!vrm) return;

    vrmRef.current = vrm;
    sceneRef.current = scene;
    cameraRef.current = camera;

    if (vrm.springBoneManager) {
      if (!originalColliderGroups.current) {
        originalColliderGroups.current = [
          ...(vrm.springBoneManager.colliderGroups || []),
        ];
      }
    }

    setupCursorCollider(vrm);
    const bodyCount = setupBodyColliders(vrm);

    if (vrm.springBoneManager) {
      const allGroups = [
        ...originalColliderGroups.current,
        ...bodyColliderGroups.current,
        ...(cursorColliderGroup.current ? [cursorColliderGroup.current] : []),
      ];
      replaceColliderGroups(vrm.springBoneManager, allGroups);
      ourColliderCount.current = bodyColliderGroups.current.length + (cursorColliderGroup.current ? 1 : 0);

      console.log(`[VRMColliders] Initialized: ${bodyCount} body collider groups + 1 cursor collider`);
    } else {
      console.warn('[VRMColliders] No springBoneManager available — colliders will not affect physics');
    }

    return true;
  }, []);

  function setupCursorCollider(vrm) {
    const cursorNode = new THREE.Object3D();
    cursorNode.name = 'CursorColliderRoot';

    cursorDummyNode.current = cursorNode;
    cursorWorldPos.current.set(0, 1.0, 0);
    cursorSmoothPos.current.set(0, 1.0, 0);

    const group = {
      node: cursorNode,
      colliders: [
        {
          radius: 0.08,
          offset: new THREE.Vector3(0, 0, 0),
          shape: 'sphere',
        },
      ],
    };

    cursorColliderGroup.current = group;

    if (vrm.springBoneManager && sceneRef.current) {
      sceneRef.current.add(cursorNode);
    }
  }

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

      // Scale collider radii to the bone's world-scale — VRoid models ship
      // at various scales and static radii that work for one break for another
      const scale = getBoneWorldScale(vrm, def.bone);
      const scaledSpheres = scaleDefSpheres(def, scale);
      const group = makeColliderGroup(bone, scaledSpheres);
      bodyColliderGroups.current.push(group);
      addedCount++;
      console.log(`[VRMColliders] Added ${def.label} collider (${def.spheres.length} sphere(s), scale=${scale.toFixed(2)})`);
    }

    return addedCount;
  }

  const updateCursorFromScreen = useCallback((mouseX, mouseY, camera, targetDistance = 2.5) => {
    if (!cursorDummyNode.current) return;

    const ray = raycaster.current;
    ray.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

    const centerRay = new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()).normalize());
    const lookAtPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    lookAtPlane.normal.copy(centerRay.direction).negate();
    lookAtPlane.constant = -centerRay.direction.dot(
      centerRay.at(targetDistance, new THREE.Vector3())
    );

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
    }

    if (debugMesh.current) {
      debugMesh.current.position.copy(cursorSmoothPos.current);
    }

    if (vrm.springBoneManager && cursorColliderGroup.current) {
      const groups = vrm.springBoneManager.colliderGroups || [];
      const hasOurCursor = groups.includes(cursorColliderGroup.current);

      if (!hasOurCursor) {
        replaceColliderGroups(vrm.springBoneManager, [
          ...originalColliderGroups.current,
          ...bodyColliderGroups.current,
          cursorColliderGroup.current,
        ]);
      }
    }
  }, [updateCursorFromScreen]);

  const setCursorRadius = useCallback((radius) => {
    if (cursorColliderGroup.current?.colliders?.[0]) {
      cursorColliderGroup.current.colliders[0].radius = radius;
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
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      sceneRef.current.add(mesh);
      debugMesh.current = mesh;
      console.log('[VRMColliders] Debug visualization enabled');
    } else if (!enabled && debugMesh.current) {
      sceneRef.current.remove(debugMesh.current);
      debugMesh.current.geometry?.dispose?.();
      debugMesh.current.material?.dispose?.();
      debugMesh.current = null;
      console.log('[VRMColliders] Debug visualization disabled');
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

    if (vrmRef.current?.springBoneManager && originalColliderGroups.current) {
      replaceColliderGroups(vrmRef.current.springBoneManager, originalColliderGroups.current);
    }

    cursorColliderGroup.current = null;
    cursorDummyNode.current = null;
    bodyColliderGroups.current = [];
    vrmRef.current = null;
  }, []);

  /**
   * Auto-init just the body colliders (no cursor, no scene/camera dependency).
   * Called from useVRM.js after model load for one-shot collider generation.
   */
  const initFromVRM = useCallback((vrm) => {
    if (!vrm?.springBoneManager) {
      console.warn('[VRMColliders] initFromVRM: no springBoneManager');
      return;
    }

    if (!originalColliderGroups.current) {
      originalColliderGroups.current = [
        ...(vrm.springBoneManager.colliderGroups || []),
      ];
    }

    const count = setupBodyColliders(vrm);
    replaceColliderGroups(vrm.springBoneManager, [
      ...originalColliderGroups.current,
      ...bodyColliderGroups.current,
    ]);

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
  };
}

export default useVRMColliders;
