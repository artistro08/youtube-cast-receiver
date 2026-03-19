import { SliderField } from '@decky/ui';
import type { SliderFieldProps } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaVolumeUp } from 'react-icons/fa';
import { addVolumeListener, getVolume, setAudioVolume, apiSetVolume } from '../services/audioManager';

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

// Module-level cache — survives tab switches / component remounts
let cachedVolume: number = 100;

export const VolumeSlider = () => {
  const [displayVolume, setDisplayVolume] = useState<number>(() => {
    cachedVolume = getVolume();
    return cachedVolume;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDragging = useRef(false);
  const dragTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe directly to audioManager volume changes (phone/WebSocket)
  useEffect(() => {
    const unsub = addVolumeListener((vol) => {
      cachedVolume = vol;
      // Only update display if user is NOT actively dragging the slider
      if (!userDragging.current) {
        setDisplayVolume(vol);
      }
    });

    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (dragTimeout.current) clearTimeout(dragTimeout.current);
    };
  }, []);

  const handleChange = useCallback((val: number) => {
    // Mark as user-dragging to suppress external updates
    userDragging.current = true;
    if (dragTimeout.current) clearTimeout(dragTimeout.current);
    dragTimeout.current = setTimeout(() => { userDragging.current = false; }, 800);

    setDisplayVolume(val);
    cachedVolume = val;

    // Set audio volume immediately — no round-trip delay
    setAudioVolume(val, true);

    // Debounce the backend API call
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
