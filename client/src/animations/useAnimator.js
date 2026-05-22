import { useRef, useCallback } from 'react';
import * as api from '../utils/api.js';
import { parseBVH, applyBVHFrame } from './useBVH.js';
import { useBuiltinAnimations } from './useBuiltinAnimations.js';

const EMOTION_BVH = {
  happy: 'joy.bvh',
  surprised: 'surprise.bvh',
  sad: 'sadness.bvh',
  angry: 'anger.bvh',
  fearful: 'fear.bvh',
  disgusted: 'disgust.bvh',
};

const SKELETON_BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  'leftShoulder', 'rightShoulder',
];

function getBone(vrm, name) {
  return vrm.humanoid?.getNormalizedBoneNode?.(name) ?? null;
}

function lerpKeyframes(keyframes, time) {
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0];
  if (time <= keyframes[0].time) return keyframes[0];
  if (time >= keyframes.at(-1).time) return keyframes.at(-1);
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i], b = keyframes[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      const result = {};
      if (a.bones || b.bones) {
        result.bones = {};
        for (const key of new Set([...Object.keys(a.bones || {}), ...Object.keys(b.bones || {})])) {
          const va = a.bones?.[key] || {}, vb = b.bones?.[key] || {};
          result.bones[key] = {};
          for (const axis of ['x', 'y', 'z']) {
            if (va[axis] !== undefined || vb[axis] !== undefined)
              result.bones[key][axis] = (va[axis] || 0) + ((vb[axis] || 0) - (va[axis] || 0)) * t;
          }
        }
      }
      if (a.expressions || b.expressions) {
        result.expressions = {};
        for (const key of new Set([...Object.keys(a.expressions || {}), ...Object.keys(b.expressions || {})])) {
          result.expressions[key] = (a.expressions?.[key] || 0) + ((b.expressions?.[key] || 0) - (a.expressions?.[key] || 0)) * t;
        }
      }
      return result;
    }
  }
  return keyframes.at(-1);
}

export function useAnimator() {
  const { updateBuiltins } = useBuiltinAnimations();
  const vrmRef = useRef(null);
  const textCache = useRef({});
  const parsedCache = useRef({});
  const preloaded = useRef(false);

  // BVH playback state — manually applied, no AnimationMixer
  const bvh = useRef(null);  // { filename, data, elapsed, loop } or null
  const pending = useRef(null);

  // Captured rest pose (synced from state.restPose each frame)
  const restPoseRef = useRef({});

  // Facial animation queue
  const facial = useRef([]);

  // Auto-trigger tracking
  const auto = useRef({ talking: false, thinking: false });
  const lastEmotion = useRef('neutral');

  // ── Preload all BVH texts ────────────────────────────────
  const preloadAll = useCallback(async () => {
    try {
      const { body } = await api.getAnimations();
      const files = body.filter(a => a.format === 'bvh');
      if (files.length === 0) return;
      console.log(`[Anim] Preloading ${files.length} BVH files...`);
      await Promise.all(files.map(async (anim) => {
        try {
          const text = await api.getAnimationText('body', anim.filename);
          textCache.current[anim.filename] = text;
        } catch { /* skip */ }
      }));
      console.log(`[Anim] Cached ${Object.keys(textCache.current).length} BVH texts`);
    } catch { /* silent */ }
  }, []);

  // ── Stop current BVH ─────────────────────────────────────
  const stopBVH = useCallback(() => {
    bvh.current = null;
    pending.current = null;
  }, []);

  // ── Start BVH from parsed data ───────────────────────────
  const startBVH = useCallback((filename, data, loop) => {
    bvh.current = { filename, data, elapsed: 0, loop };
    pending.current = null;
    console.log(`[Anim] Playing ${filename} (${data.duration.toFixed(2)}s, ${loop ? 'loop' : 'once'})`);
  }, []);

  // ── Play BVH (sync from cache if available) ──────────────
  const playBVH = useCallback((filename, options = {}) => {
    const loop = options.loop !== false;

    if (bvh.current?.filename === filename) return;

    let data = parsedCache.current[filename];

    if (!data && textCache.current[filename] && vrmRef.current?.humanoid) {
      data = parseBVH(textCache.current[filename], vrmRef.current);
      if (data) parsedCache.current[filename] = data;
    }

    if (data) {
      startBVH(filename, data, loop);
      return;
    }

    pending.current = { filename, loop };
    loadAsync(filename, loop);
  }, [startBVH]);

  // ── Async load + auto-play ───────────────────────────────
  const loadAsync = useCallback(async (filename, loop) => {
    try {
      const text = await api.getAnimationText('body', filename);
      textCache.current[filename] = text;
      const data = parseBVH(text, vrmRef.current);
      if (!data) { console.warn(`[Anim] Parse failed: ${filename}`); return; }
      parsedCache.current[filename] = data;
      if (pending.current?.filename === filename) {
        startBVH(filename, data, pending.current.loop);
      }
    } catch (e) {
      console.error(`[Anim] Load failed: ${filename}`, e);
      pending.current = null;
    }
  }, [startBVH]);

  // ── Play facial animation ────────────────────────────────
  const playFacial = useCallback((filename, options = {}) => {
    api.getAnimation('facial', filename).then(data => {
      if (!data) return;
      facial.current.push({
        filename,
        data,
        elapsed: 0,
        playing: true,
        blendSpeed: options.blendSpeed ?? data.blendSpeed ?? 8,
      });
    }).catch(() => {});
  }, []);

  // ── Stop all animation (BVH + facial) ────────────────────
  const stopAll = useCallback(() => {
    stopBVH();
    facial.current = [];
    auto.current = { talking: false, thinking: false };
  }, [stopBVH]);

  // ── Main update loop (called every frame) ────────────────
  const update = useCallback((vrm, deltaTime, state = {}) => {
    if (!vrm?.humanoid) return;

    // Clear caches when VRM changes (stale raw node references)
    if (vrm !== vrmRef.current) {
      vrmRef.current = vrm;
      parsedCache.current = {};
      textCache.current = {};
      preloaded.current = false;
      stopBVH();
    }

    if (state.restPose?.current) restPoseRef.current = state.restPose.current;

    if (isNaN(deltaTime) || deltaTime <= 0 || !isFinite(deltaTime)) return;
    const dt = Math.min(deltaTime, 0.05);

    // 1. Preload BVH texts on first frame
    if (!preloaded.current) {
      preloaded.current = true;
      preloadAll();
    }

    // 2. Apply base pose to normalized bones
    for (const name of SKELETON_BONES) {
      const node = getBone(vrm, name);
      if (!node) continue;
      const pose = state.restPose?.current?.[name];
      if (pose) {
        node.quaternion.copy(pose.quaternion);
        node.position.copy(pose.position);
      } else {
        node.rotation.set(0, 0, 0);
        if (name === 'hips') node.position.set(0, 0, 0);
      }
      node.scale.set(1, 1, 1);
    }

    // Reset finger bones
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
      for (const j of ['Proximal', 'Intermediate', 'Distal']) {
        for (const s of ['left', 'right']) {
          const node = getBone(vrm, `${s}${f}${j}`);
          if (node) node.rotation.set(0, 0, 0);
        }
      }
    }

    // 3. Builtin animations (blink, eyes, breathing)
    updateBuiltins(vrm, dt, {
      mouseX: state.mouseX || 0,
      mouseY: state.mouseY || 0,
      mouseMoving: state.mouseMoving || false,
    });

    // 4. VRM internal update (propagates normalized → raw, runs spring bones, expressions)
    vrm.update(dt);
    if (vrm.springBoneManager) vrm.springBoneManager.update(dt);

    // 5. Apply BVH frames directly to RAW bones (overwrites the normalized→raw copy)
    if (bvh.current) {
      bvh.current.elapsed += dt;
      const { data, elapsed, loop } = bvh.current;
      applyBVHFrame(vrm, data, elapsed, loop);

      if (!loop && elapsed >= data.duration) {
        stopBVH();
      }
    }

    // 6. Process facial queue
    const em = vrm.expressionManager || vrm.blendShapeProxy;
    const queue = facial.current;
    for (let i = queue.length - 1; i >= 0; i--) {
      const anim = queue[i];
      if (!anim.playing) { queue.splice(i, 1); continue; }
      anim.elapsed += dt;
      const dur = anim.data.duration || 1;
      let t = anim.elapsed;
      if (anim.data.loop) t %= dur;
      else if (t >= dur) { t = dur; anim.playing = false; }
      const frame = lerpKeyframes(anim.data.keyframes, t);
      if (!frame) continue;
      if (frame.bones) {
        for (const [name, axes] of Object.entries(frame.bones)) {
          const node = getBone(vrm, name);
          if (!node) continue;
          if (axes.x !== undefined) node.rotation.x += axes.x;
          if (axes.y !== undefined) node.rotation.y += axes.y;
          if (axes.z !== undefined) node.rotation.z += axes.z;
          if (name === 'hips' && axes.y !== undefined) node.position.y += axes.y;
        }
      }
      if (frame.expressions && em?.setValue) {
        for (const [expr, val] of Object.entries(frame.expressions)) em.setValue(expr, val);
      }
    }

    // 7. Auto-trigger: emotion → BVH
    const emotion = state.emotion || 'neutral';
    if (emotion !== lastEmotion.current && state.autoAnimate && !state.isTesting) {
      lastEmotion.current = emotion;
      if (emotion !== 'neutral') {
        playFacial(`${emotion}.json`, { blendSpeed: 10 });
        const bvhFile = EMOTION_BVH[emotion];
        if (bvhFile) playBVH(bvhFile, { loop: true });
      }
    }

    // 8. Auto-trigger: talking → neutral idle
    if (state.isTalking && !auto.current.talking) {
      auto.current.talking = true;
      playBVH('neutral_idle.bvh', { loop: true });
    } else if (!state.isTalking && auto.current.talking) {
      auto.current.talking = false;
    }

    // 9. Auto-trigger: thinking → confusion
    if (state.isThinking && !auto.current.thinking) {
      auto.current.thinking = true;
      playBVH('confusion.bvh', { loop: true });
    } else if (!state.isThinking && auto.current.thinking) {
      auto.current.thinking = false;
    }

  }, [updateBuiltins, preloadAll, playBVH, playFacial, stopBVH]);

  return { update, playBVH, playFacial, stopAll };
}