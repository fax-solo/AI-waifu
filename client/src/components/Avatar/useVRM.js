/**
 * useVRM Hook
 *
 * Manages loading and lifecycle of a VRM avatar model.
 * Supports loading from URL or user-uploaded File objects.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * Hook to load and manage a VRM model.
 *
 * @returns {{ vrm, loading, error, loadVRM, loadVRMFromFile, dispose }}
 */
export function useVRM() {
  const [vrm, setVRM] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const loaderRef = useRef(null);

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

      // Rotate model to face the camera (VRM 0.x faces +Z, needs 180deg flip)
      // VRMUtils.rotateVRM0 handles this safely for 0.x models.
      // VRM 1.0 models are already front-facing (-Z) by specification.
      VRMUtils.rotateVRM0(loadedVRM);

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
  };
}

export default useVRM;
