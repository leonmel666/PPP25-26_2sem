"""Утилиты безопасности — проверка путей, санитизация."""
import os
from pathlib import Path
from fastapi import HTTPException
from app.config import MUSIC_FOLDER, MAX_PATH_LENGTH, AUDIO_EXTENSIONS


def safe_music_path(relative: str) -> str:
    """Возвращает абсолютный путь внутри MUSIC_FOLDER или бросает 400/403."""
    if not relative or len(relative) > MAX_PATH_LENGTH:
        raise HTTPException(status_code=400, detail="Invalid path")
    clean = relative.lstrip("/\\").replace("\\", "/")
    base = Path(MUSIC_FOLDER).resolve()
    target = (base / clean).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    return str(target)


def validate_audio_extension(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")
