import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const SKIN_TAGS = ['skin', 'body', 'face', 'head', 'kao', 'hada'];

function isSkinMaterial(mat) {
  if (!mat?.name) return false;
  const n = mat.name.toLowerCase();
  return SKIN_TAGS.some(kw => n.includes(kw));
}

function gammaCorrectColor(color, gamma) {
  if (!color) return;
  color.r = Math.pow(Math.max(0, color.r), gamma);
  color.g = Math.pow(Math.max(0, color.g), gamma);
  color.b = Math.pow(Math.max(0, color.b), gamma);
}

export function useColorSpace() {
  const applied = useRef(false);

  const enforceSRGB = useCallback((vrm) => {
    if (!vrm?.scene || applied.current) return;
    let fixed = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || !isSkinMaterial(mat)) continue;
        if (mat.map && mat.map.isTexture && mat.map.colorSpace !== THREE.SRGBColorSpace) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.needsUpdate = true;
          fixed++;
        }
      }
    });

    applied.current = true;
    if (fixed > 0) console.log(`[ColorSpace] Enforced sRGB on ${fixed} skin textures`);
  }, []);

  const gammaCorrect = useCallback((vrm, manualOverride) => {
    if (!vrm?.scene) return;
    let corrected = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || !isSkinMaterial(mat)) continue;

        const changes = [];

        // Only gamma-correct mat.color — MToon properties (shadeColorFactor etc.)
        // manage their own color space; gamma-applying them causes over-darkening
        if (mat.color) {
          gammaCorrectColor(mat.color, 2.2);
          changes.push('color^2.2');
          if (manualOverride) {
            gammaCorrectColor(mat.color, 0.4545);
            changes.push('manual override ^0.4545');
          }
        }

        if (changes.length > 0) {
          mat.needsUpdate = true;
          corrected++;
        }
      }
    });

    if (corrected > 0) console.log(`[ColorSpace] Gamma corrected ${corrected} skin materials`);
    return corrected;
  }, []);

  const reset = useCallback(() => {
    applied.current = false;
  }, []);

  return { enforceSRGB, gammaCorrect, reset };
}

export default useColorSpace;
