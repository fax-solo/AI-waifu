/**
 * useTalkingAnimation Hook
 * 
 * Procedural mouth movement:
 * - Moves 'aa', 'ee', 'oo' expressions based on intensity
 * - Jiggles the jaw slightly
 */

import { useRef, useCallback } from 'react';

export function useTalkingAnimation() {
  const state = useRef({
    time: 0,
    frequency: 8.0,
    amplitude: 0.45, // Reduced for smaller mouth movements
    lastVolume: 0,
    dataArray: null,
  });

  const updateTalking = useCallback((vrm, deltaTime, isTalking, analyser) => {
    if (!vrm) return;
    const expressionManager = vrm.expressionManager || vrm.blendShapeProxy;
    if (!expressionManager) return;
    const s = state.current;
    let targetVolume = 0;

    const getBone = (name) => vrm.humanoid.getNormalizedBoneNode ? 
                              vrm.humanoid.getNormalizedBoneNode(name) : 
                              vrm.humanoid.getBoneNode(name);
    
    const setMouthShape = (name, value) => {
      // VRM 1.0 names
      if (expressionManager.setValue) expressionManager.setValue(name, value);
      
      // VRM 0.x / Custom Mapping
      const vrm0Map = {
        'aa': 'A',
        'ih': 'I',
        'ou': 'U',
        'ee': 'E',
        'oh': 'O',
        'blink': 'Blink',
        'blinkLeft': 'Blink_L',
        'blinkRight': 'Blink_R'
      };
      if (vrm0Map[name] && expressionManager.setValue) {
        expressionManager.setValue(vrm0Map[name], value);
      }
    };

    if (isTalking) {
      s.time += deltaTime;

      if (analyser) {
        // --- REAL TIME FREQUENCY-BASED LIP SYNC ---
        if (!s.dataArray || s.dataArray.length !== analyser.frequencyBinCount) {
          s.dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(s.dataArray);

        // Calculate intensity in different bands
        const getBandIntensity = (startBin, endBin) => {
          let sum = 0;
          const count = endBin - startBin;
          for (let i = startBin; i < endBin; i++) {
            sum += s.dataArray[i] || 0;
          }
          return (sum / count) / 255;
        };

        // Low (Speech base): ~100-300Hz
        const intensityLow = getBandIntensity(0, 8);
        // Mid (Vowels): ~300-1000Hz
        const intensityMid = getBandIntensity(8, 24);
        // High (Consonants/Fricatives): ~1000-4000Hz
        const intensityHigh = getBandIntensity(24, 64);

        const totalIntensity = (intensityLow + intensityMid + intensityHigh) / 3;
        targetVolume = totalIntensity;

        // Drive specific shapes - boosted sensitivity
        const aaVal = intensityMid * 1.2; 
        const ihVal = intensityHigh * 1.5;
        const ohVal = intensityLow * 1.3;

        // Smoothly apply
        s.lastVolume += (targetVolume - s.lastVolume) * deltaTime * 30; // Even faster
        
        const openFactor = s.lastVolume * s.amplitude * 1.5; // Boosted amplitude
        setMouthShape('aa', Math.min(1, aaVal * openFactor * 1.5));
        setMouthShape('ih', Math.min(1, ihVal * openFactor * 1.8));
        setMouthShape('oh', Math.min(1, ohVal * openFactor * 1.6));
        setMouthShape('ou', Math.min(1, intensityLow * 1.2 * openFactor));
      } else {
        // --- FALLBACK: Procedural Lip Sync ---
        const syllablePulse = Math.sin(s.time * 15.0) * 0.5 + 0.5;
        const wordEnvelope = Math.sin(s.time * 4.0) * 0.4 + 0.6;
        targetVolume = syllablePulse * wordEnvelope;
        s.lastVolume += (targetVolume - s.lastVolume) * deltaTime * 15;
        
        const openFactor = s.lastVolume * s.amplitude * 1.2;
        setMouthShape('aa', openFactor * 0.8);
        setMouthShape('ih', openFactor * 0.3);
        setMouthShape('oh', openFactor * 0.4);
      }

      // --- Head/Neck Animation ---
      const head = getBone('head');
      const neck = getBone('neck');
      if (head) {
        head.rotation.x = Math.sin(s.time * 12) * 0.02;
        head.rotation.z = Math.sin(s.time * 2.5) * 0.04;
      }
      if (neck) {
        neck.rotation.y = Math.sin(s.time * 1.8) * 0.03;
      }
    } else {
      s.time = 0;
      s.lastVolume = 0;
      // Precise stop: Fast fade out of all mouth shapes
      ['aa', 'ih', 'oh', 'ou', 'ee'].forEach(shape => {
        const val = expressionManager.getValue(shape) || 0;
        if (val > 0.01) setMouthShape(shape, val * 0.5); // Faster fade
        else setMouthShape(shape, 0);
      });
    }
  }, []);

  return { updateTalking };
}

export default useTalkingAnimation;
