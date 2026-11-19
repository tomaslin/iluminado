import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { SkinConfig } from '../game/types';

interface PWAInstallButtonProps {
  skin: SkinConfig;
  chipBg: string;
  chipBorder: string;
  heroInk: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  skin,
  chipBg,
  chipBorder,
  heroInk,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        data-testid="pwa-install-button"
        aria-label="Install Iluminado App"
        className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap"
        style={{
          backgroundColor: skin.palette.hudAccent,
          color: '#faf6ee',
          border: '1px solid rgba(250, 246, 238, 0.22)',
        }}
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          data-testid="pwa-install-ios-button"
          aria-label="Add Iluminado to Home Screen"
          className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: chipBg,
            color: heroInk,
            border: chipBorder,
          }}
        >
          <Share className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Add App</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
            style={{ backgroundColor: 'rgba(18, 15, 28, 0.72)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Install on iPhone or iPad"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowIOSGuide(false);
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-modal-in"
              style={{
                backgroundColor: '#faf7f1',
                color: skin.palette.hudInk,
                border: `1px solid ${skin.palette.boardFrame}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl font-semibold">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'rgba(32, 28, 44, 0.06)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed" style={{ color: skin.palette.hudMuted }}>
                <li>
                  1. Tap the <strong style={{ color: skin.palette.hudInk }}>Share</strong> icon in Safari&apos;s toolbar.
                </li>
                <li>
                  2. Scroll down and choose{' '}
                  <strong style={{ color: skin.palette.hudInk }}>Add to Home Screen</strong>.
                </li>
                <li>
                  3. Launch anytime from your home screen—even offline.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: skin.palette.hudInk,
                  color: '#faf6ee',
                }}
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
