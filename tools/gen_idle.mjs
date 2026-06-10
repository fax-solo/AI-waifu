import { readFileSync, writeFileSync } from 'fs';

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
  // Pad with spaces (valid JSON whitespace) instead of nulls so JSON.parse in browser works
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

function buildSwayQuat(t, ampDegX, ampDegZ, freq, phaseX, phaseZ) {
  const ax = ampDegX * Math.PI / 180;
  const az = ampDegZ * Math.PI / 180;
  const qx = fromAxisAngle(1, 0, 0, ax * Math.sin(t * freq * 2 * Math.PI + phaseX));
  const qz = fromAxisAngle(0, 0, 1, az * Math.sin(t * freq * 2 * Math.PI + phaseZ));
  return quatMultiply(qz, qx);
}

function applySwayToBone(ch, json, binData, anim, times, swayParams) {
  const samp = anim.samplers[ch.sampler];
  const outAcc = json.accessors[samp.output];
  const outBv = json.bufferViews[outAcc.bufferView];
  const outOff = (outBv.byteOffset || 0) + (outAcc.byteOffset || 0);
  const count = outAcc.count;
  const stride = 4 * 4;
  const newData = Buffer.alloc(count * stride);
  binData.copy(newData, 0, outOff, outOff + count * stride);

  for (let i = 0; i < count; i++) {
    const t = (i < times.length ? times[i] : 0) || (i / count * 4);
    const off = i * stride;
    const q = makeQuat(
      binData.readFloatLE(outOff + off),
      binData.readFloatLE(outOff + off + 4),
      binData.readFloatLE(outOff + off + 8),
      binData.readFloatLE(outOff + off + 12)
    );
    const sq = buildSwayQuat(t, swayParams.ampX, swayParams.ampZ, swayParams.freq,
      swayParams.phaseX || 0, swayParams.phaseZ || 0);
    const r = quatMultiply(sq, q);
    const len = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w);
    newData.writeFloatLE(r.x / len, off);
    newData.writeFloatLE(r.y / len, off + 4);
    newData.writeFloatLE(r.z / len, off + 8);
    newData.writeFloatLE(r.w / len, off + 12);
  }
  newData.copy(binData, outOff, 0, count * stride);
}

function applySwayToChannels(channelIndices, json, binData, anim, times, params) {
  for (const idx of channelIndices) {
    const ch = anim.channels[idx];
    applySwayToBone(ch, json, binData, anim, times, params);
  }
}

function findAllRotationChannels(json, anim) {
  return anim.channels
    .map((ch, i) => ({ ch, i }))
    .filter(({ ch }) => ch.target.path === 'rotation')
    .map(({ i }) => i);
}

function findChannels(json, anim, nameMatch) {
  return anim.channels
    .map((ch, i) => ({ ch, i }))
    .filter(({ ch }) => {
      const nodeName = json.nodes[ch.target.node]?.name || '';
      return ch.target.path === 'rotation' && nameMatch(nodeName);
    })
    .map(({ i }) => i);
}

function loadTimes(json, anim, binData) {
  const tAcc = json.accessors[anim.samplers[0].input];
  const tBv = json.bufferViews[tAcc.bufferView];
  const tOff = (tBv.byteOffset || 0) + (tAcc.byteOffset || 0);
  const nFrames = tAcc.count;
  const times = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    times[i] = binData.readFloatLE(tOff + i * 4);
  }
  return times;
}

const RELAX = 'server/data/animations/body/Relax.vrma';

// --- cute_idle: perky full-body idle ---
(function() {
  const { json, binData } = readGLB(RELAX);
  const anim = json.animations[0];
  const times = loadTimes(json, anim, binData);
  console.log(`cute_idle: ${times.length} frames, ${(times[times.length-1]||6).toFixed(2)}s`);

  const UPPER = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder'];
  const ARMS = ['LeftUpperArm', 'RightUpperArm', 'LeftLowerArm', 'RightLowerArm'];

  applySwayToChannels(findChannels(json, anim, n => UPPER.includes(n)), json, binData, anim, times,
    { ampX: 6, ampZ: 10, freq: 0.5, phaseX: 0.2, phaseZ: 0 });
  applySwayToChannels(findChannels(json, anim, n => ARMS.includes(n)), json, binData, anim, times,
    { ampX: 4, ampZ: 8, freq: 0.4, phaseX: 0.8, phaseZ: 0.3 });
  applySwayToChannels(findChannels(json, anim, n => n === 'Head'), json, binData, anim, times,
    { ampX: 6, ampZ: 4, freq: 0.6, phaseX: 0.5, phaseZ: 1.0 });

  writeGLB(json, binData, 'server/data/animations/body/cute_idle.vrma');
})();

// --- cute_idle_dreamy: slow, sleepy sway ---
(function() {
  const { json, binData } = readGLB(RELAX);
  const anim = json.animations[0];
  const times = loadTimes(json, anim, binData);
  console.log(`cute_idle_dreamy: ${times.length} frames, ${(times[times.length-1]||6).toFixed(2)}s`);

  const UPPER = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder'];
  const ARMS = ['LeftUpperArm', 'RightUpperArm', 'LeftLowerArm', 'RightLowerArm'];

  applySwayToChannels(findChannels(json, anim, n => UPPER.includes(n)), json, binData, anim, times,
    { ampX: 8, ampZ: 14, freq: 0.2, phaseX: 0, phaseZ: 0.3 });
  applySwayToChannels(findChannels(json, anim, n => ARMS.includes(n)), json, binData, anim, times,
    { ampX: 6, ampZ: 10, freq: 0.18, phaseX: 0.7, phaseZ: 0.1 });
  applySwayToChannels(findChannels(json, anim, n => n === 'Head'), json, binData, anim, times,
    { ampX: 10, ampZ: 5, freq: 0.25, phaseX: 0.5, phaseZ: 1.2 });
  applySwayToChannels(findChannels(json, anim, n => n === 'Neck'), json, binData, anim, times,
    { ampX: 5, ampZ: 3, freq: 0.25, phaseX: 0.5, phaseZ: 1.2 });

  writeGLB(json, binData, 'server/data/animations/body/cute_idle_dreamy.vrma');
})();

console.log('Done');
