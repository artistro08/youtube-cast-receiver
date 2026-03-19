import { Tabs, staticClasses, Focusable } from '@decky/ui';
import { definePlugin } from '@decky/api';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FaChromecast } from 'react-icons/fa';

import { PlayerProvider } from './context/PlayerContext';
import { PlayerView } from './components/PlayerView';
import { initAudio, destroyAudio } from './services/audioManager';

const MIN_HEIGHT = 433;

const TabsContainer = memo(() => {
  const [activeTab, setActiveTab] = useState<string>('player');
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(MIN_HEIGHT);

  useEffect(() => {
    if (!containerRef.current) return;

    let scrollEl: HTMLElement | null = null;
    let prevOverflow = '';

    const recalcHeight = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      let newHeight: number;

      if (scrollEl) {
        const elRect = scrollEl.getBoundingClientRect();
        newHeight = elRect.bottom - containerRect.top;
      } else {
        newHeight = window.innerHeight - containerRect.top;
      }

      setHeight(Math.max(newHeight, MIN_HEIGHT));
    };

    let el: Element | null = containerRef.current.parentElement;
    while (el && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (oy === 'scroll' || oy === 'auto' || oy === 'overlay') {
        scrollEl = el as HTMLElement;
        break;
      }
      el = el.parentElement;
    }

    requestAnimationFrame(() => {
      recalcHeight();
    });

    if (scrollEl) {
      prevOverflow = scrollEl.style.overflowY;
      scrollEl.style.overflowY = 'hidden';
    }

    const observer = new ResizeObserver(recalcHeight);
    if (scrollEl) observer.observe(scrollEl);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (scrollEl) scrollEl.style.overflowY = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = `
      #ytcast-container > * {
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      #ytcast-container [class*="TabHeaderRowWrapper"] {
        flex-shrink: 0 !important;
        min-height: 32px !important;
        padding-left: 18px !important;
        padding-right: 18px !important;
      }
      #ytcast-container [class*="TabContentsScroll"] {
        flex: 1 !important;
        min-height: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      #ytcast-container [class*="Glyphs"] {
        transform: scale(0.65) !important;
        transform-origin: center center !important;
      }
      .yt-queue-active:not(:focus):not(:focus-within) { background: rgba(255,255,255,0) !important; }
    `;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const tabItems = useMemo(() => [
    { id: 'player', title: 'Player', content: <PlayerView /> },
    { id: 'queue', title: 'Queue', content: <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gpSystemLighterGrey)' }}>Queue — coming in Plan 3</div> },
  ], []);

  return (
    <div id="ytcast-container" ref={containerRef} style={{ height, overflow: 'hidden' }}>
      <Tabs
        activeTab={activeTab}
        onShowTab={(tabID: string) => setActiveTab(tabID)}
        tabs={tabItems}
      />
    </div>
  );
});
TabsContainer.displayName = 'TabsContainer';

const Content = () => {
  useEffect(() => {
    const titleEl = document.querySelector(`.${staticClasses.Title}`);
    if (titleEl?.parentElement) {
      titleEl.parentElement.style.gap = '0';
    }
  }, []);

  return (
    <PlayerProvider>
      <TabsContainer />
    </PlayerProvider>
  );
};

export default definePlugin(() => {
  initAudio();

  return {
    name: 'YouTube Cast Receiver',
    titleView: (
      <Focusable
        style={{
          display: 'flex',
          padding: '0',
          width: '100%',
          boxShadow: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        className={staticClasses.Title}
      >
        <div>YouTube Cast</div>
      </Focusable>
    ),
    content: <Content />,
    icon: <FaChromecast />,
    onDismount() {
      destroyAudio();
    },
  };
});
