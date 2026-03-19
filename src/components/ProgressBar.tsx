import { SliderField } from '@decky/ui';
import type { SliderFieldProps } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiSeek, getPosition, getDuration, addPositionListener } from '../services/audioManager';

const PaddedSlider = (props: SliderFieldProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const firstChild = ref.current.firstElementChild as HTMLElement | null;
    if (firstChild) {
      firstChild.style.paddingLeft = '19px';
      firstChild.style.paddingRight = '19px';
    }
    ref.current.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (parseFloat(window.getComputedStyle(el).minWidth) >= 270)
        el.style.minWidth = '0';
    });
  }, []);
  return (
    <div ref={ref}>
      <SliderField {...props} />
    </div>
  );
};

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export const ProgressBar = () => {
  const [position, setPosition] = useState<number>(getPosition());
  const [duration, setDuration] = useState<number>(getDuration());
  const seekingRef = useRef(false);
  const seekRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = addPositionListener((pos, dur) => {
      if (!seekingRef.current) {
        setPosition(pos);
        setDuration(dur);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    return () => {
      if (seekRef.current) clearTimeout(seekRef.current);
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    seekingRef.current = true;
    setPosition(val);

    if (seekRef.current) clearTimeout(seekRef.current);
    seekRef.current = setTimeout(() => {
      void apiSeek(val);
      // Resume position updates after a short delay
      setTimeout(() => { seekingRef.current = false; }, 500);
    }, 200);
  }, []);

  const maxVal = Math.max(duration, 1);
  const elapsed = formatTime(position);
  const total = formatTime(duration);

  return (
    <div>
      <PaddedSlider
        value={Math.min(position, maxVal)}
        min={0}
        max={maxVal}
        step={1}
        onChange={handleChange}
        showValue={false}
      />
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 19px',
        marginTop: '-8px',
        fontSize: '11px',
        color: 'var(--gpSystemLighterGrey)',
      }}>
        <span>{elapsed}</span>
        <span>{total}</span>
      </div>
    </div>
  );
};
