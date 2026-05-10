// idleAnimation2.js
import * as THREE from 'three';
import { VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Cute Idle Animation for VRM models.
 * Includes: hip sway & bounce, spine/chest breathing, head tilts, arm swings, shoulder shrugs, and hand wiggles.
 */
export class IdleAnimation2 {
    constructor() {
        /** @private {Map<string, { bone: THREE.Bone, initQuat: THREE.Quaternion, initPos: THREE.Vector3 }>} */
        this.boneDataMap = new Map();
        /** @private {boolean} */
        this.initialized = false;
    }

    /**
     * Captures initial local transforms of relevant bones.
     * Must be called after VRM is loaded and added to scene.
     * @param {VRM} vrm - The loaded VRM instance.
     */
    init(vrm) {
        if (!vrm || !vrm.humanoid) {
            console.warn('IdleAnimation2: Invalid VRM or missing humanoid');
            return;
        }

        this.boneDataMap.clear();

        // List of bones to animate for the cute idle effect
        const targetBones = [
            VRMHumanBoneName.Hips,
            VRMHumanBoneName.Spine,
            VRMHumanBoneName.Chest,
            VRMHumanBoneName.Neck,
            VRMHumanBoneName.Head,
            VRMHumanBoneName.LeftUpperArm,
            VRMHumanBoneName.RightUpperArm,
            VRMHumanBoneName.LeftLowerArm,
            VRMHumanBoneName.RightLowerArm,
            VRMHumanBoneName.LeftShoulder,
            VRMHumanBoneName.RightShoulder,
            VRMHumanBoneName.LeftHand,
            VRMHumanBoneName.RightHand
        ];

        for (const boneName of targetBones) {
            const boneNode = vrm.humanoid.getNormalizedBoneNode ? 
                             vrm.humanoid.getNormalizedBoneNode(boneName) : 
                             vrm.humanoid.getBoneNode(boneName);
            if (boneNode) {
                this.boneDataMap.set(boneName, {
                    bone: boneNode,
                    initQuat: boneNode.quaternion.clone(),
                    initPos: boneNode.position.clone()
                });
            }
        }

        this.initialized = this.boneDataMap.size > 0;
        if (!this.initialized) {
            console.warn('IdleAnimation2: No valid bones found. Ensure VRM humanoid is ready.');
        }
    }

    /**
     * Updates the idle animation. Call every frame.
     * @param {number} deltaTime - Time since last frame (seconds) – not directly used but kept for consistency.
     * @param {number} elapsedTime - Total elapsed time (seconds) for animation cycle.
     * @param {number} speed - Animation speed multiplier (default 1.0).
     * @param {number} intensity - Overall intensity of movements (0 to 1.2, default 0.85).
     */
    update(deltaTime, elapsedTime, speed = 1.0, intensity = 0.85) {
        if (!this.initialized) return;

        const t = elapsedTime * speed * 1.8;

        // Helper to apply relative rotation + optional position offset to a bone
        const applyBoneDelta = (boneName, deltaRotEuler, deltaPosOffset = null) => {
            const data = this.boneDataMap.get(boneName);
            if (!data) return;
            const { bone, initQuat, initPos } = data;
            
            // Reset to initial state
            bone.quaternion.copy(initQuat);
            bone.position.copy(initPos);

            // Add natural A-pose offset for arms to prevent horizontal T-pose sways
            if (boneName === VRMHumanBoneName.LeftUpperArm) bone.rotation.z = 1.15;
            if (boneName === VRMHumanBoneName.RightUpperArm) bone.rotation.z = -1.15;
            if (boneName === VRMHumanBoneName.LeftLowerArm) bone.rotation.x = 0.2;
            if (boneName === VRMHumanBoneName.RightLowerArm) bone.rotation.x = 0.2;

            // Apply delta rotation
            const deltaQuat = new THREE.Quaternion().setFromEuler(deltaRotEuler);
            bone.quaternion.premultiply(deltaQuat);
            if (deltaPosOffset) {
                bone.position.add(deltaPosOffset);
            }
        };

        // --- Hips: side sway, slight forward tilt, little rotation, vertical bounce ---
        const hipSwayX = Math.sin(t * 0.9) * 0.035 * intensity;
        const hipSwayZ = Math.sin(t * 0.7) * 0.025 * intensity;
        const hipRotY = Math.sin(t * 0.6) * 0.02 * intensity;
        const hipBounceY = Math.abs(Math.sin(t * 1.8)) * 0.008 * intensity;
        applyBoneDelta(VRMHumanBoneName.Hips, new THREE.Euler(hipSwayX, hipRotY, hipSwayZ, 'XYZ'), new THREE.Vector3(0, hipBounceY, 0));

        // --- Spine: follow hips with subtle counter curve ---
        const spineBendX = Math.sin(t * 0.9 + 0.5) * 0.018 * intensity;
        const spineBendZ = Math.sin(t * 0.8) * 0.012 * intensity;
        applyBoneDelta(VRMHumanBoneName.Spine, new THREE.Euler(spineBendX, 0, spineBendZ, 'XYZ'));

        // --- Chest: breathing (front/back) and slight twist ---
        const breathCycle = Math.sin(t * 1.4) * 0.022 * intensity;
        const chestTwist = Math.sin(t * 0.9) * 0.01 * intensity;
        applyBoneDelta(VRMHumanBoneName.Chest, new THREE.Euler(breathCycle, chestTwist, Math.sin(t * 0.8) * 0.006, 'XYZ'));

        // --- Neck & Head: tilts and little nods ---
        applyBoneDelta(VRMHumanBoneName.Neck, new THREE.Euler(Math.sin(t * 1.3) * 0.012 * intensity, 0, Math.sin(t * 1.1) * 0.018 * intensity, 'XYZ'));
        applyBoneDelta(VRMHumanBoneName.Head, new THREE.Euler(Math.sin(t * 1.5) * 0.015 * intensity, Math.sin(t * 0.7) * 0.01 * intensity, Math.sin(t * 1.2) * 0.022 * intensity, 'XYZ'));

        // --- Upper arms: cute alternating swing ---
        applyBoneDelta(VRMHumanBoneName.LeftUpperArm, new THREE.Euler(Math.sin(t * 1.2) * 0.18 * intensity, 0.1 * intensity * Math.sin(t * 1.1), Math.sin(t * 1.0) * 0.08 * intensity, 'XYZ'));
        applyBoneDelta(VRMHumanBoneName.RightUpperArm, new THREE.Euler(Math.sin(t * 1.2 + 1.8) * 0.16 * intensity, 0.08 * intensity * Math.sin(t * 1.0), Math.sin(t * 1.0 + 1.5) * 0.07 * intensity, 'XYZ'));

        // --- Lower arms: floppy elbow follow ---
        applyBoneDelta(VRMHumanBoneName.LeftLowerArm, new THREE.Euler(Math.sin(t * 1.3) * 0.1 * intensity, 0, 0.02 * Math.sin(t * 1.2), 'XYZ'));
        applyBoneDelta(VRMHumanBoneName.RightLowerArm, new THREE.Euler(Math.sin(t * 1.3 + 1.2) * 0.1 * intensity, 0, 0.02 * Math.sin(t * 1.2), 'XYZ'));

        // --- Shoulders: subtle shrug ---
        applyBoneDelta(VRMHumanBoneName.LeftShoulder, new THREE.Euler(Math.sin(t * 1.6) * 0.05 * intensity, 0, 0, 'XYZ'));
        applyBoneDelta(VRMHumanBoneName.RightShoulder, new THREE.Euler(Math.sin(t * 1.6 + 1.2) * 0.05 * intensity, 0, 0, 'XYZ'));

        // --- Hands: cute little wiggles ---
        if (this.boneDataMap.has(VRMHumanBoneName.LeftHand)) {
            const leftHandWiggle = Math.sin(t * 2.0) * 0.06 * intensity;
            applyBoneDelta(VRMHumanBoneName.LeftHand, new THREE.Euler(leftHandWiggle * 0.5, leftHandWiggle, 0, 'XYZ'));
        }
        if (this.boneDataMap.has(VRMHumanBoneName.RightHand)) {
            const rightHandWiggle = Math.sin(t * 2.0 + 1.0) * 0.06 * intensity;
            applyBoneDelta(VRMHumanBoneName.RightHand, new THREE.Euler(rightHandWiggle * 0.5, rightHandWiggle, 0, 'XYZ'));
        }
    }

    /**
     * Cleans up internal references.
     */
    dispose() {
        this.boneDataMap.clear();
        this.initialized = false;
    }
}

// Example usage (commented):
/*
import { VRM } from '@pixiv/three-vrm';
import { IdleAnimation2 } from './idleAnimation2.js';

let idleAnim = new IdleAnimation2();
idleAnim.init(vrmInstance);

function animate(deltaTime, elapsedTime) {
    idleAnim.update(deltaTime, elapsedTime, speedValue, intensityValue);
    requestAnimationFrame(...);
}
*/