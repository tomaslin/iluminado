import React from 'react';
import { getHexLuminance } from '../game/skins';
import { BoardOrientation, HudSnapshot, SkinConfig } from '../game/types';
import { PiecePreview } from './PiecePreview';

interface GameHudProps {
  hud: HudSnapshot;
  skin: SkinConfig;
  orientation: BoardOrientation;
  isCompactLandscape: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onTouchAction: (action: 'left' | 'right' | 'rotate' | 'hard_drop') => void;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  skin,
  orientation,
  isCompactLandscape,
  muted,
  onToggleMute,
  onPause,
  onRestart,
  onTouchAction,
}) => {
  const { palette } = skin;
  const isDual = hud.mode === 'vs_cpu' || hud.mode === 'battle_2p';
  const showSideTouchWings = isCompactLandscape && !isDual;
  const holdTimersRef = React.useRef<{ timeout?: number; interval?: number }>({});

  const stopHoldRepeat = React.useCallback(() => {
    if (holdTimersRef.current.timeout !== undefined) {
      window.clearTimeout(holdTimersRef.current.timeout);
      holdTimersRef.current.timeout = undefined;
    }
    if (holdTimersRef.current.interval !== undefined) {
      window.clearInterval(holdTimersRef.current.interval);
      holdTimersRef.current.interval = undefined;
    }
  }, []);

  React.useEffect(() => stopHoldRepeat, [stopHoldRepeat]);

  const startHoldRepeat = React.useCallback(
    (action: 'left' | 'right') => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      stopHoldRepeat();
      onTouchAction(action);
      holdTimersRef.current.timeout = window.setTimeout(() => {
        holdTimersRef.current.interval = window.setInterval(() => {
          onTouchAction(action);
        }, 62);
      }, 160);
    },
    [onTouchAction, stopHoldRepeat]
  );

  const cardStyle: React.CSSProperties = {
    backgroundColor: palette.hudCardBg,
    color: palette.hudInk,
    border: '1px solid rgba(32, 28, 44, 0.08)',
    boxShadow: '0 8px 24px rgba(34, 24, 42, 0.08)',
  };

  return (
    <div
      className={`fixed inset-0 z-10 pointer-events-none flex flex-col justify-between ${
        isCompactLandscape ? 'p-2 sm:p-2.5' : 'p-3 sm:p-4 lg:p-5'
      }`}
    >
      {/* Top Perimeter Strip */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div
          className={`${
            isCompactLandscape ? 'px-3 py-1.5' : 'px-3.5 py-2 sm:px-4 sm:py-2.5'
          } rounded-xl flex items-center gap-3 transition-colors duration-300`}
          style={cardStyle}
        >
          <div>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium" style={{ color: palette.hudMuted }}>
              <span
                className="inline-flex items-end gap-[2px] h-3 shrink-0"
                aria-hidden="true"
                style={{
                  ['--beat-dur' as string]: `${(60 / Math.max(40, hud.bpm)).toFixed(3)}s`,
                }}
              >
                <span className="w-[2.5px] h-2.5 rounded-t-xs animate-eq-bar" style={{ backgroundColor: palette.hudAccent }} />
                <span className="w-[2.5px] h-3 rounded-t-xs animate-eq-bar" style={{ backgroundColor: palette.hudAccent, animationDelay: '0.12s' }} />
                <span className="w-[2.5px] h-2 rounded-t-xs animate-eq-bar" style={{ backgroundColor: palette.hudAccent, animationDelay: '0.24s' }} />
              </span>
              <span className="font-mono-tabular uppercase tracking-wider">
                {hud.boardCols}×{hud.boardRows}
              </span>
            </div>
            <div className={`font-display ${isCompactLandscape ? 'text-base' : 'text-lg'} font-semibold leading-tight capitalize`}>
              {hud.mode.replace('_', ' ')}
            </div>
          </div>
        </div>

        {hud.timeRemaining !== null ? (
          <div className="px-5 py-2 rounded-xl text-center" style={cardStyle}>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: palette.hudMuted }}
            >
              Time
            </div>
            <div
              className="font-mono-tabular text-2xl font-semibold leading-none mt-0.5"
              style={{
                color: hud.timeRemaining <= 10 ? palette.hudAccent : palette.hudInk,
              }}
            >
              {formatTime(hud.timeRemaining)}
            </div>
          </div>
        ) : isDual ? (
          <div
            className="px-5 py-2 rounded-xl flex items-center gap-6"
            style={cardStyle}
          >
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                Player 1
              </div>
              <div className="font-mono-tabular text-xl font-semibold">
                {Math.round(hud.score).toLocaleString()}
              </div>
            </div>
            <div className="h-6 w-px bg-[#201c2c]/10" aria-hidden="true" />
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                {hud.mode === 'vs_cpu' ? 'CPU' : 'Player 2'}
              </div>
              <div className="font-mono-tabular text-xl font-semibold">
                {Math.round(hud.p2Score ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        ) : null}

        {/* Top-Right Utility Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            style={cardStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {muted ? (
                <>
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </>
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart game (R)"
            title="Restart (R)"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            style={cardStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause game (P)"
            title="Pause (P)"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
            style={cardStyle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Compact Landscape Side-Split Touch Wings (Mobile Landscape Sideways Mode) */}
      {showSideTouchWings && (
        <div className="touch-landscape-wings items-center justify-between flex-1 gap-2 py-1 min-h-0">
          {/* Left Wing: Score/Combo summary + Directional Thumb Pad */}
          <div className="w-[118px] flex flex-col gap-1.5 pointer-events-auto">
            <div className="px-2.5 py-1.5 rounded-xl text-[11px]" style={cardStyle}>
              <div className="flex items-baseline justify-between">
                <span style={{ color: palette.hudMuted }}>Score</span>
                <span className="font-mono-tabular font-semibold text-xs">
                  {Math.round(hud.score).toLocaleString()}
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span style={{ color: palette.hudMuted }}>Lv {hud.level}</span>
                <span
                  className="font-mono-tabular font-semibold text-xs"
                  style={{ color: hud.comboMultiplier >= 4 ? palette.hudAccent : palette.hudInk }}
                >
                  {hud.comboMultiplier}×
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-label="Move Left"
                onPointerDown={startHoldRepeat('left')}
                onPointerUp={stopHoldRepeat}
                onPointerCancel={stopHoldRepeat}
                onPointerLeave={stopHoldRepeat}
                className="min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] active:scale-95 touch-none select-none cursor-pointer transition-transform"
                style={{
                  backgroundColor: palette.hudCardBg,
                  color: palette.hudInk,
                  border: `2px solid ${palette.boardFrame}`,
                  boxShadow: '0 3px 0 rgba(32, 28, 44, 0.16), 0 6px 14px rgba(24, 18, 36, 0.12)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>Left</span>
              </button>

              <button
                type="button"
                aria-label="Move Right"
                onPointerDown={startHoldRepeat('right')}
                onPointerUp={stopHoldRepeat}
                onPointerCancel={stopHoldRepeat}
                onPointerLeave={stopHoldRepeat}
                className="min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] active:scale-95 touch-none select-none cursor-pointer transition-transform"
                style={{
                  backgroundColor: palette.hudCardBg,
                  color: palette.hudInk,
                  border: `2px solid ${palette.boardFrame}`,
                  boxShadow: '0 3px 0 rgba(32, 28, 44, 0.16), 0 6px 14px rgba(24, 18, 36, 0.12)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>Right</span>
              </button>
            </div>
          </div>

          {/* Right Wing: Next preview + Rotate / Slam Action Buttons */}
          <div className="w-[118px] flex flex-col gap-1.5 pointer-events-auto">
            {hud.nextPieces[0] && (
              <div className="px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2" style={cardStyle}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                  Next
                </span>
                <PiecePreview piece={hud.nextPieces[0]} skin={skin} cellSize={13} />
              </div>
            )}

            <button
              type="button"
              aria-label="Rotate Piece"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchAction('rotate');
              }}
              className="min-h-[54px] rounded-2xl flex flex-col items-center justify-center font-bold text-xs tracking-wide text-[#faf6ee] active:scale-95 touch-none select-none cursor-pointer transition-transform"
              style={{
                backgroundColor: palette.hudInk,
                color: '#faf6ee',
                border: '2px solid rgba(250, 246, 238, 0.24)',
                boxShadow: '0 3px 0 rgba(32, 28, 44, 0.28), 0 8px 18px rgba(24, 18, 36, 0.18)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span>Rotate</span>
            </button>

            <button
              type="button"
              aria-label="Hard Drop Slam"
              onPointerDown={(e) => {
                e.preventDefault();
                onTouchAction('hard_drop');
              }}
              className="min-h-[54px] rounded-2xl flex flex-col items-center justify-center font-bold text-xs tracking-wide text-[#faf6ee] active:scale-95 touch-none select-none cursor-pointer transition-transform"
              style={{
                backgroundColor: palette.hudAccent,
                color: '#faf6ee',
                border: '2px solid rgba(250, 246, 238, 0.3)',
                boxShadow: '0 3px 0 rgba(32, 28, 44, 0.24), 0 8px 18px rgba(24, 18, 36, 0.2)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="7 6 12 11 17 6" />
                <polyline points="7 12 12 17 17 12" />
                <line x1="5" y1="20" x2="19" y2="20" />
              </svg>
              <span>Slam</span>
            </button>
          </div>
        </div>
      )}

      {/* Flanking Single-Player Docks (Desktop Wide Viewports) */}
      {!isDual && !isCompactLandscape && (
        <div className="hidden lg:flex items-center justify-between flex-1 pointer-events-none">
          <div className="w-36 flex flex-col gap-3">
            <div className="px-4 py-3.5 rounded-xl" style={cardStyle}>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                Score
              </div>
              <div
                className="font-mono-tabular text-2xl font-semibold mt-0.5"
                data-testid="hud-score"
              >
                {Math.round(hud.score).toLocaleString()}
              </div>
              <div className="text-[11px] font-medium mt-2" style={{ color: palette.hudMuted }}>
                Best {Math.round(hud.highScore).toLocaleString()}
              </div>
            </div>

            <div className="px-4 py-3.5 rounded-xl" style={cardStyle}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                  Level
                </span>
                <span className="font-mono-tabular text-sm font-semibold">
                  {hud.level}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden bg-[#201c2c]/10">
                <div
                  className="h-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${Math.min(100, Math.round((hud.stageSquares / Math.max(1, hud.stageGoal)) * 100))}%`,
                    backgroundColor: palette.hudAccent,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1.5 font-mono-tabular" style={{ color: palette.hudMuted }}>
                <span>Cleared</span>
                <span>{hud.squaresTotal}</span>
              </div>
            </div>

            <div
              className="px-4 py-3.5 rounded-xl transition-transform duration-150"
              style={{
                ...cardStyle,
                border:
                  hud.comboMultiplier >= 4
                    ? `1.5px solid ${palette.hudAccent}`
                    : cardStyle.border,
                transform: hud.comboMultiplier >= 4 ? 'scale(1.03)' : 'scale(1)',
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                Combo
              </div>
              <div
                className="font-mono-tabular text-2xl font-semibold mt-0.5"
                style={{
                  color: hud.comboMultiplier >= 4 ? palette.hudAccent : palette.hudInk,
                }}
              >
                {hud.comboMultiplier}×
              </div>
              <div className="text-[11px] font-medium mt-1" style={{ color: palette.hudMuted }}>
                Sweep: <span className="font-mono-tabular">{hud.squaresThisSweep}</span> sq
              </div>
            </div>
          </div>

          <div className="w-36 flex flex-col gap-3 items-end">
            <div className="w-full px-4 py-3.5 rounded-xl flex flex-col items-center" style={cardStyle}>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider mb-3 self-start"
                style={{ color: palette.hudMuted }}
              >
                Next
              </div>
              <div className="flex flex-col gap-3 items-center">
                {hud.nextPieces.slice(0, 3).map((piece, idx) => (
                  <div
                    key={idx}
                    style={{ opacity: idx === 0 ? 1 : idx === 1 ? 0.8 : 0.6 }}
                  >
                    <PiecePreview
                      piece={piece}
                      skin={skin}
                      cellSize={idx === 0 ? 22 : 18}
                    />
                  </div>
                ))}
              </div>
            </div>

            {hud.activePuzzle && (
              <div className="w-full px-4 py-3.5 rounded-xl" style={cardStyle}>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: palette.hudMuted }}>
                  Target Shape
                </div>
                <div className="text-xs font-semibold mb-2">
                  {hud.activePuzzle.title}
                </div>
                <div className="flex flex-col gap-0.5 items-center py-1">
                  {hud.activePuzzle.pattern.map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-0.5">
                      {row.split('').map((ch, cIdx) => {
                        const targetStyle =
                          hud.activePuzzle!.targetColor === 0
                            ? palette.blockA
                            : palette.blockB;
                        return (
                          <span
                            key={cIdx}
                            className="w-3.5 h-3.5 rounded-[2px] block"
                            style={{
                              backgroundColor:
                                ch === '#' ? targetStyle.fill : 'rgba(32, 28, 44, 0.08)',
                              border:
                                ch === '#'
                                  ? `1px solid ${targetStyle.border}`
                                  : '1px solid transparent',
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hud.activeMission && (
              <div className="w-full px-4 py-3.5 rounded-xl" style={cardStyle}>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: palette.hudMuted }}>
                  {hud.mode === 'daily' ? `Daily ${hud.activeDailyDateKey ?? ''}` : 'Mission'}
                </div>
                <div className="text-xs font-semibold leading-snug">
                  {hud.activeMission.title}
                </div>
                <div className="text-[11px] mt-1 leading-snug" style={{ color: palette.hudMuted }}>
                  {hud.activeMission.description}
                </div>
                <div className="font-mono-tabular text-sm font-semibold mt-2" style={{ color: palette.hudAccent }}>
                  {hud.missionProgress ?? 0} / {hud.activeMission.targetValue}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`flex flex-col gap-2 ${showSideTouchWings ? 'hidden' : ''}`}>
        {!isDual && !showSideTouchWings && (
          <div
            className="lg:hidden flex items-center justify-between gap-3 px-4 py-2 rounded-xl text-xs"
            style={cardStyle}
          >
            <div>
              <span style={{ color: palette.hudMuted }}>Score </span>
              <span className="font-mono-tabular font-semibold text-sm">
                {Math.round(hud.score).toLocaleString()}
              </span>
            </div>
            <div>
              <span style={{ color: palette.hudMuted }}>Lv </span>
              <span className="font-mono-tabular font-semibold text-sm">{hud.level}</span>
            </div>
            <div>
              <span style={{ color: palette.hudMuted }}>Combo </span>
              <span
                className="font-mono-tabular font-semibold text-sm"
                style={{ color: hud.comboMultiplier >= 4 ? palette.hudAccent : palette.hudInk }}
              >
                {hud.comboMultiplier}×
              </span>
            </div>
            {hud.activeMission && (
              <div className="truncate font-mono-tabular font-semibold" style={{ color: palette.hudAccent }}>
                {hud.missionProgress ?? 0}/{hud.activeMission.targetValue}
              </div>
            )}
            {hud.activePuzzle && (
              <div className="flex items-center gap-1.5" title={hud.activePuzzle.hint}>
                <span style={{ color: palette.hudMuted }}>Target</span>
                <div className="flex flex-col gap-[1px]">
                  {hud.activePuzzle.pattern.map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-[1px]">
                      {row.split('').map((ch, cIdx) => {
                        const targetStyle =
                          hud.activePuzzle!.targetColor === 0 ? palette.blockA : palette.blockB;
                        return (
                          <span
                            key={cIdx}
                            className="w-1.5 h-1.5 rounded-[1px] block"
                            style={{
                              backgroundColor: ch === '#' ? targetStyle.fill : 'rgba(32, 28, 44, 0.08)',
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hud.nextPieces[0] && (
              <div className="flex items-center gap-1.5">
                <span style={{ color: palette.hudMuted }}>Next</span>
                <PiecePreview piece={hud.nextPieces[0]} skin={skin} cellSize={13} />
              </div>
            )}
          </div>
        )}

        <div
          className={`${
            showSideTouchWings ? 'hidden' : 'touch-controls-bar'
          } grid-cols-12 gap-2 max-w-xl w-full mx-auto pointer-events-auto`}
          role="group"
          aria-label="Touch Controls"
        >
          <button
            type="button"
            aria-label="Move Left"
            onPointerDown={startHoldRepeat('left')}
            onPointerUp={stopHoldRepeat}
            onPointerCancel={stopHoldRepeat}
            onPointerLeave={stopHoldRepeat}
            className="col-span-3 min-h-[62px] sm:min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-xs tracking-tight active:translate-y-0.5 active:scale-[0.97] touch-none select-none cursor-pointer transition-transform"
            style={{
              backgroundColor: palette.hudCardBg,
              color: palette.hudInk,
              border: `2px solid ${palette.boardFrame}`,
              boxShadow: '0 4px 0 rgba(32, 28, 44, 0.16), 0 8px 18px rgba(24, 18, 36, 0.12)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Left</span>
          </button>

          <button
            type="button"
            aria-label="Move Right"
            onPointerDown={startHoldRepeat('right')}
            onPointerUp={stopHoldRepeat}
            onPointerCancel={stopHoldRepeat}
            onPointerLeave={stopHoldRepeat}
            className="col-span-3 min-h-[62px] sm:min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-xs tracking-tight active:translate-y-0.5 active:scale-[0.97] touch-none select-none cursor-pointer transition-transform"
            style={{
              backgroundColor: palette.hudCardBg,
              color: palette.hudInk,
              border: `2px solid ${palette.boardFrame}`,
              boxShadow: '0 4px 0 rgba(32, 28, 44, 0.16), 0 8px 18px rgba(24, 18, 36, 0.12)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Right</span>
          </button>

          <button
            type="button"
            aria-label="Rotate Piece"
            onPointerDown={(e) => {
              e.preventDefault();
              onTouchAction('rotate');
            }}
            className="col-span-3 min-h-[62px] sm:min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-xs tracking-wide text-[#faf6ee] active:translate-y-0.5 active:scale-[0.97] touch-none select-none cursor-pointer transition-transform"
            style={{
              backgroundColor: palette.hudInk,
              color: '#faf6ee',
              border: '2px solid rgba(250, 246, 238, 0.24)',
              boxShadow: '0 4px 0 rgba(32, 28, 44, 0.28), 0 10px 20px rgba(24, 18, 36, 0.18)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            <span>Rotate</span>
          </button>

          <button
            type="button"
            aria-label="Hard Drop Slam"
            onPointerDown={(e) => {
              e.preventDefault();
              onTouchAction('hard_drop');
            }}
            className="col-span-3 min-h-[62px] sm:min-h-[68px] rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold text-xs tracking-wide text-[#faf6ee] active:translate-y-0.5 active:scale-[0.97] touch-none select-none cursor-pointer transition-transform"
            style={{
              backgroundColor: palette.hudAccent,
              color: '#faf6ee',
              border: '2px solid rgba(250, 246, 238, 0.3)',
              boxShadow: '0 4px 0 rgba(32, 28, 44, 0.24), 0 10px 22px rgba(24, 18, 36, 0.2)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="7 6 12 11 17 6" />
              <polyline points="7 12 12 17 17 12" />
              <line x1="5" y1="20" x2="19" y2="20" />
            </svg>
            <span>Slam</span>
          </button>
        </div>

        <div
          className="kbd-hint-bar text-center text-xs font-medium transition-colors duration-300"
          style={{
            color:
              getHexLuminance(palette.waterSurface) < 0.55
                ? 'rgba(250, 246, 238, 0.94)'
                : palette.hudInk,
            textShadow:
              getHexLuminance(palette.waterSurface) < 0.55
                ? '0 1px 3px rgba(32, 28, 44, 0.48)'
                : 'none',
          }}
        >
          {hud.mode === 'battle_2p'
            ? 'P1: A D Move · W/Q Rotate · L-Shift Slam   ·   P2: Arrows Move · Up Rotate · R-Shift Slam   ·   Esc Pause'
            : 'Arrows / A D Move · Up / W / Space Rotate · Z CCW · C / Shift Slam · Esc Pause'}
        </div>
      </div>
    </div>
  );
};
