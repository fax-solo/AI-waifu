import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import * as api from '../utils/api.js';
import { useBVHRetargeting } from './useBVHRetargeting.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolateKeyframes(keyframes, time) {
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0];
  if (time <= keyframes[0].time) return keyframes[0];
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      const result = {};
      if (a.bones || b.bones) {
        result.bones = {};
        const allBoneKeys = new Set([...Object.keys(a.bones || {}), ...Object.keys(b.bones || {})]);
        for (const key of allBoneKeys) {
          const va = a.bones?.[key] || {};
          const vb = b.bones?.[key] || {};
          result.bones[key] = {};
          for (const axis of ['x', 'y', 'z']) {
            if (va[axis] !== undefined || vb[axis] !== undefined) {
              result.bones[key][axis] = lerp(va[axis] || 0, vb[axis] || 0, t);
            }
          }
        }
      }
      if (a.expressions || b.expressions) {
        result.expressions = {};
        const allExprKeys = new Set([...Object.keys(a.expressions || {}), ...Object.keys(b.expressions || {})]);
        for (const key of allExprKeys) {
          result.expressions[key] = lerp(a.expressions?.[key] || 0, b.expressions?.[key] || 0, t);
        }
      }
      return result;
    }
  }
  return keyframes[keyframes.length - 1];
}

export function useAnimationPlayer() {
  const cacheRef = useRef({});
  const activeAnimationsRef = useRef([]);
  const fetchQueueRef = useRef(Promise.resolve());
  const vrmRef = useRef(null);
  const { loadAndRetarget, createMixer } = useBVHRetargeting();
  const bvhEntriesRef = useRef(new Map());

  const fetchAnimation = useCallback(async (type, filename) => {
    const cacheKey = `${type}/${filename}`;
    if (cacheRef.current[cacheKey]) return cacheRef.current[cacheKey];
    try {
      const data = await api.getAnimation(type, filename);
      cacheRef.current[cacheKey] = data;
      return data;
    } catch {
      return null;
    }
  }, []);

  const listAnimations = useCallback(async () => {
    try {
      return await api.getAnimations();
    } catch {
      return { facial: [], body: [] };
    }
  }, []);

  const playAnimation = useCallback((type, filename, options = {}) => {
    const id = `${type}:${filename}:${Date.now()}`;
    const isBvh = filename.toLowerCase().endsWith('.bvh');

    if (isBvh) {
      const entry = {
        id, type, filename, playing: true,
        loop: !!options.loop,
        text: null, loaded: false,
        mixer: null, action: null, clip: null,
        startTime: performance.now(),
      };
      bvhEntriesRef.current.set(id, entry);

      fetchQueueRef.current = fetchQueueRef.current.then(async () => {
        try {
          const text = await api.getAnimationText(type, filename);
          if (entry.playing) entry.text = text;
        } catch (e) {
          console.error('Failed to fetch BVH:', e);
          entry.playing = false;
        }
      });

      return id;
    }

    const entry = {
      id, type, filename, data: null,
      startTime: performance.now(), elapsed: 0,
      playing: true, loop: false, blendSpeed: 8,
      ...options,
    };
    activeAnimationsRef.current.push(entry);

    fetchQueueRef.current = fetchQueueRef.current.then(async () => {
      const data = await fetchAnimation(type, filename);
      if (data) {
        entry.data = data;
        entry.loop = !!data.loop;
        entry.blendSpeed = data.blendSpeed || 8;
        entry.startTime = performance.now();
      } else {
        entry.playing = false;
      }
    });

    return id;
  }, [fetchAnimation]);

  const stopAnimation = useCallback((id) => {
    const bvhEntry = bvhEntriesRef.current.get(id);
    if (bvhEntry) {
      bvhEntry.playing = false;
      return;
    }
    const list = activeAnimationsRef.current;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) { list[i].playing = false; break; }
    }
  }, []);

  const stopAllAnimations = useCallback(() => {
    for (const [, entry] of bvhEntriesRef.current) {
      entry.playing = false;
    }
    activeAnimationsRef.current.forEach(a => { a.playing = false; });
  }, []);

  const initBVHPlayback = useCallback(async (entry, vrm) => {
    try {
      const result = await loadAndRetarget(entry.text, vrm);
      if (!entry.playing) return;
      if (!result || !result.clip) {
        console.warn('[BVH] Retargeting produced no clip:', result?.error || 'unknown');
        entry.playing = false;
        return;
      }
      const { mixer, action } = createMixer(result.clip, vrm);
      entry.mixer = mixer;
      entry.action = action;
      entry.clip = result.clip;
      entry.loaded = true;
      action.setLoop(entry.loop ? THREE.LoopRepeat : THREE.LoopOnce, entry.loop ? Infinity : 1);
      if (!entry.loop) action.clampWhenFinished = true;
      action.play();
    } catch (e) {
      console.error('BVH retarget failed:', e);
      entry.playing = false;
    }
  }, [loadAndRetarget, createMixer]);

  const updateAnimations = useCallback((vrm, deltaTime) => {
    if (!vrm) return;
    vrmRef.current = vrm;

    for (const [id, entry] of bvhEntriesRef.current) {
      if (!entry.playing) {
        if (entry.action) entry.action.stop();
        if (entry.mixer) entry.mixer.stopAllAction();
        bvhEntriesRef.current.delete(id);
        continue;
      }

      if (!entry.loaded && entry.text && vrm?.humanoid) {
        if (!entry._loading) {
          entry._loading = true;
          initBVHPlayback(entry, vrm);
        }
        continue;
      }

      if (entry.loaded && entry.mixer) {
        entry.mixer.update(deltaTime);
        if (!entry.loop && entry.clip && entry.action) {
          if (entry.action.time >= entry.clip.duration - 0.01) {
            entry.playing = false;
          }
        }
      }
    }

    const getBone = (name) => vrm.humanoid?.getNormalizedBoneNode
      ? vrm.humanoid.getNormalizedBoneNode(name)
      : vrm.humanoid?.getBoneNode(name);

    const em = vrm.expressionManager || vrm.blendShapeProxy;

    const list = activeAnimationsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const anim = list[i];
      if (!anim.playing || !anim.data) {
        list.splice(i, 1);
        continue;
      }

      anim.elapsed += deltaTime;
      const duration = anim.data.duration || 1;
      let time = anim.elapsed;

      if (anim.loop) {
        time = time % duration;
      } else if (time >= duration) {
        time = duration;
        anim.playing = false;
      }

      const frame = interpolateKeyframes(anim.data.keyframes, time);
      if (!frame) continue;

      if (frame.bones) {
        for (const [boneName, axes] of Object.entries(frame.bones)) {
          const bone = getBone(boneName);
          if (!bone) continue;
          if (axes.x !== undefined) bone.rotation.x += axes.x;
          if (axes.y !== undefined) bone.rotation.y += axes.y;
          if (axes.z !== undefined) bone.rotation.z += axes.z;
          if (boneName === 'hips' && axes.y !== undefined) {
            bone.position.y += axes.y;
          }
        }
      }

      if (frame.expressions && em?.setValue) {
        for (const [exprName, value] of Object.entries(frame.expressions)) {
          em.setValue(exprName, value);
        }
      }
    }
  }, [initBVHPlayback]);

  useEffect(() => {
    return () => {
      activeAnimationsRef.current = [];
      for (const [, entry] of bvhEntriesRef.current) {
        if (entry.action) entry.action.stop();
        if (entry.mixer) entry.mixer.stopAllAction();
      }
      bvhEntriesRef.current.clear();
    };
  }, []);

  return { playAnimation, stopAnimation, stopAllAnimations, listAnimations, updateAnimations };
}

export default useAnimationPlayer;
