import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const DEFAULT_EMISSIVE_INTENSITY = 0.6;
const LUMINANCE_THRESHOLD = 0.65;

// Compute adaptive threshold from the texture's luminance histogram
// so bright sparkles glow but mid-tones don't wash out the eye color.
function computeAdaptiveThreshold(canvas, ctx, w, h) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const hist = new Float32Array(256);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * (d[i] / 255) + 0.7152 * (d[i+1] / 255) + 0.0722 * (d[i+2] / 255);
    const bin = Math.min(255, Math.floor(l * 255));
    hist[bin]++;
    total++;
  }
  // Find luminance at 90th percentile (top 10% brightest pixels)
  let cumulative = 0;
  const target = total * 0.90;
  for (let b = 255; b >= 0; b--) {
    cumulative += hist[b];
    if (cumulative >= target) return Math.max(0.5, b / 255);
  }
  return LUMINANCE_THRESHOLD;
}

// Luminance weights per ITU-R BT.709
function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Read raw RGBA pixels from any Three.js texture
function readTexturePixels(tex) {
  if (!tex?.image) return null;
  const img = tex.image;
  try {
    if (img.data && img.width && img.height) {
      return { data: img.data, width: img.width, height: img.height };
    }
    if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
      const c = document.createElement('canvas');
      c.width = Math.min(img.width, 256);
      c.height = Math.min(img.height, 256);
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      return { data: id.data, width: c.width, height: c.height };
    }
  } catch { }
  return null;
}

// Generate an emissive mask texture by isolating bright regions
// where luminance exceeds the threshold (spec: 3.1).
function generateEmissiveMask(sourceTex, threshold) {
  if (!sourceTex?.image) return null;

  const img = sourceTex.image;
  const w = img.width || 1024;
  const h = img.height || 1024;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    return null;
  }

  // Adaptive threshold if not explicitly provided
  if (threshold == null) {
    threshold = computeAdaptiveThreshold(canvas, ctx, w, h);
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  let rSum = 0, gSum = 0, bSum = 0, brightCount = 0;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const a = d[i + 3] / 255;
    const l = luminance(r, g, b);

    if (l > threshold && a > 0.5) {
      rSum += r;
      gSum += g;
      bSum += b;
      brightCount++;
    } else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  let avgColor = new THREE.Color(1, 1, 1);
  if (brightCount > 0) {
    avgColor.setRGB(rSum / brightCount, gSum / brightCount, bSum / brightCount);
  }

  return { emissiveMap: tex, avgColor, brightCount, threshold };
}

// Apply emissive glow to a material (spec: 3.2)
function applyEmissiveGlow(mat, sourceTex, intensity = DEFAULT_EMISSIVE_INTENSITY) {
  if (!mat || !sourceTex) return false;

  const result = generateEmissiveMask(sourceTex);
  if (!result) return false;

  mat.emissiveMap = result.emissiveMap;
  mat.emissive = result.avgColor;
  mat.emissiveIntensity = intensity;
  mat.needsUpdate = true;

  // MToon uniform sync
  if (mat.uniforms?._EmissionColor?.value) {
    mat.uniforms._EmissionColor.value.copy(result.avgColor);
  }
  if (mat.uniforms?._EmissionMap?.value) {
    mat.uniforms._EmissionMap.value = result.emissiveMap;
  }

  return true;
}

export function useEmissiveGlow() {
  const applied = useRef(new Set());

  const applyToMaterial = useCallback((mat, sourceTex, intensity) => {
    if (!mat || applied.current.has(mat.uuid)) return false;
    const result = applyEmissiveGlow(mat, sourceTex, intensity);
    if (result) applied.current.add(mat.uuid);
    return result;
  }, []);

  const applyToAllEyes = useCallback((vrm, intensity) => {
    if (!vrm?.scene) return 0;
    let count = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || applied.current.has(mat.uuid)) continue;
        const n = mat.name?.toLowerCase() || '';
        const isEye = ['eye', 'iris', 'hitomi', 'pupil', 'sclera'].some(kw => n.includes(kw));
        if (!isEye || !mat.map) continue;

        if (applyEmissiveGlow(mat, mat.map, intensity ?? DEFAULT_EMISSIVE_INTENSITY)) {
          applied.current.add(mat.uuid);
          count++;
        }
      }
    });

    if (count > 0) console.log(`[EmissiveGlow] Applied glow to ${count} eye materials`);
    return count;
  }, []);

  const reset = useCallback(() => {
    applied.current.clear();
  }, []);

  return { applyToMaterial, applyToAllEyes, reset, generateEmissiveMask };
}

export {
  generateEmissiveMask,
  applyEmissiveGlow,
  DEFAULT_EMISSIVE_INTENSITY,
};

export default useEmissiveGlow;
