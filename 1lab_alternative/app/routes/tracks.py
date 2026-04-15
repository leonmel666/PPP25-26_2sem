from fastapi import APIRouter
from app.service import library

router = APIRouter()

@router.get("/tracks")
def get_tracks():
    return {"tracks": library.get_cached_library()}

@router.post("/rescan")
async def rescan_library():
    if not library.is_scanning():
        import asyncio
        asyncio.create_task(library.refresh_library())
        return {"status": "scanning started"}
    return {"status": "already scanning"}

@router.get("/scan_status")
def scan_status():
    return {"scanning": library.is_scanning(), "tracks_count": len(library.get_cached_library())}