/**
 * Music Player — фронтенд
 * Полностью переписан: убраны баги с очередью, навигацией, состоянием плеера.
 */

// ── константы ────────────────────────────────────────────────────────────────

const FALLBACK_COVER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#1c1c2a"/>' +
    '<text x="50" y="62" text-anchor="middle" font-size="38">🎵</text></svg>'
);

// ── состояние ─────────────────────────────────────────────────────────────────

const state = {
    // библиотека
    allTracks:  [],   // все треки с сервера
    artists:    new Map(),
    singles:    [],

    // навигация (стек экранов)
    navStack:   [],   // [{screen, params}]

    // плеер
    queue:      [],
    queueIdx:   0,
    shuffle:    false,
    repeat:     'none',  // 'none' | 'all' | 'one'
};

const audio = new Audio();
audio.volume = 0.8;

// ── DOM ───────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const dom = {
    content:     $('content'),
    breadcrumb:  $('breadcrumb'),
    backBtn:     $('backBtn'),
    rescanBtn:   $('rescanBtn'),
    playerBar:   $('playerBar'),
    pCover:      $('pCover'),
    pTitle:      $('pTitle'),
    pArtist:     $('pArtist'),
    pPlayPause:  $('pPlayPause'),
    pPrev:       $('pPrev'),
    pNext:       $('pNext'),
    pShuffle:    $('pShuffle'),
    pRepeat:     $('pRepeat'),
    progressFill: $('progressFill'),
    progressTrack: $('progressTrack'),
    pTimeCur:    $('pTimeCur'),
    pTimeTotal:  $('pTimeTotal'),
    pVolume:     $('pVolume'),
    pVolIcon:    $('pVolIcon'),
};

// ── утилиты ───────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmt(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function coverUrl(track) {
    if (track.album) return `/cover/album/${encodeURIComponent(track.album)}`;
    return `/cover/track/${encodeURIComponent(track.file)}`;
}

function imgWithFallback(src, cls, alt) {
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}"
             onerror="this.src='${FALLBACK_COVER}'" loading="lazy">`;
}

// ── индекс библиотеки ─────────────────────────────────────────────────────────

function buildIndex(tracks) {
    state.artists.clear();
    state.singles = [];
    state.allTracks = tracks;

    for (const t of tracks) {
        const artist = t.artist || 'Unknown Artist';
        const album  = t.album  || '';

        if (!album) {
            state.singles.push(t);
            continue;
        }

        if (!state.artists.has(artist)) state.artists.set(artist, new Map());
        const albums = state.artists.get(artist);

        if (!albums.has(album)) albums.set(album, []);
        albums.get(album).push(t);
    }

    // Сортируем треки в альбомах по track number / имени файла
    for (const albums of state.artists.values()) {
        for (const [, list] of albums) {
            list.sort((a, b) => {
                const na = parseInt(a.tracknumber) || 0;
                const nb = parseInt(b.tracknumber) || 0;
                if (na && nb) return na - nb;
                return (a.file || '').localeCompare(b.file || '');
            });
        }
    }
    state.singles.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

// ── навигация ─────────────────────────────────────────────────────────────────

function navigate(screen, params = {}) {
    state.navStack.push({ screen, params });
    _render(screen, params);
}

function goBack() {
    if (state.navStack.length <= 1) {
        state.navStack = [];
        renderHome();
        return;
    }
    state.navStack.pop();
    const prev = state.navStack[state.navStack.length - 1];
    _render(prev.screen, prev.params);
}

function _render(screen, params) {
    switch (screen) {
        case 'home':   renderHome();                              break;
        case 'artist': renderArtist(params.artist);               break;
        case 'album':  renderAlbum(params.artist, params.album);  break;
        case 'singles':renderSingles();                           break;
    }
}

// ── рендер экранов ────────────────────────────────────────────────────────────

function renderHome() {
    state.navStack = [{ screen: 'home', params: {} }];
    dom.breadcrumb.textContent = 'Библиотека';

    const artistList = [...state.artists.keys()].sort();

    if (!artistList.length && !state.singles.length) {
        dom.content.innerHTML = `
            <div class="empty-state">
                <div class="emoji">🎵</div>
                <p>Нет музыки. Добавьте файлы в папку <strong>music/</strong>.</p>
            </div>`;
        return;
    }

    let html = '';

    if (artistList.length) {
        html += `<div class="section-header">
                    <span class="section-title">Исполнители</span>
                    <span class="section-count">${artistList.length}</span>
                 </div>
                 <div class="grid">`;
        for (const artist of artistList) {
            const albums = state.artists.get(artist);
            const cnt = albums.size;
            html += `<div class="card" data-action="artist" data-artist="${esc(artist)}">
                        <div class="card-placeholder">🎤</div>
                        <div class="card-title">${esc(artist)}</div>
                        <div class="card-sub">${cnt} ${plural(cnt, 'альбом', 'альбома', 'альбомов')}</div>
                     </div>`;
        }
        html += `</div>`;
    }

    if (state.singles.length) {
        html += `<div class="section-header" style="margin-top:28px">
                    <span class="section-title">Отдельные треки</span>
                    <span class="section-count">${state.singles.length}</span>
                 </div>
                 <div class="grid">
                    <div class="card" data-action="singles">
                        <div class="card-placeholder">🎵</div>
                        <div class="card-title">Все треки</div>
                        <div class="card-sub">${state.singles.length} треков</div>
                    </div>
                 </div>`;
    }

    dom.content.innerHTML = html;
    dom.content.querySelectorAll('.card').forEach(el => {
        el.addEventListener('click', () => {
            const act = el.dataset.action;
            if (act === 'artist')  navigate('artist',  { artist: el.dataset.artist });
            if (act === 'singles') navigate('singles', {});
        });
    });
}

function renderArtist(artistName) {
    const albums = state.artists.get(artistName);
    if (!albums) { renderHome(); return; }

    dom.breadcrumb.textContent = artistName;
    const albumList = [...albums.keys()].sort();

    let html = `<div class="section-header">
                    <span class="section-title">${esc(artistName)}</span>
                    <span class="section-count">${albumList.length} ${plural(albumList.length, 'альбом', 'альбома', 'альбомов')}</span>
                </div>
                <div class="grid">`;

    for (const album of albumList) {
        const trackCount = albums.get(album).length;
        const cover = `/cover/album/${encodeURIComponent(album)}`;
        html += `<div class="card" data-action="album" data-artist="${esc(artistName)}" data-album="${esc(album)}">
                    ${imgWithFallback(cover, 'card-cover', album)}
                    <div class="card-title">${esc(album)}</div>
                    <div class="card-sub">${trackCount} треков</div>
                 </div>`;
    }
    html += `</div>`;

    dom.content.innerHTML = html;
    dom.content.querySelectorAll('.card').forEach(el => {
        el.addEventListener('click', () =>
            navigate('album', { artist: el.dataset.artist, album: el.dataset.album })
        );
    });
}

function renderAlbum(artistName, albumName) {
    const albums = state.artists.get(artistName);
    if (!albums) return;
    const list = albums.get(albumName);
    if (!list) return;

    dom.breadcrumb.textContent = `${artistName} / ${albumName}`;
    const cover = `/cover/album/${encodeURIComponent(albumName)}`;

    let html = `<div class="album-header">
                    ${imgWithFallback(cover, 'album-cover-big', albumName)}
                    <div class="album-meta">
                        <h2>${esc(albumName)}</h2>
                        <p>${esc(artistName)} · ${list.length} треков</p>
                        <button class="play-all-btn" id="playAllBtn">
                            <i class="fas fa-play"></i> Слушать всё
                        </button>
                    </div>
                </div>
                <div class="track-list">`;

    list.forEach((t, i) => {
        html += `<div class="track-row" data-idx="${i}">
                    <div class="track-num">${String(i + 1).padStart(2, '0')}</div>
                    <div>
                        <div class="track-name">${esc(t.title || 'Без названия')}</div>
                        <div class="track-artist-small">${esc(t.artist)}</div>
                    </div>
                    <div class="track-dur">${fmt(t.duration)}</div>
                 </div>`;
    });
    html += `</div>`;

    dom.content.innerHTML = html;

    $('playAllBtn').addEventListener('click', () => playTrackFromList(list, 0));

    dom.content.querySelectorAll('.track-row').forEach(el => {
        el.addEventListener('click', () => playTrackFromList(list, +el.dataset.idx));
    });
}

function renderSingles() {
    dom.breadcrumb.textContent = 'Отдельные треки';
    const list = state.singles;

    let html = `<div class="section-header">
                    <span class="section-title">Отдельные треки</span>
                    <span class="section-count">${list.length}</span>
                </div>
                <div class="track-list">`;
    list.forEach((t, i) => {
        html += `<div class="track-row" data-idx="${i}">
                    <div class="track-num">${String(i + 1).padStart(2, '0')}</div>
                    <div>
                        <div class="track-name">${esc(t.title || 'Без названия')}</div>
                        <div class="track-artist-small">${esc(t.artist)}</div>
                    </div>
                    <div class="track-dur">${fmt(t.duration)}</div>
                 </div>`;
    });
    html += `</div>`;

    dom.content.innerHTML = html;
    dom.content.querySelectorAll('.track-row').forEach(el => {
        el.addEventListener('click', () => playTrackFromList(list, +el.dataset.idx));
    });
}

// ── очередь ───────────────────────────────────────────────────────────────────

function buildQueue(list, startIdx) {
    if (state.shuffle) {
        // Перемешиваем всё кроме startIdx, затем ставим его первым
        const rest = list.filter((_, i) => i !== startIdx);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        state.queue    = [list[startIdx], ...rest];
        state.queueIdx = 0;
    } else {
        state.queue    = [...list];
        state.queueIdx = startIdx;
    }
}

// ── воспроизведение ───────────────────────────────────────────────────────────

function playTrackFromList(list, idx) {
    buildQueue(list, idx);
    _play(state.queue[state.queueIdx]);
}

function _play(track) {
    if (!track) return;

    const url = `/stream/${encodeURIComponent(track.file)}`;
    audio.src = url;
    audio.load();
    audio.play().catch(err => console.warn('play():', err));

    // Обновляем UI плеера
    dom.pTitle.textContent  = track.title  || 'Без названия';
    dom.pArtist.textContent = track.artist || '—';

    const cv = coverUrl(track);
    dom.pCover.src = cv;
    dom.pCover.onerror = () => { dom.pCover.src = FALLBACK_COVER; };

    dom.playerBar.removeAttribute('hidden');

    // Подсвечиваем активный трек в списке
    document.querySelectorAll('.track-row.active').forEach(el => el.classList.remove('active'));
    const activeRow = document.querySelector(`.track-row[data-idx="${state.queueIdx}"]`);
    if (activeRow) activeRow.classList.add('active');
}

function playNext() {
    if (!state.queue.length) return;
    if (state.repeat === 'one') {
        audio.currentTime = 0;
        audio.play();
        return;
    }
    if (state.queueIdx + 1 < state.queue.length) {
        state.queueIdx++;
    } else if (state.repeat === 'all') {
        state.queueIdx = 0;
    } else {
        // Очередь кончилась
        setPlayIcon(false);
        return;
    }
    _play(state.queue[state.queueIdx]);
}

function playPrev() {
    if (!state.queue.length) return;
    // Если прошло > 3 сек — перемотать в начало
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    if (state.queueIdx > 0) state.queueIdx--;
    _play(state.queue[state.queueIdx]);
}

// ── UI плеера ─────────────────────────────────────────────────────────────────

function setPlayIcon(playing) {
    dom.pPlayPause.innerHTML = playing
        ? '<i class="fas fa-pause"></i>'
        : '<i class="fas fa-play"></i>';
}

function updateRepeatBtn() {
    dom.pRepeat.classList.toggle('active', state.repeat !== 'none');
    dom.pRepeat.innerHTML = state.repeat === 'one'
        ? '<i class="fas fa-repeat-1"></i>'
        : '<i class="fas fa-repeat"></i>';
    dom.pRepeat.title = { none: 'Повтор выкл.', all: 'Повтор альбома', one: 'Повтор трека' }[state.repeat];
}

function updateShuffleBtn() {
    dom.pShuffle.classList.toggle('active', state.shuffle);
}

function updateVolIcon(vol) {
    let icon;
    if (vol === 0) icon = 'fa-volume-xmark';
    else if (vol < 0.4) icon = 'fa-volume-low';
    else icon = 'fa-volume-high';
    dom.pVolIcon.innerHTML = `<i class="fas ${icon}"></i>`;
}

// ── аудио-события ─────────────────────────────────────────────────────────────

audio.addEventListener('play',  () => setPlayIcon(true));
audio.addEventListener('pause', () => setPlayIcon(false));
audio.addEventListener('ended', playNext);

audio.addEventListener('timeupdate', () => {
    if (!audio.duration || isNaN(audio.duration)) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    dom.progressFill.style.width = `${pct}%`;
    dom.pTimeCur.textContent     = fmt(audio.currentTime);
});

audio.addEventListener('loadedmetadata', () => {
    dom.pTimeTotal.textContent = fmt(audio.duration);
});

audio.addEventListener('error', () => {
    console.error('Audio error:', audio.error);
});

// ── управление ────────────────────────────────────────────────────────────────

dom.pPlayPause.addEventListener('click', () => {
    if (audio.paused) audio.play();
    else audio.pause();
});

dom.pPrev.addEventListener('click', playPrev);
dom.pNext.addEventListener('click', playNext);

dom.pRepeat.addEventListener('click', () => {
    const modes = ['none', 'all', 'one'];
    state.repeat = modes[(modes.indexOf(state.repeat) + 1) % modes.length];
    updateRepeatBtn();
});

dom.pShuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    updateShuffleBtn();
    // Перестроить очередь если что-то играет
    if (state.queue.length) {
        const cur = state.queue[state.queueIdx];
        const origIdx = state.queue.indexOf(cur);
        buildQueue(state.queue, origIdx);
    }
});

dom.progressTrack.addEventListener('click', e => {
    if (!audio.duration) return;
    const r = dom.progressTrack.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
});

// Touch-scrubbing для мобильных
dom.progressTrack.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    const r = dom.progressTrack.getBoundingClientRect();
    if (audio.duration) audio.currentTime = ((touch.clientX - r.left) / r.width) * audio.duration;
}, { passive: true });

dom.pVolume.addEventListener('input', e => {
    audio.volume = +e.target.value;
    updateVolIcon(audio.volume);
});

dom.pVolIcon.addEventListener('click', () => {
    if (audio.volume > 0) {
        dom.pVolIcon._savedVol = audio.volume;
        audio.volume = 0;
        dom.pVolume.value = 0;
    } else {
        audio.volume = dom.pVolIcon._savedVol || 0.8;
        dom.pVolume.value = audio.volume;
    }
    updateVolIcon(audio.volume);
});

// ── навигация ─────────────────────────────────────────────────────────────────

dom.backBtn.addEventListener('click', goBack);

dom.rescanBtn.addEventListener('click', async () => {
    dom.rescanBtn.classList.add('spinning');
    try {
        await fetch('/rescan', { method: 'POST' });
        // Через 2 сек перезагружаем треки
        setTimeout(async () => {
            await loadTracks();
            dom.rescanBtn.classList.remove('spinning');
        }, 2000);
    } catch {
        dom.rescanBtn.classList.remove('spinning');
    }
});

// Клавиатурные шорткаты
document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); dom.pPlayPause.click(); }
    if (e.code === 'ArrowRight') { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); }
    if (e.code === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); }
    if (e.code === 'ArrowUp')    { e.preventDefault(); audio.volume = Math.min(1, audio.volume + .05); dom.pVolume.value = audio.volume; updateVolIcon(audio.volume); }
    if (e.code === 'ArrowDown')  { e.preventDefault(); audio.volume = Math.max(0, audio.volume - .05); dom.pVolume.value = audio.volume; updateVolIcon(audio.volume); }
});

// ── загрузка треков ───────────────────────────────────────────────────────────

async function loadTracks() {
    dom.content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Загрузка библиотеки…</p></div>`;
    try {
        const res = await fetch('/tracks');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        buildIndex(data.tracks || []);
        renderHome();
    } catch (err) {
        dom.content.innerHTML = `
            <div class="empty-state">
                <div class="emoji">⚠️</div>
                <p>Не удалось загрузить библиотеку.<br><small>${esc(err.message)}</small></p>
            </div>`;
    }
}

// ── склонение числительных ────────────────────────────────────────────────────

function plural(n, one, few, many) {
    const mod10  = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
    return `${n} ${many}`;
}

// ── старт ─────────────────────────────────────────────────────────────────────

updateRepeatBtn();
updateShuffleBtn();
loadTracks();
