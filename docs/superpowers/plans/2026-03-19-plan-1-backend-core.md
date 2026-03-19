# Plan 1: Project Scaffolding & Backend Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Decky plugin project structure and implement the complete Node.js backend — cast receiver, REST API, WebSocket server, yt-dlp integration, and the Python shim.

**Architecture:** Node.js backend using `yt-cast-receiver` for the YouTube Cast/DIAL protocol, `yt-dlp` for audio URL extraction, `http` module for REST endpoints, `ws` for WebSocket. The library owns the queue/playlist; our `CastPlayer` implements the `do*()` abstract methods. Python `main.py` spawns the Node.js process as a subprocess.

**Tech Stack:** TypeScript, Node.js 20+, yt-cast-receiver, ws, esbuild, vitest, rollup, @decky/ui, @decky/api, Python 3

**Reference docs:**
- yt-cast-receiver API: https://github.com/patrickkfkan/yt-cast-receiver
- Decky plugin template: https://github.com/SteamDeckHomebrew/decky-plugin-template
- Design spec: `docs/superpowers/specs/2026-03-19-youtube-cast-receiver-design.md`

---

## File Structure (created by this plan)

```
youtube-cast-receiver/
├── src/                         # Frontend (placeholder for Plan 2)
│   └── index.tsx
├── backend/
│   ├── src/
│   │   ├── server.ts            # Entry point — wires everything, starts receiver
│   │   ├── CastPlayer.ts        # Player implementation (do*() methods)
│   │   ├── JsonDataStore.ts     # Persistent key-value store for pairings
│   │   ├── ytdlp.ts             # yt-dlp subprocess wrapper
│   │   ├── httpServer.ts        # HTTP REST endpoints
│   │   └── wsManager.ts         # WebSocket connection manager
│   └── tests/
│       ├── JsonDataStore.test.ts
│       ├── ytdlp.test.ts
│       └── httpServer.test.ts
├── main.py                      # Python shim — spawns/kills Node.js
├── package.json
├── plugin.json
├── tsconfig.json                # Frontend TypeScript config
├── backend/tsconfig.json        # Backend TypeScript config (for IDE)
├── rollup.config.js             # Frontend bundler
├── vitest.config.ts             # Test configuration
└── .gitignore
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `plugin.json`
- Create: `tsconfig.json`
- Create: `rollup.config.js`
- Create: `vitest.config.ts`
- Create: `backend/tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.tsx` (minimal placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "youtube-cast-receiver",
  "version": "0.0.1",
  "description": "YouTube Cast Receiver for Steam Deck via Decky Loader",
  "type": "module",
  "scripts": {
    "build": "rollup -c",
    "build:backend": "esbuild backend/src/server.ts --bundle --platform=node --format=esm --outfile=backend/out/server.js --external:bufferutil --external:utf-8-validate --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "powershell -ExecutionPolicy Bypass -File build.ps1"
  },
  "license": "BSD-3-Clause",
  "devDependencies": {
    "@decky/rollup": "^1.0.2",
    "@decky/ui": "^4.11.0",
    "@rollup/rollup-linux-x64-musl": "^4.53.3",
    "@types/node": "^20.11.0",
    "@types/react": "19.1.1",
    "@types/react-dom": "19.1.1",
    "@types/ws": "^8.5.10",
    "esbuild": "^0.20.0",
    "rollup": "^4.53.3",
    "typescript": "^5.6.2",
    "vitest": "^1.2.0"
  },
  "dependencies": {
    "@decky/api": "^1.1.3",
    "react-icons": "^5.3.0",
    "tslib": "^2.7.0",
    "ws": "^8.16.0",
    "yt-cast-receiver": "^2.1.0"
  },
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": [
        "react",
        "react-dom"
      ]
    }
  }
}
```

- [ ] **Step 2: Create `plugin.json`**

```json
{
  "name": "YouTube Cast Receiver",
  "author": "artistro08",
  "flags": ["_root"],
  "api_version": 1,
  "publish": {
    "tags": ["music", "youtube", "cast"],
    "description": "Turn your Steam Deck into a YouTube Cast receiver.",
    "image": ""
  }
}
```

- [ ] **Step 3: Create `tsconfig.json` (frontend)**

```json
{
  "compilerOptions": {
    "outDir": "dist",
    "module": "ESNext",
    "target": "ES2020",
    "jsx": "react-jsx",
    "declaration": false,
    "moduleResolution": "node",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noImplicitAny": true,
    "strict": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "backend"]
}
```

- [ ] **Step 4: Create `backend/tsconfig.json` (backend — IDE only, esbuild handles compilation)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "out",
    "rootDir": "src",
    "declaration": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noImplicitAny": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 5: Create `rollup.config.js`**

```javascript
import deckyPlugin from "@decky/rollup";

export default deckyPlugin({});
```

- [ ] **Step 6: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
backend/out/
bin/
*.zip
.idea/
.vscode/
*.log
```

- [ ] **Step 8: Create `src/index.tsx` (minimal placeholder so frontend builds)**

```tsx
import { definePlugin } from '@decky/api';
import { FaChromecast } from 'react-icons/fa';

export default definePlugin(() => {
  return {
    name: 'YouTube Cast Receiver',
    content: <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gpSystemLighterGrey)' }}>YouTube Cast Receiver — backend starting...</div>,
    icon: <FaChromecast />,
    onDismount() {},
  };
});
```

- [ ] **Step 9: Create directory structure**

Run:
```bash
mkdir -p backend/src backend/tests backend/out src
```

- [ ] **Step 10: Install dependencies**

Run:
```bash
pnpm install
```
Expected: `node_modules/` created, lock file generated, no errors.

- [ ] **Step 11: Verify frontend builds**

Run:
```bash
pnpm run build
```
Expected: `dist/index.js` created with no errors.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml plugin.json tsconfig.json rollup.config.js vitest.config.ts backend/tsconfig.json .gitignore src/index.tsx
git commit -m "feat: scaffold Decky plugin project structure"
```

---

### Task 2: JsonDataStore

**Files:**
- Create: `backend/src/JsonDataStore.ts`
- Create: `backend/tests/JsonDataStore.test.ts`

The `yt-cast-receiver` library's `DataStore` abstract class has two methods: `set<T>(key, value): Promise<void>` and `get<T>(key): Promise<T | null>`. Our implementation writes to a JSON file on disk.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/JsonDataStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonDataStore } from '../src/JsonDataStore.js';

describe('JsonDataStore', () => {
  let tmpDir: string;
  let filePath: string;
  let store: JsonDataStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcast-test-'));
    filePath = path.join(tmpDir, 'datastore.json');
    store = new JsonDataStore(filePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for missing key', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('stores and retrieves a string value', async () => {
    await store.set('token', 'abc123');
    const result = await store.get<string>('token');
    expect(result).toBe('abc123');
  });

  it('stores and retrieves an object value', async () => {
    const data = { screenId: 'xyz', pairingCode: '1234' };
    await store.set('pairing', data);
    const result = await store.get<typeof data>('pairing');
    expect(result).toEqual(data);
  });

  it('persists data to disk', async () => {
    await store.set('key1', 'value1');

    // Create a new store instance pointing to the same file
    const store2 = new JsonDataStore(filePath);
    const result = await store2.get<string>('key1');
    expect(result).toBe('value1');
  });

  it('overwrites existing keys', async () => {
    await store.set('key', 'old');
    await store.set('key', 'new');
    const result = await store.get<string>('key');
    expect(result).toBe('new');
  });

  it('creates parent directories if they do not exist', async () => {
    const nestedPath = path.join(tmpDir, 'a', 'b', 'c', 'store.json');
    const nestedStore = new JsonDataStore(nestedPath);
    await nestedStore.set('deep', 'value');
    const result = await nestedStore.get<string>('deep');
    expect(result).toBe('value');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test -- backend/tests/JsonDataStore.test.ts
```
Expected: FAIL — `Cannot find module '../src/JsonDataStore.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/JsonDataStore.ts`:

```typescript
import { DataStore } from 'yt-cast-receiver';
import fs from 'node:fs';
import path from 'node:path';

export class JsonDataStore extends DataStore {
  private filePath: string;
  private data: Record<string, unknown>;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.data = this.loadFromDisk();
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.saveToDisk();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = this.data[key];
    return value !== undefined ? (value as T) : null;
  }

  private loadFromDisk(): Record<string, unknown> {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private saveToDisk(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm test -- backend/tests/JsonDataStore.test.ts
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/JsonDataStore.ts backend/tests/JsonDataStore.test.ts
git commit -m "feat: implement JsonDataStore for pairing persistence"
```

---

### Task 3: yt-dlp Extraction Module

**Files:**
- Create: `backend/src/ytdlp.ts`
- Create: `backend/tests/ytdlp.test.ts`

This module spawns `yt-dlp` as a subprocess to extract audio streaming URLs and metadata. It uses `yt-dlp -j` (dump JSON) to get everything in one call, then extracts the best audio URL from the output.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ytdlp.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAudioInfo, type AudioInfo } from '../src/ytdlp.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

function createMockProcess(stdout: string, exitCode: number = 0): any {
  const proc = new EventEmitter();
  const stdoutStream = Readable.from([stdout]);
  const stderrStream = Readable.from([]);
  (proc as any).stdout = stdoutStream;
  (proc as any).stderr = stderrStream;
  setTimeout(() => proc.emit('close', exitCode), 10);
  return proc;
}

const sampleYtdlpOutput = JSON.stringify({
  id: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up',
  uploader: 'Rick Astley',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  duration: 212,
  url: 'https://rr4---sn-example.googlevideo.com/videoplayback?expire=...',
  ext: 'm4a',
});

describe('extractAudioInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts audio info from yt-dlp JSON output', async () => {
    mockSpawn.mockReturnValue(createMockProcess(sampleYtdlpOutput));

    const result = await extractAudioInfo('dQw4w9WgXcQ', '/path/to/yt-dlp');

    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      artist: 'Rick Astley',
      albumArt: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      duration: 212,
      url: 'https://rr4---sn-example.googlevideo.com/videoplayback?expire=...',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      '/path/to/yt-dlp',
      ['-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', 'dQw4w9WgXcQ'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    );
  });

  it('rejects when yt-dlp exits with non-zero code', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1));

    await expect(extractAudioInfo('bad-id', '/path/to/yt-dlp'))
      .rejects.toThrow('yt-dlp exited with code 1');
  });

  it('rejects when JSON output is invalid', async () => {
    mockSpawn.mockReturnValue(createMockProcess('not json'));

    await expect(extractAudioInfo('test', '/path/to/yt-dlp'))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test -- backend/tests/ytdlp.test.ts
```
Expected: FAIL — `Cannot find module '../src/ytdlp.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/ytdlp.ts`:

```typescript
import { spawn } from 'node:child_process';

export interface AudioInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
  url: string;
}

export function extractAudioInfo(videoId: string, ytdlpPath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytdlpPath,
      ['-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', videoId],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve({
          videoId: data.id ?? videoId,
          title: data.title ?? 'Unknown',
          artist: data.uploader ?? data.channel ?? 'Unknown',
          albumArt: data.thumbnail ?? '',
          duration: data.duration ?? 0,
          url: data.url ?? '',
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${(err as Error).message}`));
      }
    });
  });
}

export function selfUpdate(ytdlpPath: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(ytdlpPath, ['-U'], { stdio: 'ignore' });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve()); // Fail silently
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm test -- backend/tests/ytdlp.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ytdlp.ts backend/tests/ytdlp.test.ts
git commit -m "feat: implement yt-dlp audio extraction module"
```

---

### Task 4: WebSocket Manager

**Files:**
- Create: `backend/src/wsManager.ts`

This module manages WebSocket connections from the Decky frontend and provides a broadcast mechanism for pushing state updates.

- [ ] **Step 1: Create `backend/src/wsManager.ts`**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

export type WsEventType =
  | 'track'
  | 'state'
  | 'queue'
  | 'stop'
  | 'seek'
  | 'volume'
  | 'error'
  | 'connection';

export interface WsMessage {
  event: WsEventType;
  data: unknown;
}

type IncomingEventType = 'progress' | 'ended' | 'playbackError';

export interface IncomingMessage {
  event: IncomingEventType;
  data: unknown;
}

type IncomingHandler = (msg: IncomingMessage) => void;

export class WsManager {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private incomingHandler: IncomingHandler | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('message', (raw) => {
        try {
          const msg: IncomingMessage = JSON.parse(raw.toString());
          if (this.incomingHandler) {
            this.incomingHandler(msg);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  broadcast(event: WsEventType, data: unknown): void {
    const msg = JSON.stringify({ event, data });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  onMessage(handler: IncomingHandler): void {
    this.incomingHandler = handler;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wss.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/wsManager.ts
git commit -m "feat: implement WebSocket connection manager"
```

---

### Task 5: CastPlayer Implementation

**Files:**
- Create: `backend/src/CastPlayer.ts`

Implements the `yt-cast-receiver` `Player` abstract class. All the `do*()` methods. Tracks position/duration from frontend progress reports. Broadcasts state changes to WebSocket clients.

Key API reference for the `Player` abstract class:
- `doPlay(video: Video, position: number): Promise<boolean>`
- `doPause(): Promise<boolean>`
- `doResume(): Promise<boolean>`
- `doStop(): Promise<boolean>`
- `doSeek(position: number): Promise<boolean>`
- `doSetVolume(volume: Volume): Promise<boolean>`
- `doGetVolume(): Promise<Volume>`
- `doGetPosition(): Promise<number>`
- `doGetDuration(): Promise<number>`

Where `Video` is `{ id: string; client: Client; context?: { playlistId?, params?, index?, ctt? } }` and `Volume` is `{ level: number; muted: boolean }`.

- [ ] **Step 1: Create `backend/src/CastPlayer.ts`**

```typescript
import { Player, Constants } from 'yt-cast-receiver';
import type { Volume, Video } from 'yt-cast-receiver';
import { extractAudioInfo, type AudioInfo } from './ytdlp.js';
import type { WsManager } from './wsManager.js';

export interface CastPlayerOptions {
  ytdlpPath: string;
  wsManager: WsManager;
}

export class CastPlayer extends Player {
  private ytdlpPath: string;
  private ws: WsManager;
  private currentVolume: Volume = { level: 100, muted: false };
  private currentPosition: number = 0;
  private currentDuration: number = 0;
  private currentTrackInfo: AudioInfo | null = null;
  private playing: boolean = false;

  constructor(options: CastPlayerOptions) {
    super();
    this.ytdlpPath = options.ytdlpPath;
    this.ws = options.wsManager;
  }

  /**
   * Called by frontend via WebSocket 'progress' messages.
   * Updates position/duration so the library can relay to the phone.
   */
  updateProgress(currentTime: number, duration: number): void {
    this.currentPosition = currentTime;
    this.currentDuration = duration;
  }

  /**
   * Called by frontend via WebSocket 'ended' message.
   * Notifies the library that the track finished so it can advance.
   */
  async handleTrackEnded(): Promise<void> {
    this.playing = false;
    await this.notifyExternalStateChange(Constants.PLAYER_STATUSES.STOPPED);
  }

  /**
   * Called by frontend via WebSocket 'playbackError' message.
   * Re-extracts the URL and sends it again.
   */
  async handlePlaybackError(): Promise<void> {
    if (!this.currentTrackInfo) return;

    try {
      const info = await extractAudioInfo(this.currentTrackInfo.videoId, this.ytdlpPath);
      this.currentTrackInfo = info;
      this.ws.broadcast('track', {
        videoId: info.videoId,
        title: info.title,
        artist: info.artist,
        albumArt: info.albumArt,
        duration: info.duration,
        url: info.url,
      });
    } catch (err) {
      this.ws.broadcast('error', {
        message: `Failed to re-extract URL: ${(err as Error).message}`,
        code: 'YTDLP_RETRY_FAILED',
      });
      // Try advancing to the next track
      try {
        await this.next();
      } catch {
        // Nothing more we can do
      }
    }
  }

  getCurrentTrackInfo(): AudioInfo | null {
    return this.currentTrackInfo;
  }

  isCurrentlyPlaying(): boolean {
    return this.playing;
  }

  // --- Player abstract method implementations ---

  protected async doPlay(video: Video, position: number): Promise<boolean> {
    try {
      const info = await extractAudioInfo(video.id, this.ytdlpPath);
      this.currentTrackInfo = info;
      this.currentPosition = position;
      this.currentDuration = info.duration;
      this.playing = true;

      this.ws.broadcast('track', {
        videoId: info.videoId,
        title: info.title,
        artist: info.artist,
        albumArt: info.albumArt,
        duration: info.duration,
        url: info.url,
      });

      if (position > 0) {
        this.ws.broadcast('seek', { position });
      }

      return true;
    } catch (err) {
      this.ws.broadcast('error', {
        message: `Failed to play: ${(err as Error).message}`,
        code: 'YTDLP_FAILED',
      });
      return false;
    }
  }

  protected async doPause(): Promise<boolean> {
    this.playing = false;
    this.ws.broadcast('state', {
      isPlaying: false,
      volume: this.currentVolume.level,
      position: this.currentPosition,
      duration: this.currentDuration,
    });
    return true;
  }

  protected async doResume(): Promise<boolean> {
    this.playing = true;
    this.ws.broadcast('state', {
      isPlaying: true,
      volume: this.currentVolume.level,
      position: this.currentPosition,
      duration: this.currentDuration,
    });
    return true;
  }

  protected async doStop(): Promise<boolean> {
    this.playing = false;
    this.currentTrackInfo = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.ws.broadcast('stop', {});
    return true;
  }

  protected async doSeek(position: number): Promise<boolean> {
    this.currentPosition = position;
    this.ws.broadcast('seek', { position });
    return true;
  }

  protected async doSetVolume(volume: Volume): Promise<boolean> {
    this.currentVolume = volume;
    this.ws.broadcast('volume', { value: volume.level, muted: volume.muted });
    return true;
  }

  protected async doGetVolume(): Promise<Volume> {
    return this.currentVolume;
  }

  protected async doGetPosition(): Promise<number> {
    return this.currentPosition;
  }

  protected async doGetDuration(): Promise<number> {
    return this.currentDuration;
  }
}
```

> **Note on imports:** `Video`, `Volume`, `Player`, and `Constants` are all re-exported from the `yt-cast-receiver` main entry point. If the `Video` type is not exported (check the library's `index.ts`), inline it as a fallback:
> ```typescript
> interface Video { id: string; client: unknown; context?: Record<string, unknown>; }
> ```

- [ ] **Step 2: Commit**

```bash
git add backend/src/CastPlayer.ts
git commit -m "feat: implement CastPlayer with yt-cast-receiver Player interface"
```

---

### Task 6: HTTP REST Server

**Files:**
- Create: `backend/src/httpServer.ts`
- Create: `backend/tests/httpServer.test.ts`

Uses Node.js built-in `http` module. No Express dependency. Parses JSON bodies manually. Routes REST requests to the CastPlayer and library methods.

- [ ] **Step 1: Create `backend/src/httpServer.ts`**

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CastPlayer } from './CastPlayer.js';
import type { Player as YtPlayer } from 'yt-cast-receiver';

interface RouteContext {
  castPlayer: CastPlayer;
  libraryPlayer: YtPlayer;
}

type RouteHandler = (body: any, ctx: RouteContext) => Promise<unknown>;

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    '/api/health': async () => ({ ready: true }),

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

    '/api/queue': async (_body, ctx) => {
      const playlist = ctx.libraryPlayer.queue;
      const state = playlist.getState();
      const videoIds = playlist.videoIds;

      // Build track list from video IDs
      // Metadata is only available for the current track (from yt-dlp)
      // Queue items show video IDs; full metadata comes from the frontend
      const tracks = videoIds.map((id: string, index: number) => ({
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
  },

  POST: {
    '/api/play': async (_body, ctx) => {
      await ctx.libraryPlayer.resume();
      return { ok: true };
    },

    '/api/pause': async (_body, ctx) => {
      await ctx.libraryPlayer.pause();
      return { ok: true };
    },

    '/api/next': async (_body, ctx) => {
      await ctx.libraryPlayer.next();
      return { ok: true };
    },

    '/api/prev': async (_body, ctx) => {
      await ctx.libraryPlayer.previous();
      return { ok: true };
    },

    '/api/seek': async (body, ctx) => {
      const position = body?.position ?? 0;
      await ctx.libraryPlayer.seek(position);
      return { ok: true };
    },

    '/api/volume': async (body, ctx) => {
      const level = body?.volume ?? 100;
      const currentVol = await ctx.libraryPlayer.getVolume();
      await ctx.libraryPlayer.setVolume({ level, muted: currentVol.muted });
      return { ok: true };
    },

    '/api/queue/jump': async (body, _ctx) => {
      // Queue jumping requires accessing the library's playlist internals
      // This will be refined in Plan 3 when queue interaction is fully built
      return { ok: true };
    },

    '/api/queue/remove': async (body, _ctx) => {
      // Queue removal requires accessing the library's playlist internals
      // This will be refined in Plan 3
      return { ok: true };
    },
  },
};

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

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): void {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  // CORS headers for local requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const handler = routes[method]?.[url];

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  void parseBody(req).then(async (body) => {
    try {
      const result = await handler(body, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}
```

- [ ] **Step 2: Write a basic test for the HTTP handler**

Create `backend/tests/httpServer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleRequest } from '../src/httpServer.js';
import { EventEmitter } from 'node:events';

function createMockReq(method: string, url: string, body?: any): any {
  const req = new EventEmitter();
  (req as any).method = method;
  (req as any).url = url;

  // Emit body data after a tick
  if (body) {
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    }, 1);
  } else {
    setTimeout(() => req.emit('end'), 1);
  }

  return req;
}

function createMockRes(): any {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers?: Record<string, string>) {
      res.statusCode = code;
      if (headers) Object.assign(res.headers, headers);
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    end(data?: string) {
      res.body = data ?? '';
    },
  };
  return res;
}

describe('HTTP Server', () => {
  it('returns 200 for GET /api/health', async () => {
    const req = createMockReq('GET', '/api/health');
    const res = createMockRes();
    const ctx = { castPlayer: {} as any, libraryPlayer: {} as any };

    handleRequest(req, res, ctx);

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ready: true });
  });

  it('returns 404 for unknown routes', async () => {
    const req = createMockReq('GET', '/api/unknown');
    const res = createMockRes();
    const ctx = { castPlayer: {} as any, libraryPlayer: {} as any };

    handleRequest(req, res, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(res.statusCode).toBe(404);
  });

  it('handles OPTIONS preflight requests', async () => {
    const req = createMockReq('OPTIONS', '/api/play');
    const res = createMockRes();
    const ctx = { castPlayer: {} as any, libraryPlayer: {} as any };

    handleRequest(req, res, ctx);

    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run:
```bash
pnpm test -- backend/tests/httpServer.test.ts
```
Expected: All 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/httpServer.ts backend/tests/httpServer.test.ts
git commit -m "feat: implement HTTP REST server with all endpoints"
```

---

### Task 7: Main Server Entry Point

**Files:**
- Create: `backend/src/server.ts`

This is the main entry point that wires everything together: creates the CastPlayer, JsonDataStore, HTTP server, WebSocket manager, and starts the `yt-cast-receiver`.

- [ ] **Step 1: Create `backend/src/server.ts`**

```typescript
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YouTubeCastReceiver from 'yt-cast-receiver';
import { CastPlayer } from './CastPlayer.js';
import { JsonDataStore } from './JsonDataStore.js';
import { WsManager } from './wsManager.js';
import { handleRequest } from './httpServer.js';
import { selfUpdate } from './ytdlp.js';

const PORT = 39281;

// Resolve paths relative to the plugin directory
// When running via main.py, cwd is the plugin dir
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(__dirname, '..', '..');
const binDir = path.join(pluginDir, 'bin');
const ytdlpPath = path.join(binDir, 'yt-dlp');
const dataStorePath = '/home/deck/homebrew/settings/youtube-cast-receiver/datastore.json';

async function main() {
  console.log('[YTCast] Starting YouTube Cast Receiver backend...');

  // Self-update yt-dlp (async, non-blocking to startup)
  selfUpdate(ytdlpPath).then(() => {
    console.log('[YTCast] yt-dlp self-update check complete.');
  });

  // Create HTTP server
  const httpServer = http.createServer();

  // Create WebSocket manager
  const wsManager = new WsManager(httpServer);

  // Create CastPlayer
  const castPlayer = new CastPlayer({
    ytdlpPath,
    wsManager,
  });

  // Create DataStore
  const dataStore = new JsonDataStore(dataStorePath);

  // Create the YouTube Cast Receiver
  const deviceName = os.hostname();
  const receiver = new YouTubeCastReceiver(castPlayer, {
    device: {
      name: deviceName,
      screenName: `YouTube on ${deviceName}`,
    },
    dataStore,
    logLevel: 'info',
  });

  // Handle WebSocket messages from frontend
  wsManager.onMessage((msg) => {
    switch (msg.event) {
      case 'progress': {
        const data = msg.data as { currentTime: number; duration: number };
        castPlayer.updateProgress(data.currentTime, data.duration);
        break;
      }
      case 'ended': {
        void castPlayer.handleTrackEnded();
        break;
      }
      case 'playbackError': {
        void castPlayer.handlePlaybackError();
        break;
      }
    }
  });

  // Handle HTTP requests
  // Wrap the context to include receiver info for connected status
  httpServer.on('request', (req, res) => {
    handleRequest(req, res, {
      castPlayer,
      libraryPlayer: castPlayer,
    });
  });

  // Receiver events
  receiver.on('senderConnect', (sender) => {
    console.log(`[YTCast] Phone connected: ${sender.name}`);
    wsManager.broadcast('connection', { phoneConnected: true });
  });

  receiver.on('senderDisconnect', (sender, implicit) => {
    console.log(`[YTCast] Phone disconnected: ${sender.name} (implicit: ${implicit})`);
    const stillConnected = receiver.getConnectedSenders().length > 0;
    wsManager.broadcast('connection', { phoneConnected: stillConnected });
  });

  // Subscribe to Playlist events for real-time queue broadcasts
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

  const playlist = castPlayer.queue;
  playlist.on('playlistUpdated', broadcastQueue);
  playlist.on('playlistSet', broadcastQueue);
  playlist.on('playlistCleared', broadcastQueue);
  playlist.on('videoAdded', broadcastQueue);
  playlist.on('videoRemoved', broadcastQueue);
  playlist.on('videoSelected', broadcastQueue);

  receiver.on('error', (error) => {
    console.error('[YTCast] Receiver error:', error);
  });

  // Start the HTTP/WS server
  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[YTCast] FATAL: Port ${PORT} is already in use.`);
        process.exit(1);
      }
      reject(err);
    });

    httpServer.listen(PORT, '127.0.0.1', () => {
      console.log(`[YTCast] HTTP/WS server listening on 127.0.0.1:${PORT}`);
      resolve();
    });
  });

  // Start the cast receiver (DIAL/SSDP advertisement)
  await receiver.start();
  console.log(`[YTCast] Cast receiver started. Device name: "${deviceName}"`);

  // Signal readiness to main.py
  console.log('READY');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[YTCast] Shutting down...');
    await receiver.stop();
    wsManager.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  console.error('[YTCast] Fatal error:', err);
  process.exit(1);
});
```

> **Important notes for the implementer:**
> - The `libraryPlayer` param in the route context currently passes `castPlayer` (which extends `Player`). This works because `CastPlayer` IS a `Player` — the REST endpoints call the public methods like `.pause()`, `.resume()`, `.next()`, `.previous()`, etc., which are defined on the base `Player` class. These public methods internally call the `do*()` abstract methods that `CastPlayer` implements.
> - The `dataStorePath` uses an absolute path under `/home/deck/homebrew/settings/` as specified in the design spec.
> - The HTTP server binds to `127.0.0.1` (localhost only) since only the frontend needs to reach it.

- [ ] **Step 2: Verify the backend builds**

Run:
```bash
pnpm run build:backend
```
Expected: `backend/out/server.js` created with no errors. If there are TypeScript or import resolution issues, fix them (common issues: the `Video` type import path, or `yt-cast-receiver` export paths).

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat: implement main server entry point wiring all components"
```

---

### Task 8: main.py Shim

**Files:**
- Create: `main.py`

Minimal Python script that Decky Loader calls. Spawns the Node.js backend as a subprocess, waits for `READY`, and kills it on unload.

- [ ] **Step 1: Create `main.py`**

```python
import os
import signal
import subprocess
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("YTCast")

PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
NODE_BIN = os.path.join(PLUGIN_DIR, "bin", "node")
SERVER_JS = os.path.join(PLUGIN_DIR, "backend", "out", "server.js")


class Plugin:
    node_process = None

    async def _main(self):
        logger.info("Starting YouTube Cast Receiver backend...")

        # Ensure node binary is executable
        if os.path.exists(NODE_BIN):
            os.chmod(NODE_BIN, 0o755)

        yt_dlp_bin = os.path.join(PLUGIN_DIR, "bin", "yt-dlp")
        if os.path.exists(yt_dlp_bin):
            os.chmod(yt_dlp_bin, 0o755)

        try:
            self.node_process = subprocess.Popen(
                [NODE_BIN, SERVER_JS],
                cwd=PLUGIN_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ, "NODE_ENV": "production"},
            )

            # Wait for READY signal (with timeout)
            import asyncio
            loop = asyncio.get_running_loop()

            def wait_for_ready():
                if self.node_process and self.node_process.stdout:
                    for line in iter(self.node_process.stdout.readline, b""):
                        decoded = line.decode("utf-8", errors="replace").strip()
                        logger.info(f"[Node] {decoded}")
                        if decoded == "READY":
                            return True
                return False

            try:
                ready = await asyncio.wait_for(
                    loop.run_in_executor(None, wait_for_ready),
                    timeout=30.0
                )
                if ready:
                    logger.info("Backend is ready.")
                else:
                    logger.error("Backend process ended before signaling READY.")
            except asyncio.TimeoutError:
                logger.error("Backend did not signal READY within 30 seconds.")

            # Continue reading stdout and stderr in background for logging
            async def log_stream(stream, level_fn):
                if stream:
                    while True:
                        line = await loop.run_in_executor(None, stream.readline)
                        if not line:
                            break
                        level_fn(f"[Node] {line.decode('utf-8', errors='replace').strip()}")

            asyncio.ensure_future(log_stream(self.node_process.stdout, logger.info))
            asyncio.ensure_future(log_stream(self.node_process.stderr, logger.warning))

        except Exception as e:
            logger.error(f"Failed to start backend: {e}")

    async def _unload(self):
        logger.info("Stopping YouTube Cast Receiver backend...")
        if self.node_process:
            try:
                self.node_process.send_signal(signal.SIGTERM)
                try:
                    self.node_process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    logger.warning("Backend did not stop gracefully, killing...")
                    self.node_process.kill()
                    self.node_process.wait(timeout=2)
            except Exception as e:
                logger.error(f"Error stopping backend: {e}")
            finally:
                self.node_process = None
        logger.info("Backend stopped.")
```

- [ ] **Step 2: Commit**

```bash
git add main.py
git commit -m "feat: implement main.py shim to spawn/kill Node.js backend"
```

---

### Task 9: Build Verification & Integration Test

**Files:** None new — this task verifies everything works together.

- [ ] **Step 1: Run all unit tests**

Run:
```bash
pnpm test
```
Expected: All tests pass (JsonDataStore: 6, ytdlp: 3, httpServer: 3).

- [ ] **Step 2: Build the backend**

Run:
```bash
pnpm run build:backend
```
Expected: `backend/out/server.js` created successfully. Check for any warnings about unresolved imports.

- [ ] **Step 3: Build the frontend**

Run:
```bash
pnpm run build
```
Expected: `dist/index.js` created successfully.

- [ ] **Step 4: Test backend starts locally (if Node.js is available)**

Run (for a quick smoke test — the cast receiver won't work on Windows but the HTTP server should start):
```bash
node backend/out/server.js
```
Expected: Should print startup messages then either `READY` (if SSDP works) or an error about SSDP/multicast (expected on Windows). Verify that `http://localhost:39281/api/health` returns `{"ready":true}`.

Press Ctrl+C to stop.

- [ ] **Step 5: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: address integration test findings"
```

(Only if fixes were needed. Skip if everything passed.)

- [ ] **Step 6: Final commit with all tests passing**

```bash
git add -A
git commit -m "chore: Plan 1 complete — backend core implemented and verified"
```
