import React from 'react';
import { ALL_SHIFT_TYPES } from '../game/shifts';
import { HudSnapshot, SkinConfig } from '../game/types';

interface GameModalsProps {
  hud: HudSnapshot;
  skin: SkinConfig;
  musicVolume: number;
  sfxVolume: number;
  onChangeMusicVolume: (val: number) => void;
  onChangeSfxVolume: (val: number) => void;
  onResume: () => void;
  onRestart: () => void;
  onNextStage?: () => void;
  onOpenShiftSettings?: () => void;
  onBackToMenu: () => void;
  reducedMotion?: boolean;
  patternMode?: boolean;
  onToggleReducedMotion?: () => void;
  onTogglePatternMode?: () => void;
}

export const GameModals: React.FC<GameModalsProps> = ({
  hud,
  skin,
  musicVolume,
  sfxVolume,
  onChangeMusicVolume,
  onChangeSfxVolume,
  onResume,
  onRestart,
  onNextStage,
  onOpenShiftSettings,
  onBackToMenu,
  reducedMotion = false,
  patternMode = false,
  onToggleReducedMotion,
  onTogglePatternMode,
}) => {
  const { palette } = skin;

  if (hud.status === 'paused') {
    const musicPct = Math.round(musicVolume * 100);
    const sfxPct = Math.round(sfxVolume * 100);

    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(35, 28, 46, 0.34)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Game Paused"
      >
        <div
          className="w-full max-w-xs rounded-3xl p-6 sm:p-7 shadow-xl animate-modal-in"
          style={{
            backgroundColor: palette.hudCardBg,
            color: palette.hudInk,
            border: `2px solid ${palette.boardFrame}`,
          }}
        >
          <div className="text-center mb-5">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Paused
            </h2>
            <p
              className="text-xs font-medium mt-1 capitalize"
              style={{ color: palette.hudMuted }}
            >
              {hud.mode.replace('_', ' ')} · {skin.name}
            </p>
          </div>

          <div
            className="mb-4 px-3.5 py-3 rounded-2xl space-y-2.5"
            style={{ backgroundColor: 'rgba(32, 28, 44, 0.045)' }}
          >
            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <label htmlFor="pause-music-vol">Music</label>
                <span
                  className="font-mono-tabular text-[11px]"
                  style={{ color: palette.hudMuted }}
                >
                  {musicPct}%
                </span>
              </div>
              <input
                id="pause-music-vol"
                data-testid="music-volume-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={musicPct}
                onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
                aria-label="Music volume"
                className="w-full h-1.5 rounded-full cursor-pointer"
                style={{ accentColor: palette.hudAccent }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <label htmlFor="pause-sfx-vol">SFX</label>
                <span
                  className="font-mono-tabular text-[11px]"
                  style={{ color: palette.hudMuted }}
                >
                  {sfxPct}%
                </span>
              </div>
              <input
                id="pause-sfx-vol"
                data-testid="sfx-volume-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={sfxPct}
                onChange={(e) => onChangeSfxVolume(Number(e.target.value) / 100)}
                aria-label="SFX volume"
                className="w-full h-1.5 rounded-full cursor-pointer"
                style={{ accentColor: palette.hudAccent }}
              />
            </div>

            {(onToggleReducedMotion || onTogglePatternMode) && (
              <div className="pt-2 border-t border-[#201c2c]/10 flex flex-col gap-1.5">
                {onToggleReducedMotion && (
                  <button
                    type="button"
                    data-testid="toggle-reduced-motion"
                    aria-pressed={reducedMotion}
                    onClick={onToggleReducedMotion}
                    className="w-full flex items-center justify-between text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                    style={{
                      backgroundColor: reducedMotion ? palette.hudAccent : 'rgba(32, 28, 44, 0.06)',
                      color: reducedMotion ? '#faf6ee' : palette.hudInk,
                    }}
                  >
                    <span>Reduced Motion</span>
                    <span className="font-mono-tabular text-[11px]">{reducedMotion ? 'ON' : 'OFF'}</span>
                  </button>
                )}
                {onTogglePatternMode && (
                  <button
                    type="button"
                    data-testid="toggle-pattern-mode"
                    aria-pressed={patternMode}
                    onClick={onTogglePatternMode}
                    className="w-full flex items-center justify-between text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                    style={{
                      backgroundColor: patternMode ? palette.hudAccent : 'rgba(32, 28, 44, 0.06)',
                      color: patternMode ? '#faf6ee' : palette.hudInk,
                    }}
                  >
                    <span>Pattern Symbols</span>
                    <span className="font-mono-tabular text-[11px]">{patternMode ? 'ON' : 'OFF'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-5 rounded-2xl font-semibold text-sm text-[#faf6ee] transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: palette.hudAccent }}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 px-5 rounded-2xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(32, 28, 44, 0.055)',
                color: palette.hudInk,
              }}
            >
              Restart
            </button>
            {onOpenShiftSettings && (
              <button
                type="button"
                data-testid="open-shift-settings-pause"
                onClick={onOpenShiftSettings}
                className="w-full py-2.5 px-5 rounded-2xl font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'rgba(32, 28, 44, 0.04)',
                  color: palette.hudInk,
                }}
              >
                Shifts ({hud.enabledShiftCount}/{ALL_SHIFT_TYPES.length})
              </button>
            )}
            <button
              type="button"
              onClick={onBackToMenu}
              className="w-full py-2.5 px-5 rounded-2xl font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              style={{
                color: palette.hudMuted,
              }}
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hud.status === 'gameover') {
    const isNewBest = hud.score > 0 && hud.score >= hud.highScore;
    const maxComboMult = hud.maxCombo > 0 ? Math.min(16, hud.maxCombo * 4) : 1;

    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(35, 28, 46, 0.38)' }}
        role="dialog"
        aria-modal="true"
        aria-label={hud.outcomeTitle}
      >
        <div
          className="w-full max-w-sm rounded-3xl p-7 sm:p-8 shadow-2xl animate-modal-in text-center"
          style={{
            backgroundColor: palette.hudCardBg,
            color: palette.hudInk,
            border: `2px solid ${palette.boardFrame}`,
          }}
        >
          {/* Welcoming 2x2 Tile Crest */}
          <div className="flex justify-center mb-3">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              aria-hidden="true"
              className={hud.isVictory ? 'drop-shadow-md' : ''}
            >
              <rect
                x="4"
                y="4"
                width="18"
                height="18"
                rx="5"
                fill={hud.isVictory ? palette.hudAccent : palette.blockA.fill}
                stroke={palette.boardFrame}
                strokeWidth="1.5"
              />
              <rect
                x="26"
                y="4"
                width="18"
                height="18"
                rx="3"
                fill={palette.blockB.fill}
                stroke={palette.boardFrame}
                strokeWidth="1.5"
              />
              <rect
                x="4"
                y="26"
                width="18"
                height="18"
                rx="3"
                fill={palette.blockB.fill}
                stroke={palette.boardFrame}
                strokeWidth="1.5"
              />
              <rect
                x="26"
                y="26"
                width="18"
                height="18"
                rx="5"
                fill={hud.isVictory ? palette.hudAccent : palette.blockA.fill}
                stroke={palette.boardFrame}
                strokeWidth="1.5"
              />
            </svg>
          </div>

          <h2 className="font-display text-3xl font-semibold tracking-tight leading-tight">
            {hud.outcomeTitle}
          </h2>
          {hud.outcomeSubtitle && (
            <p className="text-sm mt-1" style={{ color: palette.hudMuted }}>
              {hud.outcomeSubtitle}
            </p>
          )}

          {/* Hero Score */}
          <div className="mt-5 mb-5">
            {isNewBest && (
              <div
                className="text-xs font-semibold mb-0.5"
                style={{ color: palette.hudAccent }}
              >
                New High Score!
              </div>
            )}
            <div className="font-display text-4xl font-semibold tabular-nums leading-none">
              {Math.round(hud.score).toLocaleString()}
            </div>
            <div
              className="text-xs font-mono-tabular mt-1.5"
              style={{ color: palette.hudMuted }}
            >
              {hud.mode === 'daily' && hud.isVictory
                ? `Daily Streak ${hud.dailyStreak ?? 1}`
                : `Best ${Math.round(hud.highScore).toLocaleString()}`}
            </div>
          </div>

          {/* 3 Clean Game Highlights (No SaaS Spreadsheet Boxes) */}
          <div
            className="grid grid-cols-3 gap-2 py-4 border-t border-b border-[#201c2c]/10 mb-6"
            data-testid="postgame-breakdown"
          >
            <div>
              <div className="font-mono-tabular text-lg font-semibold">
                {hud.squaresTotal}
              </div>
              <div className="text-xs mt-0.5" style={{ color: palette.hudMuted }}>
                Squares
              </div>
            </div>
            <div>
              <div className="font-mono-tabular text-lg font-semibold">
                {hud.worldsCleared > 0 ? hud.worldsCleared : hud.level}
              </div>
              <div className="text-xs mt-0.5" style={{ color: palette.hudMuted }}>
                {hud.worldsCleared > 0 ? 'Worlds' : 'Level'}
              </div>
            </div>
            <div>
              <div className="font-mono-tabular text-lg font-semibold">
                {maxComboMult}×
              </div>
              <div className="text-xs mt-0.5" style={{ color: palette.hudMuted }}>
                Max Combo
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5">
            {hud.isVictory && hud.hasNextStage && onNextStage && (
              <button
                type="button"
                data-start="true"
                onClick={onNextStage}
                className="flex-1 py-3 px-5 rounded-2xl font-semibold text-sm text-[#faf6ee] transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: palette.hudAccent }}
              >
                Next Stage
              </button>
            )}
            {!(hud.mode === 'daily' && hud.isVictory) && (
              <button
                type="button"
                data-start={!(hud.isVictory && hud.hasNextStage) ? 'true' : undefined}
                onClick={onRestart}
                className="flex-1 py-3 px-5 rounded-2xl font-semibold text-sm transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor:
                    hud.isVictory && hud.hasNextStage
                      ? 'rgba(32, 28, 44, 0.07)'
                      : palette.hudAccent,
                  color:
                    hud.isVictory && hud.hasNextStage ? palette.hudInk : '#faf6ee',
                }}
              >
                {hud.mode === 'daily' ? 'Try Again' : 'Play Again'}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToMenu}
              className={`${
                hud.mode === 'daily' && hud.isVictory ? 'flex-1 text-[#faf6ee]' : 'px-5'
              } py-3 rounded-2xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap`}
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
              Title Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
