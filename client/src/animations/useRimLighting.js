import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const HAIR_TAGS = ['hair', 'kami', 'touhatsu', 'headhair'];
const CLOTHING_TAGS = ['coat', 'skirt', 'clothes', 'cloth', 'dress', 'jacket', 'shirt', 'pants', 'uniform'];

function isMToon(mat) {
  return mat.type === 'MToonMaterial' || mat.isMToonMaterial || mat.shadeColorFactor !== undefined;
}

function isHairMaterial(mat) {
  if (!mat?.name) return false;
  const n = mat.name.toLowerCase();
  return HAIR_TAGS.some(kw => n.includes(kw));
}

function isRimTarget(mat) {
  if (!mat?.name) return false;
  const n = mat.name.toLowerCase();
  return HAIR_TAGS.some(kw => n.includes(kw)) || CLOTHING_TAGS.some(kw => n.includes(kw));
}

// Generate a soft radial gradient MatCap texture for fallback rim shading
function generateMatCap() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2, cy = size / 2, r = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.4, '#e8d8ff');
  gradient.addColorStop(0.7, '#c0a8e8');
  gradient.addColorStop(1.0, '#8870a0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ── onBeforeCompile injection for rim lighting on standard materials ──
// Injects a rim light calculation into the fragment shader of non-MToon
// materials (MeshStandardMaterial, etc.) after the diffuse color is computed.
const RIM_VERTEX_INJECTION = `
#include <common>
varying vec3 vRimNormal;
varying vec3 vRimViewDir;
void main() {
  #include <beginnormal_vertex>
  vRimNormal = normalize(normalMatrix * objectNormal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vRimViewDir = normalize(cameraPosition - worldPos.xyz);
}
`;

const RIM_FRAGMENT_INJECTION = `
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
varying vec3 vRimNormal;
varying vec3 vRimViewDir;
void main() {
  float rimFactor = 1.0 - max(0.0, dot(normalize(vRimNormal), normalize(vRimViewDir)));
  float rim = pow(rimFactor, uRimPower) * uRimIntensity;
  gl_FragColor.rgb += rim * uRimColor;
}
`;

function injectRimShader(mat, color, intensity, power) {
  if (mat._rimInjected) return;

  const origOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (origOnBeforeCompile) origOnBeforeCompile.call(mat, shader);

    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimIntensity = { value: intensity };

    // Inject rim normal/viewDir varyings into vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vRimNormal;
varying vec3 vRimViewDir;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
vRimNormal = normalize(normalMatrix * objectNormal);
vRimViewDir = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);`
    );

    // Inject rim calculation into fragment shader after diffuse lighting
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
varying vec3 vRimNormal;
varying vec3 vRimViewDir;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      `float rimFactor = 1.0 - max(0.0, dot(normalize(vRimNormal), normalize(vRimViewDir)));
float rim = pow(rimFactor, uRimPower) * uRimIntensity;
vec3 rimmed = outgoingLight + rim * uRimColor;
gl_FragColor = vec4( rimmed, diffuseColor.a );`
    );
  };

  mat._rimInjected = true;
}

export function useRimLighting() {
  const matCapRef = useRef(null);
  const applied = useRef(false);

  const apply = useCallback((vrm, options = {}) => {
    if (!vrm?.scene || applied.current) return;

    const {
      color = 0xff88aa,
      intensity = 0.5,
      power = 4.0,
      mix = 0.5,
    } = options;

    let mtoonCount = 0;
    let shaderCount = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || !isRimTarget(mat)) continue;

        if (isMToon(mat)) {
          // Use MToon's built-in rim lighting parameters
          if (mat.uniforms) {
            if (mat.uniforms._RimColor) {
              mat.uniforms._RimColor.value = new THREE.Color(color);
              mtoonCount++;
            }
            if (mat.uniforms._RimLightingMix !== undefined) {
              mat.uniforms._RimLightingMix.value = mix;
            }
            if (mat.uniforms._RimFresnelPower !== undefined) {
              mat.uniforms._RimFresnelPower.value = power;
            }
            if (mat.uniforms._RimIntensity !== undefined) {
              mat.uniforms._RimIntensity.value = intensity;
            }
          }
        } else {
          // Standard material → inject via onBeforeCompile
          injectRimShader(mat, color, intensity, power);
          shaderCount++;
        }

        mat.needsUpdate = true;
      }
    });

    applied.current = true;
    const total = mtoonCount + shaderCount;
    if (total > 0) console.log(`[RimLighting] Applied to ${total} materials (MToon: ${mtoonCount}, Shader: ${shaderCount})`);
  }, []);

  const applyMatCapToHair = useCallback((vrm) => {
    if (!vrm?.scene) return 0;

    if (!matCapRef.current) {
      matCapRef.current = generateMatCap();
    }
    const matCapTex = matCapRef.current;
    let count = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat || !isHairMaterial(mat)) continue;

        if (isMToon(mat)) {
          // MToon uses _SphereAdd for MatCap
          if (mat.uniforms?._SphereAdd) {
            mat.uniforms._SphereAdd.value = matCapTex;
            count++;
          }
        } else {
          // Standard material — store as userData for reference
          // (actual MatCap on standard materials would need another shader injection)
          if (!mat.userData) mat.userData = {};
          mat.userData._matCapTex = matCapTex;
          count++;
        }

        mat.needsUpdate = true;
      }
    });

    if (count > 0) console.log(`[RimLighting] Applied MatCap to ${count} hair materials`);
    return count;
  }, []);

  const reset = useCallback(() => {
    applied.current = false;
  }, []);

  return { apply, applyMatCapToHair, reset };
}

export {
  generateMatCap,
  isMToon,
  isHairMaterial,
  isRimTarget,
};

export default useRimLighting;
