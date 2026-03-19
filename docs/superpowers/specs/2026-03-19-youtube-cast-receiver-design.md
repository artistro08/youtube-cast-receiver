# YouTube Cast Receiver for Steam Deck — Design Spec

## Overview

A Decky Loader plugin that turns the Steam Deck into a YouTube Cast receiver. Users pair once from the YouTube or YouTube Music app on their phone, and the connection auto-restores whenever the plugin is active. The plugin provides a Player tab (album art, track info, progress bar, playback controls, volume) and a Queue tab, matching the UI of [decky-youtube-music-player](https://github.com/artistro08/decky-youtube-music-player).

This is an **audio-only** receiver. When a user casts a regular YouTube video, only the audio plays. The UI shows "Playing audio only" when the cast source is a video rather than a music track.

## Architecture

**Thin frontend, smart backend.** The Node.js backend owns all state — cast receiver, playback position, pairings. The `yt-cast-receiver` library owns the queue/playlist internally. The frontend is a view layer. The `<audio>` element lives in the frontend, but the backend tells it what to play via WebSocket. The frontend reports `currentTime` back so the phone's YouTube app shows accurate progress.

```
┌─────────────────────────────────────┐
│         YouTube / YT Music App      │
│            (on phone)               │
└──────────────┬──────────────────────┘
               │ DIAL / Cast protocol
               ▼
┌─────────────────────────────────────┐
│        Node.js Backend              │
│  ┌───────────────────────────────┐  │
│  │  yt-cast-receiver             │  │
│  │  (handles pairing, protocol,  │  │
│  │   queue/playlist management)  │  │
│  └──────────┬────────────────────┘  │
│             ▼                       │
│  ┌───────────────────────────────┐  │
│  │  CastPlayer (do*() methods)   │  │
│  │  - responds to library calls  │  │
│  │  - state tracking             │  │
│  │  - yt-dlp URL extraction      │  │
│  └──────────┬────────────────────┘  │
│             │                       │
│  ┌──────────┴────────────────────┐  │
│  │  HTTP REST    │  WebSocket    │  │
│  │  (commands)   │  (state push) │  │
│  └──────────┬────┴───────────────┘  │
│             │                       │
│  ┌───────────────────────────────┐  │
│  │  JsonDataStore                │  │
│  │  - persisted pairings         │  │
│  │  - <plugin_dir>/datastore.json│  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │ localhost:39281
               ▼
┌─────────────────────────────────────┐
│      Decky Frontend (React)         │
│  ┌────────────┬──────────────────┐  │
│  │ Player Tab │   Queue Tab      │  │
│  │ - art      │   - track list   │  │
│  │ - info     │   - jump/remove  │  │
│  │ - progress │                  │  │
│  │ - controls │                  │  │
│  │ - volume   │                  │  │
│  └────────────┴──────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  <audio> element (hidden)     │  │
│  │  - plays streaming URLs       │  │
│  │  - reports currentTime back   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Key Flows

1. Phone discovers the receiver via DIAL/SSDP on the local network (see Network Requirements).
2. User pairs once — pairing tokens stored in `JsonDataStore`.
3. On plugin load, backend starts `yt-cast-receiver` with persisted pairings — phone auto-reconnects.
4. When user casts a video, the library calls `CastPlayer.doPlay(video)` — backend extracts streaming URL via `yt-dlp` lazily (at play time, not queue time), pushes to frontend via WebSocket.
5. Frontend loads URL into `<audio>`, reports `currentTime` back to backend every ~1s.
6. Backend relays progress to phone so the YouTube app's seekbar stays accurate.
7. User controls (play/pause/next/prev) from Decky panel → REST call → backend calls library methods (`player.next()`, `player.previous()`) → library calls `CastPlayer.doPlay()` with the next track → pushes to phone + frontend.

### Network Requirements

The DIAL/SSDP discovery protocol requires:
- **Multicast UDP** on `239.255.255.250:1900` — the receiver must respond to SSDP discovery.
- **TCP port** in the `8008-8009` range — for the DIAL REST service.
- **TCP port `39281`** — for the HTTP REST / WebSocket server (frontend ↔ backend).

Since Decky Loader's Python process runs as **root**, the spawned Node.js child inherits root privileges and can bind to these ports without additional configuration. SteamOS does not enable a firewall by default, so multicast should work out of the box. If a user has manually enabled `iptables` rules, they will need to allow inbound UDP 1900 and TCP 8008-8009.

## Backend Design

**Entry point:** `backend/src/server.ts` — bundled into a single file via esbuild.

### CastReceiver Setup

- Instantiates `yt-cast-receiver` with a custom `CastPlayer` implementation and `JsonDataStore`.
- Auto-detects hostname via `os.hostname()` for the device name.
- Starts on plugin load, stops on plugin unload.

### CastPlayer (yt-cast-receiver Player Interface)

Implements the `do*()` abstract methods from the library's `Player` class. The library owns the queue/playlist — `CastPlayer` does **not** manage the queue independently.

- `doPlay(video: Video)` — receives a `Video` object (with `.id`, `.context`, etc.). Calls `yt-dlp` to extract audio URL, sends it to frontend via WebSocket.
- `doPause()` — updates state, notifies frontend.
- `doResume()` — updates state, notifies frontend.
- `doStop()` — stops playback, notifies frontend.
- `doSeek(position: number)` — tells frontend to seek the `<audio>` element.
- `doSetVolume(volume: Volume)` — receives `{ level: number, muted: boolean }` from library. Maps `level` to 0-100 integer for frontend. Forwards to frontend.
- `doGetVolume(): Volume` — returns `{ level: number, muted: boolean }` from cached state.
- `doGetPosition(): number` — returns position received from frontend's `<audio>` progress reports.
- `doGetDuration(): number` — returns duration received from frontend's `<audio>` progress reports.

For user-initiated next/prev from the Decky panel, the REST endpoints call the library's `player.next()` / `player.previous()` wrapper methods (not custom queue logic). The library then calls `doPlay()` with the appropriate track.

Queue state is read from `player.queue` (the library's `Playlist` instance) when the frontend requests it.

### JsonDataStore

- Extends `yt-cast-receiver`'s abstract `DataStore` class.
- Reads/writes to the plugin's settings directory: `/home/deck/homebrew/settings/youtube-cast-receiver/datastore.json` (absolute path, not `~`, since the process runs as root).
- Persists pairing tokens so the phone reconnects automatically.

### HTTP REST Endpoints

| Method | Path | Purpose | Response Shape |
|--------|------|---------|----------------|
| GET | `/api/health` | Readiness check | `{ ready: boolean }` |
| GET | `/api/state` | Full state snapshot | `{ track: TrackInfo \| null, isPlaying: boolean, volume: number, position: number, duration: number, connected: boolean }` |
| GET | `/api/queue` | Get queue from library's Playlist | `{ tracks: TrackInfo[], position: number }` |
| POST | `/api/play` | Toggle play/resume | `{ ok: boolean }` |
| POST | `/api/pause` | Pause | `{ ok: boolean }` |
| POST | `/api/next` | Next track (calls library) | `{ ok: boolean }` |
| POST | `/api/prev` | Previous track (calls library) | `{ ok: boolean }` |
| POST | `/api/seek` | Seek to position | `{ ok: boolean }` |
| POST | `/api/volume` | Set volume (0-100) | `{ ok: boolean }` |
| POST | `/api/queue/jump` | Jump to queue index | `{ ok: boolean }` |
| POST | `/api/queue/remove` | Remove from queue | `{ ok: boolean }` |

### WebSocket Messages (Backend → Frontend)

| Event | Payload | Trigger |
|-------|---------|---------|
| `track` | `{videoId, title, artist, albumArt, duration, url}` | New track to play |
| `state` | `{isPlaying, volume, position, duration}` | State change from phone or backend |
| `queue` | `{tracks[], position}` | Queue updated |
| `stop` | `{}` | Playback stopped |
| `seek` | `{position}` | Phone seeked |
| `volume` | `{value}` | Volume changed from phone |
| `error` | `{message, code}` | yt-dlp failure, playback error |
| `connection` | `{phoneConnected: boolean}` | Phone connected/disconnected |

### WebSocket Messages (Frontend → Backend)

| Event | Payload | Purpose |
|-------|---------|---------|
| `progress` | `{currentTime, duration}` | Periodic progress (~1s) so phone seekbar stays accurate |
| `ended` | `{}` | Audio element finished playing current track |
| `playbackError` | `{message}` | `<audio>` element error (e.g. 403 expired URL) |

### yt-dlp Integration

- Spawns `yt-dlp` as a subprocess: `yt-dlp -f bestaudio[ext=m4a] -g <videoId>`
- Returns the direct audio streaming URL.
- Bundled as a binary alongside the Node.js binary.

**Lazy URL extraction:** Streaming URLs are extracted only when a track is about to play (inside `doPlay()`), never ahead of time. YouTube URLs expire after ~6 hours, so pre-fetching would cause failures for queued tracks.

**Expired URL recovery:** When the frontend reports a `playbackError` (HTTP 403 or similar), the backend re-extracts the URL via `yt-dlp` and sends a new `track` message. If the second attempt also fails, it sends an `error` event and advances to the next track.

**PO Token / anti-bot considerations:** YouTube enforces Proof of Origin (PO) tokens for many playback requests. The `yt-dlp` invocation may need `--cookies-from-browser` or a `--po-token` argument depending on YouTube's current enforcement. The initial implementation will use bare `yt-dlp`. If extraction fails due to bot detection, Plan 1 will add cookie/PO token support as a follow-up step — either by bundling a PO token provider plugin (e.g. `yt-dlp-get-pot`) or by allowing users to provide browser cookies via a settings mechanism. This is the biggest feasibility risk for the project.

**yt-dlp self-update:** On plugin load, the backend runs `yt-dlp -U` to update the bundled binary. This keeps the extractor current as YouTube changes its anti-bot measures. If the update fails (no network, permissions), it falls back to the bundled version silently.

## Frontend Design

### File Structure

```
src/
├── index.tsx              # Plugin registration, titleView, audio init
├── types.ts               # TrackInfo, PlayerState types
├── context/
│   └── PlayerContext.tsx   # State management, WebSocket connection
├── services/
│   └── audioManager.ts    # <audio> element, playback, progress reporting
└── components/
    ├── Section.tsx         # Reusable section wrapper
    ├── PlayerView.tsx      # Player tab
    ├── QueueView.tsx       # Queue tab
    ├── ProgressBar.tsx     # Track progress slider
    └── VolumeSlider.tsx    # Volume slider
```

### PlayerContext

- On mount: opens WebSocket to backend, fetches initial state via `GET /api/state`.
- Listens for WebSocket events (`track`, `state`, `queue`, `stop`, `seek`, `volume`, `error`, `connection`).
- Dispatches state updates to all consuming components.
- Survives panel close/open — WebSocket reconnects automatically with exponential backoff.
- Tracks `phoneConnected` state so the UI can show connection status.

### audioManager

- Persistent `<audio>` element in the DOM (same pattern as reference plugin).
- Receives streaming URLs from PlayerContext (via WebSocket `track` event).
- Reports `currentTime` back to backend every ~1s via WebSocket `progress` message.
- Handles `ended` event → sends `ended` message to backend via WebSocket.
- Handles `error` event → sends `playbackError` message to backend (triggers URL re-extraction).
- Handles `seek` commands from backend (phone user dragged seekbar).

### PlayerView Layout (top to bottom)

1. **Album art + title/artist** — 60x60 thumbnail, track name, artist name.
2. **Progress bar** — SliderField showing elapsed/total time, draggable to seek. Styled like VolumeSlider.
3. **Playback controls** — Prev / Play-Pause / Next as a 3-button horizontal `DialogButton` row.
4. **Volume slider** — Speaker icon + SliderField (0-100).

### QueueView

- Scrollable list of tracks with thumbnail, title, artist.
- Currently playing track highlighted with speaker icon overlay.
- Click to jump, X button to remove.
- Updates in real-time via WebSocket `queue` events.

### index.tsx

- `definePlugin()` — inits audio, establishes WebSocket.
- `titleView` — "YouTube Cast" header.
- Two tabs: Player and Queue (using Decky `Tabs` component).
- `onDismount()` — destroys audio, closes WebSocket.

## Build, Packaging & Process Lifecycle

### Build Pipeline

```
Frontend:  pnpm run build         → rollup   → dist/index.js
Backend:   pnpm run build:backend → esbuild  → backend/out/server.js
```

### Package Structure (ZIP)

```
youtube-cast-receiver/
├── dist/
│   └── index.js              # Frontend bundle
├── backend/
│   └── out/
│       └── server.js          # Backend bundle (single file)
├── bin/
│   ├── node                   # Prebuilt Node.js binary (linux x86_64)
│   └── yt-dlp                 # yt-dlp binary (linux x86_64)
├── package.json
├── plugin.json
├── main.py                    # Thin shim — spawns/kills Node.js process
└── LICENSE
```

### main.py (Minimal Shim)

Decky requires `main.py`, so it acts as a thin process manager:

- `_main()` → spawns `bin/node backend/out/server.js` as a subprocess. Waits for a readiness signal (Node.js prints `READY` to stdout) before returning, so the frontend knows the backend is available.
- `_unload()` → sends SIGTERM to Node.js process, waits for graceful shutdown (2s timeout), then SIGKILL if needed.
- No other endpoints — all communication goes directly from frontend to Node.js over localhost.

### Process Lifecycle

1. **Plugin loads** → `main.py._main()` spawns Node.js backend, waits for `READY` signal.
2. **Node.js starts** → starts HTTP/WS server on port `39281`, initializes `yt-cast-receiver` with persisted DataStore, runs `yt-dlp -U`, prints `READY` to stdout.
3. **Cast receiver advertises** → phone discovers it on the network via SSDP.
4. **Phone reconnects** → if previously paired, auto-connects using persisted tokens.
5. **Plugin unloads** → `main.py._unload()` sends SIGTERM to Node.js process, receiver stops advertising.

### Port Conflict Handling

If port `39281` is already in use, the backend logs a clear error and exits with a non-zero code. `main.py` detects this and logs the failure. The frontend shows a connection error state. A future enhancement could support configurable ports via the DataStore.

### Sleep/Wake Resilience

When the Steam Deck sleeps and wakes:
- The Node.js process continues running but network state is stale.
- The cast receiver re-advertises on SSDP after detecting network change.
- The frontend's WebSocket reconnects with exponential backoff.
- Any in-progress streaming URL is re-validated on next play action; if expired, a fresh URL is extracted via `yt-dlp`.

### Build Script (`build.ps1`)

PowerShell script for Windows development:

1. `pnpm install`
2. `pnpm run build` (frontend via rollup)
3. `pnpm run build:backend` (backend via esbuild)
4. Download/copy Node.js binary (linux x86_64) into `bin/`
5. Download/copy yt-dlp binary (linux x86_64) into `bin/`
6. `Compress-Archive` → `youtube-cast-receiver.zip`

Also available as `pnpm run package`.

## Sub-project Decomposition

### Plan 1: Project Scaffolding & Backend Core

- Initialize Decky plugin from template (package.json, plugin.json, tsconfig, rollup config).
- Set up esbuild for backend.
- Implement `JsonDataStore` (pairing persistence at `/home/deck/homebrew/settings/youtube-cast-receiver/datastore.json`).
- Implement `CastPlayer` (`do*()` methods from yt-cast-receiver Player interface).
- Wire up `yt-cast-receiver` with hostname detection.
- Implement yt-dlp URL extraction (lazy, with expired URL retry).
- HTTP REST endpoints + WebSocket server.
- `main.py` shim to spawn/kill Node.js (with READY signal).
- Health check endpoint.
- Address PO token / cookie support if bare yt-dlp fails.
- Verify: cast receiver advertises, phone can discover and pair.

### Plan 2: Frontend — Player Tab

- Set up frontend structure (index.tsx, types, context, services).
- Implement `audioManager` (audio element, progress reporting, WebSocket comms, ended/error events).
- Implement `PlayerContext` (WebSocket connection with reconnect backoff, state management, connection status).
- Build `PlayerView` (album art, track info, progress bar, controls, volume).
- Build `ProgressBar` component.
- Port `VolumeSlider` and `Section` from reference.
- Verify: cast a video from phone → plays on Deck with working controls.

### Plan 3: Frontend — Queue Tab & Bidirectional Sync

- Build `QueueView` (track list, jump, remove — reads from library's Playlist via REST).
- Implement real-time queue updates via WebSocket.
- Bidirectional state sync (phone ↔ Decky panel controls, seekbar, play/pause).
- Progress reporting back to phone (so phone seekbar is accurate).
- Handle edge cases (disconnect/reconnect, panel close/open, sleep/wake resilience).

### Plan 4: Build Pipeline & Packaging

- `build.ps1` script.
- Download/bundle Node.js + yt-dlp Linux binaries.
- ZIP packaging in Decky format.
- End-to-end test: install ZIP on Steam Deck, pair, cast, verify everything works.
