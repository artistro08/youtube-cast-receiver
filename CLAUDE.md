# CLAUDE.md

## Project Overview

YouTube Cast Receiver — a Decky Loader plugin for Steam Deck that acts as a YouTube Cast receiver. Users cast from the YouTube/YouTube Music app on their phone; audio plays through the Steam Deck.

## Architecture

- **Frontend**: React/TypeScript using `@decky/ui` and `@decky/api`. Bundled with Rollup (`pnpm run build` → `dist/index.js`).
- **Backend**: Node.js/TypeScript using `yt-cast-receiver` for the cast protocol. Bundled with esbuild as **CJS** (not ESM — `peer-dial` uses `await` as a method name which breaks ESM strict mode). Output: `backend/out/server.js`.
- **Process management**: Python `main.py` is the Decky entry point. It spawns the Node.js backend as a subprocess and waits for a `READY` signal on stdout.
- **Communication**: HTTP REST on `127.0.0.1:39281` for commands (play/pause/next/prev/seek/volume). WebSocket on the same port for real-time state push.

## Key Files

### Backend (`backend/src/`)
- `server.ts` — Entry point. Wires CastPlayer, DataStore, HTTP/WS server, receiver events, sleep detection.
- `CastPlayer.ts` — Extends `yt-cast-receiver`'s `Player` abstract class. Implements `do*()` methods. Manages metadata cache, oEmbed enrichment.
- `JsonDataStore.ts` — Extends `yt-cast-receiver`'s `DataStore`. Reads/writes to JSON file for pairing persistence and volume.
- `ytdlp.ts` — Spawns `yt-dlp` subprocess. **Must strip `LD_LIBRARY_PATH` and `PYTHONPATH`** or Decky's environment breaks PyInstaller's bundled OpenSSL.
- `httpServer.ts` — REST endpoints using Node.js `http` module (no Express).
- `wsManager.ts` — WebSocket connection manager.

### Frontend (`src/`)
- `index.tsx` — Plugin registration, tabs (Player/Queue), audio lifecycle.
- `services/audioManager.ts` — Module-scoped `<audio>` element and WebSocket connection. Survives panel close/open. Handles progress reporting, REST helpers.
- `context/PlayerContext.tsx` — React context for track, playback state, queue. **Volume is NOT in PlayerContext** — VolumeSlider subscribes directly to audioManager to avoid feedback loops.
- `components/VolumeSlider.tsx` — Subscribes directly to audioManager, uses module-level cache. Sets audio volume immediately on drag, debounces backend API call.
- `components/ProgressBar.tsx` — Uses `seekingRef` (not state) to guard against position updates during seek drag.
- `components/PlayerView.tsx` — Album art, track info, progress bar, controls, volume.
- `components/QueueView.tsx` — Read-only queue display. Tap to jump (uses current video's client to construct a Video object).

### Other
- `main.py` — Python shim for Decky. Spawns/kills Node.js.
- `build.ps1` — PowerShell build script. Downloads Node.js + yt-dlp Linux binaries, packages ZIP.
- `backend/xml/` — DIAL XML templates copied from `peer-dial` (needed at runtime because esbuild changes `__dirname`).
- `backend/out/package.json` — `{"type":"commonjs"}` override so Node.js loads the CJS bundle correctly despite root `"type":"module"`.

## Build Commands

```bash
pnpm install              # Install dependencies
pnpm run build            # Build frontend (Rollup → dist/index.js)
pnpm run build:backend    # Build backend (esbuild → backend/out/server.js)
pnpm test                 # Run backend tests (vitest)
pnpm run package          # Full build + download binaries + ZIP (calls build.ps1)
```

## Important Patterns

- **yt-dlp must be spawned with clean environment**: `{ env: { ...process.env, LD_LIBRARY_PATH: '', PYTHONPATH: '' } }`. Without this, Decky's `LD_LIBRARY_PATH` overrides PyInstaller's bundled OpenSSL and yt-dlp crashes.
- **CJS bundle, not ESM**: The `peer-dial` dependency (via `yt-cast-receiver`) uses `await` as a method name in the `gate` package, which is a syntax error in ESM strict mode. Backend must be `--format=cjs`.
- **Volume bypasses React context**: To prevent feedback loops between phone and Deck volume controls, VolumeSlider subscribes directly to audioManager — not through PlayerContext.
- **SSDP UUID is persisted**: Stored in DataStore (`ssdp.uuid`) so the device looks the same across reinstalls. Without this, each reinstall creates a duplicate entry in the YouTube cast list.
- **Queue is sender-controlled**: The `yt-cast-receiver` library owns the queue. No public API to jump to arbitrary indices or remove items. Queue jumping works by constructing a Video object from the current video's client.
- **DataStore path**: `/home/deck/homebrew/settings/youtube-cast-receiver/datastore.json` (absolute, not `~`, since process runs as root).

## Testing

Backend tests only (frontend depends on Decky SDK/Steam CEF):
- `backend/tests/JsonDataStore.test.ts` — 6 tests
- `backend/tests/ytdlp.test.ts` — 3 tests (mocked spawn)
- `backend/tests/httpServer.test.ts` — 3 tests

## Deployment

After building, copy `youtube-cast-receiver.zip` to `D:/` for transfer to Steam Deck. Must **uninstall** existing plugin before reinstalling (the old Node.js process holds port 39281).

## Gotchas

- `backend/xml/` files are copied from `node_modules/@patrickkfkan/peer-dial/xml/` — if `peer-dial` updates, these need to be re-copied.
- `yt-dlp -U` (self-update) runs on plugin load but may fail silently.
- Sleep detection uses timer drift (5s interval, 15s tolerance) to detect when the Steam Deck wakes from sleep and pauses playback.
- The `senderConnect` event triggers a 2-second delayed volume restore to override the phone's default volume (usually 100%).
