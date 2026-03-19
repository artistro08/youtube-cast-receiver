import { createContext, useContext, useEffect, useReducer, useCallback, type FC, type ReactNode } from 'react';
import type { PlayerState, TrackInfo, QueueState } from '../types';
import {
  addTrackListener,
  addPlayStateListener,
  addPositionListener,
  addConnectionListener,
  addQueueListener,
  getCurrentTrack,
  getIsPlaying,
  getIsConnected,
  getPosition,
  getDuration,
  apiGetState,
  apiGetQueue,
} from '../services/audioManager';

interface FullState extends PlayerState {
  queue: QueueState;
}

const defaultState: FullState = {
  track: null,
  isPlaying: false,
  volume: 100,
  position: 0,
  duration: 0,
  connected: false,
  queue: { tracks: [], position: -1 },
};

type Action =
  | { type: 'UPDATE'; payload: Partial<FullState> }
  | { type: 'SET_TRACK'; payload: TrackInfo | null }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_POSITION'; payload: { position: number; duration: number } }
  | { type: 'SET_QUEUE'; payload: QueueState };

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'SET_TRACK':
      return { ...state, track: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_POSITION':
      return { ...state, position: action.payload.position, duration: action.payload.duration };
    case 'SET_QUEUE':
      return { ...state, queue: action.payload };
    default:
      return state;
  }
}

interface PlayerContextValue {
  state: FullState;
  updateState: (partial: Partial<FullState>) => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  state: defaultState,
  updateState: () => {},
});

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  const updateState = useCallback((partial: Partial<FullState>) => {
    dispatch({ type: 'UPDATE', payload: partial });
  }, []);

  useEffect(() => {
    // Restore state from audioManager (survives panel close/open)
    const track = getCurrentTrack();
    const playing = getIsPlaying();
    const conn = getIsConnected();
    const position = getPosition();
    const duration = getDuration();

    dispatch({ type: 'UPDATE', payload: { track, isPlaying: playing, connected: conn, position, duration } });

    // Fetch full state from backend
    void (async () => {
      const serverState = await apiGetState();
      if (serverState) {
        dispatch({
          type: 'UPDATE',
          payload: {
            track: serverState.track ?? null,
            isPlaying: serverState.isPlaying ?? false,
            // volume handled by VolumeSlider directly via audioManager
            position: serverState.position ?? 0,
            duration: serverState.duration ?? 0,
            connected: serverState.connected ?? false,
          },
        });
      }

      // Fetch initial queue
      const queueData = await apiGetQueue();
      if (queueData) {
        dispatch({ type: 'SET_QUEUE', payload: { tracks: queueData.tracks ?? [], position: queueData.position ?? -1 } });
      }
    })();

    // Subscribe to audioManager events
    const unsubs = [
      addTrackListener((t) => dispatch({ type: 'SET_TRACK', payload: t })),
      addPlayStateListener((p) => dispatch({ type: 'SET_PLAYING', payload: p })),
      addPositionListener((pos, dur) => dispatch({ type: 'SET_POSITION', payload: { position: pos, duration: dur } })),
      addConnectionListener((c) => dispatch({ type: 'UPDATE', payload: { connected: c } })),
      addQueueListener((tracks, pos) => dispatch({ type: 'SET_QUEUE', payload: { tracks, position: pos } })),
    ];

    return () => { unsubs.forEach((fn) => fn()); };
  }, []);

  return <PlayerContext.Provider value={{ state, updateState }}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => {
  const { state, updateState } = useContext(PlayerContext);
  return { ...state, updateState };
};
