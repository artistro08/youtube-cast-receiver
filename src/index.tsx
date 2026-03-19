import { definePlugin } from '@decky/api';
import { FaChromecast } from 'react-icons/fa';

export default definePlugin(() => {
  return {
    name: 'YouTube Cast Receiver',
    content: <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gpSystemLighterGrey)' }}>YouTube Cast Receiver — backend starting...</div>,
    icon: <FaChromecast />,
    onDismount() {},
  };
});
