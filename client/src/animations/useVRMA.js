import { useRef, useEffect, useCallback } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';

const FALLBACK_URL = '/animations/body/Relax.vrma';

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
  const fallbackRef = useRef(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    loaderRef.current = loader;

    // Preload fallback VRMA for filling missing bone tracks
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
    const fallbackUrl = isFileProtocol ? FALLBACK_URL : `http://127.0.0.1:3005${FALLBACK_URL}`;
    loader.load(
      fallbackUrl,
      (gltf) => {
        fallbackRef.current = gltf.userData?.vrmAnimations?.[0] ?? null;
        if (fallbackRef.current) {
          console.log(`[VRMA] Fallback loaded: ${fallbackRef.current.humanoidTracks.rotation.size} bone tracks`);
        }
      },
      undefined,
      () => { console.warn('[VRMA] Failed to load fallback, missing bones will stay at rest pose'); },
    );

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

      const anim = anims[0];

      // Fill missing bone tracks from fallback so unanimated bones aren't stuck at T-pose
      const fallback = fallbackRef.current;
      if (fallback) {
        for (const [name, track] of fallback.humanoidTracks.rotation) {
          if (!anim.humanoidTracks.rotation.has(name)) {
            anim.humanoidTracks.rotation.set(name, track);
          }
        }
        for (const [name, track] of fallback.humanoidTracks.translation) {
          if (!anim.humanoidTracks.translation.has(name)) {
            anim.humanoidTracks.translation.set(name, track);
          }
        }
      }

      const clip = createVRMAnimationClip(anim, vrm);
      if (!clip) {
        console.warn('[VRMA] createVRMAnimationClip returned null for:', filename);
        return;
      }

      const boneTracks = clip.tracks.filter(t => t.name.endsWith('.quaternion'));
      console.log(`[VRMA] ${filename}: ${clip.tracks.length} tracks (${boneTracks.length} bone rotations), duration=${clip.duration.toFixed(3)}s`);
      if (boneTracks.length < 20) {
        console.log(`[VRMA] Tracks:`, boneTracks.map(t => t.name));
      } else {
        console.log(`[VRMA] First 5 tracks:`, boneTracks.slice(0,5).map(t => t.name));
        console.log(`[VRMA] Last 5 tracks:`, boneTracks.slice(-5).map(t => t.name));
      }

      let mixer = s.mixer;
      if (mixer) {
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
