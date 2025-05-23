const soundboard = document.getElementById('soundboard');
const videoInput = document.getElementById('videoInput');
const timestampInput = document.getElementById('timestampInput');
const addButton = document.getElementById('addButton');

// Load soundboard from cookies
function loadSoundboard() {
    const soundboardData = getCookie('soundboard');
    if (soundboardData) {
        const soundboardArray = JSON.parse(soundboardData);
        soundboardArray.forEach(item => {
            addSoundButton(item.video, item.timestamp);
        });
    }
}

// Save soundboard to cookies
function saveSoundboard() {
    const buttons = soundboard.getElementsByTagName('button');
    const soundboardArray = [];
    for (let button of buttons) {
        const [video, timestamp] = button.dataset.value.split(',');
        soundboardArray.push({ video, timestamp });
    }
    setCookie('soundboard', JSON.stringify(soundboardArray), 7);
}

// Add sound button to the soundboard
function addSoundButton(video, timestamp) {
    const button = document.createElement('button');
    button.innerText = `Play ${video} at ${timestamp}`;
    button.dataset.value = `${video},${timestamp}`;
    button.onclick = () => playSound(video, timestamp);
    soundboard.appendChild(button);
    saveSoundboard();
}

// Play sound from YouTube
function playSound(video, timestamp) {
    const audio = new Audio(`https://www.youtube.com/watch?v=${video}&t=${timestamp}`);
    audio.play();
}

// Event listener for adding a new sound
addButton.addEventListener('click', () => {
    const video = videoInput.value;
    const timestamp = timestampInput.value;
    if (video && timestamp) {
        addSoundButton(video, timestamp);
        videoInput.value = '';
        timestampInput.value = '';
    }
});

// Load soundboard on page load
window.onload = loadSoundboard;

// Cookie management functions
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
}

function deleteCookie(name) {
    setCookie(name, '', -1);
}