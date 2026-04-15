from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
import os

router = APIRouter()
MUSIC_FOLDER = "music"

def iter_file(file_path, start: int, end: int):
    chunk_size = 1024 * 1024
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            yield chunk
            remaining -= len(chunk)

@router.get("/stream/{file_path:path}")
def stream_audio(file_path: str, request: Request):
    full_path = os.path.join(MUSIC_FOLDER, file_path)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(full_path)
    range_header = request.headers.get("range")

    if range_header:
        range_value = range_header.replace("bytes=", "")
        start_str, end_str = range_value.split("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        status_code = 206
    else:
        start = 0
        end = file_size - 1
        status_code = 200

    return StreamingResponse(
        iter_file(full_path, start, end),
        media_type="audio/flac",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1)
        },
        status_code=status_code
    )