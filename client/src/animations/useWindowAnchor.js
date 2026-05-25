import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const JUMP_THRESHOLD_SQ = 0.01;
const DT_BUFFER_SIZE = 3;

export function useWindowAnchor() {
  const vrmRef = useRef(null);
  const prevWorldPos = useRef(new THREE.Vector3());
  const hasPrevPos = useRef(false);
  const dtBuffer = useRef(new Float32Array(DT_BUFFER_SIZE));
  const dtIndex = useRef(0);
  const dtCount = useRef(0);

  const init = useCallback((vrm) => {
    if (!vrm?.scene) return;
    vrmRef.current = vrm;
    hasPrevPos.current = false;
    dtIndex.current = 0;
    dtCount.current = 0;
  }, []);

  const update = useCallback((rawDt, vrm) => {
    if (!vrm?.scene) return rawDt;

    const buf = dtBuffer.current;
    buf[dtIndex.current % DT_BUFFER_SIZE] = rawDt;
    dtIndex.current++;
    dtCount.current = Math.min(dtCount.current + 1, DT_BUFFER_SIZE);
    let sum = 0;
    for (let i = 0; i < dtCount.current; i++) sum += buf[i];
    const dt = sum / dtCount.current;

    const worldPos = new THREE.Vector3();
    vrm.scene.getWorldPosition(worldPos);

    if (hasPrevPos.current) {
      const distSq = worldPos.distanceToSquared(prevWorldPos.current);
      if (distSq > JUMP_THRESHOLD_SQ) {
        vrm.springBoneManager?.reset();
      }
    }

    prevWorldPos.current.copy(worldPos);
    hasPrevPos.current = true;

    return dt;
  }, []);

  return { init, update };
}

export default useWindowAnchor;
