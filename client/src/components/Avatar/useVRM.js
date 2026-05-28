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
import { BONE_MAPPING } from '../../animations/boneMapping.js';

/**
 * Diagnose spring bone params — logs the model's original values for debugging.
 * Does NOT modify values — actual tuning is done by springPresets.init() later.
 */
function diagnoseSpringBones(vrm) {
  if (!vrm?.springBoneManager?.joints) return;
  const extremes = { stiffness: 0, drag: 0, gravity: 0, radius: 0 };
  let extremeCount = 0;

  const colliderGroups = vrm.springBoneManager?.colliderGroups;
  const hasColliders = colliderGroups && colliderGroups.length > 0;
  if (!hasColliders) {
    console.warn('[VRM] Model has NO spring bone colliders — using custom colliders');
  }

  for (const joint of vrm.springBoneManager.joints) {
    const s = joint.settings;
    if (!s) continue;
    if (s.stiffness > 0.95 || s.stiffness < 0.01) { extremes.stiffness++; extremeCount++; }
    if (s.dragForce > 0.98 || s.dragForce < 0.01) { extremes.drag++; extremeCount++; }
    if (s.gravityPower > 2.0 || s.gravityPower < 0) { extremes.gravity++; extremeCount++; }
    if (s.hitRadius > 0.3 || s.hitRadius < 0.005) { extremes.radius++; extremeCount++; }
  }
  if (extremeCount > 0) {
    console.log('[VRM] Extreme spring bone values detected (will be normalized by presets):',
      Object.entries(extremes).filter(([,c]) => c > 0).map(([k,c]) => `${k}:${c}`).join(' '));
  }
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
  const vrmRef = useRef(null);
  const objectURLRef = useRef(null);

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

  // Keep vrmRef in sync so cleanup always sees current model
  useEffect(() => {
    vrmRef.current = vrm;
  }, [vrm]);

  // Dispose of the current VRM when switching models or unmounting
  const dispose = useCallback(() => {
    const current = vrmRef.current;
    if (current) {
      console.log('[VRM] Disposing previous model');
      VRMUtils.deepDispose(current.scene);
    }
    if (objectURLRef.current) {
      URL.revokeObjectURL(objectURLRef.current);
      objectURLRef.current = null;
    }
    setVRM(null);
  }, []);

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
    const prev = vrmRef.current;
    if (prev) {
      VRMUtils.deepDispose(prev.scene);
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

        // Rotate model to face the camera.
        // VRM 0.x faces +Z by default (needs 180° Y rotation to face -Z toward camera).
        // VRM 1.0 faces -Z already — no rotation needed.
        // meta?.version is the MODEL version (e.g. "1.0"), NOT the VRM spec version.
        // Check the raw GLTF extension for the spec version instead.
        const rawExt = gltf.userData.gltfExtensions?.VRM || gltf.userData.gltfExtensions?.VRMC_vrm;
        const specVer = rawExt?.specVersion || rawExt?.version || '';
        const isVRM0 = specVer.startsWith('0');
        if (isVRM0) {
          VRMUtils.rotateVRM0(loadedVRM);
        }

        // Reset spring bones after rotation so their initial state matches the
        // new orientation — prevents them fighting the 180° flip every frame
        loadedVRM.springBoneManager?.reset();

        // Capture rest pose after rotation but before any animation
        captureRestPose(loadedVRM);

        // Diagnose original spring bone values (actual tuning in springPresets.init)
        diagnoseSpringBones(loadedVRM);
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
  }, []);

  /**
   * Load a VRM model from a user-uploaded File object.
   */
  const loadVRMFromFile = useCallback(async (file) => {
    if (!file) return;

    console.log('[VRM] Loading from File:', file.name, `(${Math.round(file.size / 1024)} KB)`);
    
    // Create a temporary object URL for the file
    const objectURL = URL.createObjectURL(file);
    // Track in ref so dispose() can revoke it if needed
    if (objectURLRef.current) URL.revokeObjectURL(objectURLRef.current);
    objectURLRef.current = objectURL;
    try {
      const result = await loadVRM(objectURL);
      // Revoke after load completes — textures are cached by the loader by then
      setTimeout(() => {
        if (objectURLRef.current === objectURL) {
          URL.revokeObjectURL(objectURL);
          objectURLRef.current = null;
        }
      }, 100);
      return result;
    } catch (err) {
      console.error('[VRM] loadVRMFromFile failed:', err);
      if (objectURLRef.current === objectURL) {
        URL.revokeObjectURL(objectURL);
        objectURLRef.current = null;
      }
      throw err;
    }
  }, [loadVRM]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const current = vrmRef.current;
      if (current) {
        VRMUtils.deepDispose(current.scene);
      }
      if (objectURLRef.current) {
        URL.revokeObjectURL(objectURLRef.current);
        objectURLRef.current = null;
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
