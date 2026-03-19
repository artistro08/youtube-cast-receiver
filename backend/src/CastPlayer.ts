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
