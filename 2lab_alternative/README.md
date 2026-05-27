# Music Player

Локальный веб-плеер с поддержкой MP3/FLAC/OGG/WAV/M4A и CUE-листов.

## Быстрый старт

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Положить музыку в папку music/
#    Поддерживаемая структура:
#      music/
#        Исполнитель/
#          Альбом/
#            01 - Трек.flac
#            cover.jpg
#            album.cue        ← CUE поддерживается
#        single.mp3

# 3. Запустить
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 4. Открыть в браузере
# http://localhost:8000
```

## Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| Пробел | Пауза / Воспроизведение |
| → | +5 секунд |
| ← | −5 секунд |
| ↑ | Громче |
| ↓ | Тише |

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `MUSIC_FOLDER` | `./music` | Путь к папке с музыкой |

## Структура проекта

```
music_player/
├── main.py               # FastAPI приложение
├── requirements.txt
├── music/                # Сюда кладём музыку
└── app/
    ├── config.py         # Настройки
    ├── security.py       # Защита от path traversal
    ├── cue_parser.py     # Парсер CUE-листов
    ├── routes/
    │   ├── stream.py     # /stream/ — стриминг с Range
    │   ├── tracks.py     # /tracks, /rescan
    │   └── cover.py      # /cover/
    ├── service/
    │   └── library.py    # Сканирование папки
    └── static/
        ├── index.html
        ├── css/style.css
        └── js/player.js
```
