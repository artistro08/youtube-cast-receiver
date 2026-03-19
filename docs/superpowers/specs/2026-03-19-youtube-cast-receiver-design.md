# YouTube Cast Receiver for Steam Deck — Design Spec

## Overview

A Decky Loader plugin that turns the Steam Deck into a YouTube Cast receiver. Users pair once from the YouTube or YouTube Music app on their phone, and the connection auto-restores whenever the plugin is active. The plugin provides a Player tab (album art, track info, progress bar, playback controls, volume) and a Queue tab, matching the UI of [decky-youtube-music-player](https://github.com/artistro08/decky-youtube-music-player).

## Architecture

**Thin frontend, smart backend.** The Node.js backend owns all state — cast receiver, queue, playback position, pairings. The frontend is a view layer. The `<audio>` element lives in the frontend, but the backend tells it what to play via WebSocket. The frontend reports `currentTime` back so the phone's YouTube app shows accurate progress.

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
│  │  (handles pairing, protocol)  │  │
│  └──────────┬────────────────────┘  │
│             ▼                       │
│  ┌───────────────────────────────┐  │
│  │  CastPlayer                   │  │
│  │  - queue management           │  │
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
│  │  - ~/.config/decky-youtube-   │  │
│  │    cast/datastore.json        │  │
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

1. Phone discovers the receiver via DIAL on the local network.
2. User pairs once — pairing tokens stored in `JsonDataStore`.
3. On plugin load, backend starts `yt-cast-receiver` with persisted pairings — phone auto-reconnects.
4. When user casts a video, backend receives it, extracts streaming URL via `yt-dlp`, pushes to frontend via WebSocket.
5. Frontend loads URL into `<audio>`, reports `currentTime` back to backend every ~1s.
6. Backend relays progress to phone so the YouTube app's seekbar stays accurate.
7. User controls (play/pause/next/prev) from Decky panel → REST call → backend updates state → pushes to phone + frontend.

## Backend Design

**Entry point:** `backend/src/server.ts` — bundled into a single file via esbuild.

### CastReceiver Setup

- Instantiates `yt-cast-receiver` with a custom `CastPlayer` implementation and `JsonDataStore`.
- Auto-detects hostname via `os.hostname()` for the device name.
- Starts on plugin load, stops on plugin unload.

### CastPlayer (yt-cast-receiver Player Interface)

- `play(videoId)` — calls `yt-dlp` to extract audio URL, sends it to frontend via WebSocket.
- `pause()`, `resume()`, `stop()` — updates state, notifies frontend + cast sender.
- `next()`, `previous()` — advances queue, extracts new URL, pushes to frontend.
- `setVolume(volume)` — forwards to frontend.
- `getPosition()` / `getDuration()` — returns values received from frontend's `<audio>` element.
- `seek(position)` — tells frontend to seek the `<audio>` element.

### JsonDataStore

- Extends `yt-cast-receiver`'s abstract `DataStore` class.
- Reads/writes to `~/.config/decky-youtube-cast/datastore.json`.
- Persists pairing tokens so the phone reconnects automatically.

### HTTP REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/play` | Toggle play/resume |
| POST | `/api/pause` | Pause |
| POST | `/api/next` | Next track |
| POST | `/api/prev` | Previous track |
| POST | `/api/seek` | Seek to position |
| POST | `/api/volume` | Set volume (0-100) |
| GET | `/api/state` | Full state snapshot |
| GET | `/api/queue` | Get queue |
| POST | `/api/queue/jump` | Jump to queue index |
| POST | `/api/queue/remove` | Remove from queue |

### WebSocket Messages (Backend → Frontend)

| Event | Payload | Trigger |
|-------|---------|---------|
| `track` | `{videoId, title, artist, albumArt, duration, url}` | New track to play |
| `state` | `{isPlaying, volume, position, duration}` | State change from phone or backend |
| `queue` | `{tracks[], position}` | Queue updated |
| `stop` | `{}` | Playback stopped |
| `seek` | `{position}` | Phone seeked |
| `volume` | `{value}` | Volume changed from phone |

### WebSocket Messages (Frontend → Backend)

| Event | Payload | Purpose |
|-------|---------|---------|
| `progress` | `{currentTime, duration}` | Periodic progress (~1s) so phone seekbar stays accurate |

### yt-dlp Integration

- Spawns `yt-dlp` as a subprocess: `yt-dlp -f bestaudio[ext=m4a] -g <videoId>`
- Returns the direct audio streaming URL.
- Bundled as a binary alongside the Node.js binary.

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
- Listens for WebSocket events (`track`, `state`, `queue`, `stop`, `seek`, `volume`).
- Dispatches state updates to all consuming components.
- Survives panel close/open — WebSocket reconnects automatically.

### audioManager

- Persistent `<audio>` element in the DOM (same pattern as reference plugin).
- Receives streaming URLs from PlayerContext (via WebSocket `track` event).
- Reports `currentTime` back to backend every ~1s via WebSocket `progress` message.
- Handles `ended` event → tells backend track finished.
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

- `_main()` → spawns `bin/node backend/out/server.js` as a subprocess.
- `_unload()` → kills the Node.js process.
- No other endpoints — all communication goes directly from frontend to Node.js over localhost.

### Process Lifecycle

1. **Plugin loads** → `main.py._main()` spawns Node.js backend.
2. **Node.js starts** → starts HTTP/WS server on port `39281`, initializes `yt-cast-receiver` with persisted DataStore.
3. **Cast receiver advertises** → phone discovers it on the network.
4. **Phone reconnects** → if previously paired, auto-connects using persisted tokens.
5. **Plugin unloads** → `main.py._unload()` sends SIGTERM to Node.js process, receiver stops advertising.

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
- Implement `JsonDataStore` (pairing persistence).
- Implement `CastPlayer` (yt-cast-receiver Player interface).
- Wire up `yt-cast-receiver` with hostname detection.
- Implement yt-dlp URL extraction.
- HTTP REST endpoints + WebSocket server.
- `main.py` shim to spawn/kill Node.js.
- Verify: cast receiver advertises, phone can discover and pair.

### Plan 2: Frontend — Player Tab

- Set up frontend structure (index.tsx, types, context, services).
- Implement `audioManager` (audio element, progress reporting, WebSocket comms).
- Implement `PlayerContext` (WebSocket connection, state management).
- Build `PlayerView` (album art, track info, progress bar, controls, volume).
- Build `ProgressBar` component.
- Port `VolumeSlider` and `Section` from reference.
- Verify: cast a video from phone → plays on Deck with working controls.

### Plan 3: Frontend — Queue Tab & Bidirectional Sync

- Build `QueueView` (track list, jump, remove).
- Implement real-time queue updates via WebSocket.
- Bidirectional state sync (phone <-> Decky panel controls, seekbar, play/pause).
- Progress reporting back to phone (so phone seekbar is accurate).
- Handle edge cases (disconnect/reconnect, panel close/open, sleep/wake).

### Plan 4: Build Pipeline & Packaging

- `build.ps1` script.
- Download/bundle Node.js + yt-dlp Linux binaries.
- ZIP packaging in Decky format.
- End-to-end test: install ZIP on Steam Deck, pair, cast, verify everything works.
