import { useRef, useCallback } from 'react';
import * as api from '../utils/api.js';
import { parseBVH, applyBVHFrame } from './useBVH.js';
import { useBuiltinAnimations } from './useBuiltinAnimations.js';

const EMOTION_FACIAL = {
  neutral: 'relaxed.json',
  happy: 'happy.json',
  sad: 'sad.json',
  angry: 'angry.json',
  relaxed: 'relaxed.json',
  surprised: 'surprised.json',
  excited: 'excited.json',
  embarrassed: 'embarrassed.json',
  nervous: 'nervous.json',
  affectionate: 'affectionate.json',
  playful: 'playful.json',
  tired: 'tired.json',
  thoughtful: 'thoughtful.json',
  smug: 'smug.json',
  loving: 'loving.json',
  grateful: 'grateful.json',
  annoyed: 'annoyed.json',
  curious: 'curious.json',
  worried: 'worried.json',
  proud: 'proud.json',
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
  if (vrm.humanoid) return vrm.humanoid.getNormalizedBoneNode?.(name) ?? null;
  if (vrm.boneMap?.[name]) return vrm.boneMap[name];
  // Fallback: traverse scene, try exact match then endsWith
  // (endsWith handles mixamorig:Spine, Head, etc. uniquely without prefix clashes)
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let found = null;
  vrm.scene?.traverse?.((child) => {
    if (!found && child.isBone) {
      const n = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n === lower || n.endsWith(lower)) found = child;
    }
  });
  return found;
}

function getRawBone(vrm, name) {
  // For BVH: VRM uses getRawBoneNode, GLB uses direct bone lookup
  if (vrm.humanoid) return vrm.humanoid.getRawBoneNode?.(name) ?? null;
  // Try bone map first, then scene traversal
  if (vrm.boneMap) return vrm.boneMap[name] ?? null;
  let found = null;
  vrm.scene?.traverse?.((child) => {
    if (!found && child.isBone && child.name.toLowerCase() === name.toLowerCase()) found = child;
  });
  return found;
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
  // { filename, data, elapsed, loop, done } or null
  // done=true means non-looping animation finished — last frame is held until replaced
  const bvh = useRef(null);
  const pending = useRef(null);

  // Captured rest pose (synced from state.restPose each frame)
  const restPoseRef = useRef({});

  // Facial animation queue
  const facial = useRef([]);
  // Smoothed expression values for blend transitions
  const facialBlend = useRef({});
  // Lip sync state (smoothed mouth shape values)
  const lipSync = useRef({ open: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
  const lipWave = useRef(null); // reusable Uint8Array for waveform
  const lipFreq = useRef(null); // reusable Uint8Array for frequency
  const EXPRESSION_NAMES = [
    'happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral',
    'Joy', 'Sorrow', 'Angry', 'Fun', 'Surprised', 'Oh',
    'aa', 'ih', 'ou', 'ee', 'oh',
    'Aa', 'Ih', 'Ou', 'Ee', 'Oh',
  ];

  // Auto-trigger tracking
  const auto = useRef({ talking: false, thinking: false });
  const lastEmotion = useRef(null);

  // Idle animation system categorized by stance
  const IDLE_FILES = {
    neutral: ['neutral_idle.bvh', 'neutral_idle2.bvh'],
    sit: ['sit_idle.bvh', 'sit_idle2.bvh', 'sit_idle3.bvh'],
    kneel: ['neutral_idle.bvh'],
    laying: ['neutral_idle.bvh'],
  };
  const idleRef = useRef({ active: false, filename: null, timer: 0 });
  const currentStance = useRef('neutral'); // Tracks posture so we don't randomly stand/sit

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

    if (bvh.current?.filename === filename && !bvh.current?.done) return;

    let data = parsedCache.current[filename];

    if (!data && textCache.current[filename] && vrmRef.current?.scene) {
      data = parseBVH(textCache.current[filename], vrmRef.current);
      if (data) parsedCache.current[filename] = data;
    }

    if (data) {
      startBVH(filename, data, loop);
      
      // Update stance based on the filename being played
      const name = filename.toLowerCase();
      if (name.includes('sit')) currentStance.current = 'sit';
      else if (name.includes('kneel')) currentStance.current = 'kneel';
      else if (name.includes('lay')) currentStance.current = 'laying';
      else if (name.includes('stand') || name.includes('walk') || name.includes('run') || name.includes('dance')) {
        currentStance.current = 'neutral';
      }
      
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
      if (!data) { console.warn(`[Anim] Parse failed: ${filename}`); pending.current = null; return; }
      parsedCache.current[filename] = data;
      if (pending.current?.filename === filename) {
        startBVH(filename, data, pending.current.loop);
        
        // Update stance based on the filename being played
        const name = filename.toLowerCase();
        if (name.includes('sit')) currentStance.current = 'sit';
        else if (name.includes('kneel')) currentStance.current = 'kneel';
        else if (name.includes('lay')) currentStance.current = 'laying';
        else if (name.includes('stand') || name.includes('walk') || name.includes('run') || name.includes('dance')) {
          currentStance.current = 'neutral';
        }
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
      // Clear queue so old looping expressions don't override the new one
      facial.current = [];
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
    if (!vrm?.scene) return;
    const isVRM = !!vrm.humanoid;

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

    // 2. Apply base pose to bones (VRM uses restPose, GLB resets to identity)
    for (const name of SKELETON_BONES) {
      const node = getBone(vrm, name);
      if (!node) continue;
      if (isVRM) {
        const pose = state.restPose?.current?.[name];
        if (pose) {
          node.quaternion.copy(pose.quaternion);
          node.position.copy(pose.position);
        } else {
          node.rotation.set(0, 0, 0);
          if (name === 'hips') node.position.set(0, 0, 0);
        }
      } else {
        node.rotation.set(0, 0, 0);
        node.position.set(0, 0, 0);
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

    // 3. Builtin animations (blink, eyes, breathing) — VRM only for blink/eyes
    updateBuiltins(vrm, dt, {
      mouseX: state.mouseX || 0,
      mouseY: state.mouseY || 0,
      mouseMoving: state.mouseMoving || false,
    });

    // 4. Propagate normalized → raw (VRM only)
    vrm.humanoid?.update();

    // 5. LookAt and expressions (VRM only)
    vrm.lookAt?.update(dt);
    (vrm.expressionManager || vrm.blendShapeProxy)?.update();

    // 6. Apply BVH frames to bones
    //    For VRM: uses raw bone nodes. For GLB: uses direct bone lookup.
    if (bvh.current) {
      const { data, loop, done } = bvh.current;
      if (!done) {
        bvh.current.elapsed += dt;
      }
      const currentTime = done ? data.duration : bvh.current.elapsed;
      applyBVHFrame(vrm, data, currentTime, loop);

      if (!loop && !done && bvh.current.elapsed >= data.duration) {
        bvh.current.done = true;
      }
    }

    // 7. Material updates (MToon per-frame shader sync) — VRM only
    if (vrm.materials) {
      vrm.materials.forEach((material) => { if (material.update) material.update(dt); });
    }

    // 8. Ensure world matrices are current
    vrm.scene.updateMatrixWorld(true);

    // 9. Spring bone physics — VRM only
    vrm.springBoneManager?.update(dt);
    vrm.nodeConstraintManager?.update();

    // 10. Process facial queue (blend shapes from JSON keyframes)
    const em = isVRM ? (vrm.expressionManager || vrm.blendShapeProxy) : null;

    // Compute target expression values from the active facial animation queue
    const targetExpressions = {};
    const queue = facial.current;
    let hasActiveFacial = false;
    let queueBlendSpeed = 8;
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
      if (frame.expressions) {
        hasActiveFacial = true;
        for (const [expr, val] of Object.entries(frame.expressions)) {
          targetExpressions[expr] = Math.max(targetExpressions[expr] || 0, val);
        }
        queueBlendSpeed = anim.blendSpeed ?? queueBlendSpeed;
      }
    }

    // 10b. Lip sync from audio analyser — drives mouth shapes when talking
    if (state.isTalking && state.analyser) {
      const bins = state.analyser.frequencyBinCount;
      if (!lipWave.current || lipWave.current.length !== bins) {
        lipWave.current = new Uint8Array(bins);
      }
      if (!lipFreq.current || lipFreq.current.length !== bins) {
        lipFreq.current = new Uint8Array(bins);
      }

      // Read both domains — they share the same underlying FFT
      state.analyser.getByteTimeDomainData(lipWave.current);
      state.analyser.getByteFrequencyData(lipFreq.current);

      const wave = lipWave.current;
      const freq = lipFreq.current;
      const lips = lipSync.current;

      // -- RMS volume from waveform (more reliable for loudness) --
      let sumSq = 0;
      for (let i = 0; i < bins; i++) {
        const v = (wave[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / bins);

      // -- Frequency band energy for shape --
      let low = 0, mid = 0, high = 0;
      const lowEnd = Math.floor(bins * 0.12);
      const midEnd = Math.floor(bins * 0.45);
      for (let i = 0; i < bins; i++) {
        const v = freq[i] / 255;
        if (i < lowEnd) low += v;
        else if (i < midEnd) mid += v;
        else high += v;
      }
      low = Math.min(1, low / lowEnd * 1.5);
      mid = Math.min(1, mid / (midEnd - lowEnd) * 1.5);
      high = Math.min(1, high / (bins - midEnd) * 1.5);

      // Noise gate — skip silence
      if (rms > 0.015) {
        // Map RMS to mouth openness with compression
        // Typical speech RMS: 0.02 (quiet) … 0.25 (loud)
        const rawOpen = Math.max(0, (rms - 0.015) * 5);
        const targetOpen = Math.min(0.65, rawOpen);

        // Envelope follower: fast attack (~40ms), slower decay (~120ms)
        const attackRate = Math.min(1, dt * 22);
        const releaseRate = Math.min(1, dt * 8);
        const envRate = targetOpen > lips.open ? attackRate : releaseRate;
        lips.open += (targetOpen - lips.open) * envRate;

        // Only deform mouth shapes when above noise floor
        if (lips.open > 0.03) {
          const totalFreq = low + mid + high + 0.001;
          const lowR = low / totalFreq;
          const midR = mid / totalFreq;
          const highR = high / totalFreq;

          // Shape weights vary by dominant frequency band
          const aaW = midR * 0.7 + highR * 0.2;
          const ohW = lowR * 0.6 + midR * 0.2;
          const ihW = highR * 0.5 + midR * 0.3;
          const eeW = highR * 0.7 + midR * 0.2;
          const ouW = lowR * 0.4 + highR * 0.3;

          const shapeRate = Math.min(1, dt * 12);
          lips.aa += (aaW * lips.open * 0.9 - lips.aa) * shapeRate;
          lips.oh += (ohW * lips.open * 0.7 - lips.oh) * shapeRate;
          lips.ih += (ihW * lips.open * 0.5 - lips.ih) * shapeRate;
          lips.ee += (eeW * lips.open * 0.5 - lips.ee) * shapeRate;
          lips.ou += (ouW * lips.open * 0.6 - lips.ou) * shapeRate;
        }
      } else {
        // Silence — smoothly close mouth
        const decay = Math.min(1, dt * 12);
        for (const k of ['open', 'aa', 'ih', 'ou', 'ee', 'oh']) {
          lips[k] -= lips[k] * decay;
        }
      }

      // Push mouth shapes onto target expressions
      for (const [name, val] of Object.entries(lips)) {
        if (name === 'open') continue;
        if (val > 0.015) {
          targetExpressions[name] = Math.max(targetExpressions[name] || 0, val);
          const upper = name.charAt(0).toUpperCase() + name.slice(1);
          targetExpressions[upper] = Math.max(targetExpressions[upper] || 0, val);
        }
      }
      hasActiveFacial = true;
      queueBlendSpeed = Math.max(queueBlendSpeed, 14);
    }

    // Smoothly blend facial expression values toward targets
    if (em && em.setValue) {
      const blendFactor = Math.min(1, dt * (hasActiveFacial ? queueBlendSpeed : 12));

      // Update the blend buffer toward targets
      const allExpr = new Set([
        ...EXPRESSION_NAMES,
        ...Object.keys(targetExpressions),
        ...Object.keys(facialBlend.current),
      ]);
      for (const expr of allExpr) {
        const target = targetExpressions[expr] ?? 0;
        const current = facialBlend.current[expr] ?? 0;
        const smoothed = current + (target - current) * blendFactor;
        if (smoothed > 0.01) {
          facialBlend.current[expr] = smoothed;
          em.setValue(expr, smoothed);
        } else {
          delete facialBlend.current[expr];
          em.setValue(expr, 0);
        }
      }
    }

    // 7. Auto-trigger: emotion → facial expression + animation lifecycle
    // The server now handles deciding which BVH to play via aiAnimationActive
    const aiActive = state.aiAnimationActive;
    
    // Always trigger facial expressions for the current emotion
    const emotion = state.emotion || 'neutral';
    if (emotion !== lastEmotion.current && state.autoAnimate && !state.isTesting) {
      lastEmotion.current = emotion;
      const facialFile = EMOTION_FACIAL[emotion] || `${emotion}.json`;
      playFacial(facialFile, { blendSpeed: 10 });
    }

    if (aiActive) {
      // Keep aiActive alive while loading or actively playing (not done)
      const stillLoading = pending.current?.filename === aiActive;
      const stillPlaying = bvh.current?.filename === aiActive && !bvh.current?.done;
      if (!stillLoading && !stillPlaying) {
        state.aiAnimationActive = null;
      }
    }

    // 8. Auto-trigger: talking → neutral idle
    if (!aiActive) {
      const isFrozen = (!bvh.current || bvh.current?.done) && !pending.current;
      if (state.isTalking && (!auto.current.talking || isFrozen)) {
        auto.current.talking = true;
        playBVH('neutral_idle.bvh', { loop: true });
      } else if (!state.isTalking && auto.current.talking) {
        auto.current.talking = false;
      }
    } else if (state.isTalking && !auto.current.talking) {
      auto.current.talking = true;
    } else if (!state.isTalking) {
      auto.current.talking = false;
    }

    // 9. Auto-trigger: thinking → confusion
    if (!aiActive) {
      const isFrozen = (!bvh.current || bvh.current?.done) && !pending.current;
      if (state.isThinking && (!auto.current.thinking || isFrozen)) {
        auto.current.thinking = true;
        playBVH('confusion.bvh', { loop: true });
      } else if (!state.isThinking && auto.current.thinking) {
        auto.current.thinking = false;
        if (bvh.current?.filename === 'confusion.bvh') stopBVH();
      }
    } else if (state.isThinking && !auto.current.thinking) {
      auto.current.thinking = true;
    } else if (!state.isThinking) {
      auto.current.thinking = false;
    }

    // 10. Auto-idle: play random idle when nothing else is active
    const currentIdleList = IDLE_FILES[currentStance.current] || IDLE_FILES['neutral'];
    const isAnimDone = bvh.current?.done;
    const idlePlaying = bvh.current && !isAnimDone && currentIdleList.includes(bvh.current.filename);
    
    const shouldIdle = !aiActive
      && (!bvh.current || isAnimDone || idlePlaying)
      && !state.isTalking
      && !state.isThinking
      && (state.emotion === 'neutral' || !state.autoAnimate);

    if (shouldIdle) {
      if (!idleRef.current.active) {
        // Adopt current if it's already an idle in the correct stance, else start one
        if (bvh.current && currentIdleList.includes(bvh.current.filename)) {
          idleRef.current = { active: true, filename: bvh.current.filename, timer: 0 };
        } else {
          const fn = currentIdleList[Math.floor(Math.random() * currentIdleList.length)];
          idleRef.current = { active: true, filename: fn, timer: 0 };
          playBVH(fn, { loop: true });
          if (bvh.current) applyBVHFrame(vrm, bvh.current.data, 0, true);
        }
      } else if (bvh.current && bvh.current.filename !== idleRef.current.filename) {
        // Something else started playing, deactivate idle
        idleRef.current = { active: false, filename: null, timer: 0 };
      } else {
        // Idle is still running — switch after 25-35 seconds
        idleRef.current.timer += dt;
        if (idleRef.current.timer > 25 + Math.random() * 10) {
          const others = currentIdleList.filter(f => f !== idleRef.current.filename);
          // If only 1 idle file in category, just keep playing it
          if (others.length > 0) {
            const fn = others[Math.floor(Math.random() * others.length)];
            idleRef.current = { active: true, filename: fn, timer: 0 };
            playBVH(fn, { loop: true });
            if (bvh.current) applyBVHFrame(vrm, bvh.current.data, 0, true);
          } else {
            idleRef.current.timer = 0;
          }
        }
      }
    } else if (idleRef.current.active) {
      // Something interrupted the idle
      idleRef.current = { active: false, filename: null, timer: 0 };
    }

  }, [updateBuiltins, preloadAll, playBVH, playFacial, stopBVH]);

  const currentAnimation = useCallback(() => {
    if (!bvh.current) return null;
    return {
      filename: bvh.current.filename,
      elapsed: bvh.current.elapsed,
      duration: bvh.current.data?.duration ?? 0,
    };
  }, []);

  return { update, playBVH, playFacial, stopAll, currentAnimation };
}