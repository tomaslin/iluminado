import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { SkinConfig } from '../game/types';

interface OfflineIndicatorProps {
  skin: SkinConfig;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ skin }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed bottom-4 left-4 z-40 pointer-events-none flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-lg"
      style={{
        backgroundColor: skin.palette.hudInk,
        color: '#faf6ee',
        border: `1px solid ${skin.palette.hudAccent}`,
      }}
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" style={{ color: skin.palette.hudAccent }} aria-hidden="true" />
      <span>Offline Mode · Playing from local cache</span>
    </div>
  );
};
