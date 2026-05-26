import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import * as api from '../utils/api.js';
import { useBuiltinAnimations } from './useBuiltinAnimations.js';
import { useWindowAnchor } from './useWindowAnchor.js';
import { useVRMA } from './useVRMA.js';
import { ExpressionCalibrationMap } from './ExpressionCalibrationMap.js';
import { ExpressionProxy } from './ExpressionProxy.js';
import { ExpressionBlendQueue } from './ExpressionBlendQueue.js';
import { LookAtController } from './LookAtController.js';

const EMOTION_FACIAL = {
  neutral: 'neutral.json',
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
  disgust: 'disgust.json',
  fear: 'fear.json',
  amused: 'amused.json',
  confusion: 'confusion.json',
};

const MOUTH_FACIAL = {
  smile: 'mouth_smile.json',
  frown: 'mouth_frown.json',
  angry: 'mouth_angry.json',
  surprised: 'mouth_surprised.json',
  open: 'mouth_open.json',
  wide: 'mouth_wide.json',
  pucker: 'mouth_pucker.json',
  neutral: 'mouth_neutral.json',
  a: 'mouth_a.json',
  i: 'mouth_i.json',
  u: 'mouth_u.json',
  e: 'mouth_e.json',
  o: 'mouth_o.json',
};

const EYE_FACIAL = {
  wide: 'eye_wide.json',
  happy: 'eye_happy.json',
  angry: 'eye_angry.json',
  sad: 'eye_sad.json',
  surprised: 'eye_surprised.json',
  neutral: 'eye_neutral.json',
  wink_left: 'eye_wink_left.json',
  wink_right: 'eye_wink_right.json',
};

const EMOTION_TO_OVERLAY = {
  happy: { mouth: 'smile', eye: 'happy' },
  sad: { mouth: 'frown', eye: 'sad' },
  angry: { mouth: 'angry', eye: 'angry' },
  surprised: { mouth: 'surprised', eye: 'surprised' },
  excited: { mouth: 'open', eye: 'wide' },
  embarrassed: { mouth: 'smile', eye: 'happy' },
  nervous: { mouth: 'pucker', eye: 'sad' },
  affectionate: { mouth: 'smile', eye: 'happy' },
  playful: { mouth: 'smile', eye: 'wide' },
  tired: { mouth: 'neutral', eye: 'sad' },
  thoughtful: { mouth: 'neutral', eye: 'neutral' },
  smug: { mouth: 'smile', eye: 'happy' },
  loving: { mouth: 'smile', eye: 'happy' },
  grateful: { mouth: 'smile', eye: 'happy' },
  annoyed: { mouth: 'frown', eye: 'angry' },
  curious: { mouth: 'neutral', eye: 'wide' },
  worried: { mouth: 'frown', eye: 'sad' },
  proud: { mouth: 'smile', eye: 'happy' },
  disgust: { mouth: 'frown', eye: 'angry' },
  fear: { mouth: 'surprised', eye: 'wide' },
  amused: { mouth: 'smile', eye: 'happy' },
  confusion: { mouth: 'neutral', eye: 'wide' },
  relaxed: { mouth: 'neutral', eye: 'neutral' },
  neutral: { mouth: 'neutral', eye: 'neutral' },
};

const EXPR_FALLBACK = {
  joy: ['joy', 'happy', 'Joy'],
  sorrow: ['sorrow', 'sad', 'Sorrow'],
  angry: ['angry', 'Angry'],
  surprised: ['surprised', 'Surprised'],
  neutral: ['neutral', 'Neutral'],
  relaxed: ['relaxed', 'Relaxed', 'neutral'],
  fun: ['fun', 'Fun', 'joy', 'happy'],
  love: ['joy', 'happy'],
  loving: ['joy', 'happy'],
  affectionate: ['joy', 'happy'],
  embarrassed: ['joy', 'happy'],
  playful: ['joy', 'happy'],
  excited: ['joy', 'surprised'],
  proud: ['joy', 'angry'],
  smug: ['joy', 'angry'],
  annoyed: ['angry', 'sorrow'],
  worried: ['sorrow', 'sad'],
  nervous: ['sorrow', 'sad'],
  tired: ['sorrow', 'sad'],
  disgust: ['sorrow', 'angry'],
  fear: ['surprised', 'sorrow'],
  curious: ['surprised', 'neutral'],
  thoughtful: ['surprised', 'neutral'],
  grateful: ['joy', 'surprised'],
  sympathetic: ['sorrow', 'sad'],
  happy: ['joy', 'happy', 'Joy'],
  sad: ['sorrow', 'sad', 'Sorrow'],
  angry: ['angry', 'Angry'],
  neutral: ['neutral', 'Neutral'],
  surprised: ['surprised', 'Surprised'],
  relaxed: ['relaxed', 'Relaxed', 'neutral'],
  aa: ['aa', 'A', 'a'],
  ih: ['ih', 'I', 'i'],
  ou: ['ou', 'U', 'u'],
  ee: ['ee', 'E', 'e'],
  oh: ['oh', 'O', 'o'],
  Aa: ['aa', 'A', 'a'],
  Ih: ['ih', 'I', 'i'],
  Ou: ['ou', 'U', 'u'],
  Ee: ['ee', 'E', 'e'],
  Oh: ['oh', 'O', 'o'],
  blinkRight: ['blinkRight', 'Blink_R', 'blink'],
  blinkLeft: ['blinkLeft', 'Blink_L', 'blink'],
  Blink_R: ['blinkRight', 'Blink_R', 'blink'],
  Blink_L: ['blinkLeft', 'Blink_L', 'blink'],
  Surprised: ['surprised'],
  Fun: ['fun', 'Fun', 'joy', 'happy'],
};

function getExpressionNames(em) {
  if (!em) return [];
  try {
    const map = em.expressionMap || em.expressions || em._expressionMap;
    if (map instanceof Map) return [...map.keys()];
    if (typeof map === 'object' && map) return Object.keys(map);
  } catch {}
  return ['happy', 'sad', 'angry', 'neutral', 'Surprised', 'relaxed'];
}

function resolveExpression(name, available, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 3) return null;
  if (available.has(name)) return name;
  const fallbacks = EXPR_FALLBACK[name];
  if (fallbacks) {
    for (const fb of fallbacks) {
      const result = resolveExpression(fb, available, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function isMToon(mat) {
  return mat.type === 'MToonMaterial' || mat.isMToonMaterial || mat.shadeColorFactor !== undefined;
}

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
      if (a.materials || b.materials) {
        result.materials = {};
        if (a.materials) {
          for (const [matName, props] of Object.entries(a.materials)) {
            result.materials[matName] = {};
            for (const [propKey, va] of Object.entries(props)) {
              const vb = b.materials?.[matName]?.[propKey];
              if (vb === undefined) {
                result.materials[matName][propKey] = va;
              } else if (Array.isArray(va)) {
                result.materials[matName][propKey] = va.map((v, j) => v + ((vb[j] || 0) - v) * t);
              } else if (typeof va === 'number') {
                result.materials[matName][propKey] = va + (vb - va) * t;
              }
            }
          }
        }
        if (b.materials) {
          for (const [matName, props] of Object.entries(b.materials)) {
            if (!result.materials[matName]) result.materials[matName] = {};
            for (const [propKey, vb] of Object.entries(props)) {
              if (result.materials[matName][propKey] === undefined) {
                result.materials[matName][propKey] = vb;
              }
            }
          }
        }
      }
      if (a.vfx && t < 0.5) result.vfx = a.vfx;
      else if (b.vfx && t >= 0.5) result.vfx = b.vfx;
      return result;
    }
  }
  return keyframes.at(-1);
}

export function useAnimator({ getTexture, onVFX } = {}) {
  const { updateBuiltins, updateBreathingRaw } = useBuiltinAnimations();
  const windowAnchor = useWindowAnchor();
  const vrma = useVRMA();
  const vrmRef = useRef(null);
  const calibrationRef = useRef(null);
  const proxyRef = useRef(null);
  const blendQueueRef = useRef(null);
  const lookAtRef = useRef(null);

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

  // Material animation state (for facial JSON material animations)
  const targetMaterials = useRef(null);
  const materialBlend = useRef({});
  const getTextureRef = useRef(getTexture || (() => null));
  const originalMapsRef = useRef({});
  const materialLookup = useRef({}); // {matName: material} — stored references for correct restore

  // VFX effect state
  const vfxState = useRef({ effects: [], changed: false });
  const onVFXRef = useRef(onVFX || null);

  // Keep these callbacks synced if they change
  useEffect(() => {
    getTextureRef.current = getTexture || (() => null);
  }, [getTexture]);
  useEffect(() => {
    onVFXRef.current = onVFX || null;
  }, [onVFX]);

  // Runtime-discovered expression names cache
  let _exprNames = null;
  let _discoveredExprs = false;
  let mtoonWarned = null;

  // Auto-trigger tracking
  const auto = useRef({ talking: false, thinking: false });
  const lastEmotion = useRef(null);
  const lastMouth = useRef(null);
  const lastEye = useRef(null);

  // Body animations disabled — all animation files removed

  // ── Play body animation (unified entry point) ────────
  // Disabled — body animation files have been removed.
  const playBodyAnimation = useCallback(async (_filename, _options = {}) => {}, []);

  // ── Stop all animation (facial) ─────────────────────
  const stopAll = useCallback(() => {
    vrma.stop();
    facial.current = [];
    auto.current = { talking: false, thinking: false };
    lastEmotion.current = null;
    lastMouth.current = null;
    lastEye.current = null;
  }, [vrma.stop]);

  // ── Play VRMA animation (delegates to playBodyAnimation) ──
  const playVRMA = useCallback((filename, options = {}) => {
    return playBodyAnimation(filename, options);
  }, [playBodyAnimation]);

  // ── Play facial animation ───────────────────────────
  const playFacial = useCallback((filename, options = {}) => {
    api.getAnimation('facial', filename).then(data => {
      if (!data) { console.warn(`[Anim] Facial ${filename}: no data`); return; }
      console.log(`[Anim] Facial: ${filename}`, JSON.stringify(data.keyframes?.[0]?.expressions));
      facial.current = [];
      targetMaterials.current = data.materialReset || null;
      vfxState.current = { effects: [], changed: false };
      facial.current.push({
        filename,
        data,
        elapsed: 0,
        playing: true,
        blendSpeed: options.blendSpeed ?? data.blendSpeed ?? 8,
      });
    }).catch((err) => {
      console.warn(`[Anim] Facial ${filename} failed:`, err?.message);
    });
  }, []);

  // ── Play facial overlay (pushes to queue without clearing) ──
  const playFacialOverlay = useCallback((filename, options = {}) => {
    api.getAnimation('facial', filename).then(data => {
      if (!data) { console.warn(`[Anim] Overlay ${filename}: no data`); return; }
      console.log(`[Anim] Overlay: ${filename}`, JSON.stringify(data.keyframes?.[0]?.expressions));
      const category = options.category || 'default';
      const queue = facial.current;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].category === category) queue.splice(i, 1);
      }
      queue.push({
        category,
        filename,
        data,
        elapsed: 0,
        playing: true,
        blendSpeed: options.blendSpeed ?? data.blendSpeed ?? 10,
      });
    }).catch((err) => {
      console.warn(`[Anim] Overlay ${filename} failed:`, err?.message);
    });
  }, []);

  // ── Main update loop (called every frame) ───────────
  const update = useCallback((vrm, deltaTime, state = {}) => {
    if (!vrm?.scene) return;
    const isVRM = !!vrm.humanoid;

    // Clear caches when VRM changes
    if (vrm !== vrmRef.current) {
      vrmRef.current = vrm;
      windowAnchor.init(vrm);
      vrma.stop();
      const modelId = vrm?.meta?.name || `vrm_${Date.now()}`;
      const em = isVRM ? (vrm.expressionManager || vrm.blendShapeProxy) : null;
      const cal = new ExpressionCalibrationMap(modelId);
      const proxy = em ? new ExpressionProxy(em, cal) : null;
      const queue = proxy ? new ExpressionBlendQueue(proxy) : null;
      const lookCtrl = isVRM ? new LookAtController(vrm) : null;
      calibrationRef.current = cal;
      proxyRef.current = proxy;
      blendQueueRef.current = queue;
      lookAtRef.current = lookCtrl;
    }

    if (state.restPose?.current) restPoseRef.current = state.restPose.current;

    if (isNaN(deltaTime) || deltaTime <= 0 || !isFinite(deltaTime)) return;
    const rawDt = Math.min(deltaTime, 0.05);
    const dt = windowAnchor.update(rawDt, vrm);

    // 1. Apply base pose to bones (VRM uses restPose, GLB resets to identity)
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

    // 2. Builtin animations (blink, eyes, breathing on normalized)
    //    Blink sets blend → expressionManager state, eyes set lookAt.yaw/pitch,
    //    breathing on normalized is overwritten by VRMA (harmless)
    updateBuiltins(vrm, dt, {
      mouseX: state.mouseX || 0,
      mouseY: state.mouseY || 0,
      mouseMoving: state.mouseMoving || false,
      proxy: proxyRef.current,
      queue: blendQueueRef.current,
      lookAtController: lookAtRef.current,
    });

    // 3. VRMA animation update (applies to normalized bones)
    vrma.update(dt);

    // 4. LookAt and expressions — override VRMA for eyes on normalized
    vrm.lookAt?.update(dt);
    (vrm.expressionManager || vrm.blendShapeProxy)?.update();

    // 5. Propagate normalized → raw — runs AFTER expressions so raw bones get final pose
    if (vrm.humanoid) {
      vrm.humanoid.update();
    }

    // 6. Breathing on raw bones — additive offsets on top of final raw pose
    updateBreathingRaw(vrm, dt);

    // 7. Material updates (MToon per-frame shader sync) — VRM only
    if (vrm.materials) {
      vrm.materials.forEach((material) => { if (material.update) material.update(dt); });
    }

    // 8. Ensure world matrices are current
    vrm.scene.updateMatrixWorld(true);

    // 9. NaN guard — reset any bone with NaN/Infinity quaternions
    vrm.scene?.traverse?.((child) => {
      if (!child.isBone) return;
      const q = child.quaternion;
      if (!isFinite(q.x) || !isFinite(q.y) || !isFinite(q.z) || !isFinite(q.w)) {
        q.identity();
      }
      const p = child.position;
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) {
        p.set(0, 0, 0);
      }
    });

    // 10. Spring bone physics — VRM only
    vrm.springBoneManager?.update(dt);
    vrm.nodeConstraintManager?.update();

    // 11. Process facial queue (blend shapes from JSON keyframes)
    const proxy = proxyRef.current;
    const rawEm = isVRM ? (vrm.expressionManager || vrm.blendShapeProxy) : null;

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
            targetExpressions[expr] = val;
          }
          queueBlendSpeed = anim.blendSpeed ?? queueBlendSpeed;
        }
        queueBlendSpeed = Math.min(queueBlendSpeed, 6);
       if (frame.materials) {
         hasActiveFacial = true;
         if (!targetMaterials.current) targetMaterials.current = {};
         for (const [matName, props] of Object.entries(frame.materials)) {
           if (!targetMaterials.current[matName]) targetMaterials.current[matName] = {};
           for (const [propKey, value] of Object.entries(props)) {
             targetMaterials.current[matName][propKey] = value;
           }
         }
       }
       if (frame.vfx) {
         const effects = Array.isArray(frame.vfx) ? frame.vfx : [frame.vfx];
         vfxState.current = { effects, changed: true };
         console.log('[Anim] VFX trigger:', effects);
         if (onVFXRef.current) onVFXRef.current(effects);
       }
     }

     // 10b. Lip sync from audio analyser
    if (state.isTalking && state.analyser) {
      const bins = state.analyser.frequencyBinCount;
      if (!lipWave.current || lipWave.current.length !== bins) {
        lipWave.current = new Uint8Array(bins);
      }
      if (!lipFreq.current || lipFreq.current.length !== bins) {
        lipFreq.current = new Uint8Array(bins);
      }

      state.analyser.getByteTimeDomainData(lipWave.current);
      state.analyser.getByteFrequencyData(lipFreq.current);

      const wave = lipWave.current;
      const freq = lipFreq.current;
      const lips = lipSync.current;

      let sumSq = 0;
      for (let i = 0; i < bins; i++) {
        const v = (wave[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / bins);

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

      if (rms > 0.015) {
        const rawOpen = Math.max(0, (rms - 0.015) * 5);
        const targetOpen = Math.min(0.65, rawOpen);

        const attackRate = Math.min(1, dt * 22);
        const releaseRate = Math.min(1, dt * 8);
        const envRate = targetOpen > lips.open ? attackRate : releaseRate;
        lips.open += (targetOpen - lips.open) * envRate;

        if (lips.open > 0.03) {
          const totalFreq = low + mid + high + 0.001;
          const lowR = low / totalFreq;
          const midR = mid / totalFreq;
          const highR = high / totalFreq;

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
        const decay = Math.min(1, dt * 12);
        for (const k of ['open', 'aa', 'ih', 'ou', 'ee', 'oh']) {
          lips[k] -= lips[k] * decay;
        }
      }

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

    if (proxy && proxy.getRawEm()) {
      const blendFactor = Math.min(1, dt * (hasActiveFacial ? queueBlendSpeed : 12));
      const presetWeights = proxy.resolveTargets(targetExpressions);
      const allPresets = new Set([
        ...proxy.getResolvedPresets().keys(),
        ...presetWeights.keys(),
        ...Object.keys(facialBlend.current),
      ]);

      for (const preset of allPresets) {
        if (!proxy.hasPreset(preset)) {
          if (facialBlend.current[preset] != null) {
            delete facialBlend.current[preset];
            proxy.setWeight(preset, 0);
          }
          continue;
        }
        const target = presetWeights.get(preset) ?? 0;
        const current = facialBlend.current[preset] ?? 0;
        const smoothed = current + (target - current) * blendFactor;
        if (smoothed > 0.01) {
          facialBlend.current[preset] = smoothed;
          proxy.setWeight(preset, smoothed);
        } else {
          delete facialBlend.current[preset];
          proxy.setWeight(preset, 0);
        }
      }
    } else if (rawEm && rawEm.setValue) {
      const blendFactor = Math.min(1, dt * (hasActiveFacial ? queueBlendSpeed : 12));
      const available = new Set(_exprNames || (_exprNames = getExpressionNames(rawEm)));
      const merged = {};
      for (const [expr, val] of Object.entries(targetExpressions)) {
        const resolved = resolveExpression(expr, available);
        if (resolved) {
          merged[resolved] = Math.max(merged[resolved] || 0, val);
        }
      }
      const allKeys = new Set([...available, ...Object.keys(merged), ...Object.keys(facialBlend.current)]);
      for (const key of allKeys) {
        if (!available.has(key)) {
          if (facialBlend.current[key] != null) {
            delete facialBlend.current[key];
            rawEm.setValue(key, 0);
          }
          continue;
        }
        const target = Math.min(merged[key] ?? 0, 0.8);
        const current = facialBlend.current[key] ?? 0;
        const smoothed = current + (target - current) * blendFactor;
        if (smoothed > 0.01) {
          facialBlend.current[key] = smoothed;
          rawEm.setValue(key, smoothed);
        } else {
          delete facialBlend.current[key];
          rawEm.setValue(key, 0);
        }
      }
    }

    if (proxy && !proxy.isDiscovered()) {
      proxy.discover();
      console.log('[Anim] Model expressions:', [...proxy.getAvailable()].join(', '));
      const presets = proxy.getResolvedPresets();
      if (presets.size > 0) {
        console.log('[Anim] Preset mappings:', [...presets.entries()].map(([p, r]) => `${p}→${r}`).join(', '));
      }
    }

     // 10c. Material value animation from facial keyframes
     if (targetMaterials.current) {
       const matBlend = materialBlend.current;
       const tmat = targetMaterials.current;
       const mBlend = Math.min(1, dt * (hasActiveFacial ? queueBlendSpeed : 8));

       for (const [matName, props] of Object.entries(tmat)) {
          let mat = vrm.materials?.find(m => m.name === matName);
          if (!mat) {
            const lower = matName.toLowerCase();
            mat = vrm.materials?.find(m => m.name && m.name.toLowerCase().includes(
              lower.replace(/ \(instance\)/i, '').replace(/\(instance\)/i, '').trim()
            ));
          }
          if (!mat) {
            const cleaned = matName.toLowerCase().replace(/ \(instance\)/i, '').trim();
            const keywords = cleaned.split(/[_\s]+/).filter(Boolean);
            const isEyeTex = Object.keys(props).some(k => k === 'map' || k === 'emissiveMap')
              && matName.toLowerCase().includes('eye');
            for (const kw of keywords) {
              if (kw === 'n00' || kw === '000' || kw === 'instance' || kw.length < 3) continue;
              if (isEyeTex && kw === 'eye') continue;
              mat = vrm.materials?.find(m => m.name && m.name.toLowerCase().includes(kw));
              if (mat) break;
            }
            if (!mat) {
              const semanticHints = {
                'skin': ['face', 'skin', 'body', 'kao', 'head'],
                'eye_highlight': ['highlight', 'hiLight', 'eye_highlight', 'hitomi'],
                'eye_iris': ['iris', 'eye_iris', 'eye'],
                'eye_white': ['white', 'eyewhite', 'shiro'],
                'mouth': ['mouth', 'lip', 'kuchi', 'teeth', 'tooth', 'haguki', 'gums'],
                'eyelash': ['eyelash', 'matsuge', 'eyebrow', 'mayu'],
              };
              const propsLower = matName.toLowerCase();
              let category = null;
              if (isEyeTex) {
                if (propsLower.includes('highlight')) category = 'eye_highlight';
                else if (propsLower.includes('iris')) category = 'eye_iris';
                else if (propsLower.includes('white')) category = 'eye_white';
                else category = 'eye_iris';
              } else if (keywords.some(k => ['face', 'skin', 'body', 'kao', 'head'].includes(k))) {
                category = 'skin';
              } else if (keywords.some(k => ['mouth', 'lip', 'kuchi', 'teeth'].includes(k))) {
                category = 'mouth';
              }
              if (category) {
                for (const hint of semanticHints[category]) {
                  mat = vrm.materials?.find(m => m.name && m.name.toLowerCase().includes(hint));
                  if (mat) break;
                }
              }
            }
          }
          if (!mat) continue;
          materialLookup.current[matName] = mat;

          const matLower = mat.name?.toLowerCase() || '';
          const isBlush = ['blush', 'cheek', 'hoho'].some(kw => matLower.includes(kw));

          const isSharpOverlay = ['eyelash', 'eyebrow', 'matsuge', 'mayu', 'eye_d', 'overlay', 'lash', 'brow', 'eye00', 'eye01', 'eye02', '-eye', 'expression'].some(kw => matLower.includes(kw));

          const isMouth = ['mouth', 'lip', 'kuchi', 'teeth', 'tongue', 'tooth', 'haguki', 'inner', 'gums'].some(kw => matLower.includes(kw));

          if (isBlush && !mat.transparent) {
            mat.transparent = true;
            mat.depthWrite = false;
            mat.alphaTest = 0;
            mat.premultipliedAlpha = true;
            mat.needsUpdate = true;
          } else if (isSharpOverlay && mat.alphaTest !== 0.5) {
            mat.transparent = true;
            mat.alphaTest = 0.5;
            mat.depthWrite = true;
            mat.premultipliedAlpha = true;
            mat.needsUpdate = true;
            if (mat.defines) { mat.defines.ALPHATEST = '1'; }
          } else if (isMouth && mat.side !== 2) {
            mat.side = 2;
            mat.transparent = true;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }

          if (!matBlend[matName]) matBlend[matName] = {};

         for (const [propKey, value] of Object.entries(props)) {
           if (propKey === 'emissiveMap' || propKey === 'map') {
             if (!originalMapsRef.current[matName]) {
               originalMapsRef.current[matName] = {};
             }
             if (!(propKey in originalMapsRef.current[matName])) {
               originalMapsRef.current[matName][propKey] = mat[propKey] || null;
             }
             if (value != null) {
               const tex = getTextureRef.current(value);
               if (tex) {
                 if (propKey === 'map') mat.map = tex;
                 else mat.emissiveMap = tex;
               }
             } else {
               const orig = originalMapsRef.current[matName]?.[propKey];
               if (orig !== undefined) mat[propKey] = orig || null;
             }
             matBlend[matName][propKey] = value;
             continue;
           }
           const mtoonOnly = ['shadeColorFactor', 'shadeMultiplyFactor', 'emissiveIntensity', 'outlineColor', 'outlineWidth'];
           if (mtoonOnly.includes(propKey) && !isMToon(mat)) {
             if (mtoonWarned !== matName) {
               mtoonWarned = matName;
               console.warn('[Anim] Skipping MToon prop "' + propKey + '" on non-MToon material:', matName);
             }
             continue;
           }
           const current = matBlend[matName][propKey];
           let smoothed;
           if (Array.isArray(value)) {
             if (!current || current.length !== value.length) {
               smoothed = [...value];
               matBlend[matName][propKey] = smoothed;
             } else {
               smoothed = current.map((v, j) => v + (value[j] - v) * mBlend);
               for (let j = 0; j < value.length; j++) matBlend[matName][propKey][j] = smoothed[j];
             }
             if (mat[propKey] && mat[propKey].isColor) {
               mat[propKey].setRGB(smoothed[0], smoothed[1], smoothed[2]);
             } else {
               mat[propKey] = smoothed;
             }
           } else if (typeof value === 'number') {
             smoothed = (current != null ? current : value) + (value - (current != null ? current : value)) * mBlend;
             matBlend[matName][propKey] = smoothed;
             mat[propKey] = smoothed;
           }
         }
       }

        if (!hasActiveFacial) {
          for (const [matName, props] of Object.entries(tmat)) {
            for (const propKey of Object.keys(props)) {
              if (propKey === 'emissiveMap' || propKey === 'map') {
                const orig = originalMapsRef.current[matName]?.[propKey];
                const mat = materialLookup.current[matName];
                if (orig !== undefined && mat) mat[propKey] = orig || null;
                const origEm = originalMapsRef.current[matName]?.originalEmissive;
                if (origEm && mat?.emissive) {
                  mat.emissive.setRGB(origEm[0], origEm[1], origEm[2]);
                  if (matBlend[matName]) delete matBlend[matName].emissive;
                }
                delete originalMapsRef.current[matName]?.[propKey];
                delete originalMapsRef.current[matName]?.originalEmissive;
                continue;
              }
              const decay = Math.min(1, dt * 4);
              const current = matBlend[matName]?.[propKey];
              const target = tmat[matName]?.[propKey];
              if (current != null && target != null) {
                if (Array.isArray(current)) {
                  for (let j = 0; j < current.length; j++) {
                    current[j] += (target[j] - current[j]) * decay;
                  }
                } else if (typeof current === 'number') {
                  matBlend[matName][propKey] = current + (target - current) * decay;
                }
              }
            }
          }
        }
     }

     // 12. Auto-trigger: emotion → facial expression + animation lifecycle
    const aiActive = state.aiAnimationActive;
    
    const emotion = state.emotion || 'neutral';
    if (emotion !== lastEmotion.current && state.autoAnimate && !state.isTesting) {
      lastEmotion.current = emotion;
      lastMouth.current = state.mouthExpression || null;
      lastEye.current = state.eyeExpression || null;
      const facialFile = EMOTION_FACIAL[emotion] || `${emotion}.json`;
      playFacial(facialFile, { blendSpeed: 10 });
      if (!state.mouthExpression) {
        const overlay = EMOTION_TO_OVERLAY[emotion];
        if (overlay?.mouth) {
          const mouthFile = MOUTH_FACIAL[overlay.mouth];
          if (mouthFile) playFacialOverlay(mouthFile, { blendSpeed: 8, category: 'mouth' });
        }
      }
      if (!state.eyeExpression) {
        const overlay = EMOTION_TO_OVERLAY[emotion];
        if (overlay?.eye) {
          const eyeFile = EYE_FACIAL[overlay.eye];
          if (eyeFile) playFacialOverlay(eyeFile, { blendSpeed: 8, category: 'eye' });
        }
      }
    }

    if (state.mouthExpression !== undefined && state.mouthExpression !== lastMouth.current) {
      lastMouth.current = state.mouthExpression;
      if (state.mouthExpression) {
        const mouthFile = MOUTH_FACIAL[state.mouthExpression];
        if (mouthFile) playFacialOverlay(mouthFile, { blendSpeed: 8, category: 'mouth' });
      }
    }
    if (state.eyeExpression !== undefined && state.eyeExpression !== lastEye.current) {
      lastEye.current = state.eyeExpression;
      if (state.eyeExpression) {
        const eyeFile = EYE_FACIAL[state.eyeExpression];
        if (eyeFile) playFacialOverlay(eyeFile, { blendSpeed: 8, category: 'eye' });
      }
    }

    if (aiActive) {
      const stillLoading = loadingBody.current;
      const stillPlaying = vrma.stateRef.current.filename === aiActive && vrma.stateRef.current.playing;
      if (!stillLoading && !stillPlaying) {
        state.aiAnimationActive = null;
      }
    }

    // 13-15. Body animation auto-trigger DISABLED (animation files removed)

  }, [updateBuiltins, updateBreathingRaw, playBodyAnimation, playFacial]);

  const currentAnimation = useCallback(() => {
    if (!vrma.stateRef.current.playing) return null;
    return {
      filename: vrma.stateRef.current.filename,
      elapsed: 0,
      duration: vrma.stateRef.current.duration ?? 0,
    };
  }, [vrma.stateRef]);

  return { update, playBVH: playBodyAnimation, playVRMA, playFacial, playFacialOverlay, stopAll, currentAnimation };
}
