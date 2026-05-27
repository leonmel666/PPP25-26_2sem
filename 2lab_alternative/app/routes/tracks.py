"""
GET  /tracks       — список всех треков из библиотеки
POST /rescan       — запустить повторное сканирование в фоне
GET  /scan_status  — состояние сканирования и кол-во треков
"""
import asyncio
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.service import library

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tracks")
def get_tracks():
    tracks = library.get_tracks()
    return JSONResponse({"tracks": tracks, "total": len(tracks)})


@router.post("/rescan")
async def rescan_library():
    if library.is_scanning():
        return JSONResponse({"status": "Сканирование уже запущено"})
    asyncio.create_task(library.refresh_library())
    return JSONResponse({"status": "Сканирование запущено"})


@router.get("/scan_status")
def scan_status():
    return JSONResponse({
        "scanning":     library.is_scanning(),
        "tracks_count": len(library.get_tracks()),
    })
