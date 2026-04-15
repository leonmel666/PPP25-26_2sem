import os
import re

MUSIC_FOLDER = "music"

def parse_cue(cue_path):
    encodings = ['utf-8', 'cp1251', 'cp1252', 'latin-1']
    content = None
    for enc in encodings:
        try:
            with open(cue_path, 'r', encoding=enc) as f:
                content = f.read()
            print(f"[CUE] Using encoding {enc} for {cue_path}")
            break
        except UnicodeDecodeError:
            continue
    if content is None:
        print(f"[ERROR] Cannot decode {cue_path}")
        return []

    tracks = []
    current = None
    global_performer = ""
    current_file = None
    cue_dir = os.path.dirname(cue_path)

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        if line.startswith("FILE"):
            if current is not None:
                tracks.append(current)
                current = None
            match = re.search(r'"([^"]+)"', line)
            if match:
                raw_file = match.group(1)
                if not os.path.isabs(raw_file):
                    raw_file = os.path.normpath(os.path.join(cue_dir, raw_file))
                if raw_file.startswith('.\\'):
                    raw_file = raw_file[2:]
                # Убираем префикс MUSIC_FOLDER, если он уже есть
                if raw_file.startswith(MUSIC_FOLDER + os.sep):
                    raw_file = raw_file[len(MUSIC_FOLDER + os.sep):]
                current_file = raw_file
            else:
                current_file = None
            continue

        if line.startswith("PERFORMER"):
            if current is None:
                if '"' in line:
                    global_performer = line.split('"')[1]
                else:
                    parts = line.split(maxsplit=1)
                    if len(parts) > 1:
                        global_performer = parts[1]
            else:
                if '"' in line:
                    current["artist"] = line.split('"')[1]
                else:
                    parts = line.split(maxsplit=1)
                    if len(parts) > 1:
                        current["artist"] = parts[1]
            continue

        if line.startswith("TRACK"):
            if current is not None:
                tracks.append(current)
            current = {"start_sec": 0.0}
            if global_performer:
                current["artist"] = global_performer
            if current_file:
                current["file"] = current_file
            continue

        if line.startswith("TITLE") and current is not None:
            if '"' in line:
                current["title"] = line.split('"')[1]
            else:
                parts = line.split(maxsplit=1)
                if len(parts) > 1:
                    current["title"] = parts[1]
            continue

        if line.startswith("INDEX 01") and current is not None:
            parts = line.split()
            if len(parts) >= 3:
                time_str = parts[2]
                time_parts = time_str.split(':')
                try:
                    if len(time_parts) == 3:
                        m, s, f = map(int, time_parts)
                        current["start_sec"] = m * 60 + s + f / 75.0
                    elif len(time_parts) == 2:
                        m, s = map(int, time_parts)
                        current["start_sec"] = m * 60 + s
                except ValueError:
                    current["start_sec"] = 0.0
            continue

    if current is not None:
        tracks.append(current)

    for t in tracks:
        if "artist" not in t:
            t["artist"] = global_performer or "Unknown Artist"
        if "file" not in t or t["file"] is None:
            t["file"] = None

    print(f"[CUE] {cue_path} -> {len(tracks)} tracks")
    return tracks