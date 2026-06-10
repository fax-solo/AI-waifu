"""
Fix arm twisting across all idle/neutral BVH files.

The idle animation has asymmetric arm rotations with significant twist (Y)
and forward tilt (X) components. After the 180° Y-quaternion conversion in
applyBVHFrame, these produce exaggerated backward arm swings on models with
different bone orientation.

Fix: Neutralize Y (twist) and X (tilt) on arm bones, keeping Z (abduction)
as-is for natural arm hang. Makes left-right symmetric where possible.

Arm bones fixed: left/right Shoulder, UpperArm, LowerArm, Hand
"""
import re
import shutil
from pathlib import Path

BODY_DIR = Path(__file__).resolve().parent.parent / 'server' / 'data' / 'animations' / 'body'
BACKUP_DIR = BODY_DIR / '_idle_arm_fix_backup'

# Target Euler rotations for neutral idle pose [Y, X, Z]
# Y=0 removes arm twist, X=5 keeps slight natural forward tilt, Z kept from original
ARM_TARGETS = {
    'leftShoulder':  {'keep_z': True, 'y': 0, 'x': 0},
    'leftUpperArm':  {'keep_z': True, 'y': 0, 'x': 5},
    'leftLowerArm':  {'keep_z': True, 'y': 0, 'x': 0},
    'leftHand':      {'keep_z': True, 'y': 0, 'x': 0},
    'rightShoulder': {'keep_z': True, 'y': 0, 'x': 0},
    'rightUpperArm': {'keep_z': True, 'y': 0, 'x': 5},
    'rightLowerArm': {'keep_z': True, 'y': 0, 'x': 0},
    'rightHand':     {'keep_z': True, 'y': 0, 'x': 0},
}


def parse_offsets(hier_lines):
    offsets = {}
    cumulative = 0
    current_joint = None
    for line in hier_lines:
        m = re.match(r'(?:ROOT|JOINT)\s+(\w+)', line.strip())
        if m:
            current_joint = m.group(1)
            offsets[current_joint] = cumulative
            continue
        m = re.match(r'CHANNELS\s+(\d+)', line.strip())
        if m and current_joint:
            cumulative += int(m.group(1))
            current_joint = None
    return offsets, cumulative


def fix_file(filepath):
    print(f'Processing: {filepath.name}')
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Find hierarchy/motion boundary
    motion_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('MOTION'):
            motion_start = i
            break
    if motion_start is None:
        print(f'  ERROR: no MOTION section')
        return False

    hier_lines = lines[:motion_start]
    offsets, total_channels = parse_offsets(hier_lines)

    # Verify which arm bones exist
    bone_offsets = {}
    for name in ARM_TARGETS:
        off = offsets.get(name)
        if off is not None:
            bone_offsets[name] = off

    if not bone_offsets:
        print(f'  SKIP: no arm bones found')
        return False

    # Find frame data lines
    data_start = None
    for i in range(motion_start, len(lines)):
        stripped = lines[i].strip()
        if stripped and not any(stripped.startswith(p) for p in ['MOTION', 'Frames:', 'Frame Time:']):
            data_start = i
            break
    if data_start is None:
        print(f'  ERROR: no frame data')
        return False

    data_lines = lines[data_start:]

    # Fix frame data
    fixed_frames = 0
    fixed_data = []
    for line in data_lines:
        stripped = line.strip()
        if not stripped:
            fixed_data.append(line)
            continue
        parts = stripped.split()
        if len(parts) != total_channels:
            fixed_data.append(line)
            continue

        for name, off in bone_offsets.items():
            target = ARM_TARGETS[name]
            parts[off + 0] = str(target['y'])
            parts[off + 1] = str(target['x'])
            # Z left unchanged (natural arm abduction angle)

        fixed_data.append(' '.join(parts))
        fixed_frames += 1

    # Backup
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True)
    backup_path = BACKUP_DIR / filepath.name
    if not backup_path.exists():
        shutil.copy2(filepath, backup_path)
        print(f'  Backup: {backup_path.name}')

    # Write
    new_lines = lines[:data_start] + fixed_data
    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines) + '\n')
    print(f'  Fixed {fixed_frames} frames for bones: {", ".join(bone_offsets.keys())}')
    return True


def main():
    # Fix all idle and neutral BVH files
    patterns = ['neutral_idle*.bvh', 'sit_idle*.bvh']
    import glob

    fixed = 0
    skipped = 0
    errors = 0

    for pat in patterns:
        for fpath in sorted(BODY_DIR.glob(pat)):
            try:
                if fix_file(fpath):
                    fixed += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f'  ERROR: {e}')
                errors += 1

    # Also fix neutral.bvh itself (used as fallback idle)
    neutral_file = BODY_DIR / 'neutral.bvh'
    if neutral_file.exists():
        try:
            if fix_file(neutral_file):
                fixed += 1
            else:
                skipped += 1
        except Exception as e:
            print(f'  ERROR: {e}')
            errors += 1

    print(f'\nSummary: {fixed} fixed, {skipped} skipped, {errors} errors')


if __name__ == '__main__':
    main()
