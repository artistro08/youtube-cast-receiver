import { Player, Constants } from 'yt-cast-receiver';
import type { Volume, Video } from 'yt-cast-receiver';
import { extractAudioInfo, type AudioInfo } from './ytdlp.js';
import type { WsManager } from './wsManager.js';
import type { JsonDataStore } from './JsonDataStore.js';

export interface CastPlayerOptions {
  ytdlpPath: string;
  wsManager: WsManager;
  dataStore: JsonDataStore;
}

export class CastPlayer extends Player {
  private ytdlpPath: string;
  private ws: WsManager;
  private store: JsonDataStore;
  private currentVolume: Volume = { level: 100, muted: false };
  private currentPosition: number = 0;
  private currentDuration: number = 0;
  private currentTrackInfo: AudioInfo | null = null;
  private playing: boolean = false;
  private metadataCache: Map<string, AudioInfo> = new Map();

  constructor(options: CastPlayerOptions) {
    super();
    this.ytdlpPath = options.ytdlpPath;
    this.ws = options.wsManager;
    this.store = options.dataStore;
    // Load persisted volume
    void this.store.get<Volume>('volume').then((vol) => {
      if (vol) this.currentVolume = vol;
    });
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
    // Advance to the next track if available, otherwise signal stopped
    if (this.queue.hasNext) {
      console.log('[YTCast] Track ended, advancing to next');
      await this.next();
    } else {
      console.log('[YTCast] Track ended, no more tracks in queue');
      await this.notifyExternalStateChange(Constants.PLAYER_STATUSES.STOPPED);
    }
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

    // Fetch oEmbed metadata for uncached items in the background
    const uncachedIds = videoIds.filter((id) => !this.metadataCache.has(id));
    if (uncachedIds.length > 0) {
      void this.enrichQueueMetadata(uncachedIds);
    }

    return { tracks, position: currentIndex };
  }

  private async enrichQueueMetadata(videoIds: string[]): Promise<void> {
    let enriched = false;
    for (const id of videoIds) {
      if (this.metadataCache.has(id)) continue;
      const meta = await this.fetchMetadataFromOembed(id);
      if (meta) {
        this.metadataCache.set(id, {
          videoId: id,
          title: meta.title,
          artist: meta.artist,
          albumArt: meta.albumArt,
          duration: 0,
          url: '',
        });
        enriched = true;
      }
    }
    // If we enriched any items, broadcast updated queue
    if (enriched) {
      const updatedQueue = this.getQueueWithMetadata();
      this.ws.broadcast('queue', updatedQueue);
    }
  }

  private async fetchMetadataFromOembed(videoId: string): Promise<{ title: string; artist: string; albumArt: string } | null> {
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      return {
        title: data.title ?? videoId,
        artist: data.author_name ?? '',
        albumArt: data.thumbnail_url ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Jump to a specific video in the queue by ID.
   * Constructs a Video object using the current video's client.
   */
  async playVideoById(videoId: string): Promise<boolean> {
    const state = this.queue.getState();
    const client = state.current?.client;
    if (!client) {
      console.error('[YTCast] Cannot jump: no current client');
      return false;
    }
    try {
      return await this.play({ id: videoId, client } as any, 0);
    } catch (err) {
      console.error(`[YTCast] Jump to ${videoId} failed:`, (err as Error).message);
      return false;
    }
  }

  // --- Player abstract method implementations ---

  protected async doPlay(video: Video, position: number): Promise<boolean> {
    try {
      const info = await extractAudioInfo(video.id, this.ytdlpPath);
      this.currentTrackInfo = info;
      this.metadataCache.set(video.id, info);
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
      console.log(`[YTCast] Playing: ${info.title} by ${info.artist} (${info.videoId})`);

      if (position > 0) {
        this.ws.broadcast('seek', { position });
      }

      // Broadcast updated queue so the current track indicator moves
      const queueData = this.getQueueWithMetadata();
      this.ws.broadcast('queue', queueData);

      return true;
    } catch (err) {
      console.error(`[YTCast] doPlay failed for ${video.id}:`, (err as Error).message);
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
      position: this.currentPosition,
      duration: this.currentDuration,
    });
    return true;
  }

  protected async doResume(): Promise<boolean> {
    this.playing = true;
    this.ws.broadcast('state', {
      isPlaying: true,
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
    void this.store.set('volume', volume);
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
