import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';

const COLLISION_BONES = [
  'chest', 'upperChest', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg',
  'rightUpperLeg', 'rightLowerLeg',
];

const SPHERE_BONES = new Set(['head', 'leftHand', 'rightHand']);

const BONE_PARENTS = {
  chest: null, upperChest: 'chest',
  head: 'upperChest',
  leftShoulder: 'chest', leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'chest', rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: null, leftLowerLeg: 'leftUpperLeg',
  rightUpperLeg: null, rightLowerLeg: 'rightUpperLeg',
};

const SMOOTHING_FACTOR = 0.25;
const MAX_CORRECTION = 0.003;
const PROXIMITY_MARGIN = 1.25;
const NOISE_FLOOR = 0.0001;

const BONE_CHILDREN = {};
for (const [child, parent] of Object.entries(BONE_PARENTS)) {
  if (!parent) continue;
  (BONE_CHILDREN[parent] ||= []).push(child);
}
for (const name of COLLISION_BONES) {
  if (!BONE_CHILDREN[name]) BONE_CHILDREN[name] = [];
}

function getAncestors(name) {
  const chain = [];
  let cur = BONE_PARENTS[name];
  while (cur) {
    chain.push(cur);
    cur = BONE_PARENTS[cur];
  }
  return chain;
}

function buildForbiddenPairs() {
  const forbidden = new Set();
  for (const name of COLLISION_BONES) {
    for (const anc of getAncestors(name)) {
      if (COLLISION_BONES.includes(anc) || BONE_PARENTS[anc]) {
        forbidden.add(`${name}|${anc}`);
        forbidden.add(`${anc}|${name}`);
      }
    }
  }
  return forbidden;
}

const FORBIDDEN_PAIRS = buildForbiddenPairs();

function isForbidden(name1, name2) {
  return FORBIDDEN_PAIRS.has(`${name1}|${name2}`);
}

function getBoneNode(vrm, name) {
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

function getCapsuleExtents(vrm, name) {
  const bone = getBoneNode(vrm, name);
  if (!bone) return { halfHeight: 0.08, radius: 0.04, centerY: 0 };
  const children = BONE_CHILDREN[name] || [];
  let maxDist = 0;
  for (const childName of children) {
    const child = getBoneNode(vrm, childName);
    if (child) {
      maxDist = Math.max(maxDist, child.position.distanceTo(bone.position));
    }
  }
  if (maxDist < 0.001) {
    const parent = BONE_PARENTS[name];
    if (parent) {
      const pBone = getBoneNode(vrm, parent);
      if (pBone) maxDist = bone.position.distanceTo(pBone.position) * 0.6;
    }
  }
  const len = Math.max(maxDist, 0.05);
  const radiusSizes = {
    chest: 0.30, upperChest: 0.28,
    head: 0.40,
    leftUpperArm: 0.18, leftLowerArm: 0.14, leftHand: 0.12,
    rightUpperArm: 0.18, rightLowerArm: 0.14, rightHand: 0.12,
    leftUpperLeg: 0.22, leftLowerLeg: 0.16,
    rightUpperLeg: 0.22, rightLowerLeg: 0.16,
  };
  const radius = Math.max((radiusSizes[name] || 0.15) * len, 0.02);
  return { halfHeight: len * 0.45, radius, centerY: len * 0.5 };
}

function getBoneColor(name) {
  if (name.startsWith('left')) return 0x44ff44;
  if (name.startsWith('right')) return 0x4488ff;
  if (name === 'head') return 0x44ff44;
  if (name.includes('Leg')) return 0xffff44;
  return 0xff8844;
}

function buildCapsuleWireframe(halfHeight, radius) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5, depthTest: false,
  });
  const cylGeo = new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 8, 1, true);
  const cyl = new THREE.Mesh(cylGeo, mat);
  group.add(cyl);
  const capGeo = new THREE.SphereGeometry(radius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = new THREE.Mesh(capGeo, mat);
  top.position.y = halfHeight;
  group.add(top);
  const bot = new THREE.Mesh(capGeo.clone(), mat);
  bot.position.y = -halfHeight;
  bot.rotation.x = Math.PI;
  group.add(bot);
  return group;
}

export function usePhysicsCollision() {
  const worldRef = useRef(null);
  const initializedRef = useRef(false);
  const enabledRef = useRef(true);
  const debugEnabledRef = useRef(false);
  const boneBodiesRef = useRef([]);
  const debugMeshesRef = useRef([]);
  const vrmRef = useRef(null);
  const bodyMapRef = useRef(new Map());
  const prevCorrectionsRef = useRef({});
  const prevVelocitiesRef = useRef({});

  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _corr = new THREE.Vector3();
  const _smoothed = new THREE.Vector3();
  const _parentInv = new THREE.Matrix4();

  const init = useCallback((vrm) => {
    if (!vrm?.humanoid) return;
    if (initializedRef.current) dispose();
    vrmRef.current = vrm;
    prevCorrectionsRef.current = {};
    prevVelocitiesRef.current = {};

    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    worldRef.current = world;
    const bodies = [];
    bodyMapRef.current.clear();

    for (const name of COLLISION_BONES) {
      const bone = getBoneNode(vrm, name);
      if (!bone) continue;

      const isSphere = SPHERE_BONES.has(name);
      const { halfHeight, radius, centerY } = getCapsuleExtents(vrm, name);
      const marginRadius = radius * PROXIMITY_MARGIN;
      const marginHalfHeight = halfHeight * PROXIMITY_MARGIN;

      const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(0, 0, 0)
        .setRotation(RAPIER.RotationOps.identity());
      const body = world.createRigidBody(bodyDesc);

      let colliderDesc;
      if (isSphere) {
        colliderDesc = RAPIER.ColliderDesc.ball(marginRadius);
      } else {
        colliderDesc = RAPIER.ColliderDesc.capsule(marginHalfHeight, marginRadius)
          .setTranslation(0, centerY, 0);
      }

      colliderDesc.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC
      );
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.NONE);

      const collider = world.createCollider(colliderDesc, body);

      bodies.push({ name, body, collider, bone, halfHeight, radius, centerY, isSphere });
      bodyMapRef.current.set(collider.handle, name);
    }

    boneBodiesRef.current = bodies;
    initializedRef.current = true;
    buildDebugMeshes(vrm);
  }, []);

  function buildDebugMeshes(vrm) {
    clearDebugMeshes();
    const meshes = [];
    for (const { name, bone, halfHeight, radius, isSphere, centerY } of boneBodiesRef.current) {
      const mr = radius * PROXIMITY_MARGIN;
      const mh = halfHeight * PROXIMITY_MARGIN;
      const child = isSphere
        ? new THREE.Mesh(
            new THREE.SphereGeometry(mr, 12, 8),
            new THREE.MeshBasicMaterial({ color: getBoneColor(name), wireframe: true, transparent: true, opacity: 0.5, depthTest: false })
          )
        : buildCapsuleWireframe(mh, mr);
      child.position.y = centerY || 0;
      const mesh = new THREE.Group();
      mesh.add(child);
      mesh.visible = debugEnabledRef.current;
      vrm.scene.add(mesh);
      meshes.push({ mesh, bone, name });
    }
    debugMeshesRef.current = meshes;
  }

  function clearDebugMeshes() {
    for (const { mesh } of debugMeshesRef.current) {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    debugMeshesRef.current = [];
  }

  const update = useCallback((vrm, deltaTime) => {
    if (!initializedRef.current || !enabledRef.current) return;
    const world = worldRef.current;
    if (!world) return;
    const bodies = boneBodiesRef.current;
    if (bodies.length === 0) return;

    for (const { body, bone } of bodies) {
      if (!bone) continue;
      bone.getWorldPosition(_v);
      bone.getWorldQuaternion(_q);
      body.setNextKinematicTranslation({ x: _v.x, y: _v.y, z: _v.z });
      body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    }

    world.step();

    const corrections = {};
    const handled = new Set();

    for (const entry of bodies) {
      const h1 = entry.collider.handle;
      world.narrowPhase.contactPairsWith(h1, (h2) => {
        const key = h1 < h2 ? `${h1}|${h2}` : `${h2}|${h1}`;
        if (handled.has(key)) return;
        handled.add(key);

        const name1 = bodyMapRef.current.get(h1);
        const name2 = bodyMapRef.current.get(h2);
        if (!name1 || !name2) return;

        if (isForbidden(name1, name2)) return;

        world.narrowPhase.contactPair(h1, h2, (manifold, flipped) => {
          const normal = manifold.normal();
          for (let i = 0; i < manifold.numContacts(); i++) {
            const dist = manifold.contactDist(i);
            if (dist >= 0) continue;
            const rawDepth = -dist;
            if (rawDepth < NOISE_FLOOR) continue;

            let depth = rawDepth * 0.5;
            depth = Math.min(depth, MAX_CORRECTION);

            const dir = flipped ? 1 : -1;
            const dx = normal.x * depth * dir;
            const dy = normal.y * depth * dir;
            const dz = normal.z * depth * dir;

            if (!corrections[name1]) corrections[name1] = new THREE.Vector3();
            if (!corrections[name2]) corrections[name2] = new THREE.Vector3();
            corrections[name1].x += dx;
            corrections[name1].y += dy;
            corrections[name1].z += dz;
            corrections[name2].x -= dx;
            corrections[name2].y -= dy;
            corrections[name2].z -= dz;
          }
        });
      });
    }

    const names = Object.keys(corrections);
    if (names.length === 0) {
      for (const name of Object.keys(prevCorrectionsRef.current)) {
        const vel = prevVelocitiesRef.current[name];
        if (vel) { vel.x *= 0.85; vel.y *= 0.85; vel.z *= 0.85; }
      }
      if (debugEnabledRef.current) {
        for (const { mesh, bone } of debugMeshesRef.current) {
          if (!bone) continue;
          bone.getWorldPosition(mesh.position);
          mesh.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()));
        }
      }
      return;
    }

    for (const name of names) {
      const rawCorr = corrections[name];
      const prevCorr = prevCorrectionsRef.current[name] || new THREE.Vector3();
      const prevVel = prevVelocitiesRef.current[name] || new THREE.Vector3();

      const dot = rawCorr.x * prevVel.x + rawCorr.y * prevVel.y + rawCorr.z * prevVel.z;
      if (dot < 0) {
        rawCorr.x *= 0.4;
        rawCorr.y *= 0.4;
        rawCorr.z *= 0.4;
      }

      _smoothed.x = prevCorr.x + (rawCorr.x - prevCorr.x) * SMOOTHING_FACTOR;
      _smoothed.y = prevCorr.y + (rawCorr.y - prevCorr.y) * SMOOTHING_FACTOR;
      _smoothed.z = prevCorr.z + (rawCorr.z - prevCorr.z) * SMOOTHING_FACTOR;

      const mag = Math.sqrt(_smoothed.x ** 2 + _smoothed.y ** 2 + _smoothed.z ** 2);
      if (mag > MAX_CORRECTION) {
        const scale = MAX_CORRECTION / mag;
        _smoothed.x *= scale;
        _smoothed.y *= scale;
        _smoothed.z *= scale;
      }

      prevCorrectionsRef.current[name] = _smoothed.clone();

      prevVel.x = _smoothed.x - prevCorr.x;
      prevVel.y = _smoothed.y - prevCorr.y;
      prevVel.z = _smoothed.z - prevCorr.z;
      prevVel.x *= 0.85;
      prevVel.y *= 0.85;
      prevVel.z *= 0.85;
      prevVelocitiesRef.current[name] = prevVel;

      const entry = bodies.find(b => b.name === name);
      if (!entry) continue;
      const bone = entry.bone;
      if (!bone || !bone.parent) continue;

      _parentInv.copy(bone.parent.matrixWorld).invert();
      _corr.copy(_smoothed);
      _corr.applyMatrix4(_parentInv);
      bone.position.add(_corr);
    }

    for (const name of Object.keys(prevCorrectionsRef.current)) {
      if (!corrections[name]) {
        const vel = prevVelocitiesRef.current[name];
        if (vel) { vel.x *= 0.85; vel.y *= 0.85; vel.z *= 0.85; }
      }
    }

    vrm.scene.updateMatrixWorld(true);

    if (debugEnabledRef.current) {
      for (const { mesh, bone } of debugMeshesRef.current) {
        if (!bone) continue;
        bone.getWorldPosition(mesh.position);
        mesh.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()));
        mesh.visible = true;
      }
    }
  }, []);

  const dispose = useCallback(() => {
    clearDebugMeshes();
    if (worldRef.current) {
      worldRef.current.free();
      worldRef.current = null;
    }
    boneBodiesRef.current = [];
    bodyMapRef.current.clear();
    prevCorrectionsRef.current = {};
    prevVelocitiesRef.current = {};
    initializedRef.current = false;
    vrmRef.current = null;
  }, []);

  const setEnabled = useCallback((val) => { enabledRef.current = val; }, []);
  const setDebugEnabled = useCallback((val) => {
    debugEnabledRef.current = val;
    for (const { mesh } of debugMeshesRef.current) {
      mesh.visible = val;
    }
  }, []);
  const isEnabled = useCallback(() => enabledRef.current, []);

  useEffect(() => {
    return () => { dispose(); };
  }, [dispose]);

  return { init, update, setEnabled, setDebugEnabled, isEnabled, dispose };
}
