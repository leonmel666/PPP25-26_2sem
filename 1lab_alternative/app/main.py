from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.routes import stream, tracks, cover
from app.service import library
import asyncio

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(library.refresh_library())

app.include_router(stream.router)
app.include_router(tracks.router)
app.include_router(cover.router)

app.mount("/static", StaticFiles(directory="app/static", html=True), name="static")

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")