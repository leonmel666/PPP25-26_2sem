"""
GET /cover/album/{album_name} — обложка альбома (из папки альбома)
GET /cover/track/{track_file} — обложка трека (встроенная или рядом лежащая)

Весь оригинальный функционал сохранён, добавлена:
  - защита от path traversal
  - чтение встроенных обложек из MP3/FLAC/M4A через mutagen
  - кэширующий заголовок Cache-Control
"""
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.config import MUSIC_FOLDER
from app.security import safe_music_path

logger = logging.getLogger(__name__)
router = APIRouter()

IMG_EXTS   = [".jpg", ".jpeg", ".png"]
COVER_NAMES = ["cover", "folder", "front", "album"]

# mutagen — опциональная зависимость для встроенных обложек
try:
    from mutagen.id3 import ID3, APIC
    from mutagen.flac import FLAC
    from mutagen.mp4 import MP4
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False


# ── маленькие хелперы ─────────────────────────────────────────────────────────

def _mime(ext: str) -> str:
    return "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"


def _send(path: str) -> Response:
    ext = Path(path).suffix.lower()
    with open(path, "rb") as f:
        data = f.read()
    return Response(
        content=data,
        media_type=_mime(ext),
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _find_image_in_dir(directory: str) -> str | None:
    """Ищет обложку в папке: сначала по известным именам, потом любую картинку."""
    if not os.path.isdir(directory):
        return None
    files = os.listdir(directory)
    lower = {f.lower(): f for f in files}

    for name in COVER_NAMES:
        for ext in IMG_EXTS:
            key = name + ext
            if key in lower:
                return os.path.join(directory, lower[key])

    for fname in files:
        if os.path.splitext(fname)[1].lower() in IMG_EXTS:
            return os.path.join(directory, fname)

    return None


def _embedded_cover(audio_path: str) -> bytes | None:
    """Извлекает встроенную обложку через mutagen (MP3 / FLAC / M4A)."""
    if not HAS_MUTAGEN or not os.path.isfile(audio_path):
        return None
    ext = os.path.splitext(audio_path)[1].lower()
    try:
        if ext == ".mp3":
            tags = ID3(audio_path)
            for tag in tags.values():
                if isinstance(tag, APIC):
                    return tag.data
        elif ext == ".flac":
            audio = FLAC(audio_path)
            if audio.pictures:
                return audio.pictures[0].data
        elif ext == ".m4a":
            audio = MP4(audio_path)
            covers = audio.tags.get("covr")
            if covers:
                return bytes(covers[0])
    except Exception as e:
        logger.debug("embedded cover error %s: %s", audio_path, e)
    return None


# ── маршруты ─────────────────────────────────────────────────────────────────

@router.get("/cover/album/{album_name:path}")
def get_album_cover(album_name: str):
    # Защита: album_name не должен вести за пределы MUSIC_FOLDER
    try:
        album_dir = safe_music_path(album_name)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Cover not found")

    # 1. Картинка внутри папки альбома
    img = _find_image_in_dir(album_dir)
    if img:
        return _send(img)

    # 2. Картинка в корне music/ с именем альбома (album_name.jpg)
    for ext in IMG_EXTS:
        candidate = os.path.join(MUSIC_FOLDER, album_name + ext)
        if os.path.isfile(candidate):
            return _send(candidate)

    # 3. cover/folder в подпапке (оригинальная логика)
    for ext in IMG_EXTS:
        for cover_name in COVER_NAMES:
            candidate = os.path.join(MUSIC_FOLDER, album_name, cover_name + ext)
            if os.path.isfile(candidate):
                return _send(candidate)

    raise HTTPException(status_code=404, detail="Cover not found")


@router.get("/cover/track/{track_file:path}")
def get_track_cover(track_file: str):
    try:
        abs_path = safe_music_path(track_file)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Cover not found")

    # 1. Встроенная обложка (MP3 ID3 / FLAC / M4A)
    data = _embedded_cover(abs_path)
    if data:
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # 2. Картинка с тем же именем, что и трек (track.jpg рядом с track.mp3)
    base = os.path.splitext(abs_path)[0]
    for ext in IMG_EXTS:
        if os.path.isfile(base + ext):
            return _send(base + ext)

    # 3. cover.jpg / folder.jpg в папке трека
    folder = os.path.dirname(abs_path)
    img = _find_image_in_dir(folder)
    if img:
        return _send(img)

    raise HTTPException(status_code=404, detail="Cover not found")
