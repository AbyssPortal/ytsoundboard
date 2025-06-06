// Helper: get/set cookies
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

// Soundboard logic
const soundboardKey = 'ytSoundboard';
let soundboard = [];

function saveSoundboard() {
    setCookie(soundboardKey, JSON.stringify(soundboard));
}
function loadSoundboard() {
    const data = getCookie(soundboardKey);
    if (data) {
        try { soundboard = JSON.parse(data); } catch { }
    }
}

function extractVideoId(url) {
    const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
    return match ? match[1] : null;
}

// IndexedDB helpers for storing audio files
const DB_NAME = 'SoundboardAudioDB';
const DB_STORE = 'audioFiles';
function openAudioDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function saveAudioFile(file, label) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        const entry = { label, name: file.name, type: file.type, data: file };
        const req = store.add(entry);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function getAudioFile(id) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Add audio file to soundboard
const audioFileInput = document.getElementById('audioFileInput');
document.getElementById('addAudioBtn').onclick = async function () {
    const file = audioFileInput.files[0];
    const labelInput = document.getElementById('audioLabelInput');
    const label = labelInput.value.trim() || (file ? file.name.replace(/\.[^/.]+$/, "") : "");
    if (!file) { alert('No file selected!'); return; }
    try {
        const id = await saveAudioFile(file, label);
        soundboard.push({ type: 'local', audioId: id, label });
        saveSoundboard();
        renderSoundboard();
        audioFileInput.value = '';
        if (labelInput) labelInput.value = '';
    } catch (err) {
        alert('Failed to save audio: ' + err);
    }
};

function renderSoundboard() {
    const board = document.getElementById('soundboard');
    board.innerHTML = '';
    soundboard.forEach((item, idx) => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';
        // Sound button
        const btn = document.createElement('button');
        btn.className = 'sound-btn';
        let label = item.label || 'Sound ' + (idx + 1);
        if (item.type === 'local') label += ' (file)';
        btn.innerHTML = `<span>${label}</span><button class='remove-btn' title='Remove'>&times;</button>`;
        btn.onclick = (e) => {
            if (e.target.classList.contains('remove-btn')) {
                soundboard.splice(idx, 1);
                saveSoundboard();
                renderSoundboard();
            } else {
                playClip(item, idx);
            }
        };
        // Volume bar
        const vol = document.createElement('input');
        vol.type = 'range';
        vol.min = 0; vol.max = 100; vol.value = item.volume !== undefined ? item.volume : 100;
        vol.title = 'Volume';
        vol.style.width = '80px';
        vol.oninput = function () {
            soundboard[idx].volume = parseInt(this.value, 10);
            saveSoundboard();
        };
        wrapper.appendChild(btn);
        wrapper.appendChild(vol);
        board.appendChild(wrapper);
    });
}

let ytPlayer;
let ytPlayerReady = false;
let currentlyPlayingIdx = null;
let currentAudio = null;
// Debug flag
const is_debug = false; // Set to false to hide the player
function playClip(item, idx) {
    stop_any_playing();
    if (item.type === 'local') {
        playLocalAudio(item, idx);
        return;
    }
    if (currentlyPlayingIdx === idx && window.ytPlayer && ytPlayerReady) {
        stopCurrentSound();
        return;
    }
    currentlyPlayingIdx = idx;
    const playerDiv = document.getElementById('player');
    const errorDivId = 'yt-error-msg';
    // Remove any previous error
    let prevError = document.getElementById(errorDivId);
    if (prevError) prevError.remove();
    if (is_debug) {
        // If in debug mode, show the player
        playerDiv.style.display = 'block';
        playerDiv.style.position = 'fixed';
        playerDiv.style.left = '0';
        playerDiv.style.right = '0';
        playerDiv.style.bottom = '0';
        playerDiv.style.width = '100%';
        playerDiv.style.height = '120px';
        playerDiv.style.background = '#222';
        playerDiv.style.zIndex = '9999';
    }
    const volume = item.volume !== undefined ? item.volume : 100;
    // If player is ready, play immediately
    if (window.ytPlayer && ytPlayerReady) {
        try {
            window.ytPlayer.setVolume(volume);
            window.ytPlayer.loadVideoById({
                videoId: item.videoId,
                startSeconds: item.start,
                endSeconds: item.end,
                suggestedQuality: 'small'
            });
            window.ytPlayer.playVideo();
        } catch (err) {
            showYTError('This sound cannot be played in an iframe.');
        }
        return;
    }
    // If player exists but not ready, wait for it to be ready, then play
    if (window.ytPlayer && !ytPlayerReady) {
        // If the player is not ready, but ytPlayerReady is false because the player was destroyed after ENDED,
        // we need to recreate the player, not just wait for it to be ready (which will never happen)
        // So, check if the player is attached to the DOM
        const iframe = document.getElementById('yt-iframe-api');
        if (!iframe) {
            // The player was destroyed, so recreate it
            playerDiv.innerHTML = `<div id="yt-iframe-api"></div>`;
            ytPlayerReady = false;
            createPlayer();
            return;
        }
        // Otherwise, wait for it to be ready
        let interval = setInterval(() => {
            if (ytPlayerReady) {
                clearInterval(interval);
                playClip(item, idx);
            }
        }, 50);
        return;
    }
    // Otherwise, create the player
    playerDiv.innerHTML = `<div id="yt-iframe-api"></div>`;
    ytPlayerReady = false;
    function createPlayer() {
        if (window.ytPlayer) window.ytPlayer.destroy();
        window.ytPlayer = new YT.Player('yt-iframe-api', {
            height: is_debug ? '120' : '1', width: is_debug ? '320' : '1',
            videoId: item.videoId,
            playerVars: {
                autoplay: 1,
                start: item.start,
                end: item.end
            },
            events: {
                'onReady': function (event) {
                    ytPlayerReady = true;
                    try {
                        event.target.setVolume(volume);
                        event.target.playVideo();
                    } catch (err) {
                        showYTError('This sound cannot be played in an iframe.');
                    }
                },
                'onError': function (event) {
                    showYTError('This sound cannot be played in an iframe.');
                },
                'onStateChange': function (event) {
                    if (event.data === YT.PlayerState.ENDED) {
                        // Don't delete the iframe, just hide the player if not in debug mode
                        if (!is_debug) playerDiv.style.display = 'none';
                        currentlyPlayingIdx = null;
                        // ytPlayerReady = true;
                    }
                }
            }
        });
    }
    if (window.YT && window.YT.Player) {
        createPlayer();
    } else {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
        window.onYouTubeIframeAPIReady = createPlayer;
    }
    // Error display helper
    function showYTError(msg) {
        let err = document.createElement('div');
        err.id = errorDivId;
        err.textContent = msg;
        err.style.background = '#ff5252';
        err.style.color = '#fff';
        err.style.padding = '10px';
        err.style.margin = '10px auto';
        err.style.textAlign = 'center';
        err.style.borderRadius = '6px';
        err.style.maxWidth = '400px';
        err.style.fontWeight = 'bold';
        err.style.zIndex = '10000';
        document.body.appendChild(err);
        setTimeout(() => { if (err.parentNode) err.parentNode.removeChild(err); }, 4000);
    }
}

function playLocalAudio(item, idx) {
    stop_any_playing();
    currentlyPlayingIdx = idx;
    getAudioFile(item.audioId).then(entry => {
        if (!entry) { alert('Audio not found!'); return; }
        const url = URL.createObjectURL(entry.data);
        const audio = new Audio(url);
        audio.volume = (item.volume !== undefined ? item.volume : 100) / 100;
        audio.onended = () => {
            currentlyPlayingIdx = null;
            URL.revokeObjectURL(url);
        };
        audio.play();
        currentAudio = audio;
    });
}

function stop_any_playing() {
    if (window.ytPlayer && ytPlayerReady) {
        try { window.ytPlayer.stopVideo(); } catch (err) {}
    }
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    currentlyPlayingIdx = null;
}

function stopCurrentSound() {
    stop_any_playing();
}

// Parse timestamp in hh:mm:ss, mm:ss, or ss format
function parseTimestamp(str) {
    if (typeof str === 'number') return str;
    str = String(str).trim();
    if (/^\d+$/.test(str)) return parseInt(str, 10); // ss
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 3) {
        // hh:mm:ss
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        // mm:ss
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        return parts[0];
    }
    return NaN;
}

document.getElementById('addForm').onsubmit = function (e) {
    e.preventDefault();
    const link = document.getElementById('ytLink').value.trim();
    const start = parseTimestamp(document.getElementById('startTime').value);
    const end = parseTimestamp(document.getElementById('endTime').value);
    const label = document.getElementById('label').value.trim();
    const videoId = extractVideoId(link);
    if (!videoId || isNaN(start) || isNaN(end) || end <= start) {
        alert('Invalid input!');
        return;
    }
    soundboard.push({ videoId, start, end, label });
    saveSoundboard();
    renderSoundboard();
    this.reset();
};

// --- Import/Export UI ---
function addImportExportUI() {
    const container = document.querySelector('.container');
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '12px';
    controls.style.marginBottom = '18px';
    controls.style.alignItems = 'center';

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export Soundboard';
    exportBtn.onclick = function () {
        const data = JSON.stringify(soundboard, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'soundboard.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    };

    // Import input
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.style.display = 'none';

    // Import button
    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import Soundboard';
    importBtn.onclick = () => importInput.click();

    // Destructive checkbox
    const destructiveLabel = document.createElement('label');
    destructiveLabel.style.display = 'flex';
    destructiveLabel.style.alignItems = 'center';
    destructiveLabel.style.gap = '4px';
    const destructiveCheckbox = document.createElement('input');
    destructiveCheckbox.type = 'checkbox';
    destructiveCheckbox.checked = false; // Non-destructive by default
    destructiveLabel.appendChild(destructiveCheckbox);
    destructiveLabel.appendChild(document.createTextNode('Destructive import (replace all)'));

    importInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const imported = JSON.parse(ev.target.result);
                if (!Array.isArray(imported)) throw new Error('Invalid format');
                if (destructiveCheckbox.checked) {
                    soundboard = imported;
                } else {
                    // Non-destructive: merge, avoid duplicates by videoId/start/end
                    const key = x => `${x.videoId}|${x.start}|${x.end}`;
                    const existing = new Set(soundboard.map(key));
                    for (const item of imported) {
                        if (!existing.has(key(item))) {
                            soundboard.push(item);
                        }
                    }
                }
                saveSoundboard();
                renderSoundboard();
                alert('Soundboard imported!');
            } catch (err) {
                alert('Failed to import: ' + err.message);
            }
        };
        reader.readAsText(file);
        importInput.value = '';
    };

    controls.appendChild(exportBtn);
    controls.appendChild(importBtn);
    controls.appendChild(importInput);
    controls.appendChild(destructiveLabel);
    container.insertBefore(controls, container.firstChild);
}

// NUMPAD BINDINGS
const NUMPAD_KEYS = [
    'Numpad7','Numpad8','Numpad9',
    'Numpad4','Numpad5','Numpad6',
    'Numpad1','Numpad2','Numpad3',
    'Numpad0','NumpadDecimal','NumpadEnter'
];
const NUMPAD_LABELS = ['7','8','9','4','5','6','1','2','3','0','.','Enter'];
let numpadBindings = {};

function saveNumpadBindings() {
    setCookie('ytNumpadBindings', JSON.stringify(numpadBindings));
}
function loadNumpadBindings() {
    const data = getCookie('ytNumpadBindings');
    if (data) {
        try { numpadBindings = JSON.parse(data); } catch {}
    }
}

function renderNumpadGrid() {
    const grid = document.getElementById('numpad-grid');
    grid.innerHTML = '';
    NUMPAD_KEYS.forEach((key, i) => {
        const btn = document.createElement('button');
        btn.textContent = NUMPAD_LABELS[i];
        btn.style.height = '40px';
        btn.style.fontWeight = 'bold';
        btn.style.background = numpadBindings[key] !== undefined ? '#ff5252' : '#333';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #444';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.title = numpadBindings[key] !== undefined ? `Bound to sound #${numpadBindings[key]+1}` : 'Unbound';
        btn.onclick = () => {
            // Open a selector to bind/unbind
            openNumpadBindDialog(key);
        };
        grid.appendChild(btn);
    });
}

function openNumpadBindDialog(numpadKey) {
    // Show a prompt to select a sound or unbind
    let msg = 'Bind numpad key ' + NUMPAD_LABELS[NUMPAD_KEYS.indexOf(numpadKey)] + ' to which sound? (1-' + soundboard.length + ', 0 to unbind)';
    let current = numpadBindings[numpadKey];
    let input = prompt(msg, current !== undefined ? (current+1) : '');
    if (input === null) return;
    let idx = parseInt(input, 10);
    if (isNaN(idx) || idx < 0 || idx > soundboard.length) return;
    if (idx === 0) {
        delete numpadBindings[numpadKey];
    } else {
        numpadBindings[numpadKey] = idx-1;
    }
    saveNumpadBindings();
    renderNumpadGrid();
}

// Listen for numpad keydown globally
window.addEventListener('keydown', function(e) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (numpadBindings[e.code] !== undefined && soundboard[numpadBindings[e.code]]) {
        playClip(soundboard[numpadBindings[e.code]], numpadBindings[e.code]);
        e.preventDefault();
    }
});

// Init
loadSoundboard();
renderSoundboard();
addImportExportUI();
document.getElementById('stopAllBtn').onclick = stopCurrentSound;
loadNumpadBindings();
renderNumpadGrid();

// Also call renderNumpadGrid() after renderSoundboard() to update UI if sounds change
const origRenderSoundboard = renderSoundboard;
renderSoundboard = function() {
    origRenderSoundboard.apply(this, arguments);
    renderNumpadGrid();
};