# Plan 2: Frontend — Player Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete frontend for the Player tab — audio management, WebSocket connection, progress bar, playback controls, volume slider — and fix 3 backend review items from Plan 1.

**Architecture:** React frontend using Decky SDK (`@decky/ui`, `@decky/api`). A module-scoped `audioManager` owns the `<audio>` element and WebSocket connection (survives panel close/open). `PlayerContext` subscribes to audioManager events and provides state to components via `usePlayer()` hook. REST calls for commands (play, pause, next, prev, seek, volume) go through audioManager helper functions.

**Tech Stack:** TypeScript, React, @decky/ui, @decky/api, rollup, WebSocket API

**Reference:**
- Design spec: `docs/superpowers/specs/2026-03-19-youtube-cast-receiver-design.md`
- Reference plugin UI: https://github.com/artistro08/decky-youtube-music-player
- Backend port: `127.0.0.1:39281` (HTTP REST + WebSocket)

---

## File Structure (created/modified by this plan)

```
src/
├── index.tsx              # MODIFY — full plugin with tabs, titleView, audio init
├── types.ts               # CREATE — TrackInfo, PlayerState types
├── context/
│   └── PlayerContext.tsx   # CREATE — state management, WebSocket event subscription
├── services/
│   └── audioManager.ts    # CREATE — <audio> element, WebSocket, REST helpers
└── components/
    ├── Section.tsx         # CREATE — reusable section wrapper (from reference)
    ├── PlayerView.tsx      # CREATE — player tab layout
    ├── ProgressBar.tsx     # CREATE — track progress slider
    └── VolumeSlider.tsx    # CREATE — volume slider

backend/src/
├── httpServer.ts          # MODIFY — fix connected status, body size limit, unused var
└── server.ts              # MODIFY — add playlistAdded event, pass isConnected
```

---

### Task 1: Backend Review Fixes

**Files:**
- Modify: `backend/src/httpServer.ts`
- Modify: `backend/src/server.ts`

Fix 3 issues from Plan 1 code review:
1. Dead `connected` variable in `/api/state` — add `isConnected` callback to RouteContext
2. Missing `playlistAdded` event subscription in server.ts
3. No body size limit in `parseBody`
4. Unused `index` parameter in queue handler

- [ ] **Step 1: Fix `httpServer.ts`**

In `backend/src/httpServer.ts`:

1. Add `isConnected` to `RouteContext`:

Replace:
```typescript
interface RouteContext {
  castPlayer: CastPlayer;
  libraryPlayer: YtPlayer;
}
```

With:
```typescript
interface RouteContext {
  castPlayer: CastPlayer;
  libraryPlayer: YtPlayer;
  isConnected: () => boolean;
}
```

2. Fix the `/api/state` handler — remove dead `connected` variable, use `ctx.isConnected()`:

Replace:
```typescript
    '/api/state': async (_body, ctx) => {
      const trackInfo = ctx.castPlayer.getCurrentTrackInfo();
      const volume = await ctx.libraryPlayer.getVolume();
      const position = await ctx.libraryPlayer.getPosition();
      const duration = await ctx.libraryPlayer.getDuration();
      const connected = ctx.libraryPlayer.getNavInfo(); // used to check if active

      return {
        track: trackInfo
          ? {
              videoId: trackInfo.videoId,
              title: trackInfo.title,
              artist: trackInfo.artist,
              albumArt: trackInfo.albumArt,
              duration: trackInfo.duration,
            }
          : null,
        isPlaying: ctx.castPlayer.isCurrentlyPlaying(),
        volume: volume.level,
        position,
        duration,
        connected: false, // Will be set by server.ts using receiver.getConnectedSenders()
      };
    },
```

With:
```typescript
    '/api/state': async (_body, ctx) => {
      const trackInfo = ctx.castPlayer.getCurrentTrackInfo();
      const volume = await ctx.libraryPlayer.getVolume();
      const position = await ctx.libraryPlayer.getPosition();
      const duration = await ctx.libraryPlayer.getDuration();

      return {
        track: trackInfo
          ? {
              videoId: trackInfo.videoId,
              title: trackInfo.title,
              artist: trackInfo.artist,
              albumArt: trackInfo.albumArt,
              duration: trackInfo.duration,
            }
          : null,
        isPlaying: ctx.castPlayer.isCurrentlyPlaying(),
        volume: volume.level,
        position,
        duration,
        connected: ctx.isConnected(),
      };
    },
```

3. Remove unused `index` parameter in queue handler:

Replace:
```typescript
      const tracks = videoIds.map((id: string, index: number) => ({
```

With:
```typescript
      const tracks = videoIds.map((id: string) => ({
```

4. Add body size limit to `parseBody`:

Replace:
```typescript
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if (req.method === 'GET') {
      resolve({});
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}
```

With:
```typescript
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if (req.method === 'GET') {
      resolve({});
      return;
    }

    let body = '';
    let oversized = false;
    req.on('data', (chunk: Buffer) => {
      if (oversized) return;
      body += chunk.toString();
      if (body.length > MAX_BODY_SIZE) {
        oversized = true;
        body = ''; // Free memory
      }
    });
    req.on('end', () => {
      if (oversized) {
        resolve({});
        return;
      }
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}
```

- [ ] **Step 2: Fix `server.ts`**

In `backend/src/server.ts`:

1. Add `playlistAdded` event subscription. After the line `playlist.on('videoSelected', broadcastQueue);`, add:

```typescript
  playlist.on('playlistAdded', broadcastQueue);
```

2. Pass `isConnected` callback in the HTTP request handler. Replace:

```typescript
  httpServer.on('request', (req, res) => {
    handleRequest(req, res, {
      castPlayer,
      libraryPlayer: castPlayer,
    });
  });
```

With:

```typescript
  httpServer.on('request', (req, res) => {
    handleRequest(req, res, {
      castPlayer,
      libraryPlayer: castPlayer,
      isConnected: () => receiver.getConnectedSenders().length > 0,
    });
  });
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run:
```bash
pnpm test
```
Expected: All 12 tests pass. (The httpServer test for `/api/health` doesn't use `isConnected`, so it passes with the mock context as-is.)

- [ ] **Step 4: Build backend**

Run:
```bash
pnpm run build:backend
```
Expected: `backend/out/server.js` builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/httpServer.ts backend/src/server.ts
git commit -m "fix: address Plan 1 review items — connected status, playlistAdded, body limit"
```

---

### Task 2: Frontend Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface TrackInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
}

export interface PlayerState {
  track: TrackInfo | null;
  isPlaying: boolean;
  volume: number;
  position: number;
  duration: number;
  connected: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add frontend TypeScript types for TrackInfo and PlayerState"
```

---

### Task 3: audioManager

**Files:**
- Create: `src/services/audioManager.ts`

This is the core service. It manages the persistent `<audio>` element, the WebSocket connection to the backend, progress reporting, and provides REST API helper functions for playback commands. Everything is module-scoped so it survives Decky panel close/open cycles.

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p src/services
```

- [ ] **Step 2: Create `src/services/audioManager.ts`**

```typescript
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

// --- Listeners ---

type TrackListener = (track: TrackInfo | null) => void;
type PlayStateListener = (playing: boolean) => void;
type VolumeListener = (volume: number) => void;
type PositionListener = (position: number, duration: number) => void;
type ConnectionListener = (connected: boolean) => void;
type QueueListener = (tracks: any[], position: number) => void;

let trackListeners: TrackListener[] = [];
let playStateListeners: PlayStateListener[] = [];
let volumeListeners: VolumeListener[] = [];
let positionListeners: PositionListener[] = [];
let connectionListeners: ConnectionListener[] = [];
let queueListeners: QueueListener[] = [];

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

// --- Getters ---

export function getCurrentTrack(): TrackInfo | null { return currentTrack; }
export function getIsPlaying(): boolean { return isPlaying; }
export function getVolume(): number { return currentVolume; }
export function getIsConnected(): boolean { return connected; }
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
  currentVolume = vol;
  volumeListeners.forEach((fn) => fn(vol));
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

      // Load audio URL
      if (audioElement && msg.data.url) {
        audioElement.src = msg.data.url;
        void audioElement.play().then(() => {
          notifyPlayState(true);
          startProgressReporting();
        }).catch((e) => {
          console.error('[YTCast] Audio play failed:', e);
          sendWs('playbackError', { message: String(e) });
        });
      }
      break;
    }

    case 'state': {
      if (msg.data.isPlaying && !isPlaying && audioElement) {
        void audioElement.play().catch(() => {});
        startProgressReporting();
      } else if (!msg.data.isPlaying && isPlaying && audioElement) {
        audioElement.pause();
        stopProgressReporting();
      }
      notifyPlayState(msg.data.isPlaying);
      if (msg.data.volume !== undefined) {
        setAudioVolume(msg.data.volume);
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
      setAudioVolume(level);
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
  console.error('[YTCast] Audio element error');
  sendWs('playbackError', { message: 'Audio playback error' });
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

function setAudioVolume(level: number) {
  if (audioElement) {
    audioElement.volume = Math.max(0, Math.min(1, level / 100));
  }
  currentVolume = level;
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
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/audioManager.ts
git commit -m "feat: implement audioManager with WebSocket, audio element, and REST helpers"
```

---

### Task 4: PlayerContext

**Files:**
- Create: `src/context/PlayerContext.tsx`

React context that subscribes to audioManager events on mount and provides state to all components via `usePlayer()`.

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p src/context
```

- [ ] **Step 2: Create `src/context/PlayerContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useReducer, useCallback, type FC, type ReactNode } from 'react';
import type { PlayerState, TrackInfo } from '../types';
import {
  addTrackListener,
  addPlayStateListener,
  addVolumeListener,
  addPositionListener,
  addConnectionListener,
  getCurrentTrack,
  getIsPlaying,
  getVolume,
  getIsConnected,
  getPosition,
  getDuration,
  apiGetState,
} from '../services/audioManager';

const defaultState: PlayerState = {
  track: null,
  isPlaying: false,
  volume: 100,
  position: 0,
  duration: 0,
  connected: false,
};

type Action =
  | { type: 'UPDATE'; payload: Partial<PlayerState> }
  | { type: 'SET_TRACK'; payload: TrackInfo | null }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_POSITION'; payload: { position: number; duration: number } };

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'SET_TRACK':
      return { ...state, track: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_POSITION':
      return { ...state, position: action.payload.position, duration: action.payload.duration };
    default:
      return state;
  }
}

interface PlayerContextValue {
  state: PlayerState;
  updateState: (partial: Partial<PlayerState>) => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  state: defaultState,
  updateState: () => {},
});

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  const updateState = useCallback((partial: Partial<PlayerState>) => {
    dispatch({ type: 'UPDATE', payload: partial });
  }, []);

  useEffect(() => {
    // Restore state from audioManager (survives panel close/open)
    const track = getCurrentTrack();
    const playing = getIsPlaying();
    const volume = getVolume();
    const connected = getIsConnected();
    const position = getPosition();
    const duration = getDuration();

    dispatch({ type: 'UPDATE', payload: { track, isPlaying: playing, volume, connected, position, duration } });

    // Fetch full state from backend
    void (async () => {
      const serverState = await apiGetState();
      if (serverState) {
        dispatch({
          type: 'UPDATE',
          payload: {
            track: serverState.track ?? null,
            isPlaying: serverState.isPlaying ?? false,
            volume: serverState.volume ?? 100,
            position: serverState.position ?? 0,
            duration: serverState.duration ?? 0,
            connected: serverState.connected ?? false,
          },
        });
      }
    })();

    // Subscribe to audioManager events
    const unsubs = [
      addTrackListener((t) => dispatch({ type: 'SET_TRACK', payload: t })),
      addPlayStateListener((p) => dispatch({ type: 'SET_PLAYING', payload: p })),
      addVolumeListener((v) => dispatch({ type: 'UPDATE', payload: { volume: v } })),
      addPositionListener((pos, dur) => dispatch({ type: 'SET_POSITION', payload: { position: pos, duration: dur } })),
      addConnectionListener((c) => dispatch({ type: 'UPDATE', payload: { connected: c } })),
    ];

    return () => { unsubs.forEach((fn) => fn()); };
  }, []);

  return <PlayerContext.Provider value={{ state, updateState }}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => {
  const { state, updateState } = useContext(PlayerContext);
  return { ...state, updateState };
};
```

- [ ] **Step 3: Commit**

```bash
git add src/context/PlayerContext.tsx
git commit -m "feat: implement PlayerContext with WebSocket event subscriptions"
```

---

### Task 5: Section Component

**Files:**
- Create: `src/components/Section.tsx`

Ported from the reference plugin. Provides consistent section spacing.

- [ ] **Step 1: Create directory**

Run:
```bash
mkdir -p src/components
```

- [ ] **Step 2: Create `src/components/Section.tsx`**

```tsx
import type { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  noPull?: boolean;
  children: ReactNode;
}

export const Section = ({ title, noPull, children }: SectionProps) => (
  <div style={noPull ? undefined : { margin: '0 -10px' }}>
    {title && (
      <div style={{
        padding: noPull ? '12px 0 4px' : '12px 12px 4px',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase' as const,
        color: 'var(--gpSystemLighterGrey)',
        letterSpacing: '0.04em',
      }}>
        {title}
      </div>
    )}
    {children}
  </div>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Section.tsx
git commit -m "feat: add Section component (ported from reference plugin)"
```

---

### Task 6: VolumeSlider Component

**Files:**
- Create: `src/components/VolumeSlider.tsx`

Adapted from the reference plugin. Uses `apiSetVolume()` from audioManager instead of Decky `call()`.

- [ ] **Step 1: Create `src/components/VolumeSlider.tsx`**

```tsx
import { SliderField } from '@decky/ui';
import type { SliderFieldProps } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { apiSetVolume } from '../services/audioManager';
import { usePlayer } from '../context/PlayerContext';

const PaddedSlider = (props: SliderFieldProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const firstChild = ref.current.firstElementChild as HTMLElement | null;
    if (firstChild) {
      firstChild.style.paddingLeft = '19px';
      firstChild.style.paddingRight = '19px';
    }
    ref.current.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (parseFloat(window.getComputedStyle(el).minWidth) >= 270)
        el.style.minWidth = '0';
    });
  }, []);
  return (
    <div ref={ref}>
      <SliderField {...props} />
    </div>
  );
};

export const VolumeSlider = () => {
  const { volume } = usePlayer();
  const [displayVolume, setDisplayVolume] = useState<number>(volume);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with context when it changes externally (e.g. phone changed volume)
  useEffect(() => {
    setDisplayVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    setDisplayVolume(val);

    // Debounce the API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void apiSetVolume(val);
    }, 300);
  }, []);

  return (
    <PaddedSlider
      icon={<FaVolumeUp size={18} />}
      value={displayVolume}
      min={0}
      max={100}
      step={1}
      onChange={handleChange}
      showValue={false}
    />
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VolumeSlider.tsx
git commit -m "feat: add VolumeSlider component"
```

---

### Task 7: ProgressBar Component

**Files:**
- Create: `src/components/ProgressBar.tsx`

A draggable slider showing elapsed time / total time. Styled like the VolumeSlider. Calls `apiSeek()` when the user drags.

- [ ] **Step 1: Create `src/components/ProgressBar.tsx`**

```tsx
import { SliderField } from '@decky/ui';
import type { SliderFieldProps } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiSeek, getPosition, getDuration, addPositionListener } from '../services/audioManager';

const PaddedSlider = (props: SliderFieldProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const firstChild = ref.current.firstElementChild as HTMLElement | null;
    if (firstChild) {
      firstChild.style.paddingLeft = '19px';
      firstChild.style.paddingRight = '19px';
    }
    ref.current.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (parseFloat(window.getComputedStyle(el).minWidth) >= 270)
        el.style.minWidth = '0';
    });
  }, []);
  return (
    <div ref={ref}>
      <SliderField {...props} />
    </div>
  );
};

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export const ProgressBar = () => {
  const [position, setPosition] = useState<number>(getPosition());
  const [duration, setDuration] = useState<number>(getDuration());
  const seekingRef = useRef(false);
  const seekRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = addPositionListener((pos, dur) => {
      if (!seekingRef.current) {
        setPosition(pos);
        setDuration(dur);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    return () => {
      if (seekRef.current) clearTimeout(seekRef.current);
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    seekingRef.current = true;
    setPosition(val);

    if (seekRef.current) clearTimeout(seekRef.current);
    seekRef.current = setTimeout(() => {
      void apiSeek(val);
      // Resume position updates after a short delay
      setTimeout(() => { seekingRef.current = false; }, 500);
    }, 200);
  }, []);

  const maxVal = Math.max(duration, 1);
  const elapsed = formatTime(position);
  const total = formatTime(duration);

  return (
    <div>
      <PaddedSlider
        value={Math.min(position, maxVal)}
        min={0}
        max={maxVal}
        step={1}
        onChange={handleChange}
        showValue={false}
      />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 19px',
        marginTop: '-8px',
        fontSize: '11px',
        color: 'var(--gpSystemLighterGrey)',
      }}>
        <span>{elapsed}</span>
        <span>{total}</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProgressBar.tsx
git commit -m "feat: add ProgressBar component with seek support"
```

---

### Task 8: PlayerView Component

**Files:**
- Create: `src/components/PlayerView.tsx`

The main player tab layout: album art + title/artist, progress bar, prev/play-pause/next controls, volume slider. Adapted from the reference plugin's `PlayerView.tsx` — no like/dislike, no shuffle/repeat.

- [ ] **Step 1: Create `src/components/PlayerView.tsx`**

```tsx
import { DialogButton, Focusable } from '@decky/ui';
import { FaMusic } from 'react-icons/fa';
import { FaPause } from 'react-icons/fa';
import { IoPlay, IoPlaySkipBack, IoPlaySkipForward } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import { togglePlayback, apiNext, apiPrev } from '../services/audioManager';
import { Section } from './Section';
import { VolumeSlider } from './VolumeSlider';
import { ProgressBar } from './ProgressBar';

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '0',
  flex: 1,
  padding: '0 8px',
  marginLeft: '0',
};

const transBtnFirst: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '4px 0 0 4px' };
const transBtnMid: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '0', borderLeft: '1px solid rgba(255,255,255,0.15)' };
const transBtnLast: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '0 4px 4px 0', borderLeft: '1px solid rgba(255,255,255,0.15)' };

export const PlayerView = () => {
  const { track, isPlaying, connected } = usePlayer();

  const albumArt = track?.albumArt;
  const title = track?.title ?? (connected ? 'Waiting for cast...' : 'Not connected');
  const artist = track?.artist ?? (connected ? 'Cast a video from your phone' : 'Open YouTube and cast to this device');

  return (
    <>
      {/* Track info: album art + title/artist */}
      <Section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px 4px' }}>
          {albumArt ? (
            <img
              src={albumArt}
              alt="Album art"
              style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: '60px', height: '60px', borderRadius: '4px', flexShrink: 0,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--gpSystemLighterGrey)',
            }}>
              <FaMusic size={36} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            {artist && (
              <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {artist}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Progress bar */}
      {track && (
        <Section>
          <ProgressBar />
        </Section>
      )}

      {/* Prev / Play-Pause / Next */}
      <div style={{ marginTop: '10px', marginBottom: '10px', paddingLeft: '5px', paddingRight: '5px' }}>
        <Section noPull>
          <Focusable style={{ display: 'flex', marginTop: '4px', marginBottom: '4px' }} flow-children="horizontal">
            <DialogButton style={transBtnFirst} onClick={() => { void apiPrev(); }}><IoPlaySkipBack /></DialogButton>
            <DialogButton style={transBtnMid} onClick={() => { togglePlayback(); }}>
              {isPlaying ? <FaPause /> : <IoPlay />}
            </DialogButton>
            <DialogButton style={transBtnLast} onClick={() => { void apiNext(); }}><IoPlaySkipForward /></DialogButton>
          </Focusable>
        </Section>
      </div>

      {/* Volume */}
      <Section>
        <VolumeSlider />
      </Section>
    </>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PlayerView.tsx
git commit -m "feat: add PlayerView with track info, progress, controls, and volume"
```

---

### Task 9: Rewrite index.tsx

**Files:**
- Modify: `src/index.tsx`

Full plugin registration with Player tab (Queue tab placeholder for Plan 3), titleView, audio init/destroy lifecycle.

- [ ] **Step 1: Rewrite `src/index.tsx`**

```tsx
import { Tabs, staticClasses, Focusable } from '@decky/ui';
import { definePlugin } from '@decky/api';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FaChromecast } from 'react-icons/fa';

import { PlayerProvider } from './context/PlayerContext';
import { PlayerView } from './components/PlayerView';
import { initAudio, destroyAudio } from './services/audioManager';

const MIN_HEIGHT = 433;

const TabsContainer = memo(() => {
  const [activeTab, setActiveTab] = useState<string>('player');
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(MIN_HEIGHT);

  useEffect(() => {
    if (!containerRef.current) return;

    let scrollEl: HTMLElement | null = null;
    let prevOverflow = '';

    const recalcHeight = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      let newHeight: number;

      if (scrollEl) {
        const elRect = scrollEl.getBoundingClientRect();
        newHeight = elRect.bottom - containerRect.top;
      } else {
        newHeight = window.innerHeight - containerRect.top;
      }

      setHeight(Math.max(newHeight, MIN_HEIGHT));
    };

    let el: Element | null = containerRef.current.parentElement;
    while (el && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (oy === 'scroll' || oy === 'auto' || oy === 'overlay') {
        scrollEl = el as HTMLElement;
        break;
      }
      el = el.parentElement;
    }

    requestAnimationFrame(() => {
      recalcHeight();
    });

    if (scrollEl) {
      prevOverflow = scrollEl.style.overflowY;
      scrollEl.style.overflowY = 'hidden';
    }

    const observer = new ResizeObserver(recalcHeight);
    if (scrollEl) observer.observe(scrollEl);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (scrollEl) scrollEl.style.overflowY = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = `
      #ytcast-container > * {
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      #ytcast-container [class*="TabHeaderRowWrapper"] {
        flex-shrink: 0 !important;
        min-height: 32px !important;
        padding-left: 18px !important;
        padding-right: 18px !important;
      }
      #ytcast-container [class*="TabContentsScroll"] {
        flex: 1 !important;
        min-height: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      #ytcast-container [class*="Glyphs"] {
        transform: scale(0.65) !important;
        transform-origin: center center !important;
      }
    `;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const tabItems = useMemo(() => [
    { id: 'player', title: 'Player', content: <PlayerView /> },
    { id: 'queue', title: 'Queue', content: <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gpSystemLighterGrey)' }}>Queue — coming in Plan 3</div> },
  ], []);

  return (
    <div id="ytcast-container" ref={containerRef} style={{ height, overflow: 'hidden' }}>
      <Tabs
        activeTab={activeTab}
        onShowTab={(tabID: string) => setActiveTab(tabID)}
        tabs={tabItems}
      />
    </div>
  );
});
TabsContainer.displayName = 'TabsContainer';

const Content = () => {
  useEffect(() => {
    const titleEl = document.querySelector(`.${staticClasses.Title}`);
    if (titleEl?.parentElement) {
      titleEl.parentElement.style.gap = '0';
    }
  }, []);

  return (
    <PlayerProvider>
      <TabsContainer />
    </PlayerProvider>
  );
};

export default definePlugin(() => {
  initAudio();

  return {
    name: 'YouTube Cast Receiver',
    titleView: (
      <Focusable
        style={{
          display: 'flex',
          padding: '0',
          width: '100%',
          boxShadow: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        className={staticClasses.Title}
      >
        <div>YouTube Cast</div>
      </Focusable>
    ),
    content: <Content />,
    icon: <FaChromecast />,
    onDismount() {
      destroyAudio();
    },
  };
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.tsx
git commit -m "feat: rewrite index.tsx with tabs, PlayerProvider, and audio lifecycle"
```

---

### Task 10: Build Verification

**Files:** None new — verifies everything builds and works.

- [ ] **Step 1: Build the frontend**

Run:
```bash
pnpm run build
```
Expected: `dist/index.js` created with no errors. If there are TypeScript or import errors, fix them.

- [ ] **Step 2: Build the backend**

Run:
```bash
pnpm run build:backend
```
Expected: `backend/out/server.js` created with no errors.

- [ ] **Step 3: Run all tests**

Run:
```bash
pnpm test
```
Expected: All 12 backend tests pass (frontend has no tests).

- [ ] **Step 4: Verify the build output structure**

Run:
```bash
ls -la dist/index.js backend/out/server.js
```
Expected: Both files exist.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build verification findings"
```

(Only if fixes were needed.)

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: Plan 2 complete — Player tab frontend implemented"
```
