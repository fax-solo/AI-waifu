const EYE_CHANNELS = ['joy', 'angry', 'sorrow', 'surprised'];
const SUPPRESS_DURATION = 0.03;
const RESTORE_DURATION = 0.08;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

class ExpressionBlendQueue {
  constructor(proxy = null) {
    this._proxy = proxy;
    this._blinkActive = false;
    this._phase = 'idle';
    this._suppressionTimer = 0;
    this._restoreTimer = 0;
    this._suppressed = new Map();
  }

  setProxy(proxy) {
    this._proxy = proxy;
  }

  onBlinkStart() {
    if (this._blinkActive) return;
    this._blinkActive = true;
    this._phase = 'suppressing';
    this._suppressionTimer = 0;
    this._restoreTimer = 0;
    this._suppressed.clear();

    if (!this._proxy) return;

    for (const preset of EYE_CHANNELS) {
      const weight = this._proxy.getWeight(preset);
      if (weight > 0.01) {
        this._suppressed.set(preset, {
          original: weight,
          target: weight * 0.1,
        });
      }
    }
  }

  onBlinkEnd() {
    if (!this._blinkActive) return;
    this._phase = 'restoring';
    this._restoreTimer = 0;

    for (const [, state] of this._suppressed) {
      state.target = state.original;
    }
  }

  update(dt) {
    if (!this._blinkActive || !this._proxy) return;

    if (this._phase === 'suppressing') {
      this._suppressionTimer += dt;
      const t = Math.min(1, this._suppressionTimer / SUPPRESS_DURATION);
      const eased = smoothstep(t);

      for (const [preset, state] of this._suppressed) {
        const current = state.original + (state.target - state.original) * eased;
        this._proxy.setWeight(preset, current);
      }

      if (t >= 1) {
        this._phase = 'active';
      }
    } else if (this._phase === 'restoring') {
      this._restoreTimer += dt;
      const t = Math.min(1, this._restoreTimer / RESTORE_DURATION);
      const eased = smoothstep(t);

      for (const [preset, state] of this._suppressed) {
        const base = state.original * 0.1;
        const current = base + (state.target - base) * eased;
        this._proxy.setWeight(preset, current);
      }

      if (t >= 1) {
        for (const [preset, state] of this._suppressed) {
          this._proxy.setWeight(preset, state.original);
        }
        this._suppressed.clear();
        this._blinkActive = false;
        this._phase = 'idle';
      }
    }
  }

  isActive() { return this._blinkActive; }
  getPhase() { return this._phase; }
  getSuppressed() { return this._suppressed; }
}

export { ExpressionBlendQueue, EYE_CHANNELS };
export default ExpressionBlendQueue;
