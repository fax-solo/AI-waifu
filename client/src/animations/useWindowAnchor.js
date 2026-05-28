import { useRef, useCallback } from 'react';
import * as THREE from 'three';

const JUMP_THRESHOLD_SQ = 0.01;
const CANVAS_JUMP_THRESHOLD_SQ = 2500; // 50px squared — canvas moved more than 50px in one frame
const DT_BUFFER_SIZE = 3;

export function useWindowAnchor() {
  const vrmRef = useRef(null);
  const prevWorldPos = useRef(new THREE.Vector3());
  const hasPrevPos = useRef(false);
  const dtBuffer = useRef(new Float32Array(DT_BUFFER_SIZE));
  const dtIndex = useRef(0);
  const dtCount = useRef(0);
  const prevCanvasRect = useRef({ x: 0, y: 0 });
  const hasPrevRect = useRef(false);

  const init = useCallback((vrm) => {
    if (!vrm?.scene) return;
    vrmRef.current = vrm;
    hasPrevPos.current = false;
    dtIndex.current = 0;
    dtCount.current = 0;
    hasPrevRect.current = false;
  }, []);

  const update = useCallback((rawDt, vrm, canvas) => {
    if (!vrm?.scene) return rawDt;

    const buf = dtBuffer.current;
    buf[dtIndex.current % DT_BUFFER_SIZE] = rawDt;
    dtIndex.current++;
    dtCount.current = Math.min(dtCount.current + 1, DT_BUFFER_SIZE);
    let sum = 0;
    for (let i = 0; i < dtCount.current; i++) sum += buf[i];
    const dt = sum / dtCount.current;

    // Check model world-position jump (e.g. nav mesh teleport)
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

    // Check canvas bounding-rect jump — skip the first frame to avoid
    // spurious reset from (0,0) to the actual canvas position.
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (hasPrevRect.current) {
        const dx = rect.x - prevCanvasRect.current.x;
        const dy = rect.y - prevCanvasRect.current.y;
        if (dx * dx + dy * dy > CANVAS_JUMP_THRESHOLD_SQ) {
          vrm.springBoneManager?.reset();
        }
      }
      prevCanvasRect.current = { x: rect.x, y: rect.y };
      hasPrevRect.current = true;
    }

    return dt;
  }, []);

  return { init, update };
}

export default useWindowAnchor;
