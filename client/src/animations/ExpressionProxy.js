const PRESET_FALLBACK = {
  neutral: ['neutral', 'Neutral'],
  joy: ['joy', 'happy', 'Joy', 'Fun'],
  angry: ['angry', 'Angry'],
  sorrow: ['sorrow', 'sad', 'Sorrow', 'Sad'],
  surprised: ['surprised', 'Surprised'],
  blink: ['blink', 'Blink'],
  blinkLeft: ['blinkLeft', 'Blink_L'],
  blinkRight: ['blinkRight', 'Blink_R'],
  aa: ['aa', 'Aa'],
  ih: ['ih', 'Ih'],
  ou: ['ou', 'Ou'],
  ee: ['ee', 'Ee'],
  oh: ['oh', 'Oh'],
  fun: ['Fun', 'fun', 'joy', 'happy'],
  relaxed: ['relaxed', 'Relaxed', 'neutral'],
  lookUp: ['lookUp'],
  lookDown: ['lookDown'],
  lookLeft: ['lookLeft'],
  lookRight: ['lookRight'],
};

const STANDARD_PRESETS = new Set(Object.keys(PRESET_FALLBACK));

const ALIAS_TO_PRESET = {
  happy: 'joy', Joy: 'joy',
  sad: 'sorrow', Sad: 'sorrow', Sorrow: 'sorrow',
  angry: 'angry', Angry: 'angry',
  surprised: 'surprised', Surprised: 'surprised',
  neutral: 'neutral', Neutral: 'neutral',
  relaxed: 'relaxed', Relaxed: 'relaxed',
  fun: 'fun', Fun: 'fun',
  blink: 'blink', Blink: 'blink',
  blinkLeft: 'blinkLeft', blinkRight: 'blinkRight',
  Blink_L: 'blinkLeft', Blink_R: 'blinkRight',
  aa: 'aa', A: 'aa', Aa: 'aa',
  ih: 'ih', I: 'ih', Ih: 'ih',
  ou: 'ou', U: 'ou', Ou: 'ou',
  ee: 'ee', E: 'ee', Ee: 'ee',
  oh: 'oh', O: 'oh', Oh: 'oh',
};

const EYE_AFFECTING_PRESETS = new Set([
  'joy', 'angry', 'sorrow', 'surprised', 'blink', 'blinkLeft', 'blinkRight',
]);

class ExpressionProxy {
  constructor(em, calibrationMap = null) {
    this._em = em;
    this._calibration = calibrationMap;
    this._available = new Set();
    this._presetCache = new Map();
    this._presetToRaw = new Map();
    this._rawToPreset = new Map();
    this._discovered = false;
    this.discover();
  }

  discover() {
    this._available.clear();
    this._presetCache.clear();
    this._presetToRaw.clear();
    this._rawToPreset.clear();
    if (!this._em) return;
    try {
      const map = this._em.expressionMap || this._em.expressions || this._em._expressionMap;
      if (map instanceof Map) {
        for (const k of map.keys()) this._available.add(k);
      } else if (typeof map === 'object' && map) {
        for (const k of Object.keys(map)) this._available.add(k);
      }
    } catch {}

    for (const [preset, fallbacks] of Object.entries(PRESET_FALLBACK)) {
      for (const fb of fallbacks) {
        if (this._available.has(fb)) {
          this._presetCache.set(preset, fb);
          this._presetToRaw.set(preset, fb);
          this._rawToPreset.set(fb, preset);
          break;
        }
      }
    }

    for (const name of this._available) {
      if (!this._rawToPreset.has(name)) {
        const lower = name.toLowerCase();
        for (const [preset, fallbacks] of Object.entries(PRESET_FALLBACK)) {
          if (fallbacks.some(f => f.toLowerCase() === lower)) {
            this._rawToPreset.set(name, preset);
            break;
          }
        }
      }
    }

    this._discovered = true;
  }

  hasPreset(preset) {
    return this._presetCache.has(preset);
  }

  resolve(preset) {
    return this._presetCache.get(preset) ?? null;
  }

  setWeight(preset, weight) {
    if (!this._em?.setValue) return;
    const resolved = this._presetCache.get(preset);
    if (!resolved) return;
    const modifier = this._calibration ? this._calibration.get(preset) : 1.0;
    const final = Math.max(0, Math.min(1, weight * modifier));
    this._em.setValue(resolved, final);
  }

  getWeight(preset) {
    if (!this._em?.getValue) return 0;
    const resolved = this._presetCache.get(preset);
    if (!resolved) return 0;
    const raw = this._em.getValue(resolved);
    const modifier = this._calibration ? this._calibration.get(preset) : 1.0;
    return modifier > 0 ? Math.min(1, raw / modifier) : 0;
  }

  nameToPreset(name) {
    if (STANDARD_PRESETS.has(name)) return name;
    const aliased = ALIAS_TO_PRESET[name];
    if (aliased && (STANDARD_PRESETS.has(aliased) || this._presetCache.has(aliased))) return aliased;
    const lower = ALIAS_TO_PRESET[name.toLowerCase()];
    if (lower && (STANDARD_PRESETS.has(lower) || this._presetCache.has(lower))) return lower;
    return this._rawToPreset.get(name) ?? null;
  }

  resolveTargets(targetExpressions) {
    const presetWeights = new Map();
    for (const [name, weight] of Object.entries(targetExpressions)) {
      const preset = this.nameToPreset(name);
      if (preset) {
        const existing = presetWeights.get(preset) ?? 0;
        presetWeights.set(preset, Math.max(existing, weight));
      }
    }
    return presetWeights;
  }

  setWeightRaw(name, weight) {
    if (this._em?.setValue) {
      this._em.setValue(name, Math.max(0, Math.min(1, weight)));
    }
  }

  update() {
    this._em?.update();
  }

  isEyeAffecting(preset) {
    return EYE_AFFECTING_PRESETS.has(preset);
  }

  isDiscovered() { return this._discovered; }
  getRawEm() { return this._em; }
  getCalibration() { return this._calibration; }
  getAvailable() { return this._available; }
  getResolvedPresets() { return this._presetCache; }
  getPresetToRaw() { return this._presetToRaw; }
  getRawToPreset() { return this._rawToPreset; }
  getStandardPresets() { return STANDARD_PRESETS; }
}

export { ExpressionProxy, STANDARD_PRESETS, PRESET_FALLBACK, EYE_AFFECTING_PRESETS };
export default ExpressionProxy;
