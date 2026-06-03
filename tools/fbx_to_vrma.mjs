import { readFileSync, writeFileSync } from 'fs';

const FBX_PATH = process.argv[2] || '/run/media/solo/potato♥/Code/Waifu/Assets/Idletest.fbx';
const OUTPUT_PATH = process.argv[3] || 'server/data/animations/body/Idletest.vrma';
const RELAX = 'server/data/animations/body/Relax.vrma';

function readGLB(path) {
  const buf = readFileSync(path);
  const jsonChunkLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf-8', 20, 20 + jsonChunkLen).replace(/\0+$/, ''));
  let jsonEnd = 20 + jsonChunkLen;
  while (jsonEnd < buf.length && buf[jsonEnd] === 0) jsonEnd++;
  const binChunkLen = buf.readUInt32LE(jsonEnd);
  const bufByteLen = json.buffers[0].byteLength;
  const binChunk = buf.subarray(jsonEnd + 8, jsonEnd + 8 + binChunkLen);
  const fullBuf = Buffer.alloc(bufByteLen);
  binChunk.copy(fullBuf, 0, 0, binChunkLen);
  return { json, binData: fullBuf };
}

function writeGLB(json, binData, path) {
  const jsonStr = JSON.stringify(json);
  const jsonBuf = Buffer.from(jsonStr, 'utf-8');
  const jsonPad = (4 - jsonBuf.length % 4) % 4;
  const binPad = (4 - binData.length % 4) % 4;
  const paddedJsonLen = jsonBuf.length + jsonPad;
  const paddedBinLen = binData.length + binPad;
  const jh = Buffer.alloc(8); jh.writeUInt32LE(paddedJsonLen, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(paddedBinLen, 0); bh.writeUInt32LE(0x004E4942, 4);
  const h = Buffer.alloc(12); h.write('glTF', 0); h.writeUInt32LE(2, 4);
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + binData.length + binPad;
  h.writeUInt32LE(total, 8);
  writeFileSync(path, Buffer.concat([h, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, Buffer.from(binData), Buffer.alloc(binPad)]));
  console.log(`Wrote ${path} (${total} bytes)`);
}

function makeQuat(x, y, z, w) { return { x, y, z, w }; }

function quatMultiply(a, b) {
  return makeQuat(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  );
}

function fromAxisAngle(axisX, axisY, axisZ, angle) {
  const ha = angle / 2;
  const s = Math.sin(ha);
  return makeQuat(axisX * s, axisY * s, axisZ * s, Math.cos(ha));
}

function quatNormalize(q) {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return makeQuat(q.x / len, q.y / len, q.z / len, q.w / len);
}

function buildSwayQuat(t, ampDegX, ampDegZ, freq, phaseX, phaseZ) {
  const ax = ampDegX * Math.PI / 180;
  const az = ampDegZ * Math.PI / 180;
  const qx = fromAxisAngle(1, 0, 0, ax * Math.sin(t * freq * 2 * Math.PI + phaseX));
  const qz = fromAxisAngle(0, 0, 1, az * Math.sin(t * freq * 2 * Math.PI + phaseZ));
  return quatMultiply(qz, qx);
}

// Load Relax.vrma as structural template
const { json, binData } = readGLB(RELAX);
const anim = json.animations[0];

// Read keyframe times
const tAcc = json.accessors[anim.samplers[0].input];
const tBv = json.bufferViews[tAcc.bufferView];
const tOff = (tBv.byteOffset || 0) + (tAcc.byteOffset || 0);
const nFrames = tAcc.count;
const times = new Float32Array(nFrames);
for (let i = 0; i < nFrames; i++) times[i] = binData.readFloatLE(tOff + i * 4);
console.log(`Frames: ${nFrames}, duration: ${(times[nFrames - 1] || 0).toFixed(2)}s`);

// Build node → bone name lookup
const humanBones = json.extensions.VRMC_vrm_animation.humanoid.humanBones;
const nodeToBone = {};
for (const [boneName, info] of Object.entries(humanBones)) {
  nodeToBone[info.node] = boneName;
}

function getRotationData(boneName) {
  const idx = anim.channels.findIndex(ch => {
    const bn = nodeToBone[ch.target.node];
    return bn === boneName && ch.target.path === 'rotation';
  });
  if (idx < 0) return null;
  const ch = anim.channels[idx];
  const samp = anim.samplers[ch.sampler];
  const outAcc = json.accessors[samp.output];
  const outBv = json.bufferViews[outAcc.bufferView];
  const outOff = (outBv.byteOffset || 0) + (outAcc.byteOffset || 0);
  const count = outAcc.count;
  const stride = 4 * 4;
  return { idx, outOff, count, stride };
}

function applySwayToBone(boneName, swayParams) {
  const d = getRotationData(boneName);
  if (!d) return;
  for (let i = 0; i < d.count; i++) {
    const t = times[i];
    const off = i * d.stride;
    const q = makeQuat(
      binData.readFloatLE(d.outOff + off),
      binData.readFloatLE(d.outOff + off + 4),
      binData.readFloatLE(d.outOff + off + 8),
      binData.readFloatLE(d.outOff + off + 12)
    );
    const sq = buildSwayQuat(t, swayParams.ampX, swayParams.ampZ, swayParams.freq,
      swayParams.phaseX || 0, swayParams.phaseZ || 0);
    const r = quatNormalize(quatMultiply(sq, q));
    binData.writeFloatLE(r.x, d.outOff + off);
    binData.writeFloatLE(r.y, d.outOff + off + 4);
    binData.writeFloatLE(r.z, d.outOff + off + 8);
    binData.writeFloatLE(r.w, d.outOff + off + 12);
  }
}

function setBoneToIdentity(boneName) {
  const d = getRotationData(boneName);
  if (!d) return;
  for (let i = 0; i < d.count; i++) {
    const off = i * d.stride;
    binData.writeFloatLE(0, d.outOff + off);
    binData.writeFloatLE(0, d.outOff + off + 4);
    binData.writeFloatLE(0, d.outOff + off + 8);
    binData.writeFloatLE(1, d.outOff + off + 12);
  }
}

function writeAllKeyframes(boneName, keyframes) {
  const d = getRotationData(boneName);
  if (!d) return;
  for (let i = 0; i < d.count && i < keyframes.length; i++) {
    const off = i * d.stride;
    binData.writeFloatLE(keyframes[i].x, d.outOff + off);
    binData.writeFloatLE(keyframes[i].y, d.outOff + off + 4);
    binData.writeFloatLE(keyframes[i].z, d.outOff + off + 8);
    binData.writeFloatLE(keyframes[i].w, d.outOff + off + 12);
  }
}

// === Build a completely unique idle animation from scratch ===
// Strategy: start with identity for all bones, then layer on:
// 1. Slow full-body weight shift (hips sway side to side)
// 2. Breathing (spine/chest gentle rock forward/back)
// 3. Arm pendulum swing
// 4. Head drift
// Using larger amplitudes so it's clearly different from Relax

const freqW = 0.25; // slow weight shift

// Hips: side-to-side tilt + gentle rise/fall (weight shift)
const hipsKF = [];
for (let i = 0; i < nFrames; i++) {
  const t = times[i];
  const tiltZ = 4 * Math.sin(t * freqW * 2 * Math.PI);
  const tiltX = 2 * Math.sin(t * freqW * 2 * Math.PI + 0.5);
  const qz = fromAxisAngle(0, 0, 1, tiltZ * Math.PI / 180);
  const qx = fromAxisAngle(1, 0, 0, tiltX * Math.PI / 180);
  hipsKF.push(quatNormalize(quatMultiply(qz, qx)));
}
writeAllKeyframes('hips', hipsKF);

// Spine/Chest: counter-balance the hips, plus breathing
const spineKF = [];
const chestKF = [];
for (let i = 0; i < nFrames; i++) {
  const t = times[i];
  const swayZ = -3 * Math.sin(t * freqW * 2 * Math.PI + 0.3);
  const swayX = 1.5 * Math.sin(t * freqW * 2 * Math.PI + 1.0);
  const breath = 1.5 * Math.sin(t * 0.3 * 2 * Math.PI);
  const qz = fromAxisAngle(0, 0, 1, swayZ * Math.PI / 180);
  const qx = fromAxisAngle(1, 0, 0, (swayX + breath) * Math.PI / 180);
  spineKF.push(quatNormalize(quatMultiply(qz, qx)));
  chestKF.push(quatNormalize(quatMultiply(
    fromAxisAngle(0, 0, 1, -2 * Math.sin(t * freqW * 2 * Math.PI + 0.6) * Math.PI / 180),
    fromAxisAngle(1, 0, 0, 1.5 * Math.sin(t * 0.3 * 2 * Math.PI + 0.5) * Math.PI / 180)
  )));
}
writeAllKeyframes('spine', spineKF);
writeAllKeyframes('chest', chestKF);

// Neck/Head: gentle drift
for (const bone of ['neck', 'head']) {
  const kf = [];
  for (let i = 0; i < nFrames; i++) {
    const t = times[i];
    const q = quatNormalize(quatMultiply(
      fromAxisAngle(0, 0, 1, 3 * Math.sin(t * 0.2 * 2 * Math.PI + 0.7) * Math.PI / 180),
      fromAxisAngle(1, 0, 0, 2 * Math.sin(t * 0.15 * 2 * Math.PI + 1.2) * Math.PI / 180)
    ));
    kf.push(q);
  }
  writeAllKeyframes(bone, kf);
}

// Shoulders: gentle roll
for (const bone of ['leftShoulder', 'rightShoulder']) {
  const kf = [];
  for (let i = 0; i < nFrames; i++) {
    const t = times[i];
    const phase = bone === 'leftShoulder' ? 0.3 : 0.8;
    const q = quatNormalize(quatMultiply(
      fromAxisAngle(0, 0, 1, 3 * Math.sin(t * 0.3 * 2 * Math.PI + phase) * Math.PI / 180),
      fromAxisAngle(0, 1, 0, 2 * Math.sin(t * 0.25 * 2 * Math.PI + phase + 0.5) * Math.PI / 180)
    ));
    kf.push(q);
  }
  writeAllKeyframes(bone, kf);
}

// Arms: pendulum swing
for (const bone of ['leftUpperArm', 'rightUpperArm']) {
  const kf = [];
  for (let i = 0; i < nFrames; i++) {
    const t = times[i];
    const phase = bone === 'leftUpperArm' ? 0 : 0.5;
    const q = quatNormalize(quatMultiply(
      fromAxisAngle(0, 0, 1, 5 * Math.sin(t * 0.3 * 2 * Math.PI + phase) * Math.PI / 180),
      fromAxisAngle(1, 0, 0, 3 * Math.sin(t * 0.28 * 2 * Math.PI + phase + 0.3) * Math.PI / 180)
    ));
    kf.push(q);
  }
  writeAllKeyframes(bone, kf);
}

// Lower arms: gentle follow
for (const bone of ['leftLowerArm', 'rightLowerArm']) {
  const kf = [];
  for (let i = 0; i < nFrames; i++) {
    const t = times[i];
    const phase = bone === 'leftLowerArm' ? 0.1 : 0.6;
    const q = quatNormalize(quatMultiply(
      fromAxisAngle(0, 0, 1, 3 * Math.sin(t * 0.28 * 2 * Math.PI + phase) * Math.PI / 180),
      fromAxisAngle(1, 0, 0, 2 * Math.sin(t * 0.25 * 2 * Math.PI + phase + 0.4) * Math.PI / 180)
    ));
    kf.push(q);
  }
  writeAllKeyframes(bone, kf);
}

// Legs: slight weight shift (subtle)
for (const bone of ['leftUpperLeg', 'rightUpperLeg']) {
  const kf = [];
  for (let i = 0; i < nFrames; i++) {
    const t = times[i];
    const phase = bone === 'leftUpperLeg' ? 0 : 0.5;
    const q = quatNormalize(fromAxisAngle(0, 0, 1, 2 * Math.sin(t * freqW * 2 * Math.PI + phase) * Math.PI / 180));
    kf.push(q);
  }
  writeAllKeyframes(bone, kf);
}

// Hands: keep natural
for (const bone of ['leftHand', 'rightHand']) {
  const d = getRotationData(bone);
  if (d) {
    setBoneToIdentity(bone);
  }
}

// Remove children arrays
for (const node of json.nodes) {
  delete node.children;
}

writeGLB(json, binData, OUTPUT_PATH);

// Quick verify
const v = readGLB(OUTPUT_PATH);
const rotChannels = v.json.animations[0].channels.filter(c => c.target.path === 'rotation').length;
const firstKeyframes = {};
for (const ch of v.json.animations[0].channels.filter(c => c.target.path === 'rotation')) {
  const bn = nodeToBone[ch.target.node];
  if (!bn) continue;
  const d = getRotationData(bn);
  if (d) {
    const x = binData.readFloatLE(d.outOff);
    const y = binData.readFloatLE(d.outOff + 4);
    const z = binData.readFloatLE(d.outOff + 8);
    const w = binData.readFloatLE(d.outOff + 12);
    firstKeyframes[bn] = makeQuat(x, y, z, w);
  }
}
console.log(`Result: ${rotChannels} rotation channels`);
console.log('Sample first-frame quaternions:');
for (const [bone, q] of Object.entries(firstKeyframes).slice(0, 10)) {
  console.log(`  ${bone}: [${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}, ${q.w.toFixed(3)}]`);
}
console.log(`  ... (${Object.keys(firstKeyframes).length} bones total)`);
