# Summary

## Problem
AI-generated VRMA files (cute_idle, cute_idle_dreamy) cause the avatar to T-pose because:
1. They only contain 24 bones from 1 motion capture track (missing 27 bones that Relax.vrma has)
2. Missing bones don't animate → model stays in T-pose for those bones
3. The hips node has `translation: [0, 0, 0]` → `restHipsPosition.y = 0` → normalization produces `NaN` for all rotation tracks
4. The hips translation track is all zeros → after normalization it outputs `[0, 0, 0]` → model collapses to floor

## Root Causes
1. **Missing bones**: AI generator (motion-capture-to-VRMA) only outputs bones that are actually animated in the source data
2. **Hips translation = 0**: The source animation has hips at world origin; VRM normalizes relative to `restHipsPosition`, which becomes 0 → division by zero → `NaN`
3. **Zero-length hips translation track**: Track exists but all keyframes are `[0,0,0]` → normalization produces `[NaN,NaN,NaN]` → VRM animator falls back to T-pose
4. **GLB padding writeGLB bug**: Chunk lengths in header were unpadded → Three.js GLTFLoader couldn't find the BIN chunk → `buffer.slice(null)` crash

## Fixes Applied

### 1. `tools/fix_vrma.mjs` — VRMA file merge & repair
- Merges missing bone nodes and animation data from Relax.vrma into AI-generated files
- Sets `hipsNode.translation = [0, 1, 0]` to prevent zero-height hips
- Removes the hips translation channel entirely (absence = skeleton default)
- Strips `children` arrays from all nodes
- **Fixed**: writes PADDED chunk lengths in GLB header for Three.js compatibility

### 2. `server/src/routes/animations.js` — `getVrmaDuration()` fix
- Fixed GLB padding: `cursor += (chunkLen + 3) & ~3` rounds up to 4-byte alignment
- Iterates all samplers instead of `samplers[0]` only

### 3. `client/src/animations/useVRMA.js` — Client-side safety net
- Falls back to Relax.vrma for any missing bones at play() time (never triggers now since merged files have all 51)

## Current State
- Both cute_idle.vrma and cute_idle_dreamy.vrma: **51 bones, hips translation channel removed, duration reads correctly** (6s / 8s)
- Three.js GLTFLoader can parse both files without errors
- Server serves them correctly
- Client playback should work — ready for browser testing

## Next Steps
1. Test in browser: verify VRM avatar animates with cute_idle animations
2. Monitor console for any remaining errors
