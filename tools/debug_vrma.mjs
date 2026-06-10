import { readFileSync } from 'fs';
import * as THREE from '../client/node_modules/three/build/three.module.js';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationHumanoidTracks,
} from '../client/node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js';

function readGLB(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf-8', 20, 20 + jsonLen).replace(/\0+$/, ''));
  let end = 20 + jsonLen;
  while (end < buf.length && buf[end] === 0) end++;
  const binLen = buf.readUInt32LE(end);
  const bin = buf.subarray(end + 8, end + 8 + binLen);
  return { json, bin, raw: buf };
}

function scanTrackValues(bin, accessor, bufferView) {
  const compType = accessor.componentType; // 5126=float, 5123=ushort, 5121=ubyte
  const type = accessor.type; // 'SCALAR','VEC3','VEC4'
  const count = accessor.count;
  const stride = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] || 1;
  const byteStride = bufferView.byteStride || stride * 4;
  const off = bufferView.byteOffset + (accessor.byteOffset || 0);
  const vals = [];
  for (let i = 0; i < count; i++) {
    let off2 = off + i * byteStride;
    if (compType === 5126) { // float
      for (let j = 0; j < stride; j++) {
        vals.push(bin.readFloatLE(off2 + j * 4));
      }
    }
  }
  return vals;
}

function diagnoseVRMA(path, label) {
  console.log(`\n========== ${label} ==========`);
  const { json, bin } = readGLB(path);
  const hb = json.extensions?.VRMC_vrm_animation?.humanoid?.humanBones;
  if (!hb) { console.log('  NOT a VRMA file'); return; }

  const nodeCount = json.nodes.length;
  const boneNames = Object.keys(hb);
  console.log(`  Nodes: ${nodeCount}, HumanBones: ${boneNames.length}`);

  // 1. Check hips node has translation
  const hipsNode = hb.hips ? json.nodes[hb.hips.node] : null;
  if (hipsNode) {
    console.log(`  hips: node=${hb.hips.node}, trans=${JSON.stringify(hipsNode.translation)}, children=${JSON.stringify(hipsNode.children)}`);
  } else {
    console.log('  !! NO hips humanBone');
  }

  // 2. Check all animation channels
  const anim = json.animations?.[0];
  if (!anim) { console.log('  !! NO animation'); return; }

  console.log(`  Channels: ${anim.channels.length}, Samplers: ${anim.samplers.length}`);

  // 3. Map channel target nodes to bone names
  const nodeToBone = {};
  for (const [name, info] of Object.entries(hb)) {
    nodeToBone[info.node] = name;
  }

  const rotChannels = [];
  const transChannels = [];
  let hasNan = false;
  let hasInf = false;

  for (const ch of anim.channels) {
    const bone = nodeToBone[ch.target.node];
    const sam = anim.samplers[ch.sampler];
    const iAcc = json.accessors[sam.input];
    const oAcc = json.accessors[sam.output];
    const iBv = json.bufferViews[iAcc.bufferView];
    const oBv = json.bufferViews[oAcc.bufferView];

    // Check input values for NaN
    const iVals = scanTrackValues(bin, iAcc, iBv);
    const iNan = iVals.some(v => Number.isNaN(v) || !Number.isFinite(v));
    if (iNan) { console.log(`  !! NaN in INPUT for ${bone} node=${ch.target.node}`); hasNan = true; }

    const oVals = scanTrackValues(bin, oAcc, oBv);
    const oNan = oVals.some(v => Number.isNaN(v) || !Number.isFinite(v));
    if (oNan) { console.log(`  !! NaN in OUTPUT for ${bone} node=${ch.target.node} path=${ch.target.path}`); hasNan = true; }

    if (ch.target.path === 'rotation') {
      rotChannels.push(bone || `node${ch.target.node}`);
      // Check quaternion normalization
      const qs = [];
      for (let i = 0; i < oVals.length; i += 4) {
        const q = new THREE.Quaternion(oVals[i], oVals[i+1], oVals[i+2], oVals[i+3]);
        qs.push(q.length());
      }
      const badQ = qs.filter(l => Math.abs(l - 1) > 0.01);
      if (badQ.length > 0) {
        console.log(`  !! Unnormalized quats for ${bone}: ${badQ.length}/${qs.length} (max dev=${Math.max(...badQ.map(l => Math.abs(l-1))).toFixed(4)})`);
      }
    } else if (ch.target.path === 'translation') {
      transChannels.push(bone || `node${ch.target.node}`);
      // Check for zero Y in hips translation
      if (bone === 'hips') {
        const firstY = oVals[1];
        console.log(`  hips-translation first Y: ${firstY}${firstY === 0 ? ' !! ZERO - will cause division by zero!' : ''}`);
      }
    }
  }

  console.log(`  Rotation channels: ${rotChannels.length} | Translation channels: ${transChannels.length}`);
  console.log(`  NaN/Inf in data: ${hasNan ? '!! YES' : 'none'}`);

  // 4. Which bones are missing from rotation tracks?
  const rotSet = new Set(rotChannels);
  const missing = boneNames.filter(b => !rotSet.has(b));
  if (missing.length > 0) {
    console.log(`  Missing rotation tracks (${missing.length}): ${missing.join(', ')}`);
  }

  // 5. Check for self-referencing children or invalid indices
  let badRef = false;
  for (let i = 0; i < json.nodes.length; i++) {
    const kids = json.nodes[i].children;
    if (kids) {
      const invalid = kids.filter(k => k === undefined || k === null || k >= json.nodes.length || k === i);
      if (invalid.length > 0) {
        console.log(`  !! Node ${i} (${boneNames.find(n => hb[n]?.node === i) || '?'}) has bad children: ${JSON.stringify(kids)}`);
        badRef = true;
      }
    }
  }
  if (!badRef) console.log('  Children arrays: OK (no bad refs)');
}

// Also test createVRMAnimationHumanoidTracks logic
function testHipsNormalization() {
  console.log(`\n========== HIPS NORMALIZATION TEST ==========`);
  // The critical function: createVRMAnimationHumanoidTracks computes
  // scale = humanoidY / animationY  where animationY = hipTrack.values[1]
  // If animationY = 0 → scale = Infinity → NaN in clip

  // Test with a mock hips translation track
  const mockTrack = {
    values: new Float32Array([0, 0, 0,  1, 0, 0]), // 2 keyframes, Y=0
  };
  const hipY = mockTrack.values[1];
  const humanoidY = 0.9; // typical VRM humanoid height
  const scale = humanoidY / hipY;
  console.log(`  animationY=${hipY}  humanoidY=${humanoidY}  scale=${scale}${!Number.isFinite(scale) ? ' !!! INFINITE' : ''}`);

  const mockTrack2 = { values: new Float32Array([0, 1, 0,  1, 0.5, 0]) };
  const scale2 = humanoidY / mockTrack2.values[1];
  console.log(`  With Y=1: scale=${scale2} (valid)`);
}

diagnoseVRMA('server/data/animations/body/Relax.vrma', 'Relax.vrma (template)');
diagnoseVRMA('server/data/animations/body/cute_idle.vrma', 'cute_idle.vrma (fixed)');
diagnoseVRMA('server/data/animations/body/cute_idle_dreamy.vrma', 'cute_idle_dreamy.vrma (fixed)');
testHipsNormalization();
