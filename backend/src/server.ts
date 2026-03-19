import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import YouTubeCastReceiver from 'yt-cast-receiver';
import { CastPlayer } from './CastPlayer.js';
import { JsonDataStore } from './JsonDataStore.js';
import { WsManager } from './wsManager.js';
import { handleRequest } from './httpServer.js';
import { selfUpdate } from './ytdlp.js';

const PORT = 39281;

// Resolve paths relative to the plugin directory
// When running via main.py, cwd is the plugin dir
// esbuild defines __dirname for CJS bundles automatically
declare const __dirname: string;
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

  // Create DataStore
  const dataStore = new JsonDataStore(dataStorePath);

  // Create CastPlayer
  const castPlayer = new CastPlayer({
    ytdlpPath,
    wsManager,
    dataStore,
  });

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
  httpServer.on('request', (req, res) => {
    handleRequest(req, res, {
      castPlayer,
      libraryPlayer: castPlayer,
      isConnected: () => receiver.getConnectedSenders().length > 0,
    });
  });

  // Receiver events
  receiver.on('senderConnect', (sender) => {
    console.log(`[YTCast] Phone connected: ${sender.name}`);
    wsManager.broadcast('connection', { phoneConnected: true });

    // The phone sends its own volume (usually 100%) on connect, overriding
    // our persisted volume. After the connection settles, push our saved
    // volume back to both the phone and the frontend.
    setTimeout(async () => {
      const savedVol = await dataStore.get<{ level: number; muted: boolean }>('volume');
      if (savedVol) {
        console.log(`[YTCast] Restoring persisted volume: ${savedVol.level}`);
        await castPlayer.setVolume(savedVol);
      }
    }, 2000);
  });

  receiver.on('senderDisconnect', (sender, implicit) => {
    console.log(`[YTCast] Phone disconnected: ${sender.name} (implicit: ${implicit})`);
    const stillConnected = receiver.getConnectedSenders().length > 0;
    wsManager.broadcast('connection', { phoneConnected: stillConnected });
  });

  // Subscribe to Playlist events for real-time queue broadcasts
  const broadcastQueue = () => {
    const queueData = castPlayer.getQueueWithMetadata();
    wsManager.broadcast('queue', queueData);
  };

  const playlist = castPlayer.queue;
  playlist.on('playlistUpdated', broadcastQueue);
  playlist.on('playlistSet', broadcastQueue);
  playlist.on('playlistCleared', broadcastQueue);
  playlist.on('videoAdded', broadcastQueue);
  playlist.on('videoRemoved', broadcastQueue);
  playlist.on('videoSelected', broadcastQueue);
  playlist.on('playlistAdded', broadcastQueue);

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

  // Detect sleep/wake by monitoring timer drift.
  // When the Deck sleeps, the process is frozen (SIGSTOP). On wake (SIGCONT),
  // a setInterval tick that was supposed to fire in 5s fires after minutes.
  // If drift > 10s, the Deck slept — pause playback.
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = now - lastTick;
    lastTick = now;
    if (drift > 15000) { // 5s interval + 10s tolerance
      console.log(`[YTCast] Sleep detected (drift: ${Math.round(drift / 1000)}s). Pausing playback.`);
      void castPlayer.pause();
    }
  }, 5000);
}

main().catch((err) => {
  console.error('[YTCast] Fatal error:', err);
  process.exit(1);
});
