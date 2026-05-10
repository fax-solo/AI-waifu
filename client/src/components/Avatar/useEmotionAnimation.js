/**
 * useEmotionAnimation
 *
 * Premium emotion hook that transforms the whole face (Eyes, Mouth, Brows).
 */

import { useCallback, useRef } from 'react';

const EXPRESSION_PROFILES = {
  neutral: { 
    presets: { neutral: 1.0 }, 
    eyeSquint: 0, headTilt: 0, gazeLow: 0 
  },
  happy: { 
    presets: { happy: 1.0, joy: 1.0, relaxed: 0.4 }, 
    eyeSquint: 0.4, headTilt: 0.15, gazeLow: 0 
  },
  sad: { 
    presets: { sad: 1.0, sorrow: 1.0 }, 
    eyeSquint: 0.1, headTilt: -0.1, gazeLow: 0.3 
  },
  angry: { 
    presets: { angry: 1.0 }, 
    eyeSquint: 0.6, headTilt: -0.05, gazeLow: -0.1 
  },
  excited: { 
    presets: { happy: 1.0, joy: 1.0, surprised: 0.4, fun: 0.6 }, 
    eyeSquint: -0.5, headTilt: 0.2, gazeLow: 0 
  },
  surprised: { 
    presets: { surprised: 1.0, fun: 0.4 }, 
    eyeSquint: -0.8, headTilt: 0, gazeLow: 0 
  },
  relaxed: { 
    presets: { relaxed: 1.0, happy: 0.2 }, 
    eyeSquint: 0.3, headTilt: 0.1, gazeLow: 0.1 
  }
};

const PRESET_NAMES = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral', 'joy', 'sorrow', 'fun'];

export function useEmotionAnimation() {
  const vrmRef = useRef(null);
  const expressionCache = useRef({});

  const updateEmotion = useCallback((vrm, emotion, delta) => {
    if (!vrm) return;
    
    // Support both VRM 1.0 (expressionManager) and VRM 0.x (blendShapeProxy)
    const expressionManager = vrm.expressionManager || vrm.blendShapeProxy;
    if (!expressionManager) return;

    // Deep scan expressions once per model to find custom ones (e.g. "Eye_Happy")
    if (vrmRef.current !== vrm) {
      vrmRef.current = vrm;
      expressionCache.current = {};
      
      // Try multiple ways to get names depending on version
      const allNames = expressionManager.expressionNames || 
                       expressionManager.expressions?.map(e => e.expressionName) || 
                       (vrm.blendShapeProxy ? Object.keys(vrm.blendShapeProxy._blendShapeGroups || {}) : []);
      
      console.log('[Emotion] Model Expression Names:', allNames);
      
      // Cache matches for each profile
      Object.keys(EXPRESSION_PROFILES).forEach(profileKey => {
        const matches = allNames.filter(name => {
          const n = name.toLowerCase();
          const p = profileKey.toLowerCase();
          if (p === 'happy' && (n.includes('happy') || n.includes('joy') || n.includes('fun'))) return true;
          if (p === 'sad' && (n.includes('sad') || n.includes('sorrow'))) return true;
          if (p === 'angry' && n.includes('angry')) return true;
          if (p === 'surprised' && (n.includes('surprised') || n.includes('surprise'))) return true;
          if (p === 'relaxed' && n.includes('relaxed')) return true;
          return n.includes(p);
        });
        
        // Ensure standard preset is ALWAYS tried even if not found in names
        if (!matches.includes(profileKey)) matches.push(profileKey);
        
        expressionCache.current[profileKey] = matches;
      });
      console.log('[Emotion] Cached Matches:', expressionCache.current);
    }

    const matchedNames = expressionCache.current[emotion] || [];

    // 1. Reset all known expressions slowly
    // For VRM 1.0
    if (vrm.expressionManager) {
      vrm.expressionManager.expressions.forEach(exp => {
        const name = exp.expressionName;
        const isTarget = matchedNames.includes(name);
        const targetWeight = isTarget ? 1.0 : 0.0;
        const currentWeight = vrm.expressionManager.getValue(name) || 0;
        
        if (Math.abs(currentWeight - targetWeight) > 0.01) {
          const speed = isTarget ? 8.0 : 4.0;
          const nextWeight = currentWeight + (targetWeight - currentWeight) * Math.min(delta * speed, 1.0);
          vrm.expressionManager.setValue(name, nextWeight);
        }
      });
    } 
    // For VRM 0.x
    else if (vrm.blendShapeProxy) {
      matchedNames.forEach(name => {
        const currentWeight = vrm.blendShapeProxy.getValue(name) || 0;
        const nextWeight = currentWeight + (1.0 - currentWeight) * Math.min(delta * 8.0, 1.0);
        vrm.blendShapeProxy.setValue(name, nextWeight);
      });
      
      // Reset others
      Object.keys(expressionCache.current).forEach(key => {
        if (key === emotion) return;
        expressionCache.current[key].forEach(name => {
          if (matchedNames.includes(name)) return;
          const currentWeight = vrm.blendShapeProxy.getValue(name) || 0;
          const nextWeight = currentWeight * Math.max(0, 1.0 - delta * 4.0);
          vrm.blendShapeProxy.setValue(name, nextWeight);
        });
      });
    }

    // 2. Extra Face polish (Gaze)
    if (vrm.lookAt) {
      const gazeY = (emotion === 'sad') ? 0.4 : (emotion === 'angry' ? -0.2 : 0);
      vrm.lookAt.pitch = (vrm.lookAt.pitch || 0) * 0.9 + gazeY * 0.1;
    }

    expressionManager.update();
  }, []);

  return { updateEmotion };
}
