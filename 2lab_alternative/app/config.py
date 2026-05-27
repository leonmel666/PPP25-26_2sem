import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MUSIC_FOLDER = os.environ.get("MUSIC_FOLDER", str(BASE_DIR / "music"))
AUDIO_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".aac", ".m4a", ".opus", ".wv"}
MAX_PATH_LENGTH = 512
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
