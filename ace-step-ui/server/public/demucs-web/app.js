/**
 * Demucs Web - Stem Extraction for SunoAce
 */
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.all.mjs';
import { DemucsProcessor, CONSTANTS } from './src/index.js';

const { SAMPLE_RATE, TRAINING_SAMPLES, TRACKS, DEFAULT_MODEL_URL } = CONSTANTS;

const LOCAL_MODEL_URL = '../models/htdemucs_embedded.onnx';

let processor = null;
let audioContext = null;
let audioBuffer = null;
let isProcessing = false;

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const progressFill = document.getElementById('progressFill');
const status = document.getElementById('status');
const results = document.getElementById('results');
const trackList = document.getElementById('trackList');
const backendBadge = document.getElementById('backendBadge');
const audioFileName = document.getElementById('audioFileName');
const statusDetail = document.getElementById('statusDetail');
const statsRow = document.getElementById('statsRow');
const statElapsed = document.getElementById('statElapsed');
const statSegment = document.getElementById('statSegment');
const statSpeed = document.getElementById('statSpeed');
const statETA = document.getElementById('statETA');

let processStartTime = null;

function log(phase, message) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const logLine = document.createElement('div');
    logLine.className = 'text-zinc-400 py-1 border-b border-zinc-800/50 last:border-0';
    logLine.innerHTML = `<span class="text-emerald-400">[${timeStr}]</span> <span class="text-teal-400">[${phase}]</span> ${message}`;
    statusDetail.appendChild(logLine);
    statusDetail.scrollTop = statusDetail.scrollHeight;
    console.log(`[${phase}] ${message}`);
}

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function init() {
    let backend = 'wasm';

    if ('gpu' in navigator) {
        try {
            const gpuAdapter = await navigator.gpu.requestAdapter();
            if (gpuAdapter) {
                backend = 'webgpu';
            }
        } catch (e) {
            console.log('WebGPU not available:', e);
        }
    }

    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

    if (backend === 'webgpu') {
        ort.env.webgpu = ort.env.webgpu || {};
        ort.env.webgpu.powerPreference = 'high-performance';
        backendBadge.textContent = 'WebGPU (GPU)';
        backendBadge.className = 'badge badge-gpu';
    } else {
        const threads = navigator.hardwareConcurrency || 4;
        backendBadge.textContent = `WASM (${threads} threads)`;
        backendBadge.className = 'badge badge-cpu';
    }

    processor = new DemucsProcessor({
        ort,
        onProgress: ({ progress, currentSegment, totalSegments }) => {
            progressFill.style.width = (5 + progress * 90) + '%';

            const elapsed = (Date.now() - processStartTime) / 1000;
            statElapsed.textContent = formatTime(elapsed);
            statSegment.textContent = `${currentSegment}/${totalSegments}`;

            if (currentSegment > 0 && audioBuffer) {
                const processedDuration = (currentSegment / totalSegments) * audioBuffer.duration;
                const speed = processedDuration / elapsed;
                statSpeed.textContent = speed.toFixed(2) + 'x';

                const remainingSegments = totalSegments - currentSegment;
                const avgTimePerSegment = elapsed / currentSegment;
                const eta = remainingSegments * avgTimePerSegment;
                statETA.textContent = formatTime(eta);
            }
        },
        onLog: log,
        onDownloadProgress: (loaded, total) => {
            const percent = ((loaded / total) * 100).toFixed(1);
            const loadedMB = (loaded / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            status.textContent = `Downloading model... ${loadedMB}MB / ${totalMB}MB (${percent}%)`;
            progressFill.style.width = (loaded / total * 100) + '%';
        }
    });

    status.textContent = 'Loading AI model...';

    try {
        try {
            status.textContent = 'Downloading model (~172MB)...';
            await processor.loadModel(DEFAULT_MODEL_URL);
        } catch {
            status.textContent = 'Loading local model...';
            await processor.loadModel(LOCAL_MODEL_URL);
        }
        status.textContent = 'Ready - Select an audio file';
        progressFill.style.width = '0%';
    } catch (e) {
        status.textContent = 'Failed to load model: ' + e.message;
        console.error('Failed to load model:', e);
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE
    });

    // Check for audio URL parameter and auto-start
    const urlParams = new URLSearchParams(window.location.search);
    const audioUrl = urlParams.get('audioUrl');
    if (audioUrl) {
        await loadAudioFromUrl(audioUrl);
    }
}

async function loadAudioFromUrl(url) {
    try {
        status.textContent = 'Loading audio...';
        const fileName = decodeURIComponent(url.split('/').pop() || 'audio.mp3');
        audioFileName.textContent = fileName;

        // Force fresh fetch to avoid 304 Not Modified with empty body
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const duration = audioBuffer.duration.toFixed(1);
        status.textContent = `Loaded: ${duration}s - Starting extraction...`;
        processBtn.disabled = false;

        // Auto-start extraction
        setTimeout(() => startProcessing(), 500);
    } catch (e) {
        status.textContent = 'Failed to load audio: ' + e.message;
        console.error('Failed to load audio from URL:', e);
    }
}

// Drag and drop handlers
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-emerald-500', 'bg-emerald-500/5');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-emerald-500', 'bg-emerald-500/5');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-emerald-500', 'bg-emerald-500/5');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
        handleFile(file);
    }
});
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

async function handleFile(file) {
    audioFileName.textContent = file.name;
    status.textContent = 'Reading audio...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration.toFixed(1);
        status.textContent = `Loaded: ${duration}s - Ready to extract`;
        processBtn.disabled = false;
    } catch (e) {
        status.textContent = 'Failed to read audio: ' + e.message;
        console.error('Failed to decode audio:', e);
    }
}

processBtn.addEventListener('click', startProcessing);

async function startProcessing() {
    if (!audioBuffer || !processor || isProcessing) return;

    isProcessing = true;
    processBtn.disabled = true;
    processBtn.textContent = 'Processing...';
    results.classList.remove('visible');
    processStartTime = Date.now();
    statusDetail.innerHTML = '';
    statusDetail.classList.add('visible');
    statsRow.classList.add('visible');

    try {
        log('Init', 'Starting stem extraction...');
        status.textContent = 'Preparing audio...';
        progressFill.style.width = '2%';

        let leftChannel = audioBuffer.getChannelData(0);
        let rightChannel = audioBuffer.numberOfChannels > 1
            ? audioBuffer.getChannelData(1)
            : leftChannel;

        if (audioBuffer.sampleRate !== SAMPLE_RATE) {
            log('Resample', `${audioBuffer.sampleRate}Hz → ${SAMPLE_RATE}Hz`);
            const ratio = SAMPLE_RATE / audioBuffer.sampleRate;
            const newLength = Math.floor(leftChannel.length * ratio);
            const newLeft = new Float32Array(newLength);
            const newRight = new Float32Array(newLength);

            for (let i = 0; i < newLength; i++) {
                const srcIdx = i / ratio;
                const idx0 = Math.floor(srcIdx);
                const idx1 = Math.min(idx0 + 1, leftChannel.length - 1);
                const frac = srcIdx - idx0;
                newLeft[i] = leftChannel[idx0] * (1 - frac) + leftChannel[idx1] * frac;
                newRight[i] = rightChannel[idx0] * (1 - frac) + rightChannel[idx1] * frac;
            }

            leftChannel = newLeft;
            rightChannel = newRight;
        }

        status.textContent = 'Extracting stems...';
        const separatedTracks = await processor.separate(leftChannel, rightChannel);
        displayResults(separatedTracks);

        const totalTime = ((Date.now() - processStartTime) / 1000).toFixed(1);
        const speedRatio = (audioBuffer.duration / parseFloat(totalTime)).toFixed(2);

        log('Done', `Completed in ${totalTime}s (${speedRatio}x realtime)`);
        status.textContent = `Complete! Extracted 4 stems in ${totalTime}s`;
        progressFill.style.width = '100%';

    } catch (e) {
        status.textContent = 'Processing failed: ' + e.message;
        console.error('Processing failed:', e);
    }

    isProcessing = false;
    processBtn.disabled = false;
    processBtn.textContent = 'Extract Stems';
}

// Store track URLs for download all feature
let trackUrls = {};

function displayResults(tracks) {
    trackList.innerHTML = '';
    trackUrls = {};

    const TRACK_CONFIG = {
        drums: { icon: '🥁', label: 'Drums' },
        bass: { icon: '🎸', label: 'Bass' },
        other: { icon: '🎹', label: 'Instrumental' },
        vocals: { icon: '🎤', label: 'Vocals' }
    };

    for (const [name, track] of Object.entries(tracks)) {
        const config = TRACK_CONFIG[name] || { icon: '🎵', label: name };
        const trackBuffer = audioContext.createBuffer(2, track.left.length, SAMPLE_RATE);
        trackBuffer.getChannelData(0).set(track.left);
        trackBuffer.getChannelData(1).set(track.right);

        const audioBlob = audioBufferToWav(trackBuffer);
        const audioUrl = URL.createObjectURL(audioBlob);
        const trackId = `track-${name}`;
        const fileName = config.label.toLowerCase();

        // Store for download all
        trackUrls[fileName] = audioUrl;

        const trackDiv = document.createElement('div');
        trackDiv.className = 'track';
        trackDiv.innerHTML = `
            <div class="track-row">
                <div class="track-info">
                    <div class="track-icon ${name}">${config.icon}</div>
                    <div>
                        <div class="track-name">${config.label}</div>
                        <div class="track-duration">${formatTime(trackBuffer.duration)}</div>
                    </div>
                </div>

                <div class="track-player">
                    <button id="play-${trackId}" class="play-btn" onclick="togglePlay('${trackId}')">
                        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>

                    <div id="progress-bg-${trackId}" class="track-progress" onclick="seekTrack(event, '${trackId}')">
                        <div id="progress-${trackId}" class="track-progress-fill ${name}"></div>
                    </div>

                    <span id="time-${trackId}" class="track-time">0:00 / ${formatTime(trackBuffer.duration)}</span>
                </div>

                <a href="${audioUrl}" download="${fileName}.wav" class="download-btn">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    WAV
                </a>
            </div>

            <audio id="audio-${trackId}" src="${audioUrl}" preload="metadata"></audio>
        `;

        trackList.appendChild(trackDiv);

        const audio = document.getElementById(`audio-${trackId}`);
        audio.addEventListener('timeupdate', () => updateProgress(trackId, audio));
        audio.addEventListener('ended', () => resetPlayer(trackId));
    }

    results.classList.add('visible');
}

// Download all stems
window.downloadAllStems = function() {
    const entries = Object.entries(trackUrls);
    let index = 0;

    function downloadNext() {
        if (index >= entries.length) return;
        const [name, url] = entries[index];
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        index++;
        setTimeout(downloadNext, 500);
    }

    downloadNext();
};

// Player functions (global scope for onclick handlers)
window.togglePlay = function(trackId) {
    const audio = document.getElementById(`audio-${trackId}`);
    const playBtn = document.getElementById(`play-${trackId}`);

    // Pause all other tracks
    document.querySelectorAll('audio').forEach(a => {
        if (a.id !== `audio-${trackId}` && !a.paused) {
            a.pause();
            const otherId = a.id.replace('audio-', '');
            resetPlayer(otherId);
        }
    });

    if (audio.paused) {
        audio.play();
        playBtn.innerHTML = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>`;
    } else {
        audio.pause();
        playBtn.innerHTML = `<svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    }
};

window.seekTrack = function(event, trackId) {
    const audio = document.getElementById(`audio-${trackId}`);
    const progressBg = document.getElementById(`progress-bg-${trackId}`);
    const rect = progressBg.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
};

function updateProgress(trackId, audio) {
    const progress = document.getElementById(`progress-${trackId}`);
    const timeDisplay = document.getElementById(`time-${trackId}`);
    const percent = (audio.currentTime / audio.duration) * 100;
    progress.style.width = `${percent}%`;
    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
}

function resetPlayer(trackId) {
    const playBtn = document.getElementById(`play-${trackId}`);
    const progress = document.getElementById(`progress-${trackId}`);
    playBtn.innerHTML = `<svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    progress.style.width = '0%';
}

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const samples = buffer.length;
    const dataSize = samples * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numChannels; c++) {
        channels.push(buffer.getChannelData(c));
    }

    let offset = 44;
    for (let i = 0; i < samples; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = Math.max(-1, Math.min(1, channels[c][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

init();
