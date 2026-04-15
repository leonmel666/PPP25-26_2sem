import os
import subprocess
import json
import asyncio
from pathlib import Path
from app.service.cue_parser import parse_cue

MUSIC_FOLDER = "music"
TRACKS_FOLDER = os.path.join(MUSIC_FOLDER, "tracks")

_library_cache = []
_is_scanning = False

def get_audio_duration(audio_path):
    if not os.path.exists(audio_path):
        return 0
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", audio_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "audio":
                return float(stream.get("duration", 0))
    except Exception as e:
        print(f"[ERROR] ffprobe failed for {audio_path}: {e}")
    return 0

def ensure_tracks_split(cue_path):
    album_name = Path(cue_path).stem
    album_tracks_dir = os.path.join(TRACKS_FOLDER, album_name)

    if os.path.exists(album_tracks_dir) and any(f.endswith(".flac") for f in os.listdir(album_tracks_dir)):
        return [os.path.join(album_tracks_dir, f) for f in os.listdir(album_tracks_dir) if f.endswith(".flac")]

    os.makedirs(album_tracks_dir, exist_ok=True)

    tracks_meta = parse_cue(cue_path)
    if not tracks_meta:
        return []

    file_durations = {}
    for track in tracks_meta:
        file_name = track.get("file")
        if file_name and file_name not in file_durations:
            audio_path = os.path.join(MUSIC_FOLDER, file_name)
            if os.path.exists(audio_path):
                file_durations[file_name] = get_audio_duration(audio_path)
                print(f"[INFO] {file_name} duration: {file_durations[file_name]}s")
            else:
                print(f"[ERROR] Audio file not found: {audio_path}")
                file_durations[file_name] = 0

    for i, track in enumerate(tracks_meta):
        start_sec = track.get("start_sec", 0)
        file_name = track.get("file")
        if not file_name:
            continue
        audio_path = os.path.join(MUSIC_FOLDER, file_name)
        if not os.path.exists(audio_path):
            continue

        total_duration = file_durations.get(file_name, 0)
        end_sec = total_duration
        for j in range(i+1, len(tracks_meta)):
            if tracks_meta[j].get("file") == file_name:
                end_sec = tracks_meta[j].get("start_sec", total_duration)
                break
        duration = end_sec - start_sec
        if duration <= 0:
            continue

        out_file = os.path.join(album_tracks_dir, f"{i+1:02d}.flac")
        result = subprocess.run([
            "ffmpeg", "-ss", str(start_sec), "-i", audio_path,
            "-t", str(duration),
            "-c", "flac", "-compression_level", "5",
            out_file
        ], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[FFMPEG ERROR] {result.stderr}")
            continue
        print(f"[SPLIT] Created {out_file} ({duration:.2f}s)")

    return [os.path.join(album_tracks_dir, f) for f in os.listdir(album_tracks_dir) if f.endswith(".flac")]

def _scan_library_sync():
    library = []
    processed_source_files = set()  # чтобы не дублировать треки из CUE

    # 1. Обрабатываем все CUE-файлы
    for file in os.listdir(MUSIC_FOLDER):
        if file.lower().endswith(".cue"):
            cue_path = os.path.join(MUSIC_FOLDER, file)
            try:
                ensure_tracks_split(cue_path)
            except Exception as e:
                print(f"[ERROR] Split failed {cue_path}: {e}")
                continue

            tracks_meta = parse_cue(cue_path)
            if not tracks_meta:
                continue

            album_name = Path(cue_path).stem
            for idx, track_meta in enumerate(tracks_meta, start=1):
                relative_path = os.path.join("tracks", album_name, f"{idx:02d}.flac")
                abs_path = os.path.join(MUSIC_FOLDER, relative_path)

                start_sec = track_meta.get("start_sec", 0)
                file_name = track_meta.get("file")
                total_duration = 0
                if file_name:
                    audio_path = os.path.join(MUSIC_FOLDER, file_name)
                    total_duration = get_audio_duration(audio_path)
                    processed_source_files.add(audio_path)
                end_sec = total_duration
                for j in range(idx, len(tracks_meta)):
                    if tracks_meta[j].get("file") == file_name:
                        end_sec = tracks_meta[j].get("start_sec", total_duration)
                        break
                duration = end_sec - start_sec
                if duration <= 0:
                    duration = get_audio_duration(abs_path) or 0

                library.append({
                    "title": track_meta.get("title", f"Track {idx}"),
                    "artist": track_meta.get("artist", "Unknown Artist"),
                    "file": relative_path,
                    "album": album_name,
                    "duration": duration,
                    "start": 0
                })

    # 2. Добавляем одиночные аудиофайлы (рекурсивно, исключая уже обработанные)
    supported_extensions = ('.flac', '.wav', '.mp3', '.ogg', '.m4a')
    for root, dirs, files in os.walk(MUSIC_FOLDER):
        for f in files:
            if f.lower().endswith(supported_extensions):
                full_path = os.path.join(root, f)
                # Пропускаем файлы, которые уже входят в какой-либо CUE
                if full_path in processed_source_files:
                    continue
                # Пропускаем папку tracks (там уже нарезанные файлы)
                if "tracks" in root.split(os.sep):
                    continue
                rel_path = os.path.relpath(full_path, MUSIC_FOLDER)
                library.append({
                    "title": Path(f).stem,
                    "artist": "Unknown Artist",
                    "file": rel_path,
                    "album": "",
                    "duration": get_audio_duration(full_path),
                    "start": 0
                })

    return library

async def refresh_library():
    global _library_cache, _is_scanning
    if _is_scanning:
        return
    _is_scanning = True
    try:
        loop = asyncio.get_running_loop()
        new_cache = await loop.run_in_executor(None, _scan_library_sync)
        _library_cache = new_cache
        print(f"[LIBRARY] Scanned {len(_library_cache)} tracks")
    except Exception as e:
        print(f"[LIBRARY] Scan error: {e}")
    finally:
        _is_scanning = False

def get_cached_library():
    return _library_cache

def is_scanning():
    return _is_scanning