# Plan 3: Frontend — Queue Tab & Bidirectional Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the QueueView component with metadata-enriched track display, wire it into the plugin tabs, and polish edge cases for bidirectional sync.

**Architecture:** The `yt-cast-receiver` library owns the queue — it does not expose methods to jump to arbitrary tracks or remove items. The queue is managed from the phone's YouTube app. Our QueueView is a **read-only display** showing the current queue with cached metadata. The CastPlayer caches track metadata (from yt-dlp) as tracks are played, and both queue broadcasts and the `/api/queue` endpoint include this cached metadata. Bidirectional sync (progress, play/pause, seek, volume) is already functional from Plan 2 — this plan polishes edge cases.

**Tech Stack:** TypeScript, React, @decky/ui

**Reference:**
- Design spec: `docs/superpowers/specs/2026-03-19-youtube-cast-receiver-design.md`
- Reference QueueView: https://github.com/artistro08/decky-youtube-music-player/blob/main/src/components/QueueView.tsx
- Backend port: `127.0.0.1:39281`

**Key constraint:** The `yt-cast-receiver` Playlist class only exposes `previous()` and `next()` for navigation (both `@internal`). It does not support jumping to an arbitrary index or removing items. `PlaylistState.videoIds` is `string[]` (no Video objects). Only `previous`, `current`, `next`, and `autoplay` are available as full Video objects.

---

## File Structure (created/modified by this plan)

```
backend/src/
├── CastPlayer.ts          # MODIFY — add metadata cache, getQueueWithMetadata()
├── httpServer.ts          # MODIFY — update /api/queue, remove stub endpoints
└── server.ts              # MODIFY — enrich queue broadcasts with cached metadata

src/
├── index.tsx              # MODIFY — replace Queue tab placeholder with QueueView
├── context/
│   └── PlayerContext.tsx   # MODIFY — add queue state and listener
└── components/
    └── QueueView.tsx       # CREATE — queue display component
```

---

### Task 1: Backend Metadata Cache

**Files:**
- Modify: `backend/src/CastPlayer.ts`

Add a metadata cache (`Map<string, AudioInfo>`) to CastPlayer. When `doPlay()` is called, cache the track metadata. Expose a method to get queue items with cached metadata.

- [ ] **Step 1: Add metadata cache to CastPlayer**

In `backend/src/CastPlayer.ts`, add a `metadataCache` field and a `getQueueWithMetadata()` method.

After line 18 (`private playing: boolean = false;`), add:
```typescript
  private metadataCache: Map<string, AudioInfo> = new Map();
```

In the `doPlay` method, after `this.currentTrackInfo = info;` (line 89), add:
```typescript
      this.metadataCache.set(video.id, info);
```

Add a new public method after `isCurrentlyPlaying()`:
```typescript
  getQueueWithMetadata(): { tracks: Array<{ videoId: string; title: string; artist: string; albumArt: string; isCurrent: boolean }>; position: number } {
    const playlist = this.queue;
    const state = playlist.getState();
    const videoIds = playlist.videoIds;
    const currentIndex = state.current
      ? videoIds.indexOf(state.current.id)
      : -1;

    const tracks = videoIds.map((id: string) => {
      const cached = this.metadataCache.get(id);
      return {
        videoId: id,
        title: cached?.title ?? id,
        artist: cached?.artist ?? '',
        albumArt: cached?.albumArt ?? '',
        isCurrent: state.current?.id === id,
      };
    });

    return { tracks, position: currentIndex };
  }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/CastPlayer.ts
git commit -m "feat: add metadata cache to CastPlayer for queue enrichment"
```

---

### Task 2: Backend Queue Endpoints & Broadcasts

**Files:**
- Modify: `backend/src/httpServer.ts`
- Modify: `backend/src/server.ts`

Update `/api/queue` to use CastPlayer's `getQueueWithMetadata()`. Remove the stub `/api/queue/jump` and `/api/queue/remove` endpoints (not supported by the library). Update the queue broadcast in `server.ts` to use cached metadata.

- [ ] **Step 1: Update httpServer.ts**

Replace the entire `/api/queue` handler:
```typescript
    '/api/queue': async (_body, ctx) => {
      const playlist = ctx.libraryPlayer.queue;
      const state = playlist.getState();
      const videoIds = playlist.videoIds;

      const tracks = videoIds.map((id: string) => ({
        videoId: id,
        title: id, // placeholder — enriched by frontend or oEmbed
        artist: '',
        albumArt: '',
        isCurrent: state.current?.id === id,
      }));

      const currentIndex = state.current
        ? videoIds.indexOf(state.current.id)
        : -1;

      return { tracks, position: currentIndex };
    },
```

With:
```typescript
    '/api/queue': async (_body, ctx) => {
      return ctx.castPlayer.getQueueWithMetadata();
    },
```

Replace the stub `/api/queue/jump` endpoint:
```typescript
    '/api/queue/jump': async (body, _ctx) => {
      // Queue jumping requires accessing the library's playlist internals
      // This will be refined in Plan 3 when queue interaction is fully built
      return { ok: true };
    },
```

With:
```typescript
    '/api/queue/jump': async (_body, _ctx) => {
      return { ok: false, message: 'Queue is managed from your phone' };
    },
```

Replace the stub `/api/queue/remove` endpoint:
```typescript
    '/api/queue/remove': async (body, _ctx) => {
      // Queue removal requires accessing the library's playlist internals
      // This will be refined in Plan 3
      return { ok: true };
    },
```

With:
```typescript
    '/api/queue/remove': async (_body, _ctx) => {
      return { ok: false, message: 'Queue is managed from your phone' };
    },
```

- [ ] **Step 2: Update server.ts broadcastQueue to use metadata cache**

Replace the `broadcastQueue` function in `backend/src/server.ts`:
```typescript
  const broadcastQueue = () => {
    const playlist = castPlayer.queue;
    const state = playlist.getState();
    const videoIds = playlist.videoIds;
    const currentIndex = state.current
      ? videoIds.indexOf(state.current.id)
      : -1;
    const tracks = videoIds.map((id: string) => ({
      videoId: id,
      title: id, // placeholder — enriched by frontend or oEmbed in Plan 3
      artist: '',
      albumArt: '',
      isCurrent: state.current?.id === id,
    }));
    wsManager.broadcast('queue', { tracks, position: currentIndex });
  };
```

With:
```typescript
  const broadcastQueue = () => {
    const queueData = castPlayer.getQueueWithMetadata();
    wsManager.broadcast('queue', queueData);
  };
```

- [ ] **Step 3: Run tests and build**

Run:
```bash
pnpm test && pnpm run build:backend
```
Expected: All 12 tests pass, backend builds.

- [ ] **Step 4: Commit**

```bash
git add backend/src/httpServer.ts backend/src/server.ts
git commit -m "feat: enrich queue with cached metadata, finalize queue endpoints"
```

---

### Task 3: Frontend Queue State in PlayerContext

**Files:**
- Modify: `src/types.ts`
- Modify: `src/context/PlayerContext.tsx`

Add queue state (tracks array + position) to PlayerContext so QueueView can consume it via `usePlayer()`. This requires widening the state type to include `queue` and updating the reducer signature accordingly.

- [ ] **Step 1: Add queue types to `src/types.ts`**

Append to the end of `src/types.ts`:
```typescript

export interface QueueItem {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  isCurrent: boolean;
}

export interface QueueState {
  tracks: QueueItem[];
  position: number;
}
```

- [ ] **Step 2: Rewrite `src/context/PlayerContext.tsx`**

The state type needs to be widened to include `queue`, the reducer signature updated, and queue listeners/fetching added. It's cleaner to rewrite the entire file than apply piecemeal edits.

Replace the entire contents of `src/context/PlayerContext.tsx` with:

```tsx
import { createContext, useContext, useEffect, useReducer, useCallback, type FC, type ReactNode } from 'react';
import type { PlayerState, TrackInfo, QueueState } from '../types';
import {
  addTrackListener,
  addPlayStateListener,
  addVolumeListener,
  addPositionListener,
  addConnectionListener,
  addQueueListener,
  getCurrentTrack,
  getIsPlaying,
  getVolume,
  getIsConnected,
  getPosition,
  getDuration,
  apiGetState,
  apiGetQueue,
} from '../services/audioManager';

interface FullState extends PlayerState {
  queue: QueueState;
}

const defaultState: FullState = {
  track: null,
  isPlaying: false,
  volume: 100,
  position: 0,
  duration: 0,
  connected: false,
  queue: { tracks: [], position: -1 },
};

type Action =
  | { type: 'UPDATE'; payload: Partial<FullState> }
  | { type: 'SET_TRACK'; payload: TrackInfo | null }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_POSITION'; payload: { position: number; duration: number } }
  | { type: 'SET_QUEUE'; payload: QueueState };

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'SET_TRACK':
      return { ...state, track: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_POSITION':
      return { ...state, position: action.payload.position, duration: action.payload.duration };
    case 'SET_QUEUE':
      return { ...state, queue: action.payload };
    default:
      return state;
  }
}

interface PlayerContextValue {
  state: FullState;
  updateState: (partial: Partial<FullState>) => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  state: defaultState,
  updateState: () => {},
});

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  const updateState = useCallback((partial: Partial<FullState>) => {
    dispatch({ type: 'UPDATE', payload: partial });
  }, []);

  useEffect(() => {
    // Restore state from audioManager (survives panel close/open)
    const track = getCurrentTrack();
    const playing = getIsPlaying();
    const volume = getVolume();
    const conn = getIsConnected();
    const position = getPosition();
    const duration = getDuration();

    dispatch({ type: 'UPDATE', payload: { track, isPlaying: playing, volume, connected: conn, position, duration } });

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

      // Fetch initial queue
      const queueData = await apiGetQueue();
      if (queueData) {
        dispatch({ type: 'SET_QUEUE', payload: { tracks: queueData.tracks ?? [], position: queueData.position ?? -1 } });
      }
    })();

    // Subscribe to audioManager events
    const unsubs = [
      addTrackListener((t) => dispatch({ type: 'SET_TRACK', payload: t })),
      addPlayStateListener((p) => dispatch({ type: 'SET_PLAYING', payload: p })),
      addVolumeListener((v) => dispatch({ type: 'UPDATE', payload: { volume: v } })),
      addPositionListener((pos, dur) => dispatch({ type: 'SET_POSITION', payload: { position: pos, duration: dur } })),
      addConnectionListener((c) => dispatch({ type: 'UPDATE', payload: { connected: c } })),
      addQueueListener((tracks, pos) => dispatch({ type: 'SET_QUEUE', payload: { tracks, position: pos } })),
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
git add src/types.ts src/context/PlayerContext.tsx
git commit -m "feat: add queue state to PlayerContext"
```

---

### Task 4: QueueView Component

**Files:**
- Create: `src/components/QueueView.tsx`

Read-only queue display. Shows tracks with thumbnails, title, artist. Current track highlighted with speaker icon. No jump or remove buttons (queue is managed from the phone).

- [ ] **Step 1: Create `src/components/QueueView.tsx`**

```tsx
import { DialogButton, Focusable } from '@decky/ui';
import { FaMusic } from 'react-icons/fa';
import { IoVolumeMedium } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import { Section } from './Section';

export const QueueView = () => {
  const { queue } = usePlayer();
  const { tracks, position } = queue;

  if (tracks.length === 0) {
    return (
      <Section>
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--gpSystemLighterGrey)' }}>
          <div style={{ marginBottom: '8px' }}><FaMusic size={32} /></div>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Queue is Empty</div>
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
            Cast a video from <strong>YouTube</strong> on your phone to start playing.
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      {tracks.map((track, index) => {
        const title = track.title ?? 'Unknown';
        const artist = track.artist ?? '';
        const isSelected = index === position;
        const thumbnail = track.albumArt;

        return (
          <Focusable
            key={track.videoId ?? `q-${index}`}
            style={{ display: 'flex', alignItems: 'stretch', marginTop: '2px', marginBottom: '2px' }}
          >
            <DialogButton
              className={isSelected ? 'yt-queue-active' : undefined}
              style={{
                flex: 1,
                textAlign: 'left',
                height: 'auto',
                minHeight: '44px',
                padding: '0',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                borderRadius: '0',
                overflow: 'hidden',
              }}
              onClick={() => {}}
            >
              {/* Thumbnail */}
              <div style={{ width: '60px', height: '60px', flexShrink: 0, alignSelf: 'center', position: 'relative', background: 'rgba(255,255,255,0.05)' }}>
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    style={{ width: '60px', height: '60px', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gpSystemLighterGrey)' }}>
                    <FaMusic size={18} />
                  </div>
                )}
                {isSelected && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IoVolumeMedium size={20} color="white" />
                  </div>
                )}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0, padding: '.55rem 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: isSelected ? 'bold' : 'normal', fontSize: '13px', display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, minWidth: 0, maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)' }}>{title}</span>
                </div>
                {artist && (
                  <div style={{ fontSize: '11px', color: 'var(--gpSystemLighterGrey)', marginTop: '2px', overflow: 'hidden', whiteSpace: 'nowrap', maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)' }}>
                    {artist}
                  </div>
                )}
              </div>
            </DialogButton>
          </Focusable>
        );
      })}
    </Section>
  );
};
```

- [ ] **Step 2: Add the queue active style**

The reference plugin injects a CSS rule for the active queue item. Add this to `src/index.tsx` inside the style injection `useEffect` in `TabsContainer`. After the existing CSS, add:

```css
.yt-queue-active:not(:focus):not(:focus-within) { background: rgba(255,255,255,0) !important; }
```

So the full style `textContent` becomes (just add the new line at the end, before the closing backtick):
```typescript
      #ytcast-container [class*="Glyphs"] {
        transform: scale(0.65) !important;
        transform-origin: center center !important;
      }
      .yt-queue-active:not(:focus):not(:focus-within) { background: rgba(255,255,255,0) !important; }
    `;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/QueueView.tsx src/index.tsx
git commit -m "feat: add QueueView component with metadata display"
```

---

### Task 5: Wire QueueView into index.tsx

**Files:**
- Modify: `src/index.tsx`

Replace the Queue tab placeholder with the real QueueView component.

- [ ] **Step 1: Add QueueView import**

Add after the PlayerView import:
```typescript
import { QueueView } from './components/QueueView';
```

- [ ] **Step 2: Replace the Queue tab placeholder**

Replace:
```typescript
    { id: 'queue', title: 'Queue', content: <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gpSystemLighterGrey)' }}>Queue — coming in Plan 3</div> },
```

With:
```typescript
    { id: 'queue', title: 'Queue', content: <QueueView /> },
```

- [ ] **Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "feat: wire QueueView into plugin tabs"
```

---

### Task 6: Edge Case Polish

**Files:**
- Modify: `src/services/audioManager.ts` (minor)

Polish edge cases for bidirectional sync, reconnection, and panel lifecycle.

- [ ] **Step 1: Verify WebSocket reconnect fetches fresh state**

In `src/services/audioManager.ts`, update the WebSocket `onopen` handler to fetch fresh state on reconnect:

Replace:
```typescript
  ws.onopen = () => {
    console.log('[YTCast] WebSocket connected');
    reconnectDelay = 1000;
  };
```

With:
```typescript
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
  };
```

This ensures that after a WebSocket reconnect (e.g., after sleep/wake), the frontend immediately fetches the current state from the backend rather than waiting for the next state change.

- [ ] **Step 2: Commit**

```bash
git add src/services/audioManager.ts
git commit -m "feat: fetch fresh state on WebSocket reconnect"
```

---

### Task 7: Build Verification

**Files:** None new.

- [ ] **Step 1: Build frontend**

Run:
```bash
pnpm run build
```
Expected: `dist/index.js` builds with no errors.

- [ ] **Step 2: Build backend**

Run:
```bash
pnpm run build:backend
```
Expected: `backend/out/server.js` builds with no errors.

- [ ] **Step 3: Run all tests**

Run:
```bash
pnpm test
```
Expected: All 12 tests pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build verification findings"
```

(Only if fixes were needed.)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: Plan 3 complete — Queue tab and sync polish implemented"
```
