import { readFileSync } from 'fs';
import * as THREE from '../client/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../client/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin } from '../client/node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js';

// Use buffer loader instead of file loader since we're in Node
const loader = new GLTFLoader();
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

const files = [
  'server/data/animations/body/cute_idle.vrma',
  'server/data/animations/body/cute_idle_dreamy.vrma',
  'server/data/animations/body/Relax.vrma',
];

for (const file of files) {
  try {
    const buf = readFileSync(file);
    console.log(`\n=== ${file.split('/').pop()} (${buf.length} bytes) ===`);

    // Parse the GLB manually and feed to loader
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.toString('utf-8', 20, 20 + jsonLen).replace(/\0+$/, ''));
    let end = 20 + jsonLen;
    while (end < buf.length && buf[end] === 0) end++;
    const binLen = buf.readUInt32LE(end);
    const bin = buf.subarray(end + 8, end + 8 + binLen);

    console.log('JSON nodes:', json.nodes?.length, 'channels:', json.animations?.[0]?.channels?.length);
    console.log('Extensions used:', json.extensionsUsed);
    console.log('Extension:', JSON.stringify(json.extensions?.VRMC_vrm_animation).substring(0, 200));

    // Simulate what GLTFLoader does: create THREE.AnimationClip from the animation
    try {
      // We need to manually create a clip since GLTFLoader expects to work with
      // scene graph objects (cameras, lights, meshes)
      // But we can at least check the track data directly
      const anim = json.animations?.[0];
      if (!anim) { console.log('No animation found'); continue; }

      // Check each track's data accessors for valid times
      let trackCount = 0;
      let maxTime = 0;
      let minTime = Infinity;
      let hasError = false;

      for (let i = 0; i < anim.channels.length; i++) {
        const ch = anim.channels[i];
        const sam = anim.samplers[ch.sampler];
        const iAcc = json.accessors[sam.input];
        const oAcc = json.accessors[sam.output];
        const iBv = json.bufferViews[iAcc.bufferView];
        const oBv = json.bufferViews[oAcc.bufferView];

        if (!iAcc || !oAcc || !iBv || !oBv) {
          console.log(`  Channel ${i}: MISSING accessor/bufferView`);
          hasError = true;
          continue;
        }

        const iOff = iBv.byteOffset + (iAcc.byteOffset || 0);
        const oOff = oBv.byteOffset + (oAcc.byteOffset || 0);
        const iCount = iAcc.count;
        
        // Read first and last time values
        const stride = iBv.byteStride || 4;
        const firstTime = bin.readFloatLE(iOff);
        const lastTime = bin.readFloatLE(iOff + (iCount - 1) * stride);

        if (iCount > 0) {
          trackCount++;
          maxTime = Math.max(maxTime, lastTime);
          minTime = Math.min(minTime, firstTime);
        }

        // Check for NaN in times
        for (let k = 0; k < iCount; k++) {
          const t = bin.readFloatLE(iOff + k * stride);
          if (Number.isNaN(t) || !Number.isFinite(t)) {
            console.log(`  Channel ${i}: NaN/Inf in time key ${k} at offset ${iOff + k * stride}!`);
            hasError = true;
            break;
          }
        }

        // Check for NaN in output values
        const oCount = oAcc.count;
        const oCompType = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[oAcc.type] || 1;
        const oByteStride = oBv.byteStride || oCompType * 4;
        for (let k = 0; k < oCount; k++) {
          for (let c = 0; c < oCompType; c++) {
            const v = bin.readFloatLE(oOff + k * oByteStride + c * 4);
            if (Number.isNaN(v) || !Number.isFinite(v)) {
              console.log(`  Channel ${i}: NaN/Inf in output value [${k}][${c}]!`);
              hasError = true;
              break;
            }
          }
          if (hasError) break;
        }
      }

      console.log(`  Valid tracks: ${trackCount}/${anim.channels.length}`);
      console.log(`  Time range: ${minTime.toFixed(3)}s - ${maxTime.toFixed(3)}s (duration: ${(maxTime - minTime).toFixed(3)}s)`);
      if (hasError) console.log('  !! ERRORS FOUND');

      // Now try to create a THREE.AnimationClip from the animation data
      // This requires proper GLTFLoader setup which is complex in Node
      // But we can manually build keyframe tracks to verify

    } catch (e) {
      console.log('Error:', e.message);
    }

  } catch (e) {
    console.log(`${file}: ${e.message}`);
  }
}
