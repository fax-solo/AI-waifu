import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

const bvhLoader = new BVHLoader();

const BONE_MAPPING = {
  hips: ['Hips', 'hips', 'pelvis', 'Pelvis', 'mixamorig:Hips', 'hip', 'HIP', 'root'],
  spine: ['Spine', 'spine', 'mixamorig:Spine'],
  chest: ['Spine1', 'spine1', 'Spine2', 'spine2', 'chest', 'Chest', 'mixamorig:Spine1', 'mixamorig:Spine2'],
  upperChest: ['Spine2', 'spine2', 'Spine3', 'spine3', 'upperChest', 'UpperChest', 'mixamorig:Spine3'],
  neck: ['Neck', 'neck', 'mixamorig:Neck'],
  head: ['Head', 'head', 'mixamorig:Head'],
  leftUpperArm: ['LeftArm', 'leftArm', 'Left_arm', 'left_arm', 'l_arm', 'mixamorig:LeftArm', 'LeftArm_', 'Left Arm', 'Left arm'],
  leftLowerArm: ['LeftForeArm', 'leftForeArm', 'Left_forearm', 'left_forearm', 'l_forearm', 'mixamorig:LeftForeArm', 'Left forearm', 'Left ForeArm'],
  leftHand: ['LeftHand', 'leftHand', 'Left_hand', 'left_hand', 'l_hand', 'mixamorig:LeftHand'],
  rightUpperArm: ['RightArm', 'rightArm', 'Right_arm', 'right_arm', 'r_arm', 'mixamorig:RightArm', 'RightArm_', 'Right Arm', 'Right arm'],
  rightLowerArm: ['RightForeArm', 'rightForeArm', 'Right_forearm', 'right_forearm', 'r_forearm', 'mixamorig:RightForeArm', 'Right forearm', 'Right ForeArm'],
  rightHand: ['RightHand', 'rightHand', 'Right_hand', 'right_hand', 'r_hand', 'mixamorig:RightHand'],
  leftUpperLeg: ['LeftUpLeg', 'leftUpLeg', 'Left_thigh', 'left_thigh', 'l_thigh', 'mixamorig:LeftUpLeg', 'LeftLeg', 'Left thigh', 'Left Thigh'],
  leftLowerLeg: ['LeftLeg', 'leftLeg', 'Left_shin', 'left_shin', 'l_shin', 'mixamorig:LeftLeg', 'LeftForeLeg', 'Left shin', 'Left Shin'],
  leftFoot: ['LeftFoot', 'leftFoot', 'Left_foot', 'left_foot', 'l_foot', 'mixamorig:LeftFoot'],
  rightUpperLeg: ['RightUpLeg', 'rightUpLeg', 'Right_thigh', 'right_thigh', 'r_thigh', 'mixamorig:RightUpLeg', 'RightLeg', 'Right thigh', 'Right Thigh'],
  rightLowerLeg: ['RightLeg', 'rightLeg', 'Right_shin', 'right_shin', 'r_shin', 'mixamorig:RightLeg', 'RightForeLeg', 'Right shin', 'Right Shin'],
  rightFoot: ['RightFoot', 'rightFoot', 'Right_foot', 'right_foot', 'r_foot', 'mixamorig:RightFoot'],
  leftShoulder: ['LeftShoulder', 'leftShoulder', 'Left_shoulder', 'left_shoulder', 'l_shoulder', 'mixamorig:LeftShoulder'],
  rightShoulder: ['RightShoulder', 'rightShoulder', 'Right_shoulder', 'right_shoulder', 'r_shoulder', 'mixamorig:RightShoulder'],
};

function findVRMBone(vrm, bvhBoneName) {
  const lower = bvhBoneName.toLowerCase();
  for (const [vrmBone, aliases] of Object.entries(BONE_MAPPING)) {
    if (aliases.some(a => lower === a.toLowerCase() || lower.endsWith(a.toLowerCase()) || a.toLowerCase().endsWith(lower) || lower.replace(/[^a-z0-9]/g, '') === a.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      const node = vrm.humanoid?.getNormalizedBoneNode
        ? vrm.humanoid.getNormalizedBoneNode(vrmBone)
        : vrm.humanoid?.getBoneNode(vrmBone);
      if (node) return { vrmBone, node, name: node.name };
    }
  }
  return null;
}

export function useBVHRetargeting() {
  const cacheRef = useRef({});

  const parseBVH = useCallback((text) => {
    return bvhLoader.parse(text);
  }, []);

  const retargetClip = useCallback((clip, skeleton, vrm) => {
    if (!vrm?.humanoid) return { clip: null, usedBones: new Set(), error: 'no humanoid' };

    const mappedTracks = [];
    const usedBones = new Set();

    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      let bvhBoneName = track.name.substring(0, dotIdx);
      const property = track.name.substring(dotIdx);

      // Clean up track name of format: .bones[BoneName] or similar brackets
      const match = bvhBoneName.match(/\[([^\]]+)\]/);
      if (match) {
        bvhBoneName = match[1];
      }

      const mapping = findVRMBone(vrm, bvhBoneName);
      if (!mapping) continue;

      usedBones.add(mapping.vrmBone);
      const trackName = `${mapping.name}${property}`;

      let values;
      if (property === '.quaternion') {
        values = new Float32Array(track.values);
      } else if (property === '.position') {
        values = new Float32Array(track.values);
      } else {
        continue;
      }

      const newTrack = track.constructor(trackName, track.times, values);
      mappedTracks.push(newTrack);
    }

    if (mappedTracks.length === 0) {
      const trackNames = clip.tracks.map(t => t.name);
      console.warn('[BVH] No bones matched. BVH tracks:', trackNames, 'VRM bones:', Object.keys(BONE_MAPPING));
      return { clip: null, usedBones: new Set(), error: 'no bones matched' };
    }

    const retargetedClip = new THREE.AnimationClip(
      `${clip.name}_retargeted`,
      clip.duration,
      mappedTracks,
    );

    console.log(`[BVH] Retargeted ${mappedTracks.length} tracks for bones:`, [...usedBones]);
    return { clip: retargetedClip, usedBones };
  }, []);

  const createMixer = useCallback((clip, vrm) => {
    const mixer = new THREE.AnimationMixer(vrm.scene);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    return { mixer, action };
  }, []);

  const loadAndRetarget = useCallback(async (text, vrm) => {
    const cacheKey = text.length.toString();
    if (cacheRef.current[cacheKey]) return cacheRef.current[cacheKey];

    const { skeleton, clip } = parseBVH(text);
    const result = retargetClip(clip, skeleton, vrm);
    cacheRef.current[cacheKey] = result;
    return result;
  }, [parseBVH, retargetClip]);

  const clearCache = useCallback(() => {
    cacheRef.current = {};
  }, []);

  return { loadAndRetarget, createMixer, clearCache };
}

export default useBVHRetargeting;
