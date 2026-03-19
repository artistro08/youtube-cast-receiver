export interface TrackInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
}

export interface PlayerState {
  track: TrackInfo | null;
  isPlaying: boolean;
  volume: number;
  position: number;
  duration: number;
  connected: boolean;
}

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
