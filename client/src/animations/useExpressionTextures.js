import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { getTextureURL } from '../utils/api.js';

const OVERLAY_FACE_W = 1024;
const OVERLAY_FACE_H = 1024;
const OVERLAY_EYE_W = 1024;
const OVERLAY_EYE_H = 512;
const BODY_ATLAS_LIMIT = 1536;

const FACE_OVERLAYS = [
  { name: 'blush_1', file: 'blush_1.png' },
  { name: 'blush_2', file: 'blush_2.png' },
  { name: 'blush_3', file: 'blush_3.png' },

  { name: 'sick_1', file: 'sick_1.png' },
  { name: 'sick_2', file: 'sick_2.png' },
  { name: 'sick_3', file: 'sick_3.png' },
  { name: 'sweat', file: 'sweat.png' },
];



function findFaceMaterial(materials) {
  if (!materials || materials.length === 0) return null;

  for (const mat of materials) {
    if (!mat.name) continue;
    const n = mat.name.toLowerCase();
    if (n.includes('face') && n.includes('skin')) return mat;
  }

  for (const mat of materials) {
    if (!mat.name) continue;
    const n = mat.name.toLowerCase();
    if (n.includes('face') && !n.includes('eye') && !n.includes('mouth') && !n.includes('hair')) return mat;
  }

  for (const mat of materials) {
    if (mat.map?.image?.width > 1) return mat;
  }

  for (const mat of materials) {
    if (!mat.name) continue;
    if (mat.name.toLowerCase().includes('skin')) return mat;
  }

  for (const mat of materials) {
    if (mat.map && mat.map !== mat.emissiveMap) return mat;
  }

  return null;
}

function findEyeMaterials(materials) {
  if (!materials) return [];

  const seen = new Set();
  const EYE_SPECIFIC = ['eyewhite', 'eyeiris', 'eyehighlight', 'iris', 'highlight'];

  for (const kw of EYE_SPECIFIC) {
    for (const mat of materials) {
      if (!mat.name || seen.has(mat)) continue;
      if (mat.name.toLowerCase().includes(kw)) seen.add(mat);
    }
  }

  if (seen.size === 0) {
    for (const mat of materials) {
      if (!mat.name || seen.has(mat)) continue;
      if (mat.name.toLowerCase().includes('eye')) seen.add(mat);
    }
  }

  return [...seen];
}

function isBodyAtlas(w, h) {
  return w > BODY_ATLAS_LIMIT || h > BODY_ATLAS_LIMIT;
}

function isVRoidModel(materials) {
  if (!materials) return false;
  return materials.some(m => m.name && /^N\d{2}_\d{3}_\d{2}_/.test(m.name));
}

function isCompatSize(actualW, actualH, expectedW, expectedH, tolerance) {
  tolerance = tolerance || 0.5;
  const ratioW = actualW / expectedW;
  const ratioH = actualH / expectedH;
  return ratioW >= 1 - tolerance && ratioW <= 1 + tolerance &&
         ratioH >= 1 - tolerance && ratioH <= 1 + tolerance;
}

function isMToon(mat) {
  return mat.type === 'MToonMaterial' || mat.isMToonMaterial || mat.shadeColorFactor !== undefined;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Detect non-color data textures (normal maps, masks, linear grayscale)
// from filename keywords. These must use LinearEncoding to avoid gamma distortion.
function isNonColorTexture(file) {
  const n = file.toLowerCase();
  return n.includes('normal') || n.includes('bump') || n.includes('nrm')
    || n.includes('mask') || n.includes('specular') || n.includes('spec')
    || n.includes('roughness') || n.includes('metalness')
    || n.includes('shadinggrade') || n.includes('_g') || n.includes('alpha');
}

function isMaskTexture(file) {
  const n = file.toLowerCase();
  return n.includes('eff_face') || n.includes('face_mask')
    || n.includes('mouth_alpha') || n.includes('_alpha')
    || n.includes('shade') || n.includes('occlusion');
}

// ── UV Offset Correction ───────────────────────────────────
// When facial overlays (blush, tear) are displaced due to UV1/UV2
// channel mismatch or incorrect face-region detection, apply a
// V-coordinate correction to anchor them over the cheekbone area.
// Spec: Offset Y = -0.15 to -0.25 in UV space.
let V_OFFSET_BASELINE = -0.20;
const BASELINE_HEIGHT = 1.5; // Standard anime character height in Three.js units

function setModelHeight(height) {
  if (!height || height <= 0) return;
  const ratio = BASELINE_HEIGHT / height;
  V_OFFSET_BASELINE = -0.20 * ratio;
}

function getVOffsetBaseline() {
  return V_OFFSET_BASELINE;
}

function findEmotionMaterials(materials) {
  if (!materials) return [];
  const seen = new Set();
  const EMOTION_KEYWORDS = ['blush', 'cheek', 'hoho', 'tear', 'emotion', 'makeup', 'beauty'];
  for (const mat of materials) {
    if (!mat.name || seen.has(mat)) continue;
    const n = mat.name.toLowerCase();
    if (EMOTION_KEYWORDS.some(kw => n.includes(kw))) seen.add(mat);
  }
  return [...seen];
}

function estimateEyeUVY(materials) {
  // Attempt to find an "eye" material on the same texture atlas and
  // estimate the V-coordinate (0-1, top-to-bottom) of the eye region.
  // Returns null if we can't determine.
  if (!materials) return null;
  for (const mat of materials) {
    if (!mat.name || !mat.map?.image) continue;
    const n = mat.name.toLowerCase();
    const isEye = ['eye', 'eyewhite', 'iris', 'hitomi', 'pupil'].some(kw => n.includes(kw));
    if (!isEye) continue;
    // Eyes are typically centered in the upper-middle of a face texture,
    // roughly UV V = 0.30 to 0.55 (top-to-bottom).
    // For safety, return the upper bound as a reference.
    return 0.32;
  }
  // Fallback: assume standard face layout
  return null;
}

// ── Asset Injection Module ─────────────────────────────────
// Eye iris detection — targets eye_l, eye_r, pupil, iris, hitomi
function findEyeIrisMaterials(materials) {
  if (!materials) return [];
  const seen = new Set();
  const IRIS_KEYWORDS = ['eye_l', 'eye_r', 'pupil', 'iris', 'hitomi', 'left_eye', 'right_eye'];
  for (const mat of materials) {
    if (!mat.name || seen.has(mat)) continue;
    const n = mat.name.toLowerCase();
    if (IRIS_KEYWORDS.some(kw => n.includes(kw))) seen.add(mat);
  }
  return [...seen];
}

// Eye highlight detection — targets eye_hi, highlight, kira, hikari
function findEyeHighlightMaterials(materials) {
  if (!materials) return [];
  const seen = new Set();
  for (const mat of materials) {
    if (!mat.name || seen.has(mat)) continue;
    const n = mat.name.toLowerCase();
    if (HIGHLIGHT_KEYWORDS.some(kw => n.includes(kw))) seen.add(mat);
  }
  return [...seen];
}

// Create an Unlit Cutout material for eye highlight planes so they
// always sit atop the main pupil geometry layers (spec: 2.2).
function createUnlitEyeHighlight(existingMat) {
  const tex = existingMat.map || null;
  const unlit = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: true,
    premultipliedAlpha: true,
    map: tex,
  });
  unlit.renderOrder = 3050;
  return unlit;
}

// UV Scale Invariant Fit: normalize a custom image to map perfectly
// onto the existing mesh UV layout without manual realignment.
// Returns a CanvasTexture sized to match the existing texture bounds
// but preserving the custom image's aspect ratio within those bounds.
function fitTextureToUVBounds(customImg, targetTex) {
  const tw = targetTex?.image?.width || customImg.width;
  const th = targetTex?.image?.height || customImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');

  const scaleX = tw / customImg.width;
  const scaleY = th / customImg.height;
  const scale = Math.min(scaleX, scaleY);
  const sw = customImg.width * scale;
  const sh = customImg.height * scale;
  const ox = (tw - sw) / 2;
  const oy = (th - sh) / 2;

  ctx.drawImage(customImg, ox, oy, sw, sh);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Generic texture pack injection: takes a map of material-name patterns
// to texture URLs and replaces the matching material's map.
// Returns the number of materials injected.
async function injectTexturePack(vrm, textureMap) {
  if (!vrm?.scene || !textureMap) return 0;
  let injected = 0;
  const mats = [];

  vrm.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const ms = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of ms) {
      if (m && !mats.includes(m)) mats.push(m);
    }
  });

  for (const [pattern, url] of Object.entries(textureMap)) {
    const patternLower = pattern.toLowerCase();
    const mat = mats.find(m => m.name && m.name.toLowerCase().includes(patternLower));
    if (!mat) continue;

    try {
      const img = await loadImage(url);
      const fitted = fitTextureToUVBounds(img, mat.map);
      mat.map = fitted;
      mat.needsUpdate = true;

      // If this is an eye highlight, upgrade to Unlit Cutout
      const nameLower = mat.name.toLowerCase();
      if (HIGHLIGHT_KEYWORDS.some(kw => nameLower.includes(kw))) {
        const parentMesh = findMeshForMaterial(vrm, mat);
        if (parentMesh) {
          const unlit = createUnlitEyeHighlight(mat);
          unlit.map = fitted;
          unlit.needsUpdate = true;
          if (Array.isArray(parentMesh.material)) {
            const idx = parentMesh.material.indexOf(mat);
            if (idx >= 0) parentMesh.material[idx] = unlit;
          } else {
            parentMesh.material = unlit;
          }
        }
      }

      injected++;
    } catch (e) {
      console.warn(`[Tex] Inject failed for pattern "${pattern}":`, e.message);
    }
  }

  return injected;
}

function findMeshForMaterial(vrm, targetMat) {
  let found = null;
  vrm.scene.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    if (found) return;
    const ms = Array.isArray(child.material) ? child.material : [child.material];
    if (ms.includes(targetMat)) found = child;
  });
  return found;
}

const HIGHLIGHT_KEYWORDS = ['eye_hi', 'highlight', 'kira', 'hikari', 'eye_highlight'];

// ── Blush Alignment Matrix ─────────────────────────────────
// Auto-detects the face sub-region on body atlases so overlays
// (blush, sweat, etc.) are drawn at the correct UV position.

function detectFaceRegion(img) {
  if (!img || img.width < 16 || img.height < 16) return null;
  const c = document.createElement('canvas');
  const sw = Math.min(img.width, 256);
  const sh = Math.min(img.height, 256);
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);
  const d = ctx.getImageData(0, 0, sw, sh).data;

  let minX = sw, minY = sh, maxX = 0, maxY = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
      if (a < 64) continue;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 20) continue;
      // Skip highly saturated (likely clothing/accessory)
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      if (sat > 0.45) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (minX >= maxX || minY >= maxY) return null;

  return {
    dx: minX / sw,
    dy: minY / sh,
    sx: (maxX - minX + 1) / sw,
    sy: (maxY - minY + 1) / sh,
  };
}

function makeCanvasTexture(canvas, file) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  // Non-color data (masks, normals) → NoColorSpace to prevent gamma corruption
  tex.colorSpace = isNonColorTexture(file) || isMaskTexture(file)
    ? THREE.NoColorSpace
    : THREE.SRGBColorSpace;
  if (isMaskTexture(file) || file?.toLowerCase().includes('alpha')) {
    tex.premultiplyAlpha = false;
    tex.format = THREE.AlphaFormat;
  }
  return tex;
}

function compositeOnFace(baseImg, overlayImg, overlayFile, alignment, eyeY) {
  const canvas = document.createElement('canvas');
  canvas.width = baseImg.width;
  canvas.height = baseImg.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

  if (overlayImg.width > 1 && overlayImg.height > 1) {
    // Detect when alignment is suspicious — if the detected face region
    // starts too high (dy < 0.1, only forehead captured) or if no alignment
    // was found but we have an eye reference, apply V-offset correction
    // to prevent blush/tears from rendering on the forehead (spec: 4.4).
    let needsVOffset = false;
    if (alignment && alignment.sx < 0.95) {
      if (alignment.dy < 0.1 || (eyeY && alignment.dy < eyeY - 0.15)) {
        needsVOffset = true;
      }
    }

    if (alignment && alignment.sx < 0.95) {
      let rx = alignment.dx * baseImg.width;
      let ry = alignment.dy * baseImg.height;
      const rw = alignment.sx * baseImg.width;
      const rh = alignment.sy * baseImg.height;

      if (needsVOffset) {
        ry += V_OFFSET_BASELINE * baseImg.height;
      }

      ctx.drawImage(overlayImg, rx, ry, rw, rh);
    } else if (Math.abs(overlayImg.width - canvas.width) > 8 || Math.abs(overlayImg.height - canvas.height) > 8) {
      const ox = (canvas.width - overlayImg.width) / 2;
      let oy = (canvas.height - overlayImg.height) / 2;

      // Without alignment data, apply fallback V-offset so overlays
      // land near the cheekbone region rather than forehead (spec: 4.4)
      if (needsVOffset || !alignment) {
        oy += V_OFFSET_BASELINE * baseImg.height;
      }

      ctx.drawImage(overlayImg, ox, oy, overlayImg.width, overlayImg.height);
    } else {
      let dy = 0;
      // Same fallback for full-screen overlay
      if (needsVOffset || !alignment) {
        dy = V_OFFSET_BASELINE * baseImg.height;
      }

      if (dy !== 0) {
        ctx.drawImage(overlayImg, 0, dy, canvas.width, canvas.height);
      } else {
        ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
      }
    }
  }
  const tex = makeCanvasTexture(canvas, overlayFile);
  return tex;
}

function imageToCanvasTexture(img, file) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const tex = makeCanvasTexture(canvas, file);
  return tex;
}

export {
  findFaceMaterial,
  findEyeMaterials,
  findEyeIrisMaterials,
  findEyeHighlightMaterials,
  findEmotionMaterials,
  estimateEyeUVY,
  isBodyAtlas,
  isVRoidModel,
  isMToon,
  V_OFFSET_BASELINE,
  setModelHeight,
  getVOffsetBaseline,
  createUnlitEyeHighlight,
  fitTextureToUVBounds,
  injectTexturePack,
};

export function useExpressionTextures(vrm) {
  const cacheRef = useRef(new Map());
  const loggedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const alignmentRef = useRef(null); // detected face region alignment

  useEffect(() => {
    if (!vrm?.scene || !vrm.materials) return;
    let cancelled = false;

    if (!ready) setReady(true);

    const faceMat = findFaceMaterial(vrm.materials);
    const eyeMats = findEyeMaterials(vrm.materials);
    const baseImage = faceMat?.map?.image;
    const baseW = baseImage?.width || 0;
    const baseH = baseImage?.height || 0;

    const isSquareEnough = baseW > 0 && baseH > 0 && (baseW / baseH) > 0.7 && (baseW / baseH) < 1.43;
    const isVRoid = isVRoidModel(vrm.materials);
    const canCompositeFace = isVRoid && faceMat && baseImage && baseImage.width > 1
      && !isBodyAtlas(baseW, baseH)
      && isSquareEnough
      && isCompatSize(baseW, baseH, OVERLAY_FACE_W, OVERLAY_FACE_H, 0.3);

    const firstEyeMat = eyeMats.find(m => m.map?.image?.width > 1);
    const eyeW = firstEyeMat?.map?.image?.width || 0;
    const eyeH = firstEyeMat?.map?.image?.height || 0;
    const canSwapEyes = eyeMats.length > 0 && firstEyeMat
      && !isBodyAtlas(eyeW, eyeH)
      && isCompatSize(eyeW, eyeH, OVERLAY_EYE_W, OVERLAY_EYE_H);

    const faceMatIsMToon = faceMat && isMToon(faceMat);

    // Detect face sub-region on this model once
    if (baseImage && (!alignmentRef.current || alignmentRef.current._src !== baseImage.src)) {
      const det = detectFaceRegion(baseImage);
      alignmentRef.current = det ? { ...det, _src: baseImage.src } : null;
    }
    const alignment = alignmentRef.current;

    if (!loggedRef.current) {
      loggedRef.current = true;
      const faceSkip = !baseImage ? 'no face texture'
        : !isVRoid ? 'non-VRoid model'
        : isBodyAtlas(baseW, baseH) ? 'body atlas'
        : !isSquareEnough ? 'non-square (' + baseW + 'x' + baseH + ')'
        : !isCompatSize(baseW, baseH, OVERLAY_FACE_W, OVERLAY_FACE_H, 0.3) ? 'size mismatch (' + baseW + 'x' + baseH + ' vs ' + OVERLAY_FACE_W + 'x' + OVERLAY_FACE_H + ')'
        : '';
      console.log('[Tex] Face material:', faceMat?.name || 'none',
        '- size:', baseW + 'x' + baseH,
        '- composite:', canCompositeFace,
        faceSkip ? '- skip reason: ' + faceSkip : '',
        '- MToon:', faceMatIsMToon,
        '- alignment:', alignment ? `${(alignment.sx*100).toFixed(0)}%×${(alignment.sy*100).toFixed(0)}% @ (${(alignment.dx*100).toFixed(0)}%,${(alignment.dy*100).toFixed(0)}%)` : 'none');
      console.log('[Tex] Eye materials:', eyeMats.map(m => m.name).join(', ') || 'none',
        '- size:', eyeW + 'x' + eyeH,
        '- swap:', canSwapEyes);
    }

    const emotionMats = findEmotionMaterials(vrm.materials);
    const eyeY = estimateEyeUVY(vrm.materials);

    if (!loggedRef.current && emotionMats.length > 0) {
      console.log('[Tex] Emotion overlay materials:', emotionMats.map(m => m.name).join(', '));
    }

    async function loadAll() {
      if (canCompositeFace) {
        const baseImg = faceMat.map.image;
        for (const overlay of FACE_OVERLAYS) {
          try {
            const overlayImg = await loadImage(getTextureURL('face', overlay.file));
            if (cancelled) return;
            const tex = compositeOnFace(baseImg, overlayImg, overlay.file, alignment, eyeY);
            cacheRef.current.set('face_' + overlay.name, tex);
          } catch (e) {
            console.warn('[Tex] Failed face overlay:', overlay.file);
          }
        }
      } else if (faceMat && baseImage && baseImage.width > 1 && !isBodyAtlas(baseW, baseH)) {
        for (const overlay of FACE_OVERLAYS) {
          try {
            const overlayImg = await loadImage(getTextureURL('face', overlay.file));
            if (cancelled) return;
            const tex = compositeOnFace(baseImg, overlayImg, overlay.file, alignment, eyeY);
            cacheRef.current.set('face_' + overlay.name, tex);
          } catch (e) {
            console.warn('[Tex] Failed face overlay (fallback):', overlay.file);
          }
        }
      }


    }

    loadAll();
    return () => { cancelled = true; };
  }, [vrm, ready]);

  const getTexture = useCallback((name) => {
    return cacheRef.current.get(name) || null;
  }, []);

  return useMemo(() => ({
    ready,
    getTexture,
    cacheRef,
    alignment: alignmentRef.current,
  }), [ready, getTexture]);
}
