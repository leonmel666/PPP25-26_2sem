from fastapi import APIRouter, HTTPException, Response
import os
from pathlib import Path

router = APIRouter()
MUSIC_FOLDER = "music"

@router.get("/cover/album/{album_name:path}")
def get_album_cover(album_name: str):
    # Папка, где лежат исходные аудиофайлы альбома (не в tracks)
    album_dir = os.path.join(MUSIC_FOLDER, album_name)
    candidates = []
    if os.path.isdir(album_dir):
        for f in os.listdir(album_dir):
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                candidates.append(os.path.join(album_dir, f))
    # Также ищем в корне music/ с именем альбома
    for ext in ['.jpg', '.jpeg', '.png']:
        candidates.append(os.path.join(MUSIC_FOLDER, album_name + ext))
        candidates.append(os.path.join(MUSIC_FOLDER, album_name, 'cover' + ext))
        candidates.append(os.path.join(MUSIC_FOLDER, album_name, 'folder' + ext))
    
    for path in candidates:
        if os.path.exists(path):
            ext = Path(path).suffix.lower()
            media_type = "image/jpeg" if ext in ('.jpg', '.jpeg') else "image/png"
            with open(path, "rb") as f:
                return Response(content=f.read(), media_type=media_type)
    raise HTTPException(status_code=404, detail="Cover not found")

@router.get("/cover/track/{track_file:path}")
def get_track_cover(track_file: str):
    track_path = os.path.join(MUSIC_FOLDER, track_file)
    base = os.path.splitext(track_path)[0]
    for ext in ['.jpg', '.jpeg', '.png']:
        path = base + ext
        if os.path.exists(path):
            media_type = "image/jpeg" if ext in ('.jpg', '.jpeg') else "image/png"
            with open(path, "rb") as f:
                return Response(content=f.read(), media_type=media_type)
    # Если нет, пробуем cover.jpg в той же папке
    folder = os.path.dirname(track_path)
    for cover in ['cover.jpg', 'folder.jpg', 'Cover.jpg']:
        path = os.path.join(folder, cover)
        if os.path.exists(path):
            with open(path, "rb") as f:
                return Response(content=f.read(), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Cover not found")