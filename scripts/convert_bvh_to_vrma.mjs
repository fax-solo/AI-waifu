import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const THREE_MODULE = join(process.cwd(), 'client/node_modules/three/build/three.module.js');
const BVH_LOADER_PATH = join(process.cwd(), 'client/node_modules/three/examples/jsm/loaders/BVHLoader.js');

const { KeyframeTrack, Quaternion, Euler, AnimationClip } = await import(THREE_MODULE);
const { BVHLoader } = await import(BVH_LOADER_PATH);

const __dirname = dirname(fileURLToPath(import.meta.url));
const BODY_DIR = resolve(__dirname, '../server/data/animations/body');

const SKIP_BONES = new Set(['leftEye', 'rightEye', 'LeftEye', 'RightEye', 'ENDSITE']);

const BONE_PARENTS = {
  hips: null,
  spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftEye: 'head', rightEye: 'head',
  leftShoulder: 'chest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'chest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot',
  leftThumbProximal: 'leftHand', leftThumbIntermediate: 'leftThumbProximal', leftThumbDistal: 'leftThumbIntermediate',
  leftIndexProximal: 'leftHand', leftIndexIntermediate: 'leftIndexProximal', leftIndexDistal: 'leftIndexIntermediate',
  leftMiddleProximal: 'leftHand', leftMiddleIntermediate: 'leftMiddleProximal', leftMiddleDistal: 'leftMiddleIntermediate',
  leftRingProximal: 'leftHand', leftRingIntermediate: 'leftRingProximal', leftRingDistal: 'leftRingIntermediate',
  leftLittleProximal: 'leftHand', leftLittleIntermediate: 'leftLittleProximal', leftLittleDistal: 'leftLittleIntermediate',
  rightThumbProximal: 'rightHand', rightThumbIntermediate: 'rightThumbProximal', rightThumbDistal: 'rightThumbIntermediate',
  rightIndexProximal: 'rightHand', rightIndexIntermediate: 'rightIndexProximal', rightIndexDistal: 'rightIndexIntermediate',
  rightMiddleProximal: 'rightHand', rightMiddleIntermediate: 'rightMiddleProximal', rightMiddleDistal: 'rightMiddleIntermediate',
  rightRingProximal: 'rightHand', rightRingIntermediate: 'rightRingProximal', rightRingDistal: 'rightRingIntermediate',
  rightLittleProximal: 'rightHand', rightLittleIntermediate: 'rightLittleProximal', rightLittleDistal: 'rightLittleIntermediate',
};

const loader = new BVHLoader();

// ── GLB builder ──

function padTo4(buf, padByte = 0x20) {
  const padLen = (4 - (buf.length % 4)) % 4;
  if (padLen === 0) return buf;
  const padded = new Uint8Array(buf.length + padLen);
  padded.set(buf);
  if (padByte !== 0) padded.fill(padByte, buf.length);
  return padded;
}

function stringToBuf(s) { return new TextEncoder().encode(s); }

function buildGLB(jsonObj, binParts) {
  const concat = new Uint8Array(binParts.reduce((s, b) => s + b.length, 0));
  let off = 0;
  for (const b of binParts) { concat.set(b, off); off += b.length; }
  const binPadded = padTo4(concat);

  const jsonStr = JSON.stringify(jsonObj);
  const jsonU8 = stringToBuf(jsonStr);
  const jsonPadded = padTo4(jsonU8, 0x20);

  const headerLen = 12;
  const totalLen = headerLen + 8 + jsonPadded.length + 8 + binPadded.length;

  const buf = new Uint8Array(totalLen);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x46546C67, true);  // glTF
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLen, true);

  let cursor = 12;
  dv.setUint32(cursor, jsonPadded.length, true); cursor += 4;
  dv.setUint32(cursor, 0x4E4F534A, true); cursor += 4; // JSON
  buf.set(jsonPadded, cursor); cursor += jsonPadded.length;

  dv.setUint32(cursor, binPadded.length, true); cursor += 4;
  dv.setUint32(cursor, 0x004E4942, true); cursor += 4; // BIN\0
  buf.set(binPadded, cursor);

  return buf;
}

// ── BVH hierarchy parser (for flat-format files) ──

function isFlatFormat(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 4) return false;
  // After "ROOT xxx" and "{", the next line should start with a keyword for hierarchical
  const line4 = lines[3]?.trim();
  // If it starts with a digit or '-', it's flat (raw motion data)
  return /^[-.\d]/.test(line4);
}

function parseBVHHierarchy(text) {
  // Parse the HIERARCHY section from a hierarchical BVH file
  // Returns array of { name, channels: string[], isEndSite }
  const bones = [];
  // Remove comments, collapse whitespace for easier tokenization
  const clean = text.replace(/\/\/.*$/gm, '').replace(/\r/g, '');
  // Tokenize: split on whitespace and braces
  const tokens = clean.split(/([{}()]|\s+)/).filter(t => t.trim());
  let i = 0;
  function expect(expected) {
    const t = tokens[i++];
    if (t !== expected) throw new Error(`Expected "${expected}" but got "${t}"`);
    return t;
  }
  function peek() { return tokens[i]; }

  // Expect HIERARCHY
  if (peek() === 'HIERARCHY') i++;

  function parseNode(parentName) {
    const name = tokens[i++];
    expect('{');
    const channels = [];
    let isEndSite = false;

    while (peek() && peek() !== '}') {
      if (peek() === 'OFFSET') {
        i++; // consume OFFSET
        // next 3 tokens are numbers
        i += 3; // skip x, y, z
      } else if (peek() === 'CHANNELS') {
        i++; // consume CHANNELS
        const count = parseInt(tokens[i++]);
        for (let c = 0; c < count; c++) {
          channels.push(tokens[i++]);
        }
      } else if (peek() === 'JOINT') {
        i++; // consume JOINT
        parseNode(name);
      } else if (peek() === 'End' && tokens[i+1] === 'Site') {
        i += 2; // consume End Site
        bones.push({ name: 'ENDSITE', channels: [], isEndSite: true, parent: parentName });
        expect('{');
        expect('OFFSET');
        i += 3; // skip x, y, z
        expect('}');
      } else {
        // Unexpected token - skip
        i++;
      }
    }
    expect('}');

    bones.push({ name, channels, isEndSite, parent: parentName });
    return name;
  }

  // Parse ROOT
  const rootType = tokens[i++]; // "ROOT"
  parseNode(null);

  // After hierarchy, optionally expect MOTION section for frame info
  return bones;
}

function parseHierarchicalBVH(text, bones) {
  // Use THREE.BVHLoader for hierarchical files
  return loader.parse(text);
}

function parseFlatBVH(text, bones) {
  // bones: array of { name, channels, isEndSite } from hierarchy parser
  const lines = text.trim().split('\n');
  // Data lines start after the first 3 lines (HIERARCHY, ROOT, {)
  const dataLines = [];
  let inData = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!inData) {
      if (line === '{') { inData = true; continue; }
      if (line.startsWith('ROOT') || line === 'HIERARCHY') continue;
      // After opening brace, if line starts with number, it's data
      if (/^[-.\d]/.test(line)) { inData = true; dataLines.push(line); continue; }
    } else {
      dataLines.push(line);
    }
  }

  const numFrames = dataLines.length;
  if (numFrames === 0) return null;

  // Parse reference hierarchy to get total channel count per bone
  const refBones = bones.filter(b => !b.isEndSite);
  // Calculate cumulative channel offsets
  let totalCh = 0;
  for (const b of refBones) totalCh += b.channels.length;

  // Build per-bone rotation and position arrays
  const boneData = {};
  for (const b of refBones) {
    boneData[b.name] = {
      channels: b.channels,
      values: [], // will be [frame0_ch0, frame0_ch1, ..., frameN_ch0, frameN_ch1, ...]
      positions: [], // only if root
      rotations: [],
    };
  }

  // Build channel offsets
  const chOffsets = [];
  let offset = 0;
  for (const b of refBones) {
    chOffsets.push({ name: b.name, offset, count: b.channels.length });
    offset += b.channels.length;
  }
  const channelsPerFrame = offset;

  // Parse each frame
  const frameTime = 1 / 60; // default for flat files (no MOTION section)
  const times = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const strVals = dataLines[f].trim().split(/\s+/).filter(Boolean);
    const vals = strVals.map(Number);
    times[f] = f * frameTime;

    // Distribute values to bones
    for (const ch of chOffsets) {
      const boneVals = [];
      for (let c = 0; c < ch.count; c++) {
        boneVals.push(vals[ch.offset + c]);
      }
      if (!boneData[ch.name].values[f]) boneData[ch.name].values[f] = [];
      boneData[ch.name].values[f].push(...boneVals);
    }

    // Check if there are extra channels beyond what we know
    if (vals.length > channelsPerFrame && f === 0) {
      console.log(`  Note: ${vals.length} channels but reference skeleton has ${channelsPerFrame} (${vals.length - channelsPerFrame} extra, ignoring)`);
    }
  }

  // Convert per-bone channels to position/quaternion tracks
  const euler = new Euler();
  const quat = new Quaternion();
  const tracks = [];

  for (const b of refBones) {
    if (SKIP_BONES.has(b.name)) continue;
    const bd = boneData[b.name];
    if (!bd || bd.values.length === 0) continue;

    const ch = bd.channels;
    const isRoot = b.name === 'hips';

    // Determine which channels are position vs rotation
    let posIndices = [];
    let rotIndices = [];
    for (let c = 0; c < ch.length; c++) {
      if (ch[c].includes('position')) posIndices.push(c);
      else if (ch[c].includes('rotation')) rotIndices.push(c);
    }

    // Default: BVH rotation order is typically Zrotation, Xrotation, Yrotation
    // But the CHANNELS define the actual order
    // Standard: root has Xposition, Yposition, Zposition, Yrotation, Xrotation, Zrotation
    // Non-root: Yrotation, Xrotation, Zrotation (ZYX order -> converts to quaternion)

    // Position track (only for root typically)
    if (posIndices.length === 3) {
      const posArray = new Float32Array(numFrames * 3);
      for (let f = 0; f < numFrames; f++) {
        const frameVals = bd.values[f];
        posArray[f * 3] = frameVals[posIndices[0]];
        posArray[f * 3 + 1] = frameVals[posIndices[1]];
        posArray[f * 3 + 2] = frameVals[posIndices[2]];
      }
      const track = new KeyframeTrack(`${b.name}.position`, times, posArray);
      tracks.push(track);
    }

    // Rotation track (convert Euler to quaternion)
    if (rotIndices.length === 3) {
      const quatArray = new Float32Array(numFrames * 4);
      const order = determineEulerOrder(rotIndices.map(i => ch[i]));
      for (let f = 0; f < numFrames; f++) {
        const frameVals = bd.values[f];
        // Set Euler angles in the order specified by CHANNELS
        const eulerVals = rotIndices.map(i => frameVals[i]);
        // Convert to radians (BVH uses degrees)
        euler.set(
          eulerVals[0] * Math.PI / 180,
          eulerVals[1] * Math.PI / 180,
          eulerVals[2] * Math.PI / 180,
          order
        );
        quat.setFromEuler(euler);
        quatArray[f * 4] = quat.x;
        quatArray[f * 4 + 1] = quat.y;
        quatArray[f * 4 + 2] = quat.z;
        quatArray[f * 4 + 3] = quat.w;
      }
      const track = new KeyframeTrack(`${b.name}.quaternion`, times, quatArray);
      tracks.push(track);
    }
  }

  // Build animation clip and skeleton
  const clip = new AnimationClip('bvhClip', times[times.length - 1], tracks);

  // Build skeleton bones for the output
  const skeletonBones = refBones
    .filter(b => !SKIP_BONES.has(b.name))
    .map(b => ({ name: b.name }));

  return { clip, skeleton: { bones: skeletonBones } };
}

function determineEulerOrder(channelNames) {
  // BVH channel names like: Xrotation, Yrotation, Zrotation
  // THREE.Euler order: 'XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'
  // Map channel position 0,1,2 to the Euler order string
  const order = ['X', 'Y', 'Z'];
  const pos = [];
  for (const name of channelNames) {
    if (name.includes('Xrotation')) pos.push('X');
    else if (name.includes('Yrotation')) pos.push('Y');
    else if (name.includes('Zrotation')) pos.push('Z');
  }
  return pos.join('');
}

// ── VRMA builder ──

function convertParsedToVRMA(parsed, frameTime) {
  const { clip, skeleton } = parsed;
  // Filter to VRM bones only
  const boneNames = skeleton.bones
    .map(b => b.name)
    .filter(name => !SKIP_BONES.has(name) && BONE_PARENTS[name] !== undefined)
    .filter((name, i, arr) => arr.indexOf(name) === i); // unique

  // Collect tracks per bone
  const boneTracks = {};
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot === -1) continue;
    const boneName = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    if (!boneNames.includes(boneName)) continue;
    if (!boneTracks[boneName]) boneTracks[boneName] = { times: track.times };
    if (prop === 'quaternion') boneTracks[boneName].rotation = track.values;
    if (prop === 'position') boneTracks[boneName].position = track.values;
  }

  const sortedBones = boneNames;
  if (sortedBones.length === 0) return null;

  const boneIndex = {};
  sortedBones.forEach((name, i) => { boneIndex[name] = i; });

  const nodeChildren = sortedBones.map(() => []);
  for (const name of sortedBones) {
    const parent = BONE_PARENTS[name];
    if (parent && boneIndex[parent] !== undefined) {
      nodeChildren[boneIndex[parent]].push(boneIndex[name]);
    }
  }

  const nodes = sortedBones.map((name, i) => {
    const node = { name };
    if (nodeChildren[i].length > 0) node.children = nodeChildren[i];
    return node;
  });

  const binParts = [];
  let byteOffset = 0;
  const accessors = [];
  const bufferViews = [];
  const samplers = [];
  const channels = [];

  function addAccessor(data, componentType, typeStr, countPerElem) {
    const byteLen = data.byteLength;
    const viewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: byteLen,
    });
    const accessorIdx = accessors.length;
    const typeMap = { 1: 'SCALAR', 3: 'VEC3', 4: 'VEC4' };
    accessors.push({
      bufferView: viewIdx,
      byteOffset: 0,
      componentType,
      count: data.length / countPerElem,
      type: typeMap[countPerElem] || 'SCALAR',
    });
    const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    binParts.push(u8);
    byteOffset += byteLen;
    return accessorIdx;
  }

  let trackCount = 0;
  for (const name of sortedBones) {
    const tracks = boneTracks[name];
    if (!tracks) continue;

    const timesAccessor = addAccessor(tracks.times, 5126, 'SCALAR', 1);

    if (tracks.rotation) {
      const rotAccessor = addAccessor(tracks.rotation, 5126, 'VEC4', 4);
      samplers.push({
        input: timesAccessor,
        output: rotAccessor,
        interpolation: 'LINEAR',
      });
      channels.push({
        sampler: samplers.length - 1,
        target: { node: boneIndex[name], path: 'rotation' },
      });
      trackCount++;
    }

    if (tracks.position) {
      const posAccessor = addAccessor(tracks.position, 5126, 'VEC3', 3);
      samplers.push({
        input: timesAccessor,
        output: posAccessor,
        interpolation: 'LINEAR',
      });
      channels.push({
        sampler: samplers.length - 1,
        target: { node: boneIndex[name], path: 'translation' },
      });
      trackCount++;
    }
  }

  const humanBones = {};
  for (const name of sortedBones) {
    humanBones[name] = { node: boneIndex[name] };
  }

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'waifu-bvh2vrma',
    },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0-draft',
        humanoid: {
          humanBones,
        },
      },
    },
    scenes: [{ nodes: [0] }],
    nodes,
    animations: [
      {
        name: 'animation',
        channels,
        samplers,
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  return buildGLB(gltf, binParts);
}

// ── Main ──

async function main() {
  if (!existsSync(BODY_DIR)) {
    console.error(`Body directory not found: ${BODY_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(BODY_DIR)
    .filter(f => f.toLowerCase().endsWith('.bvh'))
    .sort();

  console.log(`Found ${files.length} BVH files in ${BODY_DIR}`);

  // Get reference skeleton from first hierarchical file
  let refBones = null;
  for (const file of files) {
    const text = readFileSync(join(BODY_DIR, file), 'utf-8');
    if (!isFlatFormat(text)) {
      try {
        refBones = parseBVHHierarchy(text);
        console.log(`Using ${file} as reference skeleton (${refBones.filter(b => !b.isEndSite).length} bones)`);
        break;
      } catch (e) {
        console.log(`  Could not parse ${file} as reference: ${e.message}`);
      }
    }
  }

  if (!refBones) {
    console.error('No hierarchical BVH file found to use as skeleton reference');
    process.exit(1);
  }

  let converted = 0;
  let errors = [];

  for (const file of files) {
    const bvhPath = join(BODY_DIR, file);
    const vrmaName = file.replace(/\.bvh$/i, '.vrma');
    const vrmaPath = join(BODY_DIR, vrmaName);

    if (existsSync(vrmaPath) && statSync(vrmaPath).mtimeMs > statSync(bvhPath).mtimeMs) {
      const sizeKb = (statSync(vrmaPath).size / 1024).toFixed(1);
      console.log(`  SKIP ${file} -> ${vrmaName} (${sizeKb} KB, up to date)`);
      converted++;
      continue;
    }

    try {
      const text = readFileSync(bvhPath, 'utf-8');
      let parsed;

      if (isFlatFormat(text)) {
        parsed = parseFlatBVH(text, refBones);
      } else {
        const result = loader.parse(text);
        parsed = result;
      }

      if (!parsed || !parsed.clip) {
        console.error(`  FAIL ${file}: no animation data`);
        errors.push(file);
        continue;
      }

      const glb = convertParsedToVRMA(parsed, null);
      if (!glb) {
        console.error(`  FAIL ${file}: no animatable bones`);
        errors.push(file);
        continue;
      }

      writeFileSync(vrmaPath, Buffer.from(glb.buffer));
      const sizeKb = (glb.byteLength / 1024).toFixed(1);
      console.log(`  OK   ${file} -> ${vrmaName} (${sizeKb} KB)`);
      converted++;
    } catch (err) {
      console.error(`  FAIL ${file}: ${err.message}`);
      errors.push(file);
    }
  }

  console.log(`\nDone. Converted ${converted}/${files.length} files.`);
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    for (const f of errors) console.log(`  - ${f}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
