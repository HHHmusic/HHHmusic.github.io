// === 专辑封面缓存 ===
let COVER_BLOB_URL = null;
async function blobToHash(blob) {
    if (!window.crypto || !window.crypto.subtle) {
        return null;
    }
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = window.indexedDB.open("album-cover-cache", 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("covers")) db.createObjectStore("covers");
        };
        req.onerror = reject;
        req.onsuccess = e => resolve(e.target.result);
    });
}
function getCoverFromDB(key) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction("covers", "readonly");
        const store = tx.objectStore("covers");
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result); // { blob, hash }
        req.onerror = reject;
    }));
}
function saveCoverToDB(key, value) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction("covers", "readwrite");
        const store = tx.objectStore("covers");
        const req = store.put(value, key);
        req.onsuccess = () => resolve(true);
        req.onerror = reject;
    }));
}

// === 专辑封面加载 ===
async function loadOrFetchCover(callback) {
    const cache = await getCoverFromDB(COVER_IMAGE);
    let localBlob = cache && cache.blob;
    let localHash = cache && cache.hash;

    if (!window.crypto || !window.crypto.subtle) {
        if (localBlob) {
            COVER_BLOB_URL = URL.createObjectURL(localBlob);
            if (typeof callback === "function") callback();
            return;
        }
    }

    const response = await fetch(COVER_IMAGE, {cache: "reload"});
    const blob = await response.blob();

    let hash = null;
    try {
        hash = await blobToHash(blob);
    } catch (e) {}

    if (hash && hash === localHash && localBlob) {
        COVER_BLOB_URL = URL.createObjectURL(localBlob);
    } else {
        COVER_BLOB_URL = URL.createObjectURL(blob);
        if (hash) {
            await saveCoverToDB(COVER_IMAGE, {blob, hash});
        }
    }
    if (typeof callback === "function") callback();
}
// === 播放逻辑 ===
const audioPlayer = document.getElementById('audioPlayer');
function getFirstPlayableTrack() {
    for(let i=0;i<playlist.length;i++) {
        if(playlist[i] && playlist[i].path) return i;
    }
    return null;
}
function getNextPlayableTrack(from) {
    for(let i=from+1;i<playlist.length;i++) {
        if(playlist[i] && playlist[i].path) return i;
    }
    for(let i=0;i<playlist.length;i++) {
        if(playlist[i] && playlist[i].path) return i;
    }
    return null;
}
function getPrevPlayableTrack(from) {
    for(let i=from-1;i>=0;i--) {
        if(playlist[i] && playlist[i].path) return i;
    }
    for(let i=playlist.length-1; i>=0; i--) {
        if(playlist[i] && playlist[i].path) return i;
    }
    return null;
}
const playlistContainer = document.getElementById('playlistContainer');
const songInfo = document.getElementById('songInfo');
let currentTrack = 0;
let pendingAutoPlay = false;

function tryAutoPlay() {
    audioPlayer.play().then(() => {
        pendingAutoPlay = false;
    }).catch(() => {
        pendingAutoPlay = true;
    });
}

function loadPlaylist() {
    playlistContainer.innerHTML = '';
    playlist.forEach((item, index) => {
        if (item.type === 'chapter') {
            const chapterDiv = document.createElement('div');
            chapterDiv.className = 'playlist-chapter';
            chapterDiv.id = item.title; 
            chapterDiv.innerHTML = `<span>${item.title}</span><span class="chapter-sep"></span>`;
            playlistContainer.appendChild(chapterDiv);
        } else {
            const musicDiv = document.createElement('div');
            musicDiv.className = 'playlist-item';
            musicDiv.textContent = item.name;
            musicDiv.dataset.index = index;
            musicDiv.addEventListener('click', () => playTrack(index, true));
            playlistContainer.appendChild(musicDiv);
        }
    });
}
function handleUrlNavigation() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackParam = urlParams.get('track') || urlParams.get('t');
    const chapterParam = urlParams.get('chapter');

    let targetIndex = -1;

    // 1. 处理单曲跳转
    if (trackParam) {
        targetIndex = playlist.findIndex(item => {
            if (item.path) {
                const cleanPath = item.path.replace(/[^a-zA-Z0-9]/g, '');
                return cleanPath === trackParam;
            }
            return false;
        });
    } 
    // 2. 处理章节跳转
    else if (chapterParam) {
        const chapterTitle = decodeURIComponent(chapterParam);
        // 找到章节在 playlist 中的索引
        const chapterIdx = playlist.findIndex(item => item.type === 'chapter' && item.title === chapterTitle);
        
        if (chapterIdx !== -1) {
            // 滚动到章节位置
            const targetChapter = document.getElementById(chapterTitle);
            if (targetChapter) {
                targetChapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // 找到章节后的第一首可播放曲目
            for (let i = chapterIdx + 1; i < playlist.length; i++) {
                if (playlist[i].path) {
                    targetIndex = i;
                    break;
                }
            }
        }
    }

    // 执行播放逻辑
    if (targetIndex !== -1) {
        playTrack(targetIndex, false);
        // 如果是单曲，滚动到具体曲目
        if (trackParam) {
            const targetEl = document.querySelector(`.playlist-item[data-index='${targetIndex}']`);
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // 清理 URL 参数，保留 hash (如果有的话)
    if (trackParam || chapterParam) {
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
    }
}
function updateSongInfo() {
    const track = playlist[currentTrack];
    songInfo.querySelector('h3').textContent = track.name;
    songInfo.querySelector('p').textContent = track.artist;
}
function updateActiveTrack() {
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active');
    });
    const currentItem = document.querySelector(`.playlist-item[data-index='${currentTrack}']`);
    if (currentItem) currentItem.classList.add('active');
}
function playTrack(index, userInitiated = false) {
    if (!playlist[index] || !playlist[index].path) return;
    currentTrack = index;
    audioPlayer.src = playlist[currentTrack].path;
    updateActiveTrack && updateActiveTrack();
    updateSongInfo && updateSongInfo();
    updateMediaSession && updateMediaSession();
    tryAutoPlay();
}
audioPlayer.addEventListener('ended', () => {
    const next = getNextPlayableTrack(currentTrack);
    if (next !== null) playTrack(next, false);
});

function listenVisibilityForAutoplay() {
    document.addEventListener('visibilitychange', () => {
        if (!audioPlayer.paused && !pendingAutoPlay) return;
        if (!document.hidden && pendingAutoPlay) {
            tryAutoPlay();
        }
    });
    window.addEventListener('focus', () => {
        if (!audioPlayer.paused && !pendingAutoPlay) return;
        if (pendingAutoPlay) {
            tryAutoPlay();
        }
    });
}


loadOrFetchCover(function() {
    loadPlaylist();
    updateActiveTrack();
    const urlParams = new URLSearchParams(window.location.search);
    const hasParam = urlParams.has('track') || urlParams.has('t') || urlParams.has('chapter');

    if (hasParam) {
        handleUrlNavigation();
    } else {
        const firstTrack = getFirstPlayableTrack();
        if(firstTrack !== null) playTrack(firstTrack, false);
    }
    listenVisibilityForAutoplay();
});
// === 全局按键控制 ===
window.addEventListener('keydown', function (e) {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    }

    if (e.code === 'ArrowLeft') {
        e.preventDefault();
        audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 5);
    }
    if (e.code === 'ArrowRight') {
        e.preventDefault();
        audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 5);
    }

    if (e.code === 'ArrowUp') {
        e.preventDefault();
        audioPlayer.volume = Math.min(1, audioPlayer.volume + 0.1);
    }
    if (e.code === 'ArrowDown') {
        e.preventDefault();
        audioPlayer.volume = Math.max(0, audioPlayer.volume - 0.1);
    }
});
// === 音乐专辑信息显示 ===
function updateMediaSession() {
    if ('mediaSession' in navigator && COVER_BLOB_URL) {
        const track = playlist[currentTrack];
        navigator.mediaSession.metadata = new window.MediaMetadata({
            title: track.name,
            artist: track.artist,
            album: '',
            artwork: [
                { src: COVER_BLOB_URL, sizes: '512x512', type: 'image/png' },
                { src: COVER_BLOB_URL, sizes: '192x192', type: 'image/png' }
            ]
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            playTrack(currentTrack === 0 ? playlist.length - 1 : currentTrack - 1);
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            playTrack((currentTrack + 1) % playlist.length);
        });
        navigator.mediaSession.setActionHandler('pause', () => { audioPlayer.pause(); });
        navigator.mediaSession.setActionHandler('play', () => { audioPlayer.play(); });
    }
}