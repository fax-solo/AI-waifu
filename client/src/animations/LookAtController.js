import * as THREE from 'three';

const _headBox = new THREE.Box3();
const _headCenter = new THREE.Vector3();
const _headSize = new THREE.Vector3();

const TRACK_LERP = 8;
const IDLE_LERP = 10;

class LookAtController {
  constructor(vrm) {
    this._yaw = 0;
    this._pitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;
    this._maxYaw = 15;
    this._maxPitch = 10;
    this._trackLerp = TRACK_LERP;
    this._idleLerp = IDLE_LERP;
    this._measured = false;
    this._eyeDepth = 0.05;

    if (vrm) this.measure(vrm);
  }

  measure(vrm) {
    if (!vrm?.humanoid) return;
    const head = vrm.humanoid.getNormalizedBoneNode?.('head');
    if (!head) return;

    _headBox.setFromObject(head);
    _headBox.getCenter(_headCenter);
    _headBox.getSize(_headSize);

    const headWidth = _headSize.x;
    const headHeight = _headSize.y;
    const headDepth = _headSize.z;

    this._eyeDepth = Math.max(0.03, headDepth * 0.3);

    const rawMaxYaw = THREE.MathUtils.radToDeg(
      Math.atan2(headWidth * 0.45, this._eyeDepth)
    );
    const rawMaxPitch = THREE.MathUtils.radToDeg(
      Math.atan2(headHeight * 0.35, this._eyeDepth)
    );

    this._maxYaw = Math.max(2, Math.min(30, rawMaxYaw));
    this._maxPitch = Math.max(1, Math.min(20, rawMaxPitch));
    this._measured = true;
  }

  update(dt, mouseX = 0, mouseY = 0, mouseMoving = false, lookAt = null) {
    if (isNaN(dt) || dt <= 0 || !isFinite(dt)) return;

    const speed = mouseMoving ? this._trackLerp : this._idleLerp;
    const factor = Math.min(1, dt * speed);

    if (mouseMoving) {
      const rawYaw = mouseX * this._maxYaw * 0.85;
      const rawPitch = mouseY * this._maxPitch * 0.85;
      this._targetYaw = Math.max(-this._maxYaw, Math.min(this._maxYaw, rawYaw));
      this._targetPitch = Math.max(-this._maxPitch, Math.min(this._maxPitch, rawPitch));
    }

    this._yaw += (this._targetYaw - this._yaw) * factor;
    this._pitch += (this._targetPitch - this._pitch) * factor;

    if (lookAt) {
      lookAt.yaw = this._yaw;
      lookAt.pitch = this._pitch;
    }
  }

  setTarget(yaw, pitch) {
    this._targetYaw = Math.max(-this._maxYaw, Math.min(this._maxYaw, yaw));
    this._targetPitch = Math.max(-this._maxPitch, Math.min(this._maxPitch, pitch));
  }

  setClamping(maxYaw, maxPitch) {
    this._maxYaw = Math.max(1, Math.min(45, maxYaw));
    this._maxPitch = Math.max(1, Math.min(30, maxPitch));
  }

  setTrackLerp(speed) { this._trackLerp = Math.max(1, speed); }
  setIdleLerp(speed) { this._idleLerp = Math.max(1, speed); }

  getYaw() { return this._yaw; }
  getPitch() { return this._pitch; }
  getTargetYaw() { return this._targetYaw; }
  getTargetPitch() { return this._targetPitch; }
  getMaxYaw() { return this._maxYaw; }
  getMaxPitch() { return this._maxPitch; }
  isMeasured() { return this._measured; }
}

export { LookAtController };
export default LookAtController;
