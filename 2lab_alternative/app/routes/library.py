"""
Сервис библиотеки — сканирует MUSIC_FOLDER, парсит теги и CUE-листы,
хранит список треков в памяти.
"""
import asyncio
import logging
import os
from pathlib import Path

from app.config import MUSIC_FOLDER, AUDIO_EXTENSIONS
from app.cue_parser import parse_cue

logger = logging.getLogger(__name__)

# Глобальный кэш треков
_tracks: list[dict] = []
_lock = asyncio.Lock()

# Опциональная зависимость: mutagen для чтения тегов
try:
    import mutagen
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False
    logger.warning("mutagen not installed — tags won't be read from files")


def _rel(path: str) -> str:
    """Возвращает путь относительно MUSIC_FOLDER (с / в качестве разделителя)."""
    base = str(Path(MUSIC_FOLDER).resolve())
    rel = os.path.relpath(path, base)
    return rel.replace("\\", "/")


def _tags_from_file(path: str) -> dict:
    """Читает ID3/Vorbis/FLAC теги через mutagen."""
    info: dict = {}
    if not HAS_MUTAGEN:
        return info
    try:
        mf = MutagenFile(path, easy=True)
        if mf is None:
            return info
        def _first(key):
            v = mf.get(key)
            return v[0] if v else ""
        info["title"]       = _first("title")
        info["artist"]      = _first("artist") or _first("albumartist")
        info["album"]       = _first("album")
        info["tracknumber"] = _first("tracknumber")
        # Длительность
        if hasattr(mf, "info") and hasattr(mf.info, "length"):
            info["duration"] = mf.info.length
    except Exception as e:
        logger.debug("mutagen error %s: %s", path, e)
    return info


def _scan() -> list[dict]:
    music_root = Path(MUSIC_FOLDER).resolve()
    if not music_root.exists():
        logger.warning("MUSIC_FOLDER does not exist: %s", music_root)
        return []

    result: list[dict] = []

    for dirpath, dirnames, filenames in os.walk(str(music_root)):
        # Игнорируем скрытые папки (типа .DS_Store и т.п.)
        dirnames[:] = [d for d in sorted(dirnames) if not d.startswith(".")]

        # Ищем CUE-листы в текущей папке
        cue_files = [f for f in filenames if f.lower().endswith(".cue")]
        cue_audio_files: set[str] = set()  # файлы, которые уже покрыты CUE

        for cue_name in cue_files:
            cue_path = os.path.join(dirpath, cue_name)
            cue_tracks = parse_cue(cue_path)
            for t in cue_tracks:
                audio_file = t.get("file")
                if audio_file and not os.path.isabs(audio_file):
                    audio_file = os.path.normpath(os.path.join(dirpath, audio_file))
                if audio_file and os.path.exists(audio_file):
                    cue_audio_files.add(os.path.normpath(audio_file))
                    rel = _rel(audio_file)
                    # Папка альбома = имя директории
                    album = t.get("album") or Path(dirpath).name
                    # Номер трека из CUE (порядковый)
                    track_record = {
                        "file":      rel,
                        "title":     t.get("title", os.path.splitext(os.path.basename(audio_file))[0]),
                        "artist":    t.get("artist", "Unknown Artist"),
                        "album":     album,
                        "duration":  round(t.get("duration", 0.0), 2),
                        "start_sec": round(t.get("start_sec", 0.0), 3),
                        "source":    "cue",
                    }
                    result.append(track_record)
                else:
                    logger.debug("CUE references missing file: %s", audio_file)

        # Обычные аудиофайлы (не покрытые CUE)
        for fname in sorted(filenames):
            ext = os.path.splitext(fname)[1].lower()
            if ext not in AUDIO_EXTENSIONS:
                continue
            full_path = os.path.normpath(os.path.join(dirpath, fname))
            if full_path in cue_audio_files:
                continue  # уже добавлен через CUE

            rel = _rel(full_path)
            tags = _tags_from_file(full_path)
            title = tags.get("title") or os.path.splitext(fname)[0]
            artist = tags.get("artist") or "Unknown Artist"
            # Определяем альбом: тег > имя папки (если не корень music)
            parent_name = Path(dirpath).name
            is_root = Path(dirpath).resolve() == music_root
            album = tags.get("album") or ("" if is_root else parent_name)

            record = {
                "file":      rel,
                "title":     title,
                "artist":    artist,
                "album":     album,
                "duration":  round(tags.get("duration", 0.0), 2),
                "start_sec": 0.0,
                "source":    "tag",
            }
            result.append(record)

    logger.info("Library scan complete: %d tracks", len(result))
    return result





def get_tracks() -> list[dict]:
    return list(_tracks)

# ── флаг сканирования (нужен для /rescan и /scan_status) ─────────────────────
_scanning: bool = False


def is_scanning() -> bool:
    return _scanning


async def refresh_library() -> None:
    global _tracks, _scanning
    if _scanning:
        return
    _scanning = True
    try:
        loop = asyncio.get_event_loop()
        tracks = await loop.run_in_executor(None, _scan)
        async with _lock:
            _tracks = tracks
    finally:
        _scanning = False
