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
import { BONE_MAPPING } from '../../animations/useBVH.js';

/**
 * Tune spring bone parameters for better physics (anti-clipping, natural motion).
 */
function tuneSpringBones(vrm) {
  if (!vrm?.springBoneManager?.joints) return;
  let tuned = 0;

  // Check colliders first — models without any colliders are prone to spring bone explosions
  const colliderGroups = vrm.springBoneManager?.colliderGroups;
  const hasColliders = colliderGroups && colliderGroups.length > 0;
  if (!hasColliders) {
    console.warn('[VRM] Model has NO spring bone colliders — setting tiny hit radius to prevent bones popping out');
  }

  for (const joint of vrm.springBoneManager.joints) {
    const s = joint.settings;
    if (!s) continue;
    const name = joint.bone?.name || '?';
    let changed = false;

    // Per-group defaults
    let stiffness = 0.55, drag = 0.6, gravity = 0.15, radius = 0.1;

    if (name.includes('Hair')) {
      // Hair: keep original settings, only apply safety clamping below
      stiffness = s.stiffness ?? 0.4;
      drag = s.dragForce ?? 0.5;
      gravity = s.gravityPower ?? 0.08;
      radius = s.hitRadius ?? 0.06;
    } else if (name.includes('CoatSkirt')) {
      // Coat skirt: firm, large collision
      stiffness = 0.65;
      drag = 0.65;
      gravity = 0.1;
      radius = 0.12;
    } else if (name.includes('Coat')) {
      // Coat: firm
      stiffness = 0.65;
      drag = 0.65;
      gravity = 0.1;
      radius = 0.12;
    } else if (name.includes('Skirt')) {
      // Skirt: stiffer, larger collision to prevent leg clipping & flipping up
      stiffness = 0.6;
      drag = 0.65;
      gravity = 0.12;
      radius = 0.14;
    } else if (name.includes('Bust')) {
      // Bust: softer, natural bounce
      stiffness = 0.45;
      drag = 0.55;
      gravity = 0.12;
    }

    // Apply per-group defaults (with tolerance to avoid unnecessary overrides)
    if (s.stiffness == null || Math.abs(s.stiffness - stiffness) > 0.15) {
      s.stiffness = stiffness; changed = true;
    }
    if (s.dragForce == null || Math.abs(s.dragForce - drag) > 0.15) {
      s.dragForce = drag; changed = true;
    }
    if (s.gravityPower == null || Math.abs(s.gravityPower - gravity) > 0.1) {
      s.gravityPower = gravity; changed = true;
    }

    // Safety clamping for ALL joints — prevents NaN physics explosions
    if (s.hitRadius == null || s.hitRadius < 0.02 || (!hasColliders && s.hitRadius > 0.05)) {
      s.hitRadius = hasColliders ? Math.min(Math.max(s.hitRadius ?? 0.06, 0.02), 0.2) : 0.02;
      changed = true;
    }
    if (s.stiffness > 0.95) { s.stiffness = 0.95; changed = true; }
    if (s.dragForce < 0.05 || s.dragForce > 0.98) { s.dragForce = Math.min(Math.max(s.dragForce, 0.05), 0.95); changed = true; }

    if (changed) {
      tuned++;
      console.log(`[VRM] Spring bone "${name}" → stiffness=${s.stiffness.toFixed(2)} drag=${s.dragForce.toFixed(2)} gravity=${s.gravityPower.toFixed(2)} radius=${s.hitRadius.toFixed(3)}`);
    }
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
   * Load a VRM or GLB model from a URL.
   */
  const loadVRM = useCallback(async (url) => {
    if (!loaderRef.current) return;

    const isGLB = url.toLowerCase().endsWith('.glb');
    console.log(`[Model] Starting load from URL:`, url.substring(0, 50) + '...', isGLB ? '(GLB)' : '(VRM)');
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
            console.log('[Model] GLTF load success');
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
            console.error('[Model] GLTF load error:', err);
            reject(err);
          }
        );
      });

      const loadedVRM = gltf.userData.vrm;
      const isVRM = !!loadedVRM;

      if (isVRM) {
        console.log('[Model] VRM data found:', loadedVRM.meta?.name || 'Unnamed');

        // Optimize: remove unnecessary vertices (safe)
        try {
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          console.log('[Model] Removed unnecessary vertices');
        } catch (e) {
          console.warn('[Model] Optimization skipped:', e.message);
        }
        // SKIP removeUnnecessaryJoints — it removes leaf bones that spring
        // bones reference, causing dangling nodes and bone pop-out.

        // Rotate model to face the camera (VRM 0.x faces +Z, needs 180deg flip)
        VRMUtils.rotateVRM0(loadedVRM);

        // Reset spring bones after rotation so their initial state matches the
        // new orientation — prevents them fighting the 180° flip every frame
        loadedVRM.springBoneManager?.reset();

        // Capture rest pose after rotation but before any animation
        captureRestPose(loadedVRM);

        // Tune spring bones for better physics (hair/skirt)
        tuneSpringBones(loadedVRM);
      } else {
        console.log('[Model] No VRM data — loading as plain GLB scene');
      }

      // For GLB, build a bone name → node map using prefix alias matching
      let boneMap = null;
      if (!isVRM) {
        // Collect all scene bones (as array — we'll match by prefix)
        const sceneBones = [];
        gltf.scene.traverse((child) => {
          if (child.isBone && child.name) {
            sceneBones.push({
              node: child,
              normalized: child.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
              raw: child.name,
            });
          }
        });

        // Map each VRM standard bone to the best matching scene bone.
        // Uses prefix matching: scene bone name starts with the alias,
        // and the remainder is either empty or starts with a digit.
        // This handles VRoid-style names like upperarm_l_07 → upperarml.
        // Bones are matched deepest-first (reversed traverse order) so that
        // specific child bones (e.g. pelvis_02) take priority over generic
        // ancestor bones (e.g. _rootJoint) for the same VRM mapping slot.
        boneMap = {};
        for (let i = sceneBones.length - 1; i >= 0; i--) {
          const sb = sceneBones[i];
          for (const [vrmBone, aliases] of BONE_MAPPING) {
            if (boneMap[vrmBone]) continue; // already matched
            for (const a of aliases) {
              const aliasKey = a.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (sb.normalized.startsWith(aliasKey)) {
                const rest = sb.normalized.slice(aliasKey.length);
                if (rest === '' || /^\d/.test(rest)) {
                  boneMap[vrmBone] = sb.node;
                  break;
                }
              }
            }
          }
        }
        console.log('[Model] GLB bone map:', Object.keys(boneMap).length, 'bones matched (of', sceneBones.length, 'scene bones)');
      }

      // Wrap GLB in a compatible object so consuming code can use `vrm.scene` uniformly
      const model = isVRM ? loadedVRM : {
        scene: gltf.scene,
        humanoid: null,
        expressionManager: null,
        blendShapeProxy: null,
        springBoneManager: null,
        lookAt: null,
        meta: null,
        boneMap,
      };
      gltf.scene.userData.isVRM = isVRM;

      setVRM(model);
      setLoading(false);
      return model;
    } catch (err) {
      console.error('[Model] Error in loadVRM:', err);
      setError(err.message || 'Failed to load model.');
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
