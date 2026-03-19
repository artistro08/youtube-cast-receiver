import { createContext, useContext, useEffect, useReducer, useCallback, type FC, type ReactNode } from 'react';
import type { PlayerState, TrackInfo } from '../types';
import {
  addTrackListener,
  addPlayStateListener,
  addVolumeListener,
  addPositionListener,
  addConnectionListener,
  getCurrentTrack,
  getIsPlaying,
  getVolume,
  getIsConnected,
  getPosition,
  getDuration,
  apiGetState,
} from '../services/audioManager';

const defaultState: PlayerState = {
  track: null,
  isPlaying: false,
  volume: 100,
  position: 0,
  duration: 0,
  connected: false,
};

type Action =
  | { type: 'UPDATE'; payload: Partial<PlayerState> }
  | { type: 'SET_TRACK'; payload: TrackInfo | null }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_POSITION'; payload: { position: number; duration: number } };

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'SET_TRACK':
      return { ...state, track: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_POSITION':
      return { ...state, position: action.payload.position, duration: action.payload.duration };
    default:
      return state;
  }
}

interface PlayerContextValue {
  state: PlayerState;
  updateState: (partial: Partial<PlayerState>) => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  state: defaultState,
  updateState: () => {},
});

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  const updateState = useCallback((partial: Partial<PlayerState>) => {
    dispatch({ type: 'UPDATE', payload: partial });
  }, []);

  useEffect(() => {
    // Restore state from audioManager (survives panel close/open)
    const track = getCurrentTrack();
    const playing = getIsPlaying();
    const volume = getVolume();
    const connected = getIsConnected();
    const position = getPosition();
    const duration = getDuration();

    dispatch({ type: 'UPDATE', payload: { track, isPlaying: playing, volume, connected, position, duration } });

    // Fetch full state from backend
    void (async () => {
      const serverState = await apiGetState();
      if (serverState) {
        dispatch({
          type: 'UPDATE',
          payload: {
            track: serverState.track ?? null,
            isPlaying: serverState.isPlaying ?? false,
            volume: serverState.volume ?? 100,
            position: serverState.position ?? 0,
            duration: serverState.duration ?? 0,
            connected: serverState.connected ?? false,
          },
        });
      }
    })();

    // Subscribe to audioManager events
    const unsubs = [
      addTrackListener((t) => dispatch({ type: 'SET_TRACK', payload: t })),
      addPlayStateListener((p) => dispatch({ type: 'SET_PLAYING', payload: p })),
      addVolumeListener((v) => dispatch({ type: 'UPDATE', payload: { volume: v } })),
      addPositionListener((pos, dur) => dispatch({ type: 'SET_POSITION', payload: { position: pos, duration: dur } })),
      addConnectionListener((c) => dispatch({ type: 'UPDATE', payload: { connected: c } })),
    ];

    return () => { unsubs.forEach((fn) => fn()); };
  }, []);

  return <PlayerContext.Provider value={{ state, updateState }}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => {
  const { state, updateState } = useContext(PlayerContext);
  return { ...state, updateState };
};
