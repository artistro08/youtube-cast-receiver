import type { TrackInfo } from '../types';

const BACKEND_URL = 'http://127.0.0.1:39281';
const WS_URL = 'ws://127.0.0.1:39281';
const AUDIO_ID = 'ytcast-audio-player';
const PROGRESS_INTERVAL_MS = 1000;

// --- Module-scoped state (survives panel close/open) ---

let audioElement: HTMLAudioElement | null = null;
let ws: WebSocket | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;

let currentTrack: TrackInfo | null = null;
let isPlaying = false;
let currentVolume = 100;
let connected = false;

export interface NetworkInfo {
  uuid: string | null;
  name: string | null;
  trusted: boolean;
}

let networkInfo: NetworkInfo = {
  uuid: null,
  name: null,
  trusted: false,
};

// Suppression window for local volume changes (ms).
// WS echoes arriving within this window after a local change are ignored.
const VOLUME_SUPPRESS_MS = 600;
let lastLocalVolumeChangeAt = 0;

// Settling debounce for remote volume changes (ms).
// The DIAL/Lounge protocol relays commands through YouTube's servers,
// causing ~200ms round-trip latency. The phone's YouTube app oscillates
// ±3 levels when the ack arrives late. This debounce waits for the
// oscillation to settle before applying the final value.
const VOLUME_SETTLE_MS = 150;
let volumeSettleTimer: ReturnType<typeof setTimeout> | null = null;

// --- Listeners ---

type TrackListener = (track: TrackInfo | null) => void;
type PlayStateListener = (playing: boolean) => void;
type VolumeListener = (volume: number) => void;
type PositionListener = (position: number, duration: number) => void;
type ConnectionListener = (connected: boolean) => void;
type QueueListener = (tracks: any[], position: number) => void;
type NetworkListener = (info: NetworkInfo) => void;

let trackListeners: TrackListener[] = [];
let playStateListeners: PlayStateListener[] = [];
let volumeListeners: VolumeListener[] = [];
let positionListeners: PositionListener[] = [];
let connectionListeners: ConnectionListener[] = [];
let queueListeners: QueueListener[] = [];
let networkListeners: NetworkListener[] = [];

export function addTrackListener(fn: TrackListener): () => void {
  trackListeners.push(fn);
  return () => { trackListeners = trackListeners.filter((l) => l !== fn); };
}

export function addPlayStateListener(fn: PlayStateListener): () => void {
  playStateListeners.push(fn);
  return () => { playStateListeners = playStateListeners.filter((l) => l !== fn); };
}

export function addVolumeListener(fn: VolumeListener): () => void {
  volumeListeners.push(fn);
  return () => { volumeListeners = volumeListeners.filter((l) => l !== fn); };
}

export function addPositionListener(fn: PositionListener): () => void {
  positionListeners.push(fn);
  return () => { positionListeners = positionListeners.filter((l) => l !== fn); };
}

export function addConnectionListener(fn: ConnectionListener): () => void {
  connectionListeners.push(fn);
  return () => { connectionListeners = connectionListeners.filter((l) => l !== fn); };
}

export function addQueueListener(fn: QueueListener): () => void {
  queueListeners.push(fn);
  return () => { queueListeners = queueListeners.filter((l) => l !== fn); };
}

export function addNetworkListener(fn: NetworkListener): () => void {
  networkListeners.push(fn);
  return () => { networkListeners = networkListeners.filter((l) => l !== fn); };
}

// --- Getters ---

export function getCurrentTrack(): TrackInfo | null { return currentTrack; }
export function getIsPlaying(): boolean { return isPlaying; }
export function getVolume(): number { return currentVolume; }
export function getIsConnected(): boolean { return connected; }
export function getNetworkInfo(): NetworkInfo { return networkInfo; }
export function getPosition(): number {
  return audioElement ? audioElement.currentTime : 0;
}
export function getDuration(): number {
  return audioElement && isFinite(audioElement.duration) ? audioElement.duration : 0;
}

// --- Notify helpers ---

function notifyTrack(track: TrackInfo | null) {
  currentTrack = track;
  trackListeners.forEach((fn) => fn(track));
}

function notifyPlayState(playing: boolean) {
  isPlaying = playing;
  playStateListeners.forEach((fn) => fn(playing));
}

function notifyVolume(vol: number) {
  if (Date.now() - lastLocalVolumeChangeAt < VOLUME_SUPPRESS_MS) {
    // A local Deck slider change happened recently — skip to avoid
    // overwriting the user's more recent value with a stale echo.
    return;
  }

  // Debounce remote volume changes so the phone's ±3 oscillation
  // settles before we apply it to the audio element and update the slider.
  if (volumeSettleTimer) clearTimeout(volumeSettleTimer);
  volumeSettleTimer = setTimeout(() => {
    volumeSettleTimer = null;
    if (Date.now() - lastLocalVolumeChangeAt < VOLUME_SUPPRESS_MS) return;
    setAudioVolume(vol);
    volumeListeners.forEach((fn) => fn(vol));
  }, VOLUME_SETTLE_MS);
}

function notifyPosition(pos: number, dur: number) {
  positionListeners.forEach((fn) => fn(pos, dur));
}

function notifyConnection(conn: boolean) {
  connected = conn;
  connectionListeners.forEach((fn) => fn(conn));
}

function notifyQueue(tracks: any[], position: number) {
  queueListeners.forEach((fn) => fn(tracks, position));
}

function notifyNetwork(info: NetworkInfo) {
  networkInfo = info;
  networkListeners.forEach((fn) => fn(info));
}

// --- WebSocket ---

function sendWs(event: string, data: unknown = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[YTCast] WebSocket connected');
    reconnectDelay = 1000;
    // Fetch fresh state on reconnect
    void apiGetState().then((state) => {
      if (state) {
        if (state.track) notifyTrack(state.track);
        notifyPlayState(state.isPlaying ?? false);
        notifyVolume(state.volume ?? 100);
        notifyConnection(state.connected ?? false);
      }
    });
    void apiGetQueue().then((data) => {
      if (data) notifyQueue(data.tracks ?? [], data.position ?? -1);
    });
    void apiGetNetwork().then((data) => {
      if (data && typeof data.trusted === 'boolean') notifyNetwork(data as NetworkInfo);
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      handleWsMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    console.log('[YTCast] WebSocket disconnected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connectWebSocket();
  }, reconnectDelay);
}

function handleWsMessage(msg: { event: string; data: any }) {
  switch (msg.event) {
    case 'track': {
      const info: TrackInfo = {
        videoId: msg.data.videoId,
        title: msg.data.title,
        artist: msg.data.artist,
        albumArt: msg.data.albumArt,
        duration: msg.data.duration,
      };
      notifyTrack(info);

      // Load audio URL. Backend sets autoplay=false when the phone connects
      // in paused state — preload only, don't start playback. Default true
      // for backward compat if the field is missing.
      if (audioElement && msg.data.url) {
        audioElement.src = msg.data.url;
        const shouldAutoplay = msg.data.autoplay !== false;
        if (shouldAutoplay) {
          void audioElement.play().then(() => {
            notifyPlayState(true);
            startProgressReporting();
          }).catch((e) => {
            console.error('[YTCast] Audio play failed:', e);
            sendWs('playbackError', { message: String(e) });
          });
        } else {
          notifyPlayState(false);
        }
      }
      break;
    }

    case 'state': {
      if (msg.data.isPlaying && !isPlaying && audioElement) {
        if (audioElement.src) {
          void audioElement.play().then(() => {
            notifyPlayState(true);
            startProgressReporting();
          }).catch(() => {});
        }
      } else if (!msg.data.isPlaying && isPlaying && audioElement) {
        audioElement.pause();
        stopProgressReporting();
        notifyPlayState(false);
      }
      if (msg.data.volume !== undefined) {
        notifyVolume(msg.data.volume);
      }
      break;
    }

    case 'stop': {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
      stopProgressReporting();
      notifyPlayState(false);
      notifyTrack(null);
      break;
    }

    case 'seek': {
      if (audioElement && isFinite(msg.data.position)) {
        audioElement.currentTime = msg.data.position;
      }
      break;
    }

    case 'volume': {
      const level = msg.data.value ?? msg.data.level ?? 100;
      notifyVolume(level);
      break;
    }

    case 'connection': {
      notifyConnection(msg.data.phoneConnected);
      break;
    }

    case 'queue': {
      notifyQueue(msg.data.tracks ?? [], msg.data.position ?? -1);
      break;
    }

    case 'network': {
      notifyNetwork({
        uuid: msg.data.uuid ?? null,
        name: msg.data.name ?? null,
        trusted: !!msg.data.trusted,
      });
      break;
    }

    case 'error': {
      console.error('[YTCast] Backend error:', msg.data.message, msg.data.code);
      break;
    }
  }
}

// --- Progress reporting ---

function startProgressReporting() {
  stopProgressReporting();
  progressInterval = setInterval(() => {
    if (audioElement && isPlaying) {
      const pos = audioElement.currentTime;
      const dur = isFinite(audioElement.duration) ? audioElement.duration : 0;
      sendWs('progress', { currentTime: pos, duration: dur });
      notifyPosition(pos, dur);
    }
  }, PROGRESS_INTERVAL_MS);
}

function stopProgressReporting() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

// --- Audio element event handlers ---

function onAudioEnded() {
  isPlaying = false;
  notifyPlayState(false);
  stopProgressReporting();
  sendWs('ended');
}

function onAudioError() {
  const err = audioElement?.error;
  const src = audioElement?.src ?? '(no src)';
  console.error(`[YTCast] Audio element error: code=${err?.code} message="${err?.message}" src=${src.substring(0, 120)}`);
  sendWs('playbackError', { message: `Audio playback error: ${err?.message ?? 'unknown'}` });
}

function onAudioPause() {
  // Detect system-initiated pause (e.g. sleep/wake)
  if (isPlaying) {
    isPlaying = false;
    notifyPlayState(false);
    stopProgressReporting();
  }
}

// --- Audio volume ---

export function setAudioVolume(level: number, local: boolean = false) {
  if (audioElement) {
    audioElement.volume = Math.max(0, Math.min(1, level / 100));
  }
  currentVolume = level;
  if (local) {
    lastLocalVolumeChangeAt = Date.now();
  }
}

// --- REST API helpers ---

async function apiPost(path: string, body?: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  } catch (e) {
    console.error(`[YTCast] API ${path} failed:`, e);
    return { ok: false };
  }
}

async function apiGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`);
    return await res.json();
  } catch (e) {
    console.error(`[YTCast] API ${path} failed:`, e);
    return null;
  }
}

export async function apiPlay() { return apiPost('/api/play'); }
export async function apiPause() { return apiPost('/api/pause'); }
export async function apiNext() { return apiPost('/api/next'); }
export async function apiPrev() { return apiPost('/api/prev'); }
export async function apiSeek(position: number) { return apiPost('/api/seek', { position }); }
export async function apiSetVolume(volume: number) { return apiPost('/api/volume', { volume }); }
export async function apiGetState() { return apiGet('/api/state'); }
export async function apiGetQueue() { return apiGet('/api/queue'); }
export async function apiGetNetwork() { return apiGet('/api/network/current'); }
export async function apiTrustNetwork() { return apiPost('/api/network/trust'); }
export async function apiUntrustNetwork() { return apiPost('/api/network/untrust'); }

export function togglePlayback() {
  if (isPlaying) {
    void apiPause();
  } else {
    void apiPlay();
  }
}

// --- Init / Destroy ---

export function initAudio() {
  // Reuse existing element if present (e.g. hot reload)
  if (document.getElementById(AUDIO_ID)) {
    audioElement = document.getElementById(AUDIO_ID) as HTMLAudioElement;
  } else {
    audioElement = document.createElement('audio');
    audioElement.id = AUDIO_ID;
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
  }

  audioElement.removeEventListener('ended', onAudioEnded);
  audioElement.removeEventListener('error', onAudioError);
  audioElement.removeEventListener('pause', onAudioPause);
  audioElement.addEventListener('ended', onAudioEnded);
  audioElement.addEventListener('error', onAudioError);
  audioElement.addEventListener('pause', onAudioPause);

  // Set initial volume
  setAudioVolume(currentVolume);

  // Connect WebSocket
  connectWebSocket();
}

export function destroyAudio() {
  stopProgressReporting();

  if (volumeSettleTimer) {
    clearTimeout(volumeSettleTimer);
    volumeSettleTimer = null;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (ws) {
    ws.onclose = null; // Prevent reconnect on intentional close
    ws.close();
    ws = null;
  }

  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement.removeEventListener('ended', onAudioEnded);
    audioElement.removeEventListener('error', onAudioError);
    audioElement.removeEventListener('pause', onAudioPause);
    audioElement.remove();
    audioElement = null;
  }

  currentTrack = null;
  isPlaying = false;
  trackListeners = [];
  playStateListeners = [];
  volumeListeners = [];
  positionListeners = [];
  connectionListeners = [];
  queueListeners = [];
  networkListeners = [];
}
