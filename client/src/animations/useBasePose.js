/**
 * useBasePose Hook
 * 
 * Resets the model to a neutral zero state.
 * All subsequent animation hooks should ADD to these rotations.
 */

import { useCallback } from 'react';

export function useBasePose() {
  const applyBasePose = useCallback((vrm) => {
    if (!vrm || !vrm.humanoid) return;

    const bones = [
      'hips', 'spine', 'chest', 'neck', 'head',
      'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
      'leftShoulder', 'rightShoulder'
    ];
    
    bones.forEach(b => {
      // Helper to handle both VRM 1.0 and 0.x bone access
      const node = vrm.humanoid.getNormalizedBoneNode ? 
                   vrm.humanoid.getNormalizedBoneNode(b) : 
                   vrm.humanoid.getBoneNode(b);

      if (node) {
        node.rotation.set(0, 0, 0);
        
        // Natural A-pose for arms
        if (b === 'leftUpperArm') node.rotation.z = 1.2;
        if (b === 'rightUpperArm') node.rotation.z = -1.2;
        if (b === 'leftLowerArm') node.rotation.x = 0.2;
        if (b === 'rightLowerArm') node.rotation.x = 0.2;
        
        node.scale.set(1, 1, 1);
        
        // Ground the character and ensure horizontal centering
        if (b === 'hips') {
          node.position.x = 0;
          node.position.y = 0; 
          node.position.z = 0;
        }
      }
    });

    // Reset fingers
    const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
    fingers.forEach(f => {
      ['Proximal', 'Intermediate', 'Distal'].forEach(j => {
        const leftBone = `left${f}${j}`;
        const rightBone = `right${f}${j}`;
        
        const ln = vrm.humanoid.getNormalizedBoneNode ? 
                   vrm.humanoid.getNormalizedBoneNode(leftBone) : 
                   vrm.humanoid.getBoneNode(leftBone);
        if (ln) ln.rotation.set(0, 0, 0);

        const rn = vrm.humanoid.getNormalizedBoneNode ? 
                   vrm.humanoid.getNormalizedBoneNode(rightBone) : 
                   vrm.humanoid.getBoneNode(rightBone);
        if (rn) rn.rotation.set(0, 0, 0);
      });
    });

    if (vrm.scene) vrm.scene.visible = true;
  }, []);

  return { applyBasePose };
}

export default useBasePose;
