import React from 'react';
import { getHexLuminance } from '../game/skins';
import { HudSnapshot, SkinConfig } from '../game/types';
import { PiecePreview } from './PiecePreview';

interface GameHudProps {
  hud: HudSnapshot;
  skin: SkinConfig;
  isCompactLandscape: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onTouchAction: (action: 'left' | 'right' | 'rotate' | 'hard_drop' | 'hold') => void;
}

function getPolarityColors(
  polarity: HudSnapshot['upcomingShiftPolarity'],
  fallbackAccent: string
): { fg: string; bg: string; border: string } {
  if (polarity === 'boon') {
    return {
      fg: '#1b6e44',
      bg: 'rgba(31, 122, 76, 0.14)',
      border: 'rgba(31, 122, 76, 0.34)',
    };
  }
  if (polarity === 'bane') {
    return {
      fg: '#a63343',
      bg: 'rgba(184, 58, 75, 0.14)',
      border: 'rgba(184, 58, 75, 0.34)',
    };
  }
  return {
    fg: fallbackAccent,
    bg: 'rgba(32, 28, 44, 0.07)',
    border: 'rgba(32, 28, 44, 0.16)',
  };
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

  const cardStyle = React.useMemo<React.CSSProperties>(
    () => ({
      backgroundColor: palette.hudCardBg,
      color: palette.hudInk,
      border: '1px solid rgba(32, 28, 44, 0.08)',
      boxShadow: '0 8px 24px rgba(34, 24, 42, 0.08)',
    }),
    [palette.hudCardBg, palette.hudInk]
  );

  return (
    <div
      className={`fixed inset-0 z-10 pointer-events-none flex flex-col justify-between ${
        isCompactLandscape ? 'p-2 sm:p-2.5' : 'p-3 sm:p-4 lg:p-5'
      }`}
    >
      <div
        className={`flex items-start gap-2 sm:gap-4 ${
          hud.timeRemaining !== null || isDual ? 'justify-between' : 'justify-end'
        }`}
      >
        {(hud.timeRemaining !== null || isDual) && (
          <div className="w-10 sm:w-[136px] shrink-0" aria-hidden="true" />
        )}

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
            {hud.mode === 'time_attack' && hud.timeAttackPaceDelta !== null && (
              <div
                className="font-mono-tabular text-[10px] font-semibold mt-1"
                style={{
                  color:
                    hud.timeAttackPaceDelta >= 0 ? palette.hudAccent : palette.hudMuted,
                }}
              >
                {hud.timeAttackPaceDelta >= 0 ? '+' : ''}
                {hud.timeAttackPaceDelta.toLocaleString()} vs PB
              </div>
            )}
          </div>
        ) : isDual ? (
          <div
            className="px-4 sm:px-5 py-2 rounded-xl flex items-center gap-4 sm:gap-6"
            style={cardStyle}
          >
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5" style={{ color: palette.hudMuted }}>
                <span>Player 1</span>
                {hud.pendingGarbage > 0 && (
                  <span
                    className="font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded text-[#faf6ee]"
                    style={{ backgroundColor: palette.hudAccent }}
                    title={`Incoming ${hud.pendingGarbage} garbage blocks on next sweep`}
                    data-testid="p1-incoming-garbage"
                  >
                    +{hud.pendingGarbage}
                  </span>
                )}
              </div>
              <div className="font-mono-tabular text-xl font-semibold">
                {Math.round(hud.score).toLocaleString()}
              </div>
            </div>
            <div className="h-6 w-px bg-[#201c2c]/10" aria-hidden="true" />
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5" style={{ color: palette.hudMuted }}>
                <span>{hud.mode === 'vs_cpu' ? 'CPU' : 'Player 2'}</span>
                {hud.p2PendingGarbage > 0 && (
                  <span
                    className="font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded text-[#faf6ee]"
                    style={{ backgroundColor: palette.hudInk }}
                    title={`Incoming ${hud.p2PendingGarbage} garbage blocks on next sweep`}
                    data-testid="p2-incoming-garbage"
                  >
                    +{hud.p2PendingGarbage}
                  </span>
                )}
              </div>
              <div className="font-mono-tabular text-xl font-semibold">
                {Math.round(hud.p2Score ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        ) : null}

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

      {showSideTouchWings && (
        <div className="touch-landscape-wings items-center justify-between flex-1 gap-2 py-1 min-h-0">
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

          <div className="w-[118px] flex flex-col gap-1.5 pointer-events-auto">
            {hud.nextPieces[0] && (
              <div className="px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2" style={cardStyle}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                  Next
                </span>
                <PiecePreview piece={hud.nextPieces[0]} skin={skin} cellSize={18} patternMode={hud.patternMode} />
              </div>
            )}
            {hud.activeShift === 'stash_hold' && (
              <button
                type="button"
                tabIndex={-1}
                data-testid="hold-piece-button-compact"
                disabled={hud.stashUsedThisTurn}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchAction('hold');
                }}
                className="px-2.5 py-1 rounded-xl flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-55"
                style={cardStyle}
                aria-label="Hold Piece"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                  Hold
                </span>
                {hud.heldPiece ? (
                  <PiecePreview piece={hud.heldPiece} skin={skin} cellSize={12} patternMode={hud.patternMode} />
                ) : (
                  <span className="text-[9px] font-mono-tabular" style={{ color: palette.hudMuted }}>
                    Empty
                  </span>
                )}
              </button>
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

      {!isDual && !isCompactLandscape && (
        <div className="hidden lg:flex items-center justify-start flex-1 pointer-events-none">
          <div className="w-[126px] flex flex-col gap-2.5 items-stretch">
            <div
              className="px-3 py-2.5 rounded-xl transition-transform duration-150"
              style={{
                ...cardStyle,
                border:
                  hud.comboMultiplier >= 4
                    ? `1.5px solid ${palette.hudAccent}`
                    : cardStyle.border,
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                Score
              </div>
              <div
                className="font-mono-tabular text-xl font-semibold leading-tight mt-0.5"
                data-testid="hud-score"
              >
                {Math.round(hud.score).toLocaleString()}
              </div>
              <div className="text-[10px] font-medium mt-0.5" style={{ color: palette.hudMuted }}>
                Best {Math.round(hud.highScore).toLocaleString()}
              </div>

              {hud.mode === 'time_attack' &&
                hud.timeAttackPaceDelta !== null &&
                hud.timeAttackPbFraction !== null &&
                hud.timeAttackCurrentFraction !== null && (
                  <div className="mt-2 pt-2 border-t border-[#201c2c]/10">
                    <div className="flex items-center justify-between text-[10px] font-mono-tabular font-semibold mb-1">
                      <span style={{ color: palette.hudMuted }}>PB Pace</span>
                      <span
                        data-testid="time-attack-pace-delta"
                        style={{
                          color:
                            hud.timeAttackPaceDelta >= 0
                              ? palette.hudAccent
                              : palette.hudMuted,
                        }}
                      >
                        {hud.timeAttackPaceDelta >= 0 ? '+' : ''}
                        {hud.timeAttackPaceDelta.toLocaleString()}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full rounded-full bg-[#201c2c]/10 overflow-visible">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, Math.round(hud.timeAttackCurrentFraction * 100))}%`,
                          backgroundColor: palette.hudAccent,
                        }}
                      />
                      <span
                        className="absolute top-[-3px] w-[2px] h-3 rounded-full"
                        style={{
                          left: `calc(${Math.min(100, Math.round(hud.timeAttackPbFraction * 100))}% - 1px)`,
                          backgroundColor: palette.hudInk,
                        }}
                        title="Personal Best pace marker"
                      />
                    </div>
                  </div>
                )}

              <div className="border-t border-[#201c2c]/10 my-2 pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                    Level
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold">
                    {hud.level}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden bg-[#201c2c]/10">
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${Math.min(100, Math.round((hud.stageSquares / Math.max(1, hud.stageGoal)) * 100))}%`,
                      backgroundColor: palette.hudAccent,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] mt-1 font-mono-tabular" style={{ color: palette.hudMuted }}>
                  <span>Cleared</span>
                  <span>{hud.squaresTotal}</span>
                </div>
              </div>

              <div className="border-t border-[#201c2c]/10 pt-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                    Combo
                  </span>
                  <span
                    className="font-mono-tabular text-base font-semibold"
                    style={{
                      color: hud.comboMultiplier >= 4 ? palette.hudAccent : palette.hudInk,
                    }}
                  >
                    {hud.comboMultiplier}×
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] mt-0.5 font-mono-tabular" style={{ color: palette.hudMuted }}>
                  <span>Sweep</span>
                  <span>{hud.squaresThisSweep} sq</span>
                </div>
              </div>

              {hud.activeShiftLabel && (
                <div
                  className="border-t border-[#201c2c]/10 mt-2 pt-1.5 text-[10px] font-mono-tabular font-semibold truncate"
                  style={{ color: palette.hudAccent }}
                  title={hud.activeShiftLabel}
                >
                  {hud.activeShiftLabel}
                </div>
              )}

              {hud.upcomingShiftLabel && (() => {
                const pol = getPolarityColors(hud.upcomingShiftPolarity, palette.hudAccent);
                return (
                  <div
                    data-testid="next-shift-chip"
                    className="mt-1.5 px-2 py-1 rounded-lg text-[10px] font-mono-tabular font-bold leading-tight"
                    style={{
                      color: pol.fg,
                      backgroundColor: pol.bg,
                      border: `1px solid ${pol.border}`,
                    }}
                    title={`Next Shift: ${hud.upcomingShiftLabel}`}
                  >
                    <div className="text-[8px] uppercase tracking-wider opacity-80">Next Shift</div>
                    <div className="truncate">{hud.upcomingShiftLabel}</div>
                  </div>
                );
              })()}
            </div>

            {hud.activeShift === 'stash_hold' && (
              <button
                type="button"
                tabIndex={-1}
                data-testid="hold-piece-button"
                disabled={hud.stashUsedThisTurn}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onTouchAction('hold');
                }}
                className="px-3 py-2 rounded-xl flex items-center justify-between gap-2 pointer-events-auto cursor-pointer disabled:opacity-55 disabled:cursor-default transition-transform active:scale-95"
                style={cardStyle}
                title="Stash / Hold Piece (C or Shift)"
              >
                <div className="text-left">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: palette.hudMuted }}>
                    Hold
                  </div>
                  <div className="text-[9px] font-mono-tabular" style={{ color: palette.hudMuted }}>
                    C / Shift
                  </div>
                </div>
                {hud.heldPiece ? (
                  <PiecePreview piece={hud.heldPiece} skin={skin} cellSize={16} patternMode={hud.patternMode} />
                ) : (
                  <span className="text-[10px] font-mono-tabular px-1.5 py-1 rounded border border-dashed border-[#201c2c]/25" style={{ color: palette.hudMuted }}>
                    Empty
                  </span>
                )}
              </button>
            )}

            <div className="px-3 py-2.5 rounded-xl flex flex-col items-center" style={cardStyle}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2 self-start"
                style={{ color: palette.hudMuted }}
              >
                Next
              </div>
              <div className="flex flex-col gap-2 items-center">
                {hud.nextPieces.slice(0, 3).map((piece, idx) => (
                  <div
                    key={idx}
                    className={idx === 2 ? 'p-1 rounded-lg' : undefined}
                    style={{
                      opacity: idx === 0 ? 1 : idx === 1 ? 0.86 : 0.78,
                      border: idx === 2 ? `1px solid ${palette.boardFrame}38` : undefined,
                      backgroundColor: idx === 2 ? 'rgba(32, 28, 44, 0.045)' : undefined,
                    }}
                  >
                    <PiecePreview
                      piece={piece}
                      skin={skin}
                      cellSize={idx === 0 ? 20 : 16}
                      patternMode={hud.patternMode}
                    />
                  </div>
                ))}
              </div>
            </div>

            {hud.activePuzzle && (
              <div className="px-3 py-2.5 rounded-xl" style={cardStyle}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: palette.hudMuted }}>
                  Target
                </div>
                <div className="text-[11px] font-semibold mb-1.5 leading-tight">
                  {hud.activePuzzle.title}
                </div>
                <div className="flex flex-col gap-0.5 items-center py-0.5">
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
                            className="w-3 h-3 rounded-[2px] block"
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
              <div className="px-3 py-2.5 rounded-xl" style={cardStyle}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: palette.hudMuted }}>
                  {hud.mode === 'daily' ? `Daily ${hud.activeDailyDateKey ?? ''}` : 'Mission'}
                </div>
                <div className="text-[11px] font-semibold leading-snug">
                  {hud.activeMission.title}
                </div>
                <div className="text-[10px] mt-1 leading-snug" style={{ color: palette.hudMuted }}>
                  {hud.activeMission.description}
                </div>
                <div className="font-mono-tabular text-xs font-semibold mt-1.5" style={{ color: palette.hudAccent }}>
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
            {hud.upcomingShiftLabel && (() => {
              const pol = getPolarityColors(hud.upcomingShiftPolarity, palette.hudAccent);
              return (
                <div
                  className="px-2 py-0.5 rounded-md text-[10px] font-mono-tabular font-bold truncate max-w-[112px]"
                  style={{
                    color: pol.fg,
                    backgroundColor: pol.bg,
                    border: `1px solid ${pol.border}`,
                  }}
                >
                  Next: {hud.upcomingShiftLabel}
                </div>
              );
            })()}
            {hud.activeShift === 'stash_hold' && (
              <button
                type="button"
                tabIndex={-1}
                data-testid="hold-piece-button-mobile"
                disabled={hud.stashUsedThisTurn}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchAction('hold');
                }}
                className="pointer-events-auto flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#201c2c]/15 cursor-pointer disabled:opacity-55"
                aria-label="Hold Piece"
              >
                <span className="text-[10px] font-semibold uppercase" style={{ color: palette.hudMuted }}>
                  Hold
                </span>
                {hud.heldPiece ? (
                  <PiecePreview piece={hud.heldPiece} skin={skin} cellSize={12} patternMode={hud.patternMode} />
                ) : (
                  <span className="text-[9px] font-mono-tabular" style={{ color: palette.hudMuted }}>
                    Empty
                  </span>
                )}
              </button>
            )}
            {hud.nextPieces[0] && (
              <div className="flex items-center gap-1.5">
                <span style={{ color: palette.hudMuted }}>Next</span>
                <PiecePreview piece={hud.nextPieces[0]} skin={skin} cellSize={18} patternMode={hud.patternMode} />
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
            ? 'P1: A D Move · W Rotate · S Slam   ·   P2: ← → Move · ↑ Rotate · ↓ Slam   ·   Esc Pause'
            : hud.activeShift === 'stash_hold'
            ? '← → Move · ↑ Rotate · ↓ Slam · C Hold · Z CCW · Esc Pause'
            : '← → Move · ↑ Rotate · ↓ Slam · Z CCW · Esc Pause'}
        </div>
      </div>
    </div>
  );
};
