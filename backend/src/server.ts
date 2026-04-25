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

  // Get or create a persistent UUID so the device looks the same across reinstalls
  let ssdpUuid = await dataStore.get<string>('ssdp.uuid');
  if (!ssdpUuid) {
    const { randomUUID } = await import('node:crypto');
    ssdpUuid = randomUUID();
    await dataStore.set('ssdp.uuid', ssdpUuid);
    console.log(`[YTCast] Generated new SSDP UUID: ${ssdpUuid}`);
  } else {
    console.log(`[YTCast] Using persisted SSDP UUID: ${ssdpUuid}`);
  }

  // Create the YouTube Cast Receiver
  const deviceName = os.hostname();
  const receiver = new YouTubeCastReceiver(castPlayer, {
    dial: {
      uuid: ssdpUuid,
    } as any,
    device: {
      name: deviceName,
      screenName: `YouTube on ${deviceName}`,
    },
    dataStore,
    logLevel: 'info',
  });

  // Receiver on/off control (start = advertise on network, stop = go dark)
  // Persisted across reboots via dataStore. Default disabled — user opts in via toggle.
  let receiverEnabled = false;
  const receiverControl = {
    enable: async () => {
      if (!receiverEnabled) {
        await receiver.start();
        receiverEnabled = true;
        await dataStore.set('receiver.enabled', true);
        console.log('[YTCast] Cast receiver enabled (advertising on network)');
      }
    },
    disable: async () => {
      if (receiverEnabled) {
        await receiver.stop();
        receiverEnabled = false;
        await dataStore.set('receiver.enabled', false);
        console.log('[YTCast] Cast receiver disabled (no longer advertising)');
      }
    },
    isEnabled: () => receiverEnabled,
  };

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
      receiver: receiverControl,
    });
  });

  // Shared connection tracking — used by senderDisconnect, sleep detection,
  // and the periodic health check to stay in sync.
  let wasConnected = false;

  // Receiver events
  receiver.on('senderConnect', (sender) => {
    console.log(`[YTCast] Phone connected: ${sender.name}`);
    wsManager.broadcast('connection', { phoneConnected: true });
    wasConnected = true;
    castPlayer.markSenderActivity(); // seed idle clock so health check doesn't fire before first cast command

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
    if (!stillConnected) {
      console.log('[YTCast] No senders remaining, clearing playback and queue');
      castPlayer.clearOnDisconnect();
      wasConnected = false;
    }
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

  // Start the cast receiver only if user has enabled it (persisted in dataStore).
  // Default is disabled — user must toggle on via the player page.
  const persistedEnabled = await dataStore.get<boolean>('receiver.enabled');
  if (persistedEnabled === true) {
    await receiver.start();
    receiverEnabled = true;
    console.log(`[YTCast] Cast receiver started (persisted enabled). Device name: "${deviceName}"`);
  } else {
    console.log(`[YTCast] Cast receiver disabled at startup (toggle on to advertise). Device name: "${deviceName}"`);
  }

  // Signal readiness to main.py
  console.log('READY');

  // Graceful shutdown.
  // Decky reinstalls block on extractall() if our binaries (bin/node,
  // bin/yt-dlp) are still being executed. The Python wrapper kills the
  // whole process group on _unload, but we also enforce a hard upper
  // bound here so a misbehaving receiver.stop() can't keep us alive.
  const SHUTDOWN_HARD_LIMIT_MS = 1500;
  const RECEIVER_STOP_LIMIT_MS = 1000;
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[YTCast] Shutting down...');

    // Fail-safe: force exit if cleanup hangs. .unref() lets us exit
    // cleanly via process.exit(0) below if cleanup completes in time.
    const failSafe = setTimeout(() => {
      console.error('[YTCast] Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_HARD_LIMIT_MS);
    failSafe.unref();

    try {
      if (receiverEnabled) {
        // Race against a 1s timer — yt-cast-receiver's stop() can hang
        // on flaky network conditions during SSDP teardown.
        await Promise.race([
          receiver.stop(),
          new Promise<void>((resolve) => setTimeout(resolve, RECEIVER_STOP_LIMIT_MS)),
        ]);
      }
      await dataStore.flush();
      wsManager.close();
      httpServer.close();
    } catch (err) {
      console.error('[YTCast] Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  // Detect sleep/wake by monitoring timer drift.
  // When the Deck sleeps, the process is frozen (SIGSTOP). On wake (SIGCONT),
  // a setInterval tick that was supposed to fire in 5s fires after minutes.
  // If drift > 10s, the Deck slept — clear playback entirely since the cast
  // session is dead after sleep.
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const drift = now - lastTick;
    lastTick = now;
    if (drift > 15000) { // 5s interval + 10s tolerance
      console.log(`[YTCast] Sleep detected (drift: ${Math.round(drift / 1000)}s). Clearing playback.`);
      wsManager.broadcast('connection', { phoneConnected: false });
      castPlayer.clearOnDisconnect();
      wasConnected = false;
    }
  }, 5000);

  // Periodic connection health check.
  // Catches cases where the RPC connection to YouTube silently dies
  // (e.g. Steam Deck loses wifi) and no senderDisconnect event fires.
  const STALE_SESSION_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    const sendersNow = receiver.getConnectedSenders().length > 0;

    // Case 1: Library now reports 0 senders but we thought we had one
    if (wasConnected && !sendersNow) {
      console.log('[YTCast] Health check: senders dropped to 0, clearing playback');
      wsManager.broadcast('connection', { phoneConnected: false });
      castPlayer.clearOnDisconnect();
      wasConnected = false;
      return;
    }

    // Case 2: Stale session — library says connected but no sender activity
    // for 5 minutes AND playback is stopped (active playback = session alive)
    if (wasConnected && !castPlayer.isCurrentlyPlaying() && castPlayer.getSenderIdleMs() > STALE_SESSION_MS) {
      console.log('[YTCast] Health check: no sender activity for 5m, clearing stale session');
      wsManager.broadcast('connection', { phoneConnected: false });
      castPlayer.clearOnDisconnect();
      wasConnected = false;
      return;
    }

    wasConnected = sendersNow;
  }, 30000); // Check every 30s
}

main().catch((err) => {
  console.error('[YTCast] Fatal error:', err);
  process.exit(1);
});
