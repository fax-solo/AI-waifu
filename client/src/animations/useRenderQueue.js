import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const RENDER_LAYERS = {
  BASE_GEOMETRY: {
    order: 2000,
    label: 'Base Geometry',
    match: ['body', 'clothes', 'hair', 'face', 'head', 'skin', 'kao', 'torso', 'arm', 'leg', 'skirt', 'coat'],
    castShadow: true,
    receiveShadow: true,
    depthWrite: true,
  },
  INNER_CAVITIES: {
    order: 2400,
    label: 'Inner Cavities',
    match: ['mouth', 'lip', 'kuchi', 'teeth', 'tongue', 'tooth', 'haguki', 'inner', 'gums'],
    castShadow: false,
    receiveShadow: false,
    depthWrite: false,
  },
  FACIAL_MARKS: {
    order: 2800,
    label: 'Facial Base Marks',
    match: ['blush', 'cheek', 'hoho', 'sweat', 'sick', 'scar', 'sticker', 'beauty', 'makeup'],
    castShadow: false,
    receiveShadow: false,
    depthWrite: false,
  },
  OCULAR_ELEMENTS: {
    order: 3000,
    label: 'Ocular Elements',
    match: ['eye', 'sclera', 'pupil', 'hitomi', 'iris', 'highlight', 'eyewhite', 'lens', 'ganma'],
    castShadow: false,
    receiveShadow: false,
    depthWrite: true,
  },
  FACIAL_LINEWORK: {
    order: 3100,
    label: 'Facial Linework',
    match: ['eyelash', 'eyebrow', 'matsuge', 'mayu', 'eye_d', 'overlay', 'bang', 'hair_front', 'expression'],
    castShadow: false,
    receiveShadow: false,
    depthWrite: true,
  },
};

function classifyMesh(mesh) {
  const name = mesh.name?.toLowerCase() || '';
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const matName = mat?.name?.toLowerCase() || '';

  let bestLayer = null;
  let bestScore = 0;

  for (const [key, layer] of Object.entries(RENDER_LAYERS)) {
    for (const kw of layer.match) {
      if (name.includes(kw) || matName.includes(kw)) {
        const score = kw.length;
        if (score > bestScore) {
          bestScore = score;
          bestLayer = key;
        }
      }
    }
  }

  return bestLayer;
}

function setShadowFlags(mesh, cast, receive) {
  if (mesh.userData._origCastShadow === undefined) {
    mesh.userData._origCastShadow = mesh.castShadow;
    mesh.userData._origReceiveShadow = mesh.receiveShadow;
  }
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
}

export function useRenderQueue() {
  const applied = useRef(false);

  const apply = useCallback((vrm) => {
    if (!vrm?.scene || applied.current) return;
    let classified = 0;

    vrm.scene.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      const layerKey = classifyMesh(child);
      if (!layerKey) return;

      const layer = RENDER_LAYERS[layerKey];
      child.renderOrder = layer.order;

      setShadowFlags(child, layer.castShadow, layer.receiveShadow);

      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat.transparent) {
            mat.depthWrite = layer.depthWrite;
          }
        }
      }

      classified++;
    });

    applied.current = true;
    console.log(`[RenderQueue] Classified ${classified} meshes into render layers (2000-3100)`);
  }, []);

  const reset = useCallback(() => {
    applied.current = false;
  }, []);

  return { apply, reset };
}

export default useRenderQueue;
