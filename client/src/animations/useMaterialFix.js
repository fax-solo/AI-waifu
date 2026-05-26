import { useRef, useCallback } from 'react';
import * as THREE from 'three';

// ── Keyword classification (matches spec Layer Classification) ──

const OPAQUE_BASE = ['face', 'head', 'skin', 'body', 'kao'];
const SOFT_ALPHA = ['blush', 'cheek', 'hoho'];
const SHARP_ALPHA = ['eyelash', 'eyebrow', 'matsuge', 'mayu', 'eye_d', 'overlay', 'expression', 'lash', 'brow', 'eye00', 'eye01', 'eye02', '-eye'];
const EYE_ALPHA = ['eye', 'iris', 'highlight', 'eyewhite', 'hitomi', 'pupil', 'sclera', 'lens', 'ganma'];
const MOUTH_INTERIOR = ['mouth', 'lip', 'kuchi', 'teeth', 'tongue', 'tooth', 'haguki'];

// Data texture filename patterns — channel-packed lightmaps, shadow masks, AO, etc.
const DATA_TEX_PATTERNS = [
  /lightmap/i, /shadowmask/i, /shadowmap/i, /ambientocclusion/i,
  /ao\b/i, /_g$/i, /_r$/i, /bump/i, /normal/i, /nrml?/i,
  /specular/i, /roughness/i, /metalness/i, /gloss/i, /disp/i,
  /opacity/i, /translucency/i, /thickness/i,
];

// Diffuse/albedo texture filename patterns (real color maps)
const DIFFUSE_TEX_PATTERNS = [
  /_tex/i, /_diffuse/i, /_diff$/i, /_skin/i, /_color/i,
  /_base/i, /_albedo/i, /_d\./i, /_c\./i,
  /body/i, /face/i, /head/i,
];

const DEFAULT_SKIN_COLOR = new THREE.Color(0xffe0c0);

function isMToon(mat) {
  return mat.type === 'MToonMaterial' || mat.isMToonMaterial || mat.shadeColorFactor !== undefined;
}

function getFixMode(mat) {
  if (!mat?.name) return null;
  const n = mat.name.toLowerCase();

  // Check specific categories FIRST before broad OPAQUE_BASE
  // to prevent FaceBrow/FaceMouth being misclassified as opaque
  for (const kw of SHARP_ALPHA) {
    if (n.includes(kw)) return 'cutout';
  }
  for (const kw of EYE_ALPHA) {
    const strict = kw === 'eye';
    if (strict ? (n === kw || n.endsWith(kw)) : n.includes(kw)) return 'eye';
  }
  for (const kw of MOUTH_INTERIOR) {
    if (n.includes(kw)) return 'mouth';
  }
  for (const kw of OPAQUE_BASE) {
    if (n.includes(kw)) return 'opaque_base';
  }
  for (const kw of SOFT_ALPHA) {
    if (n.includes(kw)) return 'transparent';
  }

  return null;
}

function isCutoutMode(mode) { return mode === 'cutout'; }
function isEyeMode(mode) { return mode === 'eye'; }
function isTransparentMode(mode) { return mode === 'transparent'; }

// ── Skin texture audit ──────────────────────────────────────

function getTexName(tex) {
  if (!tex) return '';
  return tex.name?.toLowerCase()
    || tex.source?.url?.toLowerCase?.()?.split('/')?.pop()?.split('?')?.[0]
    || tex.image?.src?.toLowerCase?.()
    || tex.source?.toJSON?.()?.url?.toLowerCase?.()
    || '';
}

function isDataPattern(name) {
  return DATA_TEX_PATTERNS.some(p => p.test(name));
}

function isDiffusePattern(name) {
  return DIFFUSE_TEX_PATTERNS.some(p => p.test(name));
}

// Read raw RGBA pixels from any Three.js texture (DataTexture, ImageBitmap, HTMLImage, Canvas)
function readTexturePixels(tex) {
  if (!tex?.image) return null;
  const img = tex.image;
  try {
    // DataTexture / CompressedTexture: raw buffer
    if (img.data && img.width && img.height) {
      return { data: img.data, width: img.width, height: img.height };
    }
    // HTMLImage / HTMLCanvas / ImageBitmap
    if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
      const c = document.createElement('canvas');
      c.width = Math.min(img.width, 32);
      c.height = Math.min(img.height, 32);
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      return { data: id.data, width: c.width, height: c.height };
    }
  } catch { /* fall through */ }
  return null;
}

// ── Alpha channel helpers for cutout textures ────────────────

function checkTextureAlpha(tex) {
  const px = readTexturePixels(tex);
  if (!px) return null;
  const d = px.data;
  let minA = 255, maxA = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < minA) minA = d[i];
    if (d[i] > maxA) maxA = d[i];
  }
  return { min: minA, max: maxA, range: maxA - minA };
}

// Convert an image source (HTMLImageElement/HTMLCanvasElement/ImageBitmap)
// to full-size RGBA pixels, then derive alpha from luminance inverse.
// Bright pixels become transparent, dark pixels remain opaque.
function generateLuminanceAlphaTexture(tex) {
  if (!tex?.image) return null;
  const img = tex.image;
  // Get source dimensions
  let w, h, source;
  if (img instanceof HTMLImageElement || img instanceof ImageBitmap) {
    w = img.width; h = img.height; source = img;
  } else if (img instanceof HTMLCanvasElement) {
    w = img.width; h = img.height; source = img;
  } else if (img.data && img.width && img.height) {
    // DataTexture / raw buffer — convert in-place
    const d = img.data;
    let maxL = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      if (l > maxL) maxL = l;
    }
    const threshold = maxL * 0.55;
    for (let i = 3; i < d.length; i += 4) {
      const l = 0.299 * d[i-3] + 0.587 * d[i-2] + 0.114 * d[i-1];
      d[i] = l > threshold ? 0 : 255;
    }
    const newTex = tex.clone();
    newTex.premultiplyAlpha = false;
    newTex.colorSpace = THREE.SRGBColorSpace;
    newTex.needsUpdate = true;
    return newTex;
  } else {
    return null;
  }
  // Draw full resolution to canvas, read back, compute alpha
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  // Compute luminance of entire image, find threshold to separate
  // bright (background) from dark (linework)
  let maxL = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    if (l > maxL) maxL = l;
  }
  const threshold = maxL * 0.55;
  for (let i = 3; i < d.length; i += 4) {
    const l = 0.299 * d[i-3] + 0.587 * d[i-2] + 0.114 * d[i-1];
    d[i] = l > threshold ? 0 : 255;
  }
  ctx.putImageData(id, 0, 0);
  const newTex = new THREE.CanvasTexture(c);
  newTex.premultiplyAlpha = false;
  newTex.colorSpace = THREE.SRGBColorSpace;
  newTex.needsUpdate = true;
  return newTex;
}

function isDataTexturePixels(tex) {
  const px = readTexturePixels(tex);
  if (!px) return null;
  const d = px.data;
  let maxL = 0, minL = 1, sum = 0;
  const count = d.length / 4;
  const vals = [];
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255;
    vals.push(l);
    if (l > maxL) maxL = l;
    if (l < minL) minL = l;
    sum += l;
  }
  const avg = sum / count;
  const variance = vals.reduce((sumV, v) => sumV + (v - avg) ** 2, 0) / vals.length;
  // Data textures: very low max luminance, narrow range, low avg, near-zero variance
  // Higher thresholds and variance check prevents false-flagging dark skin
  return maxL < 0.25 && (maxL - minL) < 0.25 && avg < 0.15 && variance < 0.02;
}

function isSuspectTexture(tex) {
  if (!tex) return false;
  const name = getTexName(tex);
  if (name && isDataPattern(name)) return true;
  if (name && isDiffusePattern(name)) return false;

  // Pixel analysis (works with DataTexture raw buffers too)
  const pxResult = isDataTexturePixels(tex);
  if (pxResult === true) return true;
  if (pxResult === false) return false;

  // Can't determine — assume safe
  return false;
}

function isProperDiffuse(tex) {
  if (!tex) return false;
  const name = getTexName(tex);
  if (name && isDiffusePattern(name)) return true;
  if (name && isDataPattern(name)) return false;
  const pxResult = isDataTexturePixels(tex);
  if (pxResult === true) return false;
  return true; // not obviously wrong → safe
}

const MTOON_MAP_PROPS = ['shadeMap', 'sphereAdd', 'rimMap', 'shadingGradeMap'];

function collectAllTextures(vrm) {
  const seen = new Set();
  const textures = [];
  vrm.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      // Standard Three.js map properties
      for (const key of Object.keys(mat)) {
        if (key.endsWith('Map')) {
          const tex = mat[key];
          if (tex && tex.isTexture && !seen.has(tex)) { seen.add(tex); textures.push({ tex, mat, key }); }
        }
      }
      // MToon-specific direct properties (shadeMap, sphereAdd, rimMap, shadingGradeMap)
      for (const prop of MTOON_MAP_PROPS) {
        const tex = mat[prop];
        if (tex && tex.isTexture && !seen.has(tex)) { seen.add(tex); textures.push({ tex, mat, key: prop }); }
      }
      // MToon uniform textures
      if (mat.uniforms) {
        for (const [uname, uniform] of Object.entries(mat.uniforms)) {
          const tex = uniform?.value;
          if (tex && tex.isTexture && !seen.has(tex)) { seen.add(tex); textures.push({ tex, mat, key: uname }); }
        }
      }
    }
  });
  return textures;
}

function auditSkinTextures(vrm, logPrefix) {
  let fixed = 0;

  const allTextures = collectAllTextures(vrm);
  const diffuseCandidates = allTextures.filter(t => isProperDiffuse(t.tex));
  const namedDiffuse = allTextures.filter(t => isDiffusePattern(getTexName(t.tex)));

  vrm.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || mat._skinAudited) continue;
      const name = mat.name?.toLowerCase() || '';
      const isSkin = ['face', 'head', 'skin', 'body', 'kao'].some(kw => name.includes(kw));
      if (!isSkin) continue;

      mat._skinAudited = true;
      const changes = [];

      // Step 1: Check if mainTex is a data texture (lightmap/AO/normal misassigned as diffuse)
      const mainTex = mat.map;
      const mainTexSuspect = mainTex && isSuspectTexture(mainTex);

      if (mainTexSuspect) {
        console.log(`[${logPrefix}] ${mat.name}: mainTex suspect (${getTexName(mainTex) || 'unnamed'})`);

        // Only use other texture slots on THIS material — never swap from other materials
        const thisMatSlots = allTextures.filter(t => t.mat === mat && t.key !== 'map' && isProperDiffuse(t.tex));
        let replacement = thisMatSlots[0];

        if (replacement) {
          mat.map = replacement.tex;
          if (mat.uniforms?._MainTex) mat.uniforms._MainTex.value = replacement.tex;
          mat.needsUpdate = true;
          changes.push(`swapped ${replacement.key}→mainTex`);
        } else {
          mat.map = null;
          if (mat.uniforms?._MainTex) mat.uniforms._MainTex.value = null;
          if (mat.color) mat.color.copy(DEFAULT_SKIN_COLOR);
          mat.needsUpdate = true;
          changes.push('fallback skin color');
        }
      }

      // Step 2: Reset MToon shadeColorFactor if too dark (most common cause of black skin)
      // shadeColorFactor is a THREE.Color — use .r/.g/.b, NOT array indexing!
      const scf = mat.shadeColorFactor;
      if (scf) {
        const maxVal = Math.max(scf.r, scf.g, scf.b);
        if (maxVal < 0.15) {
          scf.set(0.5, 0.45, 0.4);
          mat.needsUpdate = true;
          changes.push(`reset shadeColorFactor ${maxVal.toFixed(2)}→0.5`);
        }
      }

      // Also check uniform variant (for adapted materials that don't expose shadeColorFactor directly)
      if (mat.uniforms?._ShadeColorFactor?.value) {
        const uScf = mat.uniforms._ShadeColorFactor.value;
        const maxVal = Math.max(uScf.r, uScf.g, uScf.b);
        if (maxVal < 0.15) {
          uScf.set(0.5, 0.45, 0.4);
          mat.needsUpdate = true;
          changes.push(`reset uniform _ShadeColorFactor ${maxVal.toFixed(2)}→0.5`);
        }
      }

      // Step 3: Reset base color if pitch black (mat.color)
      if (mat.color) {
        const c = mat.color;
        if (c.r < 0.01 && c.g < 0.01 && c.b < 0.01) {
          c.copy(DEFAULT_SKIN_COLOR);
          mat.needsUpdate = true;
          changes.push('reset black color→default');
        }
      }

      // Note: MToon-specific maps (_ShadeTexture, _SphereAdd, _RimTexture, _ShadingGradeTexture)
      // are intentionally NOT checked — they are supposed to look like data textures.
      // Normal maps, roughness maps, etc. are also left intact — they are data textures by design.
      // Only the mainTex slot is audited above.

      if (changes.length > 0) {
        fixed++;
        console.log(`[${logPrefix}] ${mat.name}: ${changes.join(', ')}`);
      }
    }
  });

  return fixed;
}

export function useMaterialFix() {
  const applied = useRef(false);

  const apply = useCallback((vrm) => {
    if (!vrm?.scene || applied.current) return;
    let fixed = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || mat._materialFixed) continue;
        const mode = getFixMode(mat);
        if (!mode) continue;

        const changed = [];

        if (mode === 'opaque_base') {
          // Base skin → enforce FrontSide culling (spec: Cull Back = True)
          if (mat.side !== THREE.FrontSide) {
            mat.side = THREE.FrontSide;
            changed.push('frontSide');
          }
          // Ensure opaque — no transparency
          if (mat.transparent) {
            mat.transparent = false;
            changed.push('opaque');
          }
          // Disable vertex colors on skin meshes so AO-baked vertex
          // data doesn't override global scene lighting (spec: 3.4)
          if (mat.vertexColors) {
            mat.vertexColors = false;
            changed.push('vertexColors off');
          }
          // Strip COLOR_0 vertex attribute from mesh geometry to
          // prevent vertex color data from dirtying the albedo layer
          if (child.geometry?.attributes?.color) {
            child.geometry.deleteAttribute('color');
            changed.push('COLOR_0 stripped');
          }
        } else if (isTransparentMode(mode)) {
          // Soft alpha (blush, cheek) → full Transparent, depthWrite off
          if (mat.transparent !== true) { mat.transparent = true; changed.push('transparent'); }
          if (mat.depthWrite !== false) { mat.depthWrite = false; changed.push('depthWrite'); }
          if (mat.alphaTest !== 0) { mat.alphaTest = 0; changed.push('alphaTest=0'); }
          if (isMToon(mat) && mat.uniforms?._BlendMode && mat.uniforms._BlendMode.value !== 1) {
            mat.uniforms._BlendMode.value = 1;
            changed.push('_BlendMode→Transparent');
          }
          // Shadow exclusion: facial marks shouldn't cast/receive shadows
          if (child.castShadow !== false) { child.castShadow = false; changed.push('noCastShadow'); }
          if (child.receiveShadow !== false) { child.receiveShadow = false; changed.push('noReceiveShadow'); }
        } else if (isCutoutMode(mode)) {
          // Sharp alpha (eyelash, eyebrow, eye) → Cutout with alphaTest 0.5
          if (mat.transparent !== true) { mat.transparent = true; changed.push('transparent'); }
          if (mat.alphaTest !== 0.5) { mat.alphaTest = 0.5; changed.push('alphaTest=0.5'); }
          if (mat.depthWrite !== true) { mat.depthWrite = true; changed.push('depthWrite=true'); }
          // MToon: _BlendMode=2 means Cutout (0=Opaque, 1=Transparent, 2=Cutout)
          if (isMToon(mat)) {
            if (mat.uniforms?._BlendMode && mat.uniforms._BlendMode.value !== 2) {
              mat.uniforms._BlendMode.value = 2;
              changed.push('_BlendMode→Cutout');
            }
            if (mat.uniforms?._Cutoff && mat.uniforms._Cutoff.value !== 0.5) {
              mat.uniforms._Cutoff.value = 0.5;
              changed.push('_Cutoff=0.5');
            }
          }
          if (mat.defines) {
            if (mat.defines.ALPHATEST !== '1') { mat.defines.ALPHATEST = '1'; changed.push('ALPHATEST'); }
            if (mat.defines.TRANSPARENT) { delete mat.defines.TRANSPARENT; changed.push('removed TRANSPARENT'); }
          }
          // Shadow exclusion (spec: eye_c004)
          if (child.castShadow !== false) { child.castShadow = false; changed.push('noCastShadow'); }
          if (child.receiveShadow !== false) { child.receiveShadow = false; changed.push('noReceiveShadow'); }
          // Fix texture alpha channel — ensure premultiply=false so alpha
          // values are read raw for correct eyelash/eyebrow linework
          if (mat.map && mat.map.isTexture) {
            if (mat.map.premultiplyAlpha) {
              mat.map.premultiplyAlpha = false;
              mat.map.needsUpdate = true;
              changed.push('tex premultiplyAlpha off');
            }
            if (mat.map.colorSpace !== THREE.SRGBColorSpace) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.needsUpdate = true;
              changed.push('tex sRGB');
            }
          }
        } else if (isEyeMode(mode)) {
          // Eye materials (iris, pupil, sclera, highlight) → Transparent blend
          // for smooth alpha gradients (gradient iris edges, soft highlight falloff).
          // Cutout would clip gradients harshly, creating visible aliasing.
          if (mat.transparent !== true) { mat.transparent = true; changed.push('transparent'); }
          if (mat.alphaTest !== 0) { mat.alphaTest = 0; changed.push('alphaTest=0'); }
          if (mat.depthWrite !== true) { mat.depthWrite = true; changed.push('depthWrite=true'); }
          // MToon: _BlendMode=1 is Transparent (0=Opaque, 1=Transparent, 2=Cutout)
          if (isMToon(mat)) {
            if (mat.uniforms?._BlendMode && mat.uniforms._BlendMode.value !== 1) {
              mat.uniforms._BlendMode.value = 1;
              changed.push('_BlendMode→Transparent');
            }
            // Remove any Cutoff — eye gradients should blend, not clip
            if (mat.uniforms?._Cutoff && mat.uniforms._Cutoff.value !== 0) {
              mat.uniforms._Cutoff.value = 0;
              changed.push('_Cutoff=0');
            }
          }
          if (mat.defines) {
            if (mat.defines.ALPHATEST) { delete mat.defines.ALPHATEST; changed.push('removed ALPHATEST'); }
            if (!mat.defines.TRANSPARENT) { mat.defines.TRANSPARENT = '1'; changed.push('TRANSPARENT'); }
          }
          // Shadow exclusion
          if (child.castShadow !== false) { child.castShadow = false; changed.push('noCastShadow'); }
          if (child.receiveShadow !== false) { child.receiveShadow = false; changed.push('noReceiveShadow'); }
          // Texture: keep premultiplyAlpha=true for proper blend, enforce sRGB
          if (mat.map && mat.map.isTexture) {
            if (mat.map.premultiplyAlpha) {
              mat.map.premultiplyAlpha = false; // raw alpha for correct blend
              mat.map.needsUpdate = true;
              changed.push('tex premultiplyAlpha off');
            }
            if (mat.map.colorSpace !== THREE.SRGBColorSpace) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.needsUpdate = true;
              changed.push('tex sRGB');
            }
          }
        } else if (mode === 'mouth') {
          // Mouth interior → DoubleSide so internal geometry is visible
          if (mat.side !== THREE.DoubleSide) { mat.side = THREE.DoubleSide; changed.push('doubleSide'); }
          // Also set transparent for proper rendering
          if (mat.transparent !== true) { mat.transparent = true; changed.push('transparent'); }
          if (mat.depthWrite !== false) { mat.depthWrite = false; changed.push('depthWrite'); }
        }

        // Cutout → premultiply=false (white halo prevention)
        // Eye → premultiply=true (proper color blending)
        // Opaque → leave at default (false) to avoid color shifts
        // Transparent → premultiply=true
        if (isCutoutMode(mode)) {
          if (mat.premultipliedAlpha !== false) {
            mat.premultipliedAlpha = false;
            changed.push('premultipliedAlpha off');
          }
        } else if (isEyeMode(mode)) {
          if (mat.premultipliedAlpha !== true) {
            mat.premultipliedAlpha = true;
            changed.push('premultipliedAlpha');
          }
        } else if (mat.transparent) {
          if (mat.premultipliedAlpha !== true) {
            mat.premultipliedAlpha = true;
            changed.push('premultipliedAlpha');
          }
        }
        if (mat.needsUpdate !== true) {
          mat.needsUpdate = true;
          changed.push('needsUpdate');
        }

        mat._materialFixed = true;
        if (changed.length > 0) fixed++;
      }
    });

    applied.current = true;

    // Second pass: audit skin textures for lightmap/shadow data misassignment
    const audited = auditSkinTextures(vrm, 'MaterialFix');
    if (audited > 0) console.log(`[MaterialFix] Audited ${audited} skin materials (fixed data texture misassignment)`);

    // Third pass: audit eyelash/eyebrow cutout textures for missing/broken alpha
    // Causes: JPG (no alpha), PNG with stripped alpha channel, or alpha all-255
    let alphaFixed = 0;
    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || !mat._materialFixed) continue;
        const name = mat.name?.toLowerCase() || '';
        const isSharpAlpha = SHARP_ALPHA.some(kw => name.includes(kw));
        if (!isSharpAlpha || !mat.map) continue;
        const tex = mat.map;
        if (tex._alphaAudited) continue;
        tex._alphaAudited = true;

        const srcUrl = tex.source?.url || tex.image?.src || '';

        // Step 1: If JPG (alpha impossible), try to find a PNG from another slot
        if (/\.jpe?g$/i.test(srcUrl)) {
          let pngTex = null;
          for (const key of Object.keys(mat)) {
            if (key.endsWith('Map') && key !== 'map') {
              const t = mat[key];
              const tUrl = t?.source?.url || t?.image?.src || '';
              if (t && t.isTexture && /\.png$/i.test(tUrl)) { pngTex = t; break; }
            }
          }
          if (!pngTex && mat.uniforms) {
            for (const [uname, uniform] of Object.entries(mat.uniforms)) {
              const t = uniform?.value;
              const tUrl = t?.source?.url || t?.image?.src || '';
              if (t && t.isTexture && /\.png$/i.test(tUrl)) { pngTex = t; break; }
            }
          }
          if (pngTex) {
            mat.map = pngTex;
            if (mat.uniforms?._MainTex) mat.uniforms._MainTex.value = pngTex;
            mat.needsUpdate = true;
            alphaFixed++;
            console.log(`[MaterialFix] ${mat.name}: swapped JPG→PNG for alpha`);
            continue; // skip luminance fallback
          }
        }

        // Step 2: Check if texture's alpha channel has real variation
        const alphaInfo = checkTextureAlpha(tex);
        const needsLuminanceAlpha = alphaInfo === null || alphaInfo.range < 20;

        if (needsLuminanceAlpha) {
          console.log(`[MaterialFix] ${mat.name}: alpha flat (range=${alphaInfo?.range ?? '?'}), generating from luminance`);
          const newTex = generateLuminanceAlphaTexture(tex);
          if (newTex) {
            mat.map = newTex;
            if (mat.uniforms?._MainTex) mat.uniforms._MainTex.value = newTex;
            mat.needsUpdate = true;
            alphaFixed++;
          }
        }
      }
    });
    if (alphaFixed > 0) console.log(`[MaterialFix] Generated luminance alpha for ${alphaFixed} cutout materials`);

    if (fixed > 0 || audited > 0 || alphaFixed > 0)
      console.log(`[MaterialFix] Total: ${fixed} materials fixed, ${audited} skin textures audited, ${alphaFixed} alpha fixes`);
  }, []);

  const reset = useCallback(() => {
    applied.current = false;
  }, []);

  return { apply, reset };
}

export default useMaterialFix;
