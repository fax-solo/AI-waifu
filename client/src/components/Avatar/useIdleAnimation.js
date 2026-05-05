/**
 * useIdleAnimation Hook
 *
 * Procedural idle animations for VRM avatars:
 * - Natural blinking (random intervals)
 * - Gentle breathing (chest/spine subtle movement)
 * - Micro head sway (alive feeling)
 *
 * These run continuously to make the character feel alive.
 */

import { useRef, useCallback } from 'react';

// ─── Blink Configuration ──────────────────────────────────────
const BLINK_DURATION = 0.12;         // How long a blink takes (seconds)
const BLINK_INTERVAL_MIN = 2.0;      // Minimum time between blinks
const BLINK_INTERVAL_MAX = 6.0;      // Maximum time between blinks
const DOUBLE_BLINK_CHANCE = 0.2;     // 20% chance of a double-blink

// ─── Breathing Configuration ──────────────────────────────────
const BREATH_SPEED = 0.4;             // Breathing cycle speed (slow, natural)
const BREATH_AMPLITUDE = 0.008;       // How much the chest rotates (radians, very subtle)

// ─── Head Sway Configuration ──────────────────────────────────
const SWAY_SPEED_X = 0.15;            // Horizontal sway speed (slow)
const SWAY_SPEED_Y = 0.1;             // Vertical sway speed (slow)
const SWAY_AMPLITUDE = 0.008;         // Sway range (radians, very subtle)

/**
 * Hook providing an update function for idle VRM animations.
 *
 * @returns {{ updateIdle: (vrm, deltaTime) => void }}
 */
export function useIdleAnimation() {
  const state = useRef({
    // Blink state
    blinkTimer: 0,
    nextBlinkAt: randomRange(BLINK_INTERVAL_MIN, BLINK_INTERVAL_MAX),
    blinkPhase: 'waiting', // 'waiting' | 'closing' | 'opening' | 'pause'
    blinkProgress: 0,
    doDoubleBlink: false,
    doubleBlinkDone: false,

    // Breathing
    breathTime: 0,

    // Sway
    swayTime: 0,

    // Total elapsed
    elapsed: 0,
  });

  const updateIdle = useCallback((vrm, deltaTime) => {
    if (!vrm) return;

    const s = state.current;
    s.elapsed += deltaTime;
    s.breathTime += deltaTime;
    s.swayTime += deltaTime;

    // ─── Blinking ─────────────────────────────────────────
    updateBlink(vrm, deltaTime, s);

    // ─── Breathing ────────────────────────────────────────
    updateBreathing(vrm, s);

    // ─── Head Sway ────────────────────────────────────────
    updateHeadSway(vrm, s);

    // Update VRM (required each frame)
    vrm.update(deltaTime);
  }, []);

  return { updateIdle };
}

// ─── Blink Logic ──────────────────────────────────────────────

function updateBlink(vrm, deltaTime, s) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  s.blinkTimer += deltaTime;

  switch (s.blinkPhase) {
    case 'waiting':
      if (s.blinkTimer >= s.nextBlinkAt) {
        s.blinkPhase = 'closing';
        s.blinkProgress = 0;
        s.doDoubleBlink = Math.random() < DOUBLE_BLINK_CHANCE;
        s.doubleBlinkDone = false;
      }
      break;

    case 'closing':
      s.blinkProgress += deltaTime / BLINK_DURATION;
      if (s.blinkProgress >= 1.0) {
        s.blinkProgress = 1.0;
        s.blinkPhase = 'opening';
      }
      expressionManager.setValue('blink', s.blinkProgress);
      break;

    case 'opening':
      s.blinkProgress -= deltaTime / BLINK_DURATION;
      if (s.blinkProgress <= 0) {
        s.blinkProgress = 0;
        expressionManager.setValue('blink', 0);

        if (s.doDoubleBlink && !s.doubleBlinkDone) {
          // Quick pause then blink again
          s.doubleBlinkDone = true;
          s.blinkPhase = 'pause';
          s.blinkTimer = 0;
        } else {
          // Reset for next blink cycle
          s.blinkPhase = 'waiting';
          s.blinkTimer = 0;
          s.nextBlinkAt = randomRange(BLINK_INTERVAL_MIN, BLINK_INTERVAL_MAX);
        }
      } else {
        expressionManager.setValue('blink', s.blinkProgress);
      }
      break;

    case 'pause':
      // Short pause between double-blinks
      if (s.blinkTimer >= 0.08) {
        s.blinkPhase = 'closing';
        s.blinkProgress = 0;
      }
      break;
  }
}

// ─── Breathing Logic ──────────────────────────────────────────

function updateBreathing(vrm, s) {
  // Use spine rotation for breathing instead of hips position (avoids bouncing)
  const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
  if (!spine) return;

  const breathValue = Math.sin(s.breathTime * Math.PI * 2 * BREATH_SPEED) * BREATH_AMPLITUDE;
  spine.rotation.x = breathValue;
}

// ─── Head Sway Logic ──────────────────────────────────────────

function updateHeadSway(vrm, s) {
  const head = vrm.humanoid?.getNormalizedBoneNode('head');
  if (!head) return;

  // Gentle Perlin-like sway using offset sine waves
  const swayX = Math.sin(s.swayTime * SWAY_SPEED_X) * SWAY_AMPLITUDE;
  const swayY = Math.sin(s.swayTime * SWAY_SPEED_Y + 1.5) * SWAY_AMPLITUDE * 0.5;

  head.rotation.x = swayX;
  head.rotation.z = swayY;
}

// ─── Utilities ────────────────────────────────────────────────

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export default useIdleAnimation;
