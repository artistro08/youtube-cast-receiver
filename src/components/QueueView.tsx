import { DialogButton, Focusable } from '@decky/ui';
import { FaMusic } from 'react-icons/fa';
import { IoVolumeMedium } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import { Section } from './Section';

const BACKEND_URL = 'http://127.0.0.1:39281';

async function jumpToTrack(videoId: string) {
  try {
    await fetch(`${BACKEND_URL}/api/queue/jump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
  } catch (e) {
    console.error('[YTCast] Queue jump failed:', e);
  }
}

export const QueueView = () => {
  const { queue } = usePlayer();
  const { tracks, position } = queue;

  if (tracks.length === 0) {
    return (
      <Section>
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--gpSystemLighterGrey)' }}>
          <div style={{ marginBottom: '8px' }}><FaMusic size={32} /></div>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Queue is Empty</div>
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
            Cast a video from <strong>YouTube</strong> on your phone to start playing.
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      {tracks.map((track, index) => {
        const title = track.title ?? 'Unknown';
        const artist = track.artist ?? '';
        const isSelected = index === position;
        const thumbnail = track.albumArt;

        return (
          <Focusable
            key={track.videoId ?? `q-${index}`}
            style={{ display: 'flex', alignItems: 'stretch', marginTop: '2px', marginBottom: '2px' }}
          >
            <DialogButton
              className={isSelected ? 'yt-queue-active' : undefined}
              style={{
                flex: 1,
                textAlign: 'left',
                height: 'auto',
                minHeight: '44px',
                padding: '0',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                borderRadius: '0',
                overflow: 'hidden',
              }}
              onClick={() => { void jumpToTrack(track.videoId); }}
            >
              {/* Thumbnail */}
              <div style={{ width: '60px', height: '60px', flexShrink: 0, alignSelf: 'center', position: 'relative', background: 'rgba(255,255,255,0.05)' }}>
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    style={{ width: '60px', height: '60px', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gpSystemLighterGrey)' }}>
                    <FaMusic size={18} />
                  </div>
                )}
                {isSelected && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IoVolumeMedium size={20} color="white" />
                  </div>
                )}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0, padding: '.55rem 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: isSelected ? 'bold' : 'normal', fontSize: '13px', display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, minWidth: 0, maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)' }}>{title}</span>
                </div>
                {artist && (
                  <div style={{ fontSize: '11px', color: 'var(--gpSystemLighterGrey)', marginTop: '2px', overflow: 'hidden', whiteSpace: 'nowrap', maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)' }}>
                    {artist}
                  </div>
                )}
              </div>
            </DialogButton>
          </Focusable>
        );
      })}
    </Section>
  );
};
