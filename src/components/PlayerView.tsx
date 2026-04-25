import { useState, useEffect, useRef } from 'react';
import { DialogButton, Focusable, ToggleField } from '@decky/ui';
import { FaMusic } from 'react-icons/fa';
import { FaPause } from 'react-icons/fa';
import { IoPlay, IoPlaySkipBack, IoPlaySkipForward } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import {
  togglePlayback, apiNext, apiPrev,
  getNetworkInfo, addNetworkListener,
  apiTrustNetwork, apiUntrustNetwork,
  type NetworkInfo,
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
  const [network, setNetwork] = useState<NetworkInfo>(getNetworkInfo());

  useEffect(() => addNetworkListener(setNetwork), []);

  const handleTrustToggle = async (trusted: boolean) => {
    setNetwork({ ...network, trusted });
    if (trusted) {
      await apiTrustNetwork();
    } else {
      await apiUntrustNetwork();
    }
  };

  const trustDescription = network.name
    ? `Currently on "${network.name}". Receiver runs only on trusted networks.`
    : 'No network detected';

  const albumArt = track?.albumArt;
  const title = track?.title ?? (connected ? 'Waiting for cast...' : 'Not connected');
  const artist = track?.artist;

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

      {/* Trust this network toggle — receiver runs while connected to a trusted network */}
      <Section>
        <PaddedToggle
          label="Trust this network"
          description={trustDescription}
          checked={network.trusted}
          onChange={(v) => { void handleTrustToggle(v); }}
        />
      </Section>
    </>
  );
};
