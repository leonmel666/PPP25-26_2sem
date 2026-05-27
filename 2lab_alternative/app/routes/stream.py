"""
GET /stream/{file_path} — потоковая отдача аудио с поддержкой Range.

Определяет MIME по расширению (не хардкодит audio/flac для всего подряд).
Защита от path traversal через app.security.
"""
import logging
import os

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse

from app.security import safe_music_path, validate_audio_extension

logger = logging.getLogger(__name__)
router = APIRouter()

CHUNK = 1024 * 64  # 64 KB

MIME_MAP = {
    ".mp3":  "audio/mpeg",
    ".flac": "audio/flac",
    ".ogg":  "audio/ogg",
    ".opus": "audio/ogg",
    ".wav":  "audio/wav",
    ".aac":  "audio/aac",
    ".m4a":  "audio/mp4",
    ".wv":   "audio/x-wavpack",
}


def _mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return MIME_MAP.get(ext, "application/octet-stream")


def _iter_file(path: str, start: int, end: int):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = f.read(min(CHUNK, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("/stream/{file_path:path}")
def stream_audio(file_path: str, request: Request):
    # Проверяем путь и расширение
    abs_path = safe_music_path(file_path)
    validate_audio_extension(abs_path)

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(abs_path)
    if file_size == 0:
        raise HTTPException(status_code=422, detail="Empty file")

    mime = _mime(abs_path)

    # Парсим Range-заголовок
    range_header = request.headers.get("range")
    if range_header:
        try:
            unit, rng = range_header.split("=", 1)
            if unit.strip().lower() != "bytes":
                raise ValueError("bad unit")
            s, e = rng.split("-", 1)
            start = int(s) if s else 0
            end   = int(e) if e else file_size - 1
        except (ValueError, IndexError):
            raise HTTPException(status_code=416, detail="Invalid Range header")

        start = max(0, start)
        end   = min(end, file_size - 1)
        if start > end:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        status_code = 206
    else:
        start = 0
        end   = file_size - 1
        status_code = 200

    headers = {
        "Content-Range":  f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges":  "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control":  "no-store",
    }

    return StreamingResponse(
        _iter_file(abs_path, start, end),
        status_code=status_code,
        headers=headers,
        media_type=mime,
    )
