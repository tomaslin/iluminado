import React from 'react';
import { HudSnapshot, SkinConfig } from '../game/types';

interface GameModalsProps {
  hud: HudSnapshot;
  skin: SkinConfig;
  onResume: () => void;
  onRestart: () => void;
  onBackToMenu: () => void;
}

export const GameModals: React.FC<GameModalsProps> = ({
  hud,
  skin,
  onResume,
  onRestart,
  onBackToMenu,
}) => {
  const { palette } = skin;

  if (hud.status === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(35, 28, 46, 0.34)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Game Paused"
      >
        <div
          className="w-full max-w-sm rounded-2xl p-7 shadow-xl animate-modal-in"
          style={{
            backgroundColor: palette.hudCardBg,
            color: palette.hudInk,
            border: `1px solid ${palette.boardFrame}`,
          }}
        >
          <div className="text-center mb-6">
            <p
              className="text-xs font-medium tracking-wide mb-1 capitalize"
              style={{ color: palette.hudMuted }}
            >
              {hud.mode.replace('_', ' ')} · Level {hud.level}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Paused
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-[#faf6ee] transition-transform active:scale-[0.99] cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: palette.hudAccent }}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 px-5 rounded-xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(32, 28, 44, 0.05)',
                color: palette.hudInk,
              }}
            >
              Restart
            </button>
            <button
              type="button"
              onClick={onBackToMenu}
              className="w-full py-3 px-5 rounded-xl font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              style={{
                color: palette.hudMuted,
              }}
            >
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hud.status === 'gameover') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(35, 28, 46, 0.38)' }}
        role="dialog"
        aria-modal="true"
        aria-label={hud.outcomeTitle}
      >
        <div
          className="w-full max-w-md rounded-2xl p-8 shadow-2xl animate-modal-in"
          style={{
            backgroundColor: palette.hudCardBg,
            color: palette.hudInk,
            border: `1px solid ${palette.boardFrame}`,
          }}
        >
          <div className="text-center mb-6">
            <p
              className="text-xs font-semibold tracking-wider uppercase mb-1"
              style={{ color: palette.hudAccent }}
            >
              {hud.isVictory ? 'Completed' : 'Finished'}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              {hud.outcomeTitle}
            </h2>
            {hud.outcomeSubtitle && (
              <p className="text-sm mt-1.5" style={{ color: palette.hudMuted }}>
                {hud.outcomeSubtitle}
              </p>
            )}
          </div>

          <div
            className="grid grid-cols-3 gap-3 py-4 px-4 rounded-xl mb-6"
            style={{ backgroundColor: 'rgba(32, 28, 44, 0.04)' }}
          >
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: palette.hudMuted }}
              >
                Score
              </div>
              <div className="font-mono-tabular text-xl font-semibold mt-0.5">
                {Math.round(hud.score).toLocaleString()}
              </div>
            </div>
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: palette.hudMuted }}
              >
                Best
              </div>
              <div className="font-mono-tabular text-xl font-semibold mt-0.5">
                {Math.round(hud.highScore).toLocaleString()}
              </div>
            </div>
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: palette.hudMuted }}
              >
                Squares
              </div>
              <div className="font-mono-tabular text-xl font-semibold mt-0.5">
                {hud.squaresTotal}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs mb-6 px-1" style={{ color: palette.hudMuted }}>
            <span>
              {hud.mode === 'daily' && hud.isVictory
                ? `Daily ${hud.activeDailyDateKey ?? ''} · Streak ${hud.dailyStreak ?? 1}`
                : `Level ${hud.level} · ${hud.squaresTotal} Squares`}
            </span>
            <span className="font-mono-tabular">
              Max Combo {hud.maxCombo > 0 ? Math.min(16, hud.maxCombo * 4) : 1}×
            </span>
          </div>

          <div className="flex gap-3">
            {!(hud.mode === 'daily' && hud.isVictory) && (
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="flex-1 py-3 px-5 rounded-xl font-semibold text-sm text-[#faf6ee] transition-transform active:scale-[0.99] cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: palette.hudAccent }}
              >
                {hud.mode === 'daily' ? 'Try Again' : 'Play Again'}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToMenu}
              className={`${
                hud.mode === 'daily' && hud.isVictory ? 'flex-1 text-[#faf6ee]' : ''
              } py-3 px-5 rounded-xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap`}
              style={{
                backgroundColor:
                  hud.mode === 'daily' && hud.isVictory
                    ? palette.hudAccent
                    : 'rgba(32, 28, 44, 0.06)',
                color:
                  hud.mode === 'daily' && hud.isVictory
                    ? '#faf6ee'
                    : palette.hudInk,
              }}
            >
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
