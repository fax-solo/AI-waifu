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
    duration: 0,
    loop: false,
  });

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loaderRef.current = loader;
    return () => {
      if (stateRef.current.mixer) {
        stateRef.current.mixer.stopAllAction();
      }
      stateRef.current.playing = false;
    };
  }, []);

  const play = useCallback(async (vrm, filename, url, { loop = false } = {}) => {
    if (!loaderRef.current || !vrm) return;

    if (stateRef.current.filename === filename && stateRef.current.playing) return;

    const s = stateRef.current;
    if (s.mixer) {
      s.mixer.stopAllAction();
      // Remove any previous clips from the mixer to avoid accumulation
      if (s.action) {
        s.mixer.uncacheClip(s.action.getClip());
      }
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

      console.log(`[VRMA] Playing ${filename} (${clip.duration.toFixed(2)}s, ${loop ? 'loop' : 'once'})`);

      // Reuse the existing mixer if the scene is the same, otherwise create a new one
      let mixer = s.mixer;
      if (mixer) {
        // Check if the mixer is still tied to this scene (mixer._root is the scene)
        if (mixer._root !== vrm.scene) {
          mixer = new THREE.AnimationMixer(vrm.scene);
        }
      } else {
        mixer = new THREE.AnimationMixer(vrm.scene);
      }
      const action = mixer.clipAction(clip);

      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, 1);
      if (!loop) action.clampWhenFinished = true;
      action.play();

      stateRef.current = {
        playing: true,
        filename,
        mixer,
        action,
        duration: clip.duration,
        loop,
      };
    } catch (err) {
      console.error('[VRMA] Failed to play:', filename, err);
      stateRef.current.playing = false;
    }
  }, []);

  const stop = useCallback(() => {
    if (stateRef.current.mixer) {
      stateRef.current.mixer.stopAllAction();
    }
    stateRef.current.playing = false;
  }, []);

  const update = useCallback((dt) => {
    const s = stateRef.current;
    if (!s.playing || !s.mixer) return;
    s.mixer.update(dt);
    if (s.action && !s.loop && s.action.time >= s.duration - 0.001) {
      s.playing = false;
      s.filename = null; // allow re-triggering the same animation
      console.log(`[VRMA] Finished: ${s.filename}`);
    }
  }, []);

  return { play, stop, update, stateRef };
}
