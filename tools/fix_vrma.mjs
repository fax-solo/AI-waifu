import { readFileSync, writeFileSync } from 'fs';

const TARGET = process.argv[2];
const TEMPLATE = 'server/data/animations/body/Relax.vrma';

if (!TARGET) {
  console.log('Usage: node tools/fix_vrma.mjs <target.vrma>');
  console.log('Merges missing bones from Relax.vrma into target VRMA');
  process.exit(1);
}

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

const target = readGLB(TARGET);
const templ = readGLB(TEMPLATE);

const targetHB = target.json.extensions.VRMC_vrm_animation.humanoid.humanBones;
const templHB = templ.json.extensions.VRMC_vrm_animation.humanoid.humanBones;
const templAnim = templ.json.animations[0];

const missing = Object.keys(templHB).filter(b => !(b in targetHB));
console.log(`Target: ${Object.keys(targetHB).length}B, Template: ${Object.keys(templHB).length}B, Missing: ${missing.length}B`);

// Build merge data if there are missing bones
const addNodes = [], addBVs = [], addAccs = [], addSamps = [], addChans = [], addBin = [];
let nN = target.json.nodes.length, nA = target.json.accessors.length, nB = target.json.bufferViews.length;
let nS = target.json.animations[0].samplers.length;
const originalBufLen = target.binData.length;

for (const boneName of missing) {
  const tn = templHB[boneName].node;
  const node = JSON.parse(JSON.stringify(templ.json.nodes[tn]));
  const myIdx = nN + addNodes.length;
  addNodes.push(node);

  const ch = templAnim.channels.find(c => c.target?.node === tn);
  if (!ch) continue;

  const sam = templAnim.samplers[ch.sampler];
  const iA = templ.json.accessors[sam.input], oA = templ.json.accessors[sam.output];
  const iB = templ.json.bufferViews[iA.bufferView], oB = templ.json.bufferViews[oA.bufferView];
  const iD = templ.binData.subarray(iB.byteOffset, iB.byteOffset + iB.byteLength);
  const oD = templ.binData.subarray(oB.byteOffset, oB.byteOffset + oB.byteLength);

  let off = addBin.reduce((s, c) => s + c.length, 0);
  addBin.push(iD);
  const ip = (4 - iD.length % 4) % 4; if (ip) addBin.push(Buffer.alloc(ip));
  off = addBin.reduce((s, c) => s + c.length, 0) - iD.length - ip;
  addBin.push(oD);
  const op = (4 - oD.length % 4) % 4; if (op) addBin.push(Buffer.alloc(op));

  addBVs.push({ buffer: 0, byteOffset: originalBufLen + off, byteLength: iD.length });
  addBVs.push({ buffer: 0, byteOffset: originalBufLen + off + iD.length + ip, byteLength: oD.length });
  addAccs.push({ ...iA, bufferView: nB + addBVs.length - 2 });
  addAccs.push({ ...oA, bufferView: nB + addBVs.length - 1 });
  addSamps.push({ ...sam, input: nA + addAccs.length - 2, output: nA + addAccs.length - 1 });
  addChans.push({ ...ch, target: { ...ch.target, node: myIdx }, sampler: nS + addSamps.length - 1 });
  console.log(`  + ${boneName}`);
}

// Build the merged GLB JSON
const merged = JSON.parse(JSON.stringify(target.json));

// Fix the hips node — if it has no translation, set a default 1m height.
// This prevents restHipsPosition.y = 0 → division by zero in
// createVRMAnimationHumanoidTracks when it computes scale = humanoidY / animationY.
const hipsNodeIdx = merged.extensions.VRMC_vrm_animation.humanoid.humanBones.hips.node;
const hipsNode = merged.nodes[hipsNodeIdx];
if (!hipsNode.translation) {
  hipsNode.translation = [0, 1, 0];
  console.log(`  * hips: set default translation [0, 1, 0]`);
}

// Remove any translation channels for hips — AI generators output all-zero
// [0,0,0] tracks which get normalized into [0,0,0] * scale = [0,0,0],
// collapsing the model's hips to the origin.
merged.animations[0].channels = merged.animations[0].channels.filter(ch => {
  if (ch.target?.node === hipsNodeIdx && ch.target?.path === 'translation') {
    console.log(`  * hips: removed zero translation channel`);
    return false;
  }
  return true;
});

if (missing.length > 0) {
  merged.nodes.push(...addNodes);
  merged.accessors.push(...addAccs);
  merged.bufferViews.push(...addBVs);
  merged.animations[0].channels.push(...addChans);
  merged.animations[0].samplers.push(...addSamps);
  missing.forEach((n, i) => { merged.extensions.VRMC_vrm_animation.humanoid.humanBones[n] = { node: nN + i }; });
}

// Strip children arrays from all nodes — the cloned Relax nodes copied wrong
// indices (relax node indices, not merged indices), and some even self-reference
// (e.g. LeftLowerArm → children: [16]), causing infinite recursion in GLTFLoader.
// VRMA nodes don't need parent-child relationships; the animation system accesses
// bones by node index directly.
for (const node of merged.nodes) {
  delete node.children;
}

const mergedBin = missing.length > 0
  ? Buffer.concat([target.binData, ...addBin])
  : target.binData;
merged.buffers[0].byteLength = mergedBin.length;

writeGLB(merged, mergedBin, TARGET);

// Quick verify
const v = readGLB(TARGET);
const vMiss = Object.keys(templHB).filter(b => !(b in v.json.extensions.VRMC_vrm_animation.humanoid.humanBones));
console.log(`Result: ${Object.keys(v.json.extensions.VRMC_vrm_animation.humanoid.humanBones).length}B. Missing: ${vMiss.length > 0 ? vMiss.join(',') : 'none'}`);
const chk = v.json.animations[0].channels;
const hipTrans = chk.filter(c => {
  const bone = Object.entries(v.json.extensions.VRMC_vrm_animation.humanoid.humanBones).find(([_,v]) => v.node === c.target?.node)?.[0];
  return bone === 'hips' && c.target?.path === 'translation';
});
if (hipTrans.length > 0) console.log(`  !! hips translation channel still present!`);
else console.log(`  hips translation channel: removed ✓`);
