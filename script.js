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
        btn.innerHTML = `<span>${item.label || 'Sound ' + (idx + 1)}</span><button class='remove-btn' title='Remove'>&times;</button>`;
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
// Debug flag
const is_debug = false; // Set to false to hide the player
function playClip(item, idx) {
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

function stopCurrentSound() {
    if (window.ytPlayer && ytPlayerReady) {
        try {
            window.ytPlayer.stopVideo();
        } catch (err) {}
    }
    currentlyPlayingIdx = null;
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

// Init
loadSoundboard();
renderSoundboard();
addImportExportUI();