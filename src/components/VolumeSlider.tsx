import { SliderField } from '@decky/ui';
import type { SliderFieldProps } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { apiSetVolume } from '../services/audioManager';
import { usePlayer } from '../context/PlayerContext';

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

export const VolumeSlider = () => {
  const { volume } = usePlayer();
  const [displayVolume, setDisplayVolume] = useState<number>(volume);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with context when it changes externally (e.g. phone changed volume)
  useEffect(() => {
    setDisplayVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    setDisplayVolume(val);

    // Debounce the API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void apiSetVolume(val);
    }, 300);
  }, []);

  return (
    <PaddedSlider
      icon={<FaVolumeUp size={18} />}
      value={displayVolume}
      min={0}
      max={100}
      step={1}
      onChange={handleChange}
      showValue={false}
    />
  );
};
