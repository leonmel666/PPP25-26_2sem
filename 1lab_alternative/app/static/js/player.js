// ----- глобальное состояние -----
let tracks = [];
let artists = new Map();
let singles = [];
let currentStack = [];
let currentAudio = new Audio();
let currentTrackObj = null;
let isPlaying = false;

let repeatMode = 'none';
let shuffleMode = false;
let originalQueue = [];
let currentQueue = [];
let currentQueueIndex = 0;

// DOM элементы
const contentDiv = document.getElementById('content');
const backBtn = document.getElementById('backBtn');
const breadcrumbSpan = document.getElementById('breadcrumb');
const rescanBtn = document.getElementById('rescanBtn');
const nowPlayingBar = document.getElementById('nowPlayingBar');
const npCover = document.getElementById('npCover');
const npTitle = document.getElementById('npTitle');
const npArtist = document.getElementById('npArtist');
const npPlayPause = document.getElementById('npPlayPause');
const npPrev = document.getElementById('npPrev');
const npNext = document.getElementById('npNext');
const progressFill = document.getElementById('progressFill');
const progressBarBg = document.getElementById('progressBarBg');
const currentTimeSpan = document.getElementById('currentTime');
const totalTimeSpan = document.getElementById('totalTime');
const volumeSlider = document.getElementById('volumeSlider');
const volumeIcon = document.getElementById('volumeIcon');
const repeatBtn = document.getElementById('repeatBtn');
const shuffleBtn = document.getElementById('shuffleBtn');

// ----- вспомогательные функции -----
function formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ----- загрузка треков с API -----
async function loadTracks() {
    try {
        const resp = await fetch('/tracks');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        tracks = data.tracks || [];
        buildIndex();
        renderHome();
    } catch (err) {
        contentDiv.innerHTML = `<div style="text-align:center; padding:40px;">❌ Ошибка загрузки: ${err.message}</div>`;
    }
}

// группировка по исполнителям и альбомам
function buildIndex() {
    artists.clear();
    singles = [];
    for (const track of tracks) {
        const artist = track.artist || 'Unknown Artist';
        const album = track.album || '';
        if (!album) {
            singles.push(track);
            continue;
        }
        if (!artists.has(artist)) {
            artists.set(artist, { albums: new Map() });
        }
        const artistData = artists.get(artist);
        if (!artistData.albums.has(album)) {
            artistData.albums.set(album, []);
        }
        artistData.albums.get(album).push(track);
    }
    for (const artistData of artists.values()) {
        for (const trackList of artistData.albums.values()) {
            trackList.sort((a, b) => (a.file || '').localeCompare(b.file || ''));
        }
    }
    singles.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

// ----- рендер -----
function renderHome() {
    const artistsList = Array.from(artists.keys()).sort();
    if (artistsList.length === 0 && singles.length === 0) {
        contentDiv.innerHTML = '<div style="text-align:center; padding:40px;">🎵 Нет треков. Добавьте музыку в папку "music".</div>';
        return;
    }
    let html = `<h2 style="margin-bottom: 8px;">Исполнители</h2><div class="grid">`;
    for (const artist of artistsList) {
        html += `
            <div class="card" data-type="artist" data-value="${escapeHtml(artist)}">
                <div class="card-img" style="background: #3a3a5a; display: flex; align-items: center; justify-content: center; font-size: 3rem;">🎤</div>
                <div class="card-title">${escapeHtml(artist)}</div>
                <div class="card-sub">${artists.get(artist).albums.size} альбомов</div>
            </div>
        `;
    }
    if (singles.length) {
        html += `<div class="card" data-type="singles" data-value="singles">
                    <div class="card-img" style="background: #3a3a5a; display: flex; align-items: center; justify-content: center; font-size: 3rem;">🎵</div>
                    <div class="card-title">Синглы</div>
                    <div class="card-sub">${singles.length} треков</div>
                </div>`;
    }
    html += `</div>`;
    contentDiv.innerHTML = html;
    attachCardListeners();
    currentStack = [];
    breadcrumbSpan.textContent = 'Главная';
}

function renderArtist(artistName) {
    const artistData = artists.get(artistName);
    if (!artistData) {
        renderHome();
        return;
    }
    const albums = Array.from(artistData.albums.keys()).sort();
    let html = `<h2 style="margin-bottom: 8px;">${escapeHtml(artistName)}</h2><div class="grid">`;
    for (const album of albums) {
        const tracksCount = artistData.albums.get(album).length;
        const coverUrl = `/cover/album/${encodeURIComponent(album)}`;
        html += `
            <div class="card" data-type="album" data-artist="${escapeHtml(artistName)}" data-album="${escapeHtml(album)}">
                <img class="card-img" src="${coverUrl}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'50\' y=\'55\' text-anchor=\'middle\' fill=\'%23999\' font-size=\'12\'%3E🎵%3C/text%3E%3C/svg%3E'">
                <div class="card-title">${escapeHtml(album)}</div>
                <div class="card-sub">${tracksCount} треков</div>
            </div>
        `;
    }
    html += `</div>`;
    contentDiv.innerHTML = html;
    attachCardListeners();
    currentStack = [{ type: 'artist', id: artistName, name: artistName }];
    breadcrumbSpan.textContent = `${artistName}`;
}

function renderAlbum(artistName, albumName) {
    const artistData = artists.get(artistName);
    if (!artistData) return;
    const trackList = artistData.albums.get(albumName);
    if (!trackList) return;
    let html = `<h2>${escapeHtml(albumName)}</h2>
                <div class="track-list">`;
    trackList.forEach((track, idx) => {
        html += `
            <div class="track-item" data-track-index="${idx}" data-artist="${escapeHtml(artistName)}" data-album="${escapeHtml(albumName)}">
                <div class="track-number">${(idx+1).toString().padStart(2,'0')}</div>
                <div class="track-info">
                    <div class="track-title">${escapeHtml(track.title)}</div>
                    <div class="track-artist">${escapeHtml(track.artist)}</div>
                </div>
                <div class="track-duration">${formatTime(track.duration)}</div>
            </div>
        `;
    });
    html += `</div>`;
    contentDiv.innerHTML = html;
    document.querySelectorAll('.track-item').forEach(el => {
        const idx = parseInt(el.dataset.trackIndex);
        const track = trackList[idx];
        if (track) {
            el.addEventListener('click', () => playTrack(track, trackList, idx));
        }
    });
    currentStack.push({ type: 'album', id: albumName, name: albumName, artist: artistName });
    breadcrumbSpan.textContent = `${artistName} / ${albumName}`;
}

function renderSingles() {
    let html = `<h2>Синглы (вне альбомов)</h2><div class="track-list">`;
    singles.forEach((track, idx) => {
        html += `
            <div class="track-item" data-single-index="${idx}">
                <div class="track-number">${(idx+1).toString().padStart(2,'0')}</div>
                <div class="track-info">
                    <div class="track-title">${escapeHtml(track.title)}</div>
                    <div class="track-artist">${escapeHtml(track.artist)}</div>
                </div>
                <div class="track-duration">${formatTime(track.duration)}</div>
            </div>
        `;
    });
    html += `</div>`;
    contentDiv.innerHTML = html;
    document.querySelectorAll('.track-item').forEach(el => {
        const idx = parseInt(el.dataset.singleIndex);
        if (!isNaN(idx)) {
            el.addEventListener('click', () => playTrack(singles[idx], singles, idx));
        }
    });
    currentStack = [{ type: 'singles', id: 'singles', name: 'Синглы' }];
    breadcrumbSpan.textContent = 'Синглы';
}

function attachCardListeners() {
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', (e) => {
            const type = card.dataset.type;
            if (type === 'artist') {
                const artist = card.dataset.value;
                renderArtist(artist);
            } else if (type === 'album') {
                const artist = card.dataset.artist;
                const album = card.dataset.album;
                renderAlbum(artist, album);
            } else if (type === 'singles') {
                renderSingles();
            }
        });
    });
}

// ----- управление очередью -----
function initQueue(tracklist, startIndex) {
    originalQueue = [...tracklist];
    if (shuffleMode) {
        const shuffled = [...originalQueue];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const currentTrack = shuffled.find(t => t.file === originalQueue[startIndex].file);
        const idx = shuffled.indexOf(currentTrack);
        if (idx !== -1) shuffled.splice(idx, 1);
        currentQueue = [originalQueue[startIndex], ...shuffled];
        currentQueueIndex = 0;
    } else {
        currentQueue = [...originalQueue];
        currentQueueIndex = startIndex;
    }
}

function updateRepeatButton() {
    if (!repeatBtn) return;
    repeatBtn.innerHTML = repeatMode === 'one' ? '<i class="fas fa-repeat-1"></i>' : '<i class="fas fa-repeat"></i>';
    repeatBtn.style.opacity = repeatMode === 'none' ? '0.5' : '1';
}

function updateShuffleButton() {
    if (shuffleBtn) {
        shuffleBtn.style.opacity = shuffleMode ? '1' : '0.5';
    }
}

function nextTrack() {
    if (!currentTrackObj) return;
    if (repeatMode === 'one') {
        playTrack(currentTrackObj.track, currentTrackObj.tracklist, currentTrackObj.index);
        return;
    }
    if (currentQueueIndex + 1 < currentQueue.length) {
        const nextTrackObj = currentQueue[currentQueueIndex + 1];
        const origIndex = currentTrackObj.tracklist.findIndex(t => t.file === nextTrackObj.file);
        playTrack(nextTrackObj, currentTrackObj.tracklist, origIndex);
    } else {
        if (repeatMode === 'all') {
            const firstTrack = currentQueue[0];
            const origIndex = currentTrackObj.tracklist.findIndex(t => t.file === firstTrack.file);
            playTrack(firstTrack, currentTrackObj.tracklist, origIndex);
        } else {
            currentAudio.pause();
            isPlaying = false;
            npPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        }
    }
}

function prevTrack() {
    if (!currentTrackObj) return;
    if (currentQueueIndex - 1 >= 0) {
        const prevTrackObj = currentQueue[currentQueueIndex - 1];
        const origIndex = currentTrackObj.tracklist.findIndex(t => t.file === prevTrackObj.file);
        playTrack(prevTrackObj, currentTrackObj.tracklist, origIndex);
    } else {
        const firstTrack = currentQueue[0];
        const origIndex = currentTrackObj.tracklist.findIndex(t => t.file === firstTrack.file);
        playTrack(firstTrack, currentTrackObj.tracklist, origIndex);
    }
}

// ----- плеер -----
function playTrack(track, tracklist, index) {
    if (!track) return;
    const streamUrl = `/stream/${encodeURIComponent(track.file)}`;
    currentAudio.src = streamUrl;
    currentTrackObj = { track, tracklist, index };
    if (!currentQueue.length || currentQueue[0]?.file !== tracklist[0]?.file || shuffleMode !== (currentQueue.length !== tracklist.length)) {
        initQueue(tracklist, index);
    } else {
        currentQueueIndex = currentQueue.findIndex(t => t.file === track.file);
        if (currentQueueIndex === -1) initQueue(tracklist, index);
    }
    currentAudio.load();
    currentAudio.play().then(() => {
        isPlaying = true;
        npPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
        updateNowPlayingUI();
        showPlayerBar();
        nowPlayingBar.style.display = 'flex';
    }).catch(e => {
        console.warn('play error', e);
        isPlaying = false;
        npPlayPause.innerHTML = '<i class="fas fa-play"></i>';
    });
    const coverUrl = track.album ? `/cover/album/${encodeURIComponent(track.album)}` : `/cover/track/${encodeURIComponent(track.file)}`;
    npCover.src = coverUrl;
    npCover.onerror = () => {
        npCover.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' fill=\'%23333\'/%3E%3Ctext x=\'50\' y=\'55\' text-anchor=\'middle\' fill=\'%23999\' font-size=\'12\'%3E🎵%3C/text%3E%3C/svg%3E';
    };
    npTitle.textContent = track.title || 'Без названия';
    npArtist.textContent = track.artist || 'Unknown';
}

function updateNowPlayingUI() {
    if (!currentTrackObj) return;
    npTitle.textContent = currentTrackObj.track.title || 'Без названия';
    npArtist.textContent = currentTrackObj.track.artist || 'Unknown';
}

// ----- скрываемый плеер -----
let hideTimeout;
function showPlayerBar() {
    if (nowPlayingBar) {
        nowPlayingBar.classList.add('expanded');
        if (hideTimeout) clearTimeout(hideTimeout);
    }
}
function hidePlayerBar() {
    if (nowPlayingBar && !nowPlayingBar.matches(':hover') && !trigger?.matches(':hover')) {
        nowPlayingBar.classList.remove('expanded');
    }
}
const trigger = document.createElement('div');
trigger.className = 'player-trigger';
document.body.appendChild(trigger);
trigger.addEventListener('mouseenter', showPlayerBar);
nowPlayingBar?.addEventListener('mouseenter', () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    showPlayerBar();
});
nowPlayingBar?.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(hidePlayerBar, 300);
});
trigger.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(hidePlayerBar, 300);
});

// ----- инициализация аудио-событий -----
function initAudioEvents() {
    currentAudio.addEventListener('timeupdate', () => {
        if (currentAudio.duration && !isNaN(currentAudio.duration)) {
            const percent = (currentAudio.currentTime / currentAudio.duration) * 100;
            progressFill.style.width = `${percent}%`;
            currentTimeSpan.textContent = formatTime(currentAudio.currentTime);
            totalTimeSpan.textContent = formatTime(currentAudio.duration);
        }
    });
    currentAudio.addEventListener('loadedmetadata', () => {
        totalTimeSpan.textContent = formatTime(currentAudio.duration);
    });
    currentAudio.addEventListener('ended', () => {
        nextTrack();
    });
    progressBarBg.addEventListener('click', (e) => {
        if (!currentAudio.duration) return;
        const rect = progressBarBg.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        currentAudio.currentTime = percent * currentAudio.duration;
    });
    volumeSlider.addEventListener('input', (e) => {
        currentAudio.volume = parseFloat(e.target.value);
        if (currentAudio.volume === 0) volumeIcon.innerHTML = '<i class="fas fa-volume-mute"></i>';
        else if (currentAudio.volume < 0.5) volumeIcon.innerHTML = '<i class="fas fa-volume-down"></i>';
        else volumeIcon.innerHTML = '<i class="fas fa-volume-up"></i>';
    });
    npPlayPause.addEventListener('click', () => {
        if (currentAudio.paused) {
            currentAudio.play();
            npPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            currentAudio.pause();
            npPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        }
    });
    npPrev.addEventListener('click', prevTrack);
    npNext.addEventListener('click', nextTrack);
    if (repeatBtn) {
        repeatBtn.addEventListener('click', () => {
            if (repeatMode === 'none') repeatMode = 'all';
            else if (repeatMode === 'all') repeatMode = 'one';
            else repeatMode = 'none';
            updateRepeatButton();
        });
    }
    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            shuffleMode = !shuffleMode;
            updateShuffleButton();
            if (currentTrackObj) initQueue(currentTrackObj.tracklist, currentTrackObj.index);
        });
    }
}

// ----- кнопка рескана -----
rescanBtn?.addEventListener('click', async () => {
    try {
        const resp = await fetch('/rescan', { method: 'POST' });
        const data = await resp.json();
        alert(data.status);
        setTimeout(() => location.reload(), 2000);
    } catch (err) {
        alert('Ошибка при запуске сканирования');
    }
});

// ----- навигация назад -----
backBtn?.addEventListener('click', () => {
    if (currentStack.length === 0) renderHome();
    else {
        const prev = currentStack.pop();
        if (currentStack.length === 0) renderHome();
        else if (currentStack[currentStack.length-1]?.type === 'artist') {
            renderArtist(currentStack[currentStack.length-1].id);
        } else if (currentStack[currentStack.length-1]?.type === 'album') {
            renderAlbum(currentStack[currentStack.length-1].artist, currentStack[currentStack.length-1].id);
        } else if (currentStack[currentStack.length-1]?.type === 'singles') {
            renderSingles();
        } else renderHome();
    }
});

// ----- запуск -----
initAudioEvents();
loadTracks();