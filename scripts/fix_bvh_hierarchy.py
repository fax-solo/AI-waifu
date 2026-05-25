"""
BVH Hierarchy Fix Script
Adds missing 'upperChest' joint to BVH files that lack it.

For a BVH with hierarchy:
  hips → spine → chest → neck → head → ... (shoulders children of chest)
Transforms into:
  hips → spine → chest → upperChest(identity) → neck → head → ... (shoulders moved under upperChest)

The upperChest rotation is set to identity (no rotation), preserving the original animation.
Shoulder offsets remain the same (relative to upperChest instead of chest).
"""

import re
import shutil
from pathlib import Path

BODY_DIR = Path(__file__).resolve().parent.parent / 'server' / 'data' / 'animations' / 'body'
BACKUP_DIR = BODY_DIR / '_original_backup'


def find_hierarchy_motion_boundary(lines):
    """Return the line index where MOTION section begins."""
    for i, line in enumerate(lines):
        if line.strip().startswith('MOTION'):
            return i
    return None


def has_upper_chest(lines):
    """Check if any line contains upperChest reference."""
    return any('upperChest' in line for line in lines)


def compute_channel_offsets(hier_lines):
    """
    In a BVH hierarchy text, joints appear in depth-first order.
    Each ROOT/JOINT line is followed by a CHANNELS line.
    Return dict mapping joint name -> cumulative channel offset (0-based).
    """
    offsets = {}
    cumulative = 0
    current_joint = None

    for line in hier_lines:
        stripped = line.strip()
        m = re.match(r'(?:ROOT|JOINT)\s+(\w+)', stripped)
        if m:
            current_joint = m.group(1)
            offsets[current_joint] = cumulative
            continue

        m = re.match(r'CHANNELS\s+(\d+)', stripped)
        if m and current_joint is not None:
            cumulative += int(m.group(1))
            current_joint = None  # CHANNELS consumed for this joint

    return offsets


def find_chest_block_boundaries(hier_lines):
    """
    Find the brace-delimited block of JOINT chest.
    Returns (start_line, end_line_exclusive) or None.
    """
    start = None
    brace = 0
    for i, line in enumerate(hier_lines):
        stripped = line.rstrip()
        if re.search(r'\bJOINT\s+chest\b', stripped, re.IGNORECASE):
            start = i
            brace = stripped.count('{') - stripped.count('}')
            continue
        if start is not None:
            brace += stripped.count('{') - stripped.count('}')
            if brace <= 0:
                return start, i + 1
    return None


def build_new_hierarchy(hier_lines, offsets):
    """
    Insert upperChest into the hierarchy.
    Moves all direct children of chest (neck, shoulders, etc.) under a new upperChest joint.
    Splits the first child's OFFSET Y so upperChest gets 40% and the child keeps 60%.
    """

    chest_line = None
    chest_indent = None
    for i, line in enumerate(hier_lines):
        if re.search(r'\bJOINT\s+chest\b', line, re.IGNORECASE):
            chest_line = i
            chest_indent = len(line) - len(line.lstrip())
            break

    if chest_line is None:
        return None

    # Find the opening brace of chest block
    open_brace = None
    for i in range(chest_line, len(hier_lines)):
        if '{' in hier_lines[i]:
            open_brace = i
            break

    if open_brace is None:
        return None

    # Find closing brace of chest block
    brace = 0
    close_brace = None
    for i in range(open_brace, len(hier_lines)):
        stripped = hier_lines[i].rstrip()
        brace += stripped.count('{') - stripped.count('}')
        if brace <= 0:
            close_brace = i
            break

    if close_brace is None:
        return None

    # Extract the lines inside chest block (between { and })
    chest_body = hier_lines[open_brace + 1:close_brace]

    # Find OFFSET of chest
    chest_offset_y = 0.0
    for line in chest_body:
        m = re.match(r'\s*OFFSET\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)', line)
        if m:
            chest_offset_y = float(m.group(2))
            break

    # Find first child JOINT inside chest body and its OFFSET
    first_child_offset_y = 0.0
    first_child_name = None
    first_child_line_idx = None

    for i, line in enumerate(chest_body):
        m = re.match(r'\s*JOINT\s+(\w+)', line)
        if m:
            first_child_name = m.group(1)
            first_child_line_idx = i
            # Find the OFFSET of this child (within its block)
            sub_brace = 0
            for j in range(i, len(chest_body)):
                sl = chest_body[j].strip()
                sub_brace += sl.count('{') - sl.count('}')
                om = re.match(r'OFFSET\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)', sl)
                if om:
                    first_child_offset_y = float(om.group(2))
                    break
                if sub_brace < 0:
                    break
            break

    # Calculate split
    uc_offset_y = first_child_offset_y * 0.4
    new_child_offset_y = first_child_offset_y - uc_offset_y

    # Rebuild chest body with upperChest wrapper
    new_body = []

    # Lines before first child (OFFSET, CHANNELS)
    for line in chest_body[:first_child_line_idx]:
        new_body.append(line)

    # Insert upperChest wrapper
    ci = chest_indent + 2  # chest children indent
    uci = ci + 2  # upperChest children indent
    new_body.append(f'{" " * ci}JOINT upperChest')
    new_body.append(f'{" " * ci}{{')
    new_body.append(f'{" " * uci}OFFSET 0 {uc_offset_y} 0')
    new_body.append(f'{" " * uci}CHANNELS 3 Yrotation Xrotation Zrotation')

    # Process all children, moving them inside upperChest
    # Track brace depth to handle nested JOINTs
    child_lines = []
    depth = 0
    first_child_offset_adjusted = False
    for i in range(first_child_line_idx, len(chest_body)):
        line = chest_body[i]
        stripped = line.rstrip()

        # Check if this starts a TOP-LEVEL child (indent == ci, starts with JOINT)
        is_top_child = (re.match(r'\s*JOINT\s+\w+', stripped)
                        and len(line) - len(line.lstrip()) == ci)

        if is_top_child and child_lines:
            # Flush previous child
            for cl in child_lines:
                new_body.append(cl)
            child_lines = []
            depth = 0
            first_child_offset_adjusted = False

        depth += stripped.count('{') - stripped.count('}')

        # Adjust first child's OFFSET Y value (at any depth within its block)
        if not first_child_offset_adjusted and 'OFFSET' in stripped and new_child_offset_y != first_child_offset_y:
            om = re.match(r'(\s*OFFSET\s+[\d.eE+\-]+\s+)[\d.eE+\-]+(\s+[\d.eE+\-]+)', stripped)
            if om:
                stripped = f'{om.group(1)}{new_child_offset_y}{om.group(2)}'
                first_child_offset_adjusted = True

        child_lines.append(stripped)

    # Flush last child
    for cl in child_lines:
        new_body.append(cl)

    # Close upperChest
    new_body.append(f'{" " * ci}}}')
    # Close chest
    new_body.append(hier_lines[close_brace])

    return hier_lines[:open_brace + 1] + new_body + hier_lines[close_brace + 1:]


def modify_frame_data(motion_lines, insert_pos):
    """
    Insert 3 additional values (copy of parent-chest values) into each frame line.
    insert_pos: the 0-based channel index where upperChest data should be inserted.
                This is right after chest's 3 channels.
    """
    data_lines = []
    header_done = False
    header_lines = []

    for line in motion_lines:
        if not header_done:
            stripped = line.strip()
            if stripped and not stripped.startswith('Frames:') and not stripped.startswith('Frame Time:'):
                header_done = True
                data_lines.append(line)
            else:
                header_lines.append(line)
        else:
            data_lines.append(line)

    modified_data = []
    for line in data_lines:
        stripped = line.strip()
        if not stripped:
            modified_data.append(line)
            continue

        parts = stripped.split()
        if len(parts) < insert_pos + 3:
            modified_data.append(line)
            continue

        # Copy chest's 3 values (at insert_pos-3, insert_pos-2, insert_pos-1)
        chest_vals = parts[insert_pos - 3:insert_pos]
        new_parts = parts[:insert_pos] + chest_vals + parts[insert_pos:]
        modified_data.append(' '.join(new_parts))

    return header_lines + modified_data


def process_bvh(filepath):
    print(f'Processing: {filepath.name}')

    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Strip trailing newlines for consistency
    lines = [l.rstrip('\n\r') for l in lines]

    if has_upper_chest(lines):
        print(f'  SKIP: already has upperChest')
        return False

    # Find hierarchy/motion boundary
    motion_start = find_hierarchy_motion_boundary(lines)
    if motion_start is None:
        print(f'  ERROR: could not find MOTION section')
        return False

    hier_lines = lines[:motion_start]
    motion_lines = lines[motion_start:]

    # Compute channel offsets
    offsets = compute_channel_offsets(hier_lines)

    if 'chest' not in offsets:
        print(f'  ERROR: no chest joint found')
        return False

    # The first child of chest is the next joint in depth-first order
    # Find the first JOINT that comes after chest in the offsets dict
    child_names = []
    found_chest = False
    for k in offsets:
        if k.lower() == 'chest':
            found_chest = True
            continue
        if found_chest:
            child_names.append(k)
            break  # First child (in depth-first order) is the one right after chest

    if not child_names:
        print(f'  ERROR: no children found after chest')
        return False

    insert_pos = offsets[child_names[0]]
    print(f'  chest offset={offsets["chest"]}, first child {child_names[0]} offset={insert_pos}')
    print(f'  Will insert upperChest (3 channels) at position {insert_pos}')

    # Build new hierarchy
    new_hier = build_new_hierarchy(hier_lines, offsets)
    if new_hier is None:
        print(f'  ERROR: hierarchy transformation failed')
        return False

    # Modify frame data
    new_motion = modify_frame_data(motion_lines, insert_pos)

    # Combine
    new_text = '\n'.join(new_hier) + '\n' + '\n'.join(new_motion)

    # Backup
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True)
    backup_path = BACKUP_DIR / filepath.name
    if not backup_path.exists():
        shutil.copy2(filepath, backup_path)
        print(f'  Backup: {backup_path.name}')

    # Write
    with open(filepath, 'w') as f:
        f.write(new_text)
    print(f'  Done!')

    return True


def main():
    bvh_files = sorted(BODY_DIR.glob('*.bvh'))
    print(f'Found {len(bvh_files)} BVH files in {BODY_DIR}')

    modified = 0
    skipped = 0
    errors = 0

    for fpath in bvh_files:
        try:
            result = process_bvh(fpath)
            if result:
                modified += 1
            else:
                skipped += 1
        except Exception as e:
            print(f'  ERROR: {e}')
            errors += 1

    print(f'\nSummary: {modified} modified, {skipped} skipped, {errors} errors')


if __name__ == '__main__':
    main()
