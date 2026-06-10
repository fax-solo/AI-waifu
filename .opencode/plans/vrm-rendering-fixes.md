# VRM Rendering Fixes — Complete Implementation Plan

## Phase 1: Fix Disappearing Parts (Critical)

### File: `client/src/animations/useAnimator.js`

#### 1a. Add `materialLookup` ref (after line 280)
```js
const originalMapsRef = useRef({});
const materialLookup = useRef({}); // {matName: material} — stores matched references for restore
```

#### 1b. Fix `'000'` keyword fallback (line 777)
Change:
```js
if (kw === 'n00' || kw === 'instance' || kw.length < 3) continue;
```
To:
```js
if (kw === 'n00' || kw === '000' || kw === 'instance' || kw.length < 3) continue;
```

#### 1c. Store matched material reference (between lines 811 and 813)
Before `const matLower = mat.name?.toLowerCase() || '';`, add:
```js
materialLookup.current[matName] = mat;
```

#### 1d. Remove dead `isOpaqueBase` (line 814)
Delete line:
```js
const isOpaqueBase = ['face', 'head', 'skin', 'body', 'kao'].some(kw => matLower.includes(kw));
```

#### 1e. Fix `isSharpOverlay` keywords (line 817)
Change:
```js
const isSharpOverlay = ['eyelash', 'eyebrow', 'matsuge', 'mayu', 'eye_d', 'overlay', 'eye', 'iris', 'highlight', 'eyewhite', 'hitomi', 'pupil', 'sclera', 'lens', 'ganma', 'expression'].some(kw => matLower.includes(kw));
```
To (match SHARP_ALPHA from useMaterialFix.js — removes bare `'eye'` and ocular keywords):
```js
const isSharpOverlay = ['eyelash', 'eyebrow', 'matsuge', 'mayu', 'eye_d', 'overlay', 'lash', 'brow', 'eye00', 'eye01', 'eye02', '-eye', 'expression'].some(kw => matLower.includes(kw));
```

#### 1f. Fix material restore to use stored reference (line 900)
Change:
```js
const mat = vrm.materials?.find(m => m.name === matName);
```
To:
```js
const mat = materialLookup.current[matName];
```

#### 1g. Re-enable `updateBreathingRaw` and `material.update(dt)` (lines 494-500)
Uncomment:
```js
// 6. Breathing on raw bones
updateBreathingRaw(vrm, dt);

// 7. Material updates (MToon per-frame shader sync)
if (vrm.materials) {
  vrm.materials.forEach((material) => { if (material.update) material.update(dt); });
}
```

#### 1h. Remove frame-by-frame body diagnostic (lines ~1049-1072)
Delete the block added for debugging (starts with `// ── Frame-by-frame body material diagnostic`).

---

## Phase 2: Fix "Bad Looking" — Texture/MToon Pipeline

### File: `client/src/animations/useMaterialFix.js`

#### 2a. Remove generic uniform texture cleanup (lines 343-374)
Replace the entire block that nulls out MToon maps and generic uniform textures. Only keep `_MainTex` checking on skin materials.

Delete lines 343-374:
```js
// Step 3b: Ensure MToon _ShadeTexture / _SphereAdd slots don't...
// Step 4: Null out stray data textures in non-mainTex slots
// (the for loop over MTOON_MAP_PROPS at 368-374)
```

Comment out the loop at lines 352-360 (nukes ALL non-mainTex uniforms) and the loop at 361-367 (standard maps).

#### 2b. Fix cross-material texture swapping (lines 286-292)
Change priority: only use texture from SAME material's other slots. Never grab from namedDiffuse or diffuseCandidates from other materials.

```js
// Before (lines 282-292):
let replacement = thisMatSlots[0];
if (!replacement) {
  const named = namedDiffuse.find(t => t.mat !== mat);
  if (named) replacement = named;
}
if (!replacement) {
  const anyDiffuse = diffuseCandidates.find(t => t.mat !== mat && t.tex !== mainTex);
  if (anyDiffuse) replacement = anyDiffuse;
}

// After:
let replacement = thisMatSlots[0];
// Do NOT grab from other materials — only use same-material slots
```

#### 2c. Fix `premultipliedAlpha` for opaque materials (lines 536-537)
Change:
```js
} else {
  if (mat.premultipliedAlpha !== true) {
    mat.premultipliedAlpha = true;
```
To:
```js
} else if (mat.transparent) {
  if (mat.premultipliedAlpha !== true) {
    mat.premultipliedAlpha = true;
```

This ensures only transparent materials get `premultipliedAlpha=true`.

#### 2d. Fix `getFixMode` ordering for OPAQUE_BASE (lines 37-39)
Move OPAQUE_BASE check to AFTER SHARP_ALPHA, EYE_ALPHA, and MOUTH_INTERIOR checks so `FaceBrow`, `FaceMouth`, etc. get correct classification:
- If name includes 'brow' or 'lash' → return 'cutout' first
- Else if name includes 'face' or 'skin' → return 'opaque_base'

Reorder to check specific categories before broad OPAQUE_BASE.

---

## Phase 3: Fix Skin Color & Gamma

### File: `client/src/animations/useColorSpace.js`

#### 3a. Limit gamma correction (lines 55-81)
Only gamma-correct `mat.color` if it's NOT already in linear space. Skip MToon `shadeColorFactor` gamma correction since MToon manages its own color space.

Change `gammaCorrect` to only touch `mat.color` and skip `shadeColorFactor`:

```js
if (mat.color) {
  gammaCorrectColor(mat.color, 2.2);
  changes.push('color^2.2');
}
// Remove the shadeColorFactor gamma correction
```

### File: `client/src/animations/useMaterialFix.js`

#### 3b. Fix `isDataTexturePixels` thresholds (line 193)
Add color variance check and increase thresholds:
```js
// Before:
return maxL < 0.35 && (maxL - minL) < 0.3 && avg < 0.2;

// After — add luminance STD, relax maxL:
// Data textures have LOW variance AND very low max luminance AND nearly zero color
// A dark skin texture has higher maxL from skin tones
const variance = d.length > 16 ? computeVariance(d) : 1;
return maxL < 0.25 && (maxL - minL) < 0.25 && avg < 0.15 && variance < 0.02;
```

Where `computeVariance` is:
```js
function computeLuminanceVariance(data) {
  const vals = [];
  for (let i = 0; i < data.length; i += 4) {
    vals.push((0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255);
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length;
  return variance;
}
```

#### 3c. Fix `getTexName` for embedded textures (lines 64-70)
Add a fallback: check `tex.source` data type for embedded GLB textures:
```js
function getTexName(tex) {
  if (!tex) return '';
  return tex.name?.toLowerCase()
    || tex.source?.url?.toLowerCase?.()?.split('/')?.pop()?.split('?')?.[0]
    || tex.image?.src?.toLowerCase?.()
    || tex.source?.toJSON?.()?.url?.toLowerCase?.()  // NEW: GLB embedded source
    || '';
}
```

---

## Phase 4: Fix Expression Textures & Render Queue

### File: `client/src/animations/useExpressionTextures.js`

#### 4a. Fix `loadAll()` double execution (line 553 dependency array)
Change `useEffect` to only depend on `vrm` (remove `ready`):
```js
useEffect(() => {
  if (!vrm) return;
  if (!ready) { setReady(true); return; }
  loadAll();
}, [vrm]); // REMOVED: ready
```

But check if `ready` is needed for first-run initialization. Alternative: use a ref to track if loaded:
```js
const loadedRef = useRef(false);
useEffect(() => {
  if (!vrm) return;
  if (!loadedRef.current) {
    loadedRef.current = true;
    loadAll();
  }
}, [vrm]);
```

#### 4b. Fix `'eye'` capture of eyelash/eyebrow (line 71)
Change:
```js
if (mat.name.toLowerCase().includes('eye')) seen.add(mat);
```
To:
```js
const n = mat.name.toLowerCase();
if (n.includes('eye') && !n.includes('lash') && !n.includes('brow')) seen.add(mat);
```

### File: `client/src/animations/useRenderQueue.js`

#### 4c. Fix `classifyMesh` scoring (line 58)
Change scoring to prioritize `FACIAL_LINEWORK` and `OCULAR_ELEMENTS` for eye-related keywords:
```js
// Add scoring bonus for specific categories
const SCORE_BONUS = {
  FACIAL_LINEWORK: 1,
  OCULAR_ELEMENTS: 1,
  INNER_CAVITIES: 0.5,
};
```

And modify scoring:
```js
let score = kw.length + (SCORE_BONUS[key] || 0);
```

#### 4d. Fix `"inner"` in INNER_CAVITIES to be more specific (line 16)
Change `'inner'` to stricter keywords or add exclusion:
```js
match: ['mouth', 'lip', 'kuchi', 'teeth', 'tongue', 'tooth', 'haguki', /*'inner' removed*/, 'gums'],
```

This prevents `inner_dress`, `inner_coat`, `inner_shoe` from being classified as mouth cavities.

---

## Implementation Order

1. Phase 1 (all sub-steps 1a-1h) — fixes disappearing parts
2. Phase 2 (2a-2d) — fixes "bad looking" textures/shading
3. Phase 3 (3a-3c) — fixes skin color issues
4. Phase 4 (4a-4d) — fixes expression textures and render queue
