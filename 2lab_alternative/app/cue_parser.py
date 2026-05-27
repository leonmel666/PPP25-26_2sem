"""
Парсер CUE-листов. Поддерживает UTF-8, cp1251, latin-1.
Возвращает список треков с полями: title, artist, file, start_sec, duration.
"""
import os
import re
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ENCODINGS = ["utf-8-sig", "utf-8", "cp1251", "cp1252", "latin-1"]


def _try_read(path: str) -> str | None:
    for enc in ENCODINGS:
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    return None


def _parse_time(time_str: str) -> float:
    """MM:SS:FF -> секунды (75 кадров/сек)."""
    parts = time_str.split(":")
    try:
        if len(parts) == 3:
            m, s, f = int(parts[0]), int(parts[1]), int(parts[2])
            return m * 60 + s + f / 75.0
        if len(parts) == 2:
            m, s = int(parts[0]), int(parts[1])
            return m * 60 + s
    except ValueError:
        pass
    return 0.0


def parse_cue(cue_path: str) -> list[dict]:
    content = _try_read(cue_path)
    if content is None:
        logger.error("Cannot decode CUE: %s", cue_path)
        return []

    cue_dir = os.path.dirname(os.path.abspath(cue_path))
    tracks: list[dict] = []
    current: dict | None = None
    global_performer = ""
    current_file: str | None = None

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # FILE — сброс текущего трека и установка файла
        if line.upper().startswith("FILE"):
            if current is not None:
                tracks.append(current)
                current = None
            m = re.search(r'"([^"]+)"', line)
            if m:
                raw_file = m.group(1).replace("\\", os.sep)
                if not os.path.isabs(raw_file):
                    raw_file = os.path.normpath(os.path.join(cue_dir, raw_file))
                current_file = raw_file
            else:
                current_file = None
            continue

        # PERFORMER глобальный
        if line.upper().startswith("PERFORMER") and current is None:
            m = re.search(r'"([^"]*)"', line)
            global_performer = m.group(1) if m else line.split(None, 1)[-1].strip()
            continue

        # TRACK — новый трек
        if line.upper().startswith("TRACK"):
            if current is not None:
                tracks.append(current)
            current = {
                "start_sec": 0.0,
                "artist": global_performer or "Unknown Artist",
                "file": current_file,
            }
            continue

        if current is None:
            continue

        # TITLE
        if line.upper().startswith("TITLE"):
            m = re.search(r'"([^"]*)"', line)
            current["title"] = m.group(1) if m else line.split(None, 1)[-1].strip()
            continue

        # PERFORMER трека
        if line.upper().startswith("PERFORMER"):
            m = re.search(r'"([^"]*)"', line)
            current["artist"] = m.group(1) if m else line.split(None, 1)[-1].strip()
            continue

        # INDEX 01
        if line.upper().startswith("INDEX 01"):
            parts = line.split()
            if len(parts) >= 3:
                current["start_sec"] = _parse_time(parts[2])
            continue

    if current is not None:
        tracks.append(current)

    # Вычисляем длительности из разницы start_sec
    # Треки из одного файла идут подряд — группируем
    for i, track in enumerate(tracks):
        track.setdefault("title", f"Track {i + 1}")
        track.setdefault("artist", global_performer or "Unknown Artist")
        # Ищем следующий трек из того же файла
        if i + 1 < len(tracks) and tracks[i + 1].get("file") == track.get("file"):
            track["duration"] = tracks[i + 1]["start_sec"] - track["start_sec"]
        else:
            track["duration"] = 0.0  # заполнится при сканировании файла

    logger.info("CUE %s -> %d tracks", cue_path, len(tracks))
    return tracks
