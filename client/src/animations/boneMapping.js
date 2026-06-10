function fingerAliases(name) {
  const sides = ['left', 'right'];
  const digits = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
  const joints = ['Proximal', 'Intermediate', 'Distal'];
  const aliases = [];
  for (const side of sides) {
    for (const digit of digits) {
      for (const joint of joints) {
        const vrmName = `${side}${digit}${joint}`;
        if (vrmName === name || vrmName.toLowerCase() === name.toLowerCase()) {
          aliases.push(vrmName);
        }
      }
    }
  }
  return aliases;
}

export const BONE_MAPPING = [
  ['upperChest', ['Spine3', 'spine3', 'Spine2', 'spine2', 'upperChest', 'UpperChest', 'mixamorig:Spine2', 'mixamorig:Spine3', 'spine03']],
  ['chest', ['Spine1', 'spine1', 'chest', 'Chest', 'mixamorig:Spine1', 'spine02']],
  ['spine', ['spine01']],
  ['hips', ['Hips', 'hips', 'pelvis', 'Pelvis', 'mixamorig:Hips', 'hip', 'HIP', 'root', 'Root']],
  ['neck', ['Neck', 'neck', 'mixamorig:Neck']],
  ['head', ['Head', 'head', 'mixamorig:Head']],
  ['leftShoulder', ['LeftShoulder', 'leftShoulder', 'Left_shoulder', 'left_shoulder', 'l_shoulder', 'mixamorig:LeftShoulder', 'claviclel']],
  ['rightShoulder', ['RightShoulder', 'rightShoulder', 'Right_shoulder', 'right_shoulder', 'r_shoulder', 'mixamorig:RightShoulder', 'clavicler']],
  ['leftUpperArm', ['leftUpperArm', 'LeftArm', 'leftArm', 'Left_arm', 'left_arm', 'l_arm', 'mixamorig:LeftArm', 'upperarml']],
  ['leftLowerArm', ['leftLowerArm', 'LeftForeArm', 'leftForeArm', 'Left_forearm', 'left_forearm', 'l_forearm', 'mixamorig:LeftForeArm', 'lowerarml']],
  ['leftHand', ['leftHand', 'LeftHand', 'leftHand', 'Left_hand', 'left_hand', 'l_hand', 'mixamorig:LeftHand', 'handl']],
  ['rightUpperArm', ['rightUpperArm', 'RightArm', 'rightArm', 'Right_arm', 'right_arm', 'mixamorig:RightArm', 'upperarmr']],
  ['rightLowerArm', ['rightLowerArm', 'RightForeArm', 'rightForeArm', 'Right_forearm', 'right_forearm', 'l_forearm', 'mixamorig:RightForeArm', 'lowerarmr']],
  ['rightHand', ['rightHand', 'RightHand', 'rightHand', 'Right_hand', 'right_hand', 'r_hand', 'mixamorig:RightHand', 'handr']],
  ['leftUpperLeg', ['leftUpperLeg', 'LeftUpLeg', 'leftUpLeg', 'Left_thigh', 'left_thigh', 'l_thigh', 'mixamorig:LeftUpLeg', 'thighl']],
  ['leftLowerLeg', ['leftLowerLeg', 'LeftLeg', 'leftLeg', 'Left_shin', 'left_shin', 'l_shin', 'mixamorig:LeftLeg', 'calfl', 'shinl']],
  ['leftFoot', ['leftFoot', 'LeftFoot', 'leftFoot', 'Left_foot', 'left_foot', 'l_foot', 'mixamorig:LeftFoot', 'footl']],
  ['leftToes', ['leftToes', 'LeftToes', 'leftToes', 'Left_toes', 'left_toes', 'l_toes', 'LeftFootEnd', 'balll']],
  ['rightUpperLeg', ['rightUpperLeg', 'RightUpLeg', 'rightUpLeg', 'Right_thigh', 'right_thigh', 'r_thigh', 'mixamorig:RightUpLeg', 'thighr']],
  ['rightLowerLeg', ['rightLowerLeg', 'RightLeg', 'rightLeg', 'Right_shin', 'right_shin', 'r_shin', 'mixamorig:RightLeg', 'calfr', 'shinr']],
  ['rightFoot', ['rightFoot', 'RightFoot', 'rightFoot', 'Right_foot', 'right_foot', 'r_foot', 'mixamorig:RightFoot', 'footr']],
  ['rightToes', ['rightToes', 'RightToes', 'rightToes', 'Right_toes', 'right_toes', 'r_toes', 'RightFootEnd', 'ballr']],
  ['leftThumbProximal', fingerAliases('leftThumbProximal')],
  ['leftThumbIntermediate', fingerAliases('leftThumbIntermediate')],
  ['leftThumbDistal', fingerAliases('leftThumbDistal')],
  ['leftIndexProximal', fingerAliases('leftIndexProximal')],
  ['leftIndexIntermediate', fingerAliases('leftIndexIntermediate')],
  ['leftIndexDistal', fingerAliases('leftIndexDistal')],
  ['leftMiddleProximal', fingerAliases('leftMiddleProximal')],
  ['leftMiddleIntermediate', fingerAliases('leftMiddleIntermediate')],
  ['leftMiddleDistal', fingerAliases('leftMiddleDistal')],
  ['leftRingProximal', fingerAliases('leftRingProximal')],
  ['leftRingIntermediate', fingerAliases('leftRingIntermediate')],
  ['leftRingDistal', fingerAliases('leftRingDistal')],
  ['leftLittleProximal', fingerAliases('leftLittleProximal')],
  ['leftLittleIntermediate', fingerAliases('leftLittleIntermediate')],
  ['leftLittleDistal', fingerAliases('leftLittleDistal')],
  ['rightThumbProximal', fingerAliases('rightThumbProximal')],
  ['rightThumbIntermediate', fingerAliases('rightThumbIntermediate')],
  ['rightThumbDistal', fingerAliases('rightThumbDistal')],
  ['rightIndexProximal', fingerAliases('rightIndexProximal')],
  ['rightIndexIntermediate', fingerAliases('rightIndexIntermediate')],
  ['rightIndexDistal', fingerAliases('rightIndexDistal')],
  ['rightMiddleProximal', fingerAliases('rightMiddleProximal')],
  ['rightMiddleIntermediate', fingerAliases('rightMiddleIntermediate')],
  ['rightMiddleDistal', fingerAliases('rightMiddleDistal')],
  ['rightRingProximal', fingerAliases('rightRingProximal')],
  ['rightRingIntermediate', fingerAliases('rightRingIntermediate')],
  ['rightRingDistal', fingerAliases('rightRingDistal')],
  ['rightLittleProximal', fingerAliases('rightLittleProximal')],
  ['rightLittleIntermediate', fingerAliases('rightLittleIntermediate')],
  ['rightLittleDistal', fingerAliases('rightLittleDistal')],
];
