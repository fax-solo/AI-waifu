"""
Fix BVH files where upperChest rotation was incorrectly set to copy chest values.
Resets upperChest channels to identity (0, 0, 0) to avoid double-rotation of torso,
which caused "hands twisted backward" in VRM playback.

This only touches files where upperChest channel values match chest values.
"""
import re
import shutil
from pathlib import Path

BODY_DIR = Path(__file__).resolve().parent.parent / 'server' / 'data' / 'animations' / 'body'
BACKUP_DIR = BODY_DIR / '_upperchest_fix_backup'


def parse_hierarchy(hier_lines):
    """Parse BVH hierarchy returning (joint_names, channel_offsets)."""
    joint_names = []
    offsets = {}
    cumulative = 0
    current_joint = None

    for line in hier_lines:
        stripped = line.strip()
        m = re.match(r'(?:ROOT|JOINT)\s+(\w+)', stripped)
        if m:
            current_joint = m.group(1)
            joint_names.append(current_joint)
            offsets[current_joint] = cumulative
            continue

        m = re.match(r'CHANNELS\s+(\d+)', stripped)
        if m and current_joint is not None:
            cumulative += int(m.group(1))
            current_joint = None

    return joint_names, offsets


def fix_file(filepath):
    print(f'Processing: {filepath.name}')

    with open(filepath, 'r') as f:
        text = f.read()
    lines = text.splitlines(keepends=False)

    if not any('upperChest' in line for line in lines):
        print(f'  SKIP: no upperChest')
        return False

    # Find MOTION boundary
    motion_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('MOTION'):
            motion_start = i
            break
    if motion_start is None:
        print(f'  ERROR: no MOTION section')
        return False

    hier_lines = lines[:motion_start]
    motion_lines = lines[motion_start:]

    joint_names, offsets = parse_hierarchy(hier_lines)

    if 'chest' not in offsets or 'upperChest' not in offsets:
        print(f'  SKIP: chest={offsets.get("chest")}, upperChest={offsets.get("upperChest")}')
        return False

    chest_off = offsets['chest']
    uc_off = offsets['upperChest']

    # Find the first data line
    data_start = None
    for i, line in enumerate(motion_lines):
        stripped = line.strip()
        if stripped and not stripped.startswith('MOTION') and not stripped.startswith('Frames:') and not stripped.startswith('Frame Time:'):
            data_start = i
            break
    if data_start is None:
        print(f'  ERROR: no data lines')
        return False

    data_lines = motion_lines[data_start:]

    # Check if any frame has non-zero upperChest that matches chest
    needs_fix = False
    sample_count = 0
    for line in data_lines:
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if len(parts) <= uc_off + 2:
            continue
        chest_vals = parts[chest_off:chest_off + 3]
        uc_vals = parts[uc_off:uc_off + 3]
        if chest_vals == uc_vals:
            needs_fix = True
            break
        # Also fix if upperChest values are non-zero (should be identity)
        uc_floats = [float(v) for v in uc_vals]
        if any(abs(v) > 1e-6 for v in uc_floats):
            needs_fix = True
            sample_count += 1
            if sample_count >= 3:
                break

    if not needs_fix:
        print(f'  SKIP: upperChest already identity or differs from chest')
        return False

    # Apply fix: zero out upperChest channels in all frames
    fixed_data = []
    fixed_count = 0
    for line in data_lines:
        stripped = line.strip()
        if not stripped:
            fixed_data.append(line)
            continue
        parts = stripped.split()
        if len(parts) <= uc_off + 2:
            fixed_data.append(line)
            continue
        # Replace uc_off, uc_off+1, uc_off+2 with '0'
        parts[uc_off] = '0'
        parts[uc_off + 1] = '0'
        parts[uc_off + 2] = '0'
        fixed_data.append(' '.join(parts))
        fixed_count += 1

    # Backup
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True)
    backup_path = BACKUP_DIR / filepath.name
    if not backup_path.exists():
        shutil.copy2(filepath, backup_path)
        print(f'  Backup: {backup_path.name}')

    # Write result
    new_lines = lines[:data_start] + fixed_data
    with open(filepath, 'w') as f:
        f.write('\n'.join(new_lines) + '\n')
    print(f'  Fixed {fixed_count} frames (upperChest at channels {uc_off}-{uc_off+2} set to 0)')
    return True


def main():
    bvh_files = sorted(BODY_DIR.glob('*.bvh'))
    print(f'Found {len(bvh_files)} BVH files in {BODY_DIR}')

    fixed = 0
    skipped = 0
    errors = 0

    for fpath in bvh_files:
        try:
            result = fix_file(fpath)
            if result:
                fixed += 1
            else:
                skipped += 1
        except Exception as e:
            print(f'  ERROR: {e}')
            errors += 1

    print(f'\nSummary: {fixed} fixed, {skipped} skipped, {errors} errors')


if __name__ == '__main__':
    main()
