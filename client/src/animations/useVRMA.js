import { useRef, useEffect, useCallback } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';

export function useVRMA() {
  const loaderRef = useRef(null);
  const stateRef = useRef({
    playing: false,
    filename: null,
    mixer: null,
    action: null,
    clip: null,
    vrm: null,
  });

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loaderRef.current = loader;
    return () => {
      if (stateRef.current.mixer) {
        stateRef.current.mixer.stopAllAction();
      }
      stateRef.current = { playing: false, filename: null, mixer: null, action: null, clip: null, vrm: null };
    };
  }, []);

  const play = useCallback(async (vrm, filename, url, { loop = false } = {}) => {
    if (!loaderRef.current || !vrm) return;

    if (stateRef.current.filename === filename && stateRef.current.playing) return;

    if (stateRef.current.mixer) {
      stateRef.current.mixer.stopAllAction();
    }

    try {
      const gltf = await new Promise((resolve, reject) => {
        loaderRef.current.load(
          url,
          (g) => resolve(g),
          undefined,
          (err) => { console.error('[VRMA] Load error:', err); reject(err); },
        );
      });

      const anims = gltf.userData?.vrmAnimations;
      if (!anims?.length) {
        console.warn('[VRMA] No animations in:', filename);
        return;
      }

      const clip = createVRMAnimationClip(anims[0], vrm);
      if (!clip) {
        console.warn('[VRMA] createVRMAnimationClip returned null for:', filename);
        return;
      }

      const mixer = new THREE.AnimationMixer(vrm.scene);
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
      if (!loop) action.clampWhenFinished = true;
      action.play();

      stateRef.current = {
        playing: true,
        filename,
        mixer,
        action,
        clip,
        vrm,
      };
    } catch (err) {
      console.error('[VRMA] Failed to play:', filename, err);
    }
  }, []);

  const stop = useCallback(() => {
    if (stateRef.current.mixer) {
      stateRef.current.mixer.stopAllAction();
    }
    stateRef.current = { playing: false, filename: null, mixer: null, action: null, clip: null, vrm: null };
  }, []);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.playing || !s.mixer) return;
    s.mixer.update(dt);
    if (s.action && !s.action.loop && s.action.paused) {
      s.playing = false;
    }
  }, []);

  return { play, stop, update, stateRef };
}
