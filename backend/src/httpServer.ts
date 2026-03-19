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
