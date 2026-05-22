/**
 * useVRM Hook
 *
 * Manages loading and lifecycle of a VRM avatar model.
 * Supports loading from URL or user-uploaded File objects.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';

/**
 * Tune spring bone parameters for better physics (anti-clipping, natural motion).
 */
function tuneSpringBones(vrm) {
  if (!vrm?.springBoneManager?.joints) return;
  let tuned = 0;
  for (const joint of vrm.springBoneManager.joints) {
    const s = joint.settings;
    if (!s) continue;
    const name = joint.bone?.name || '?';
    let changed = false;

    // Per-group defaults
    let stiffness = 0.55, drag = 0.6, gravity = 0.15, radius = 0.1;

    if (name.includes('Hair') || name.includes('Skirt') || name.includes('Coat')) {
      // Skip — use model's original settings
      continue;
    } else if (name.includes('Bust')) {
      // Bust: softer, natural bounce
      stiffness = 0.45;
      drag = 0.55;
      gravity = 0.12;
    } else if (name.includes('Skirt') && !name.includes('Coat')) {
      // Skirt: stiffer, larger collision to prevent leg clipping & flipping up
      stiffness = 0.6;
      drag = 0.65;
      gravity = 0.12;
      radius = 0.14;
    } else if (name.includes('CoatSkirt') || name.includes('Coat')) {
      // Coat / coat-skirt: firm, large collision
      stiffness = 0.65;
      drag = 0.65;
      gravity = 0.1;
      radius = 0.12;
    }

    if (s.stiffness == null || Math.abs(s.stiffness - stiffness) > 0.15) {
      s.stiffness = stiffness; changed = true;
    }
    if (s.dragForce == null || Math.abs(s.dragForce - drag) > 0.15) {
      s.dragForce = drag; changed = true;
    }
    if (s.gravityPower == null || Math.abs(s.gravityPower - gravity) > 0.1) {
      s.gravityPower = gravity; changed = true;
    }
    if (s.hitRadius == null || s.hitRadius < 0.06 || s.hitRadius > 0.2) {
      s.hitRadius = radius; changed = true;
    }

    if (changed) {
      tuned++;
      console.log(`[VRM] Spring bone "${name}" → stiffness=${s.stiffness.toFixed(2)} drag=${s.dragForce.toFixed(2)} gravity=${s.gravityPower.toFixed(2)} radius=${s.hitRadius.toFixed(3)}`);
    }
  }
  const colliderGroups = vrm.springBoneManager?.colliderGroups;
  if (!colliderGroups || colliderGroups.length === 0) {
    console.warn('[VRM] Model has NO spring bone colliders — hair/skirt will clip through body');
  } else {
    console.log(`[VRM] Model has ${colliderGroups.length} collider group(s)`);
  }
  if (tuned > 0) console.log(`[VRM] Tuned ${tuned} spring bone joints`);
}

/**
 * Hook to load and manage a VRM model.
 *
 * @returns {{ vrm, loading, error, loadVRM, loadVRMFromFile, dispose, restPose }}
 */
export function useVRM() {
  const [vrm, setVRM] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const loaderRef = useRef(null);
  const restPoseRef = useRef({});

  const captureRestPose = useCallback((vrm) => {
    if (!vrm?.humanoid) return;
    const bones = [
      'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
      'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
      'leftShoulder', 'rightShoulder',
    ];
    const pose = {};
    for (const b of bones) {
      const node = vrm.humanoid.getNormalizedBoneNode?.(b);
      if (node) {
        pose[b] = {
          quaternion: node.quaternion.clone(),
          position: node.position.clone(),
        };
      }
    }
    restPoseRef.current = pose;
    console.log('[VRM] Captured rest pose for', Object.keys(pose).length, 'bones');
  }, []);

  // Create the GLTF loader with VRM plugin (once)
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loaderRef.current = loader;
  }, []);

  // Dispose of the current VRM when switching models or unmounting
  const dispose = useCallback(() => {
    if (vrm) {
      console.log('[VRM] Disposing previous model');
      VRMUtils.deepDispose(vrm.scene);
      setVRM(null);
    }
  }, [vrm]);

  /**
   * Load a VRM model from a URL.
   */
  const loadVRM = useCallback(async (url) => {
    if (!loaderRef.current) return;

    console.log('[VRM] Starting load from URL:', url.substring(0, 50) + '...');
    setLoading(true);
    setProgress(0);
    setError(null);

    // Dispose previous model
    if (vrm) {
      VRMUtils.deepDispose(vrm.scene);
    }

    try {
      const gltf = await new Promise((resolve, reject) => {
        loaderRef.current.load(
          url,
          (gltf) => {
            console.log('[VRM] GLTF load success');
            setProgress(100);
            resolve(gltf);
          },
          (p) => {
            if (p.total > 0) {
              const percent = Math.round((p.loaded / p.total) * 100);
              setProgress(percent);
            }
          },
          (err) => {
            console.error('[VRM] GLTF load error:', err);
            reject(err);
          }
        );
      });

      const loadedVRM = gltf.userData.vrm;
      if (!loadedVRM) {
        throw new Error('File is not a valid VRM model (no VRM data found in GLTF).');
      }

      console.log('[VRM] VRM data found:', loadedVRM.meta?.name || 'Unnamed');

      // Optimize: remove unnecessary vertices and joints before creating skeleton
      try {
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        console.log('[VRM] Removed unnecessary vertices and joints');
      } catch (e) {
        console.warn('[VRM] Optimization skipped:', e.message);
      }

      // Rotate model to face the camera (VRM 0.x faces +Z, needs 180deg flip)
      VRMUtils.rotateVRM0(loadedVRM);

      // Capture rest pose after rotation but before any animation
      captureRestPose(loadedVRM);

      // Tune spring bones for better physics (hair/skirt)
      tuneSpringBones(loadedVRM);

      setVRM(loadedVRM);
      setLoading(false);
      return loadedVRM;
    } catch (err) {
      console.error('[VRM] Error in loadVRM:', err);
      setError(err.message || 'Failed to load VRM model.');
      setLoading(false);
      setProgress(0);
      return null;
    }
  }, [vrm]);

  /**
   * Load a VRM model from a user-uploaded File object.
   */
  const loadVRMFromFile = useCallback(async (file) => {
    if (!file) return;

    console.log('[VRM] Loading from File:', file.name, `(${Math.round(file.size / 1024)} KB)`);
    
    // Create a temporary object URL for the file
    const objectURL = URL.createObjectURL(file);
    try {
      const result = await loadVRM(objectURL);
      return result;
    } catch (err) {
      console.error('[VRM] loadVRMFromFile failed:', err);
      throw err;
    }
    // Note: We don't revoke immediately because VRM textures might still be loading
  }, [loadVRM]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vrm) {
        VRMUtils.deepDispose(vrm.scene);
      }
    };
  }, []);

  return {
    vrm,
    loading,
    progress,
    error,
    loadVRM,
    loadVRMFromFile,
    dispose,
    restPose: restPoseRef,
  };
}

export default useVRM;
