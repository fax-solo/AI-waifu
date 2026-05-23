import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

const loader = new BVHLoader();

// Generic bone lookup: tries VRM raw bone node, then boneMap, then scene traversal
function getBoneNode(vrm, vrmBone) {
  if (vrm.humanoid) return vrm.humanoid.getRawBoneNode?.(vrmBone) ?? null;
  if (vrm.boneMap?.[vrmBone]) return vrm.boneMap[vrmBone];
  const lower = vrmBone.toLowerCase().replace(/[^a-z0-9]/g, '');
  let found = null;
  vrm.scene?.traverse?.((child) => {
    if (!found && child.isBone) {
      const n = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n === lower || n.endsWith(lower)) found = child;
    }
  });
  return found;
}

function fingerAliases(name) {
  const sides = ['left', 'right'];
  const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
  const joints = ['Proximal', 'Intermediate', 'Distal'];
  const aliases = [];
  for (const side of sides) {
    for (const digit of digits) {
      for (const joint of joints) {
        const vrmName = `${side}${digit}${joint}`;
        if (vrmName === name || vrmName.toLowerCase() === name.toLowerCase()) {
          aliases.push(vrmName);
        }
      }
    }
  }
  return aliases;
}

const BONE_MAPPING = [
  // Order matters: more specific entries first so they take priority.
  // Aliases must NOT overlap between entries to avoid double-matching.
  ['upperChest', ['Spine3', 'spine3', 'Spine2', 'spine2', 'upperChest', 'UpperChest', 'mixamorig:Spine2', 'mixamorig:Spine3', 'spine03']],
  ['chest', ['Spine1', 'spine1', 'chest', 'Chest', 'mixamorig:Spine1', 'spine02']],
  // No bare 'Spine'/'spine' or 'mixamorig:Spine' — they would prefix-match
  // numbered siblings (Spine2) and VRoid segments (spine_01_03). Instead
  // use spine01 (for numbered bones); the fallback getBone uses endsWith
  // to catch 'Spine' and 'mixamorig:Spine' uniquely.
  ['spine', ['spine01']],
  ['hips', ['Hips', 'hips', 'pelvis', 'Pelvis', 'mixamorig:Hips', 'hip', 'HIP', 'root', 'Root']],
  ['neck', ['Neck', 'neck', 'mixamorig:Neck']],
  ['head', ['Head', 'head', 'mixamorig:Head']],
  ['leftShoulder', ['LeftShoulder', 'leftShoulder', 'Left_shoulder', 'left_shoulder', 'l_shoulder', 'mixamorig:LeftShoulder', 'claviclel']],
  ['rightShoulder', ['RightShoulder', 'rightShoulder', 'Right_shoulder', 'right_shoulder', 'r_shoulder', 'mixamorig:RightShoulder', 'clavicler']],
  ['leftUpperArm', ['leftUpperArm', 'LeftArm', 'leftArm', 'Left_arm', 'left_arm', 'l_arm', 'mixamorig:LeftArm', 'upperarml']],
  ['leftLowerArm', ['leftLowerArm', 'LeftForeArm', 'leftForeArm', 'Left_forearm', 'left_forearm', 'l_forearm', 'mixamorig:LeftForeArm', 'lowerarml']],
  ['leftHand', ['leftHand', 'LeftHand', 'leftHand', 'Left_hand', 'left_hand', 'l_hand', 'mixamorig:LeftHand', 'handl']],
  ['rightUpperArm', ['rightUpperArm', 'RightArm', 'rightArm', 'Right_arm', 'right_arm', 'mixamorig:RightArm', 'upperarmr']],
  ['rightLowerArm', ['rightLowerArm', 'RightForeArm', 'rightForeArm', 'Right_forearm', 'right_forearm', 'l_forearm', 'mixamorig:RightForeArm', 'lowerarmr']],
  ['rightHand', ['rightHand', 'RightHand', 'rightHand', 'Right_hand', 'right_hand', 'r_hand', 'mixamorig:RightHand', 'handr']],
  ['leftUpperLeg', ['leftUpperLeg', 'LeftUpLeg', 'leftUpLeg', 'Left_thigh', 'left_thigh', 'l_thigh', 'mixamorig:LeftUpLeg', 'thighl']],
  ['leftLowerLeg', ['leftLowerLeg', 'LeftLeg', 'leftLeg', 'Left_shin', 'left_shin', 'l_shin', 'mixamorig:LeftLeg', 'calfl', 'shinl']],
  ['leftFoot', ['leftFoot', 'LeftFoot', 'leftFoot', 'Left_foot', 'left_foot', 'l_foot', 'mixamorig:LeftFoot', 'footl']],
  ['leftToes', ['leftToes', 'LeftToes', 'leftToes', 'Left_toes', 'left_toes', 'l_toes', 'LeftFootEnd', 'balll']],
  ['rightUpperLeg', ['rightUpperLeg', 'RightUpLeg', 'rightUpLeg', 'Right_thigh', 'right_thigh', 'r_thigh', 'mixamorig:RightUpLeg', 'thighr']],
  ['rightLowerLeg', ['rightLowerLeg', 'RightLeg', 'rightLeg', 'Right_shin', 'right_shin', 'r_shin', 'mixamorig:RightLeg', 'calfr', 'shinr']],
  ['rightFoot', ['rightFoot', 'RightFoot', 'rightFoot', 'Right_foot', 'right_foot', 'r_foot', 'mixamorig:RightFoot', 'footr']],
  ['rightToes', ['rightToes', 'RightToes', 'rightToes', 'Right_toes', 'right_toes', 'r_toes', 'RightFootEnd', 'ballr']],
  // Finger bones
  ['leftThumbProximal', fingerAliases('leftThumbProximal')],
  ['leftThumbIntermediate', fingerAliases('leftThumbIntermediate')],
  ['leftThumbDistal', fingerAliases('leftThumbDistal')],
  ['leftIndexProximal', fingerAliases('leftIndexProximal')],
  ['leftIndexIntermediate', fingerAliases('leftIndexIntermediate')],
  ['leftIndexDistal', fingerAliases('leftIndexDistal')],
  ['leftMiddleProximal', fingerAliases('leftMiddleProximal')],
  ['leftMiddleIntermediate', fingerAliases('leftMiddleIntermediate')],
  ['leftMiddleDistal', fingerAliases('leftMiddleDistal')],
  ['leftRingProximal', fingerAliases('leftRingProximal')],
  ['leftRingIntermediate', fingerAliases('leftRingIntermediate')],
  ['leftRingDistal', fingerAliases('leftRingDistal')],
  ['leftLittleProximal', fingerAliases('leftLittleProximal')],
  ['leftLittleIntermediate', fingerAliases('leftLittleIntermediate')],
  ['leftLittleDistal', fingerAliases('leftLittleDistal')],
  ['rightThumbProximal', fingerAliases('rightThumbProximal')],
  ['rightThumbIntermediate', fingerAliases('rightThumbIntermediate')],
  ['rightThumbDistal', fingerAliases('rightThumbDistal')],
  ['rightIndexProximal', fingerAliases('rightIndexProximal')],
  ['rightIndexIntermediate', fingerAliases('rightIndexIntermediate')],
  ['rightIndexDistal', fingerAliases('rightIndexDistal')],
  ['rightMiddleProximal', fingerAliases('rightMiddleProximal')],
  ['rightMiddleIntermediate', fingerAliases('rightMiddleIntermediate')],
  ['rightMiddleDistal', fingerAliases('rightMiddleDistal')],
  ['rightRingProximal', fingerAliases('rightRingProximal')],
  ['rightRingIntermediate', fingerAliases('rightRingIntermediate')],
  ['rightRingDistal', fingerAliases('rightRingDistal')],
  ['rightLittleProximal', fingerAliases('rightLittleProximal')],
  ['rightLittleIntermediate', fingerAliases('rightLittleIntermediate')],
  ['rightLittleDistal', fingerAliases('rightLittleDistal')],
];

function matchBoneKey(bvhName) {
  const lower = bvhName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bvhHasSpecial = /[^a-z0-9]/.test(bvhName);
  for (const [vrmBone, aliases] of BONE_MAPPING) {
    for (const a of aliases) {
      const alias = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower === alias) return vrmBone;
      if (bvhHasSpecial && lower.endsWith(alias)) return vrmBone;
      if (/[^a-z0-9]/.test(a) && alias.endsWith(lower)) return vrmBone;
    }
  }
  return null;
}

const _q = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();

export { BONE_MAPPING };

export function parseBVH(text, vrm) {
  const { clip } = loader.parse(text);
  const times = clip.tracks.length > 0 ? clip.tracks[0].times : new Float32Array();
  if (times.length === 0) return null;

  const bones = {};
  const usedBones = new Set();

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    let name = track.name.substring(0, dot);
    const prop = track.name.substring(dot);
    if (prop !== '.quaternion') continue;

    const bracket = name.match(/\[([^\]]+)\]/);
    if (bracket) name = bracket[1];

    const vrmBone = matchBoneKey(name);
    if (!vrmBone) continue;

    usedBones.add(vrmBone);
    bones[vrmBone] = new Float32Array(track.values);
  }

  // Debug: compare BVH frame0 to raw bone rest rotation (VRM only)
  const restRots = vrm?.humanoid?._normalizedHumanBones?._boneRotations;
  if (restRots) {
    for (const [vrmBone, values] of Object.entries(bones)) {
      const rest = restRots[vrmBone];
      if (rest) {
        _q.fromArray(values, 0);
        const diff = _q.angleTo(rest);
        if (diff > 0.05) {
          console.log(`[BVH] ${vrmBone}: frame0 angle diff from rest = ${(diff * 180 / Math.PI).toFixed(1)}°  (bvh=${_q.x.toFixed(3)},${_q.y.toFixed(3)},${_q.z.toFixed(3)},${_q.w.toFixed(3)}  rest=${rest.x.toFixed(3)},${rest.y.toFixed(3)},${rest.z.toFixed(3)},${rest.w.toFixed(3)})`);
        }
      }
    }
  }

  console.log(`[BVH] Parsed: ${Object.keys(bones).length} bones matched (${usedBones.size} unique)`);

  if (Object.keys(bones).length === 0) return null;

  return {
    duration: clip.duration,
    times,
    bones,
    usedBones,
  };
}

export function applyBVHFrame(vrm, data, elapsed, loop) {
  if (!vrm?.scene) return;

  const { times, duration, bones } = data;
  let t = elapsed;
  if (loop) t %= duration;
  else t = Math.min(t, duration);
  if (t <= 0) t = 0;
  if (t >= duration) t = duration;

  const n = times.length;
  let i0 = 0, i1 = 0, frac = 0;
  if (t >= times[n - 1]) {
    i0 = n - 1;
    i1 = n - 1;
    frac = 0;
  } else {
    for (let i = 0; i < n - 1; i++) {
      if (t >= times[i] && t < times[i + 1]) {
        i0 = i;
        i1 = i + 1;
        frac = (t - times[i]) / (times[i + 1] - times[i]);
        break;
      }
    }
  }

  for (const vrmBone in bones) {
    const values = bones[vrmBone];
    const off0 = i0 * 4;
    const off1 = i1 * 4;

    if (i0 === i1) {
      _q.fromArray(values, off0);
    } else {
      _q.fromArray(values, off0);
      _q1.fromArray(values, off1);
      _q.slerp(_q1, frac);
    }

    // BVH bone local frames differ from VRM by 180° around Y (negates X & Z)
    _q.x *= -1;
    _q.z *= -1;

    const rawNode = getBoneNode(vrm, vrmBone);
    if (rawNode) {
      rawNode.quaternion.copy(_q);
    } else if (vrm.humanoid) {
      if (!window._missingRaws) window._missingRaws = new Set();
      if (!window._missingRaws.has(vrmBone)) {
        window._missingRaws.add(vrmBone);
        console.warn(`[BVH] ${vrmBone}: no raw bone node`);
      }
    }
  }
}