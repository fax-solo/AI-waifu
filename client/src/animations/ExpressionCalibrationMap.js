const STORAGE_PREFIX = 'waifu-expr-calib:';

const DEFAULT_CALIBRATION = {
  neutral: 1.0,
  joy: 0.8,
  angry: 0.75,
  sorrow: 0.85,
  surprised: 0.7,
  blink: 0.85,
  blinkLeft: 0.85,
  blinkRight: 0.85,
  aa: 0.9,
  ih: 0.85,
  ou: 0.9,
  ee: 0.85,
  oh: 0.9,
  fun: 0.8,
  relaxed: 0.9,
  lookUp: 1.0,
  lookDown: 1.0,
  lookLeft: 1.0,
  lookRight: 1.0,
};

class ExpressionCalibrationMap {
  constructor(modelId = 'default') {
    this._modelId = modelId;
    this._map = new Map();
    this._resetToDefaults();
    this.load(modelId);
  }

  _resetToDefaults() {
    this._map.clear();
    for (const [k, v] of Object.entries(DEFAULT_CALIBRATION)) {
      this._map.set(k, v);
    }
  }

  get(preset) {
    const v = this._map.get(preset);
    return v !== undefined ? v : 1.0;
  }

  set(preset, value) {
    this._map.set(preset, Math.max(0, Math.min(2, value)));
  }

  reset(preset) {
    if (DEFAULT_CALIBRATION.hasOwnProperty(preset)) {
      this._map.set(preset, DEFAULT_CALIBRATION[preset]);
    } else {
      this._map.set(preset, 1.0);
    }
  }

  resetAll() {
    this._resetToDefaults();
  }

  getAll() {
    const out = {};
    for (const [k, v] of this._map) {
      out[k] = v;
    }
    return out;
  }

  load(modelId) {
    this._modelId = modelId || 'default';
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + this._modelId);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'number' && v >= 0 && v <= 2) {
            this._map.set(k, v);
          }
        }
      }
    } catch {}
  }

  save() {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + this._modelId,
        JSON.stringify(Object.fromEntries(this._map))
      );
    } catch {}
  }

  getModelId() { return this._modelId; }

  setModelId(id) {
    this._modelId = id;
    this._resetToDefaults();
    this.load(id);
  }

  getRawMap() { return this._map; }
}

export { ExpressionCalibrationMap, DEFAULT_CALIBRATION };
export default ExpressionCalibrationMap;
