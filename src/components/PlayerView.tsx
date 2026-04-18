import { useState, useEffect, useRef } from 'react';
import { DialogButton, Focusable, ToggleField } from '@decky/ui';
import { FaMusic } from 'react-icons/fa';
import { FaPause } from 'react-icons/fa';
import { IoPlay, IoPlaySkipBack, IoPlaySkipForward } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import {
  togglePlayback, apiNext, apiPrev,
  getReceiverEnabled, addReceiverStatusListener, notifyReceiverStatus,
  apiReceiverEnable, apiReceiverDisable,
} from '../services/audioManager';
import { Section } from './Section';
import { VolumeSlider } from './VolumeSlider';
import { ProgressBar } from './ProgressBar';

const PaddedToggle = ({ label, description, checked, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const firstChild = ref.current.firstElementChild as HTMLElement | null;
    if (firstChild) {
      firstChild.style.paddingLeft = '19px';
      firstChild.style.paddingRight = '19px';
    }
  }, []);
  return (
    <div ref={ref}>
      <ToggleField label={label} description={description} checked={checked} onChange={onChange} />
    </div>
  );
};

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '0',
  flex: 1,
  padding: '0 8px',
  marginLeft: '0',
};

const transBtnFirst: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '4px 0 0 4px' };
const transBtnMid: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '0', borderLeft: '1px solid rgba(255,255,255,0.15)' };
const transBtnLast: React.CSSProperties = { ...btnBase, height: '33px', borderRadius: '0 4px 4px 0', borderLeft: '1px solid rgba(255,255,255,0.15)' };

export const PlayerView = () => {
  const { track, isPlaying, connected } = usePlayer();
  const [receiverEnabled, setReceiverEnabled] = useState(getReceiverEnabled());

  useEffect(() => {
    return addReceiverStatusListener(setReceiverEnabled);
  }, []);

  const handleReceiverToggle = async (enabled: boolean) => {
    notifyReceiverStatus(enabled); // update module-level state so it persists across panel close/open
    if (enabled) {
      await apiReceiverEnable();
    } else {
      await apiReceiverDisable();
    }
  };

  const albumArt = track?.albumArt;
  const title = track?.title ?? (connected ? 'Waiting for cast...' : 'Not connected');
  const artist = track?.artist ?? (connected ? 'Cast a video from your phone' : 'Open YouTube and cast to this device');

  return (
    <>
      {/* Track info: album art + title/artist */}
      <Section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px 4px' }}>
          {albumArt ? (
            <img
              src={albumArt}
              alt="Album art"
              style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: '60px', height: '60px', borderRadius: '4px', flexShrink: 0,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--gpSystemLighterGrey)',
            }}>
              <FaMusic size={36} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            {artist && (
              <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {artist}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Progress bar */}
      {track && (
        <Section>
          <ProgressBar />
        </Section>
      )}

      {/* Prev / Play-Pause / Next */}
      <div style={{ marginTop: '10px', marginBottom: '10px', paddingLeft: '5px', paddingRight: '5px' }}>
        <Section noPull>
          <Focusable style={{ display: 'flex', marginTop: '4px', marginBottom: '4px' }} flow-children="horizontal">
            <DialogButton style={transBtnFirst} onClick={() => { void apiPrev(); }}><IoPlaySkipBack /></DialogButton>
            <DialogButton style={transBtnMid} onClick={() => { togglePlayback(); }}>
              {isPlaying ? <FaPause /> : <IoPlay />}
            </DialogButton>
            <DialogButton style={transBtnLast} onClick={() => { void apiNext(); }}><IoPlaySkipForward /></DialogButton>
          </Focusable>
        </Section>
      </div>

      {/* Volume */}
      <Section>
        <VolumeSlider />
      </Section>

      {/* Cast receiver toggle */}
      <Section>
        <PaddedToggle
          label="Cast Receiver"
          description="Advertise this device on the network for casting"
          checked={receiverEnabled}
          onChange={(v) => { void handleReceiverToggle(v); }}
        />
      </Section>
    </>
  );
};
