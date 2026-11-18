import React, { useEffect, useState } from 'react';
import {
  formatCountdownHMS,
  getMsUntilNextDaily,
} from '../game/daily';
import { MISSION_LEVELS, PUZZLE_LEVELS } from '../game/modes';
import { getHexLuminance, isHexColorDark, SKINS } from '../game/skins';
import {
  getEffectiveDailyStreak,
  isDailyCompletedForDate,
} from '../game/storage';
import {
  BoardOrientation,
  ChallengeVariant,
  DailyChallengeSpec,
  GameMode,
  SavedProgress,
  SkinConfig,
} from '../game/types';

interface TitleScreenProps {
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
  orientation: BoardOrientation;
  isCompactLandscape: boolean;
  challengeVariant: ChallengeVariant;
  onSelectChallengeVariant: (v: ChallengeVariant) => void;
  timeAttackDuration: 60 | 180 | 300;
  onSelectTimeAttackDuration: (d: 60 | 180 | 300) => void;
  selectedPuzzleIdx: number;
  onSelectPuzzleIdx: (idx: number) => void;
  selectedMissionIdx: number;
  onSelectMissionIdx: (idx: number) => void;
  progress: SavedProgress;
  muted: boolean;
  onToggleMute: () => void;
  previewSkin: SkinConfig;
  getSpectrumSnapshot?: () => { bands: number[]; hasLiveAudio: boolean };
  dailySpec: DailyChallengeSpec;
  onStart: () => void;
}

const MODE_LIST: Array<{ id: GameMode; label: string; summary: string }> = [
  {
    id: 'challenge',
    label: 'Challenge',
    summary:
      'Clear squares smoothly as atmosphere, tempo, and soundtrack gently evolve.',
  },
  {
    id: 'daily',
    label: 'Daily Challenge',
    summary:
      'A fresh deterministic courtyard and mission objective generated once every 24 hours.',
  },
  {
    id: 'time_attack',
    label: 'Time Attack',
    summary:
      'Clear as many monochromatic squares as possible before the clock runs out.',
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    summary: 'Sculpt a target silhouette framed in contrasting tiles.',
  },
  {
    id: 'mission',
    label: 'Mission',
    summary: 'Complete tactical clearing trials under strict time limits.',
  },
  {
    id: 'vs_cpu',
    label: 'VS CPU',
    summary: 'Duel an adaptive strategist on twin playfields.',
  },
  {
    id: 'battle_2p',
    label: '2P Battle',
    summary:
      'Shared-screen two-player contest: big sweeps send pressure to your rival.',
  },
];

const EQ_HEIGHTS = [35, 58, 42, 82, 64, 95, 52, 74, 46, 62];

const ModeArtworkSvg: React.FC<{
  mode: GameMode;
  skin: SkinConfig;
}> = ({ mode, skin }) => {
  const { palette } = skin;
  const aFill = palette.blockA.fill;
  const aHi = palette.blockA.highlight;
  const bFill = palette.blockB.fill;
  const bBorder = palette.blockB.border;
  const frame = palette.boardFrame;

  return (
    <svg
      viewBox="0 0 180 180"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Soft radial zen rays */}
      <g opacity="0.22">
        {Array.from({ length: 12 }, (_, idx) => {
          const ang = (idx / 12) * Math.PI * 2;
          const x2 = 90 + Math.cos(ang) * 130;
          const y2 = 90 + Math.sin(ang) * 130;
          const x3 = 90 + Math.cos(ang + 0.14) * 130;
          const y3 = 90 + Math.sin(ang + 0.14) * 130;
          return (
            <polygon
              key={idx}
              points={`90,90 ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}`}
              fill={idx % 2 === 0 ? aHi : '#faf6ee'}
            />
          );
        })}
      </g>

      {/* Mode-specific crisp isometric / architectural emblem */}
      {mode === 'challenge' && (
        <g transform="translate(90, 90)">
          {/* Shadow extrusion */}
          <polygon
            points="-44,16 -8,42 46,16 46,32 -8,58 -44,32"
            fill={frame}
            opacity="0.35"
          />
          {/* Isometric 2x2 cube top & front faces */}
          <polygon
            points="0,-50 48,-24 0,2 -48,-24"
            fill={aFill}
            stroke={frame}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon
            points="-48,-24 0,2 0,48 -48,22"
            fill={bFill}
            stroke={frame}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon
            points="0,2 48,-24 48,22 0,48"
            fill={palette.hudInk}
            stroke={frame}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* 4 isometric tiles on right face */}
          <rect
            x="9"
            y="-4"
            width="13"
            height="13"
            rx="2"
            transform="skewY(-26)"
            fill="#faf6ee"
          />
          <rect
            x="27"
            y="-4"
            width="13"
            height="13"
            rx="2"
            transform="skewY(-26)"
            fill={aHi}
          />
          <rect
            x="9"
            y="14"
            width="13"
            height="13"
            rx="2"
            transform="skewY(-26)"
            fill={aHi}
          />
          <rect
            x="27"
            y="14"
            width="13"
            height="13"
            rx="2"
            transform="skewY(-26)"
            fill="#faf6ee"
          />
          {/* Faceted zen prism seal on left face */}
          <polygon
            points="-24,-4 -12,12 -24,28 -36,12"
            fill="none"
            stroke="#faf6ee"
            strokeOpacity="0.88"
            strokeWidth="2"
          />
        </g>
      )}

      {mode === 'time_attack' && (
        <g transform="translate(90, 90)">
          <circle
            cx="0"
            cy="2"
            r="46"
            fill="#faf6ee"
            fillOpacity="0.92"
            stroke={frame}
            strokeWidth="3"
          />
          <circle
            cx="0"
            cy="2"
            r="35"
            fill="none"
            stroke={aFill}
            strokeWidth="4"
            strokeDasharray="165 60"
            strokeLinecap="round"
          />
          <rect x="-12" y="-54" width="24" height="8" rx="3" fill={palette.hudInk} />
          <line x1="0" y1="2" x2="0" y2="-20" stroke={palette.hudInk} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="0" y1="2" x2="18" y2="12" stroke={palette.hudAccent} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="0" cy="2" r="4" fill={palette.hudInk} />
        </g>
      )}

      {mode === 'puzzle' && (
        <g transform="translate(90, 90)">
          <rect x="-46" y="-42" width="92" height="84" rx="8" fill={bFill} stroke={frame} strokeWidth="2.5" />
          {/* Archway silhouette */}
          <path
            d="M-24,42 L-24,-4 A24,24 0 0,1 24,-4 L24,42 Z"
            fill={aFill}
            stroke="#faf6ee"
            strokeWidth="2.5"
          />
          <rect x="-8" y="8" width="16" height="34" fill="#faf6ee" fillOpacity="0.9" />
        </g>
      )}

      {mode === 'mission' && (
        <g transform="translate(90, 90)">
          <polygon
            points="0,-52 52,0 0,52 -52,0"
            fill={palette.hudInk}
            stroke="#faf6ee"
            strokeWidth="2.5"
          />
          <polygon
            points="0,-32 32,0 0,32 -32,0"
            fill={aFill}
          />
          <polygon
            points="0,-14 14,0 0,14 -14,0"
            fill="#faf6ee"
          />
        </g>
      )}

      {mode === 'daily' && (
        <g transform="translate(90, 90)">
          <rect
            x="-46"
            y="-40"
            width="92"
            height="84"
            rx="10"
            fill="#faf6ee"
            fillOpacity="0.94"
            stroke={frame}
            strokeWidth="2.8"
          />
          <rect x="-46" y="-40" width="92" height="22" rx="8" fill={palette.hudInk} />
          <rect x="-26" y="-48" width="8" height="14" rx="3" fill={palette.hudAccent} />
          <rect x="18" y="-48" width="8" height="14" rx="3" fill={palette.hudAccent} />
          {/* Sanctuary 2x2 tile icon inside calendar frame */}
          <rect x="-18" y="-6" width="16" height="16" rx="3" fill={aFill} stroke={frame} strokeWidth="1.5" />
          <rect x="2" y="-6" width="16" height="16" rx="1.5" fill={bFill} stroke={frame} strokeWidth="1.5" />
          <rect x="-18" y="14" width="16" height="16" rx="1.5" fill={bFill} stroke={frame} strokeWidth="1.5" />
          <rect x="2" y="14" width="16" height="16" rx="3" fill={aFill} stroke={frame} strokeWidth="1.5" />
        </g>
      )}

      {(mode === 'vs_cpu' || mode === 'battle_2p') && (
        <g transform="translate(90, 90)">
          <rect x="-48" y="-34" width="38" height="68" rx="6" fill={aFill} stroke={frame} strokeWidth="2.5" />
          <rect x="10" y="-34" width="38" height="68" rx="6" fill={bFill} stroke={bBorder} strokeWidth="2.5" />
          <line x1="0" y1="-48" x2="0" y2="48" stroke="#faf6ee" strokeWidth="2.5" strokeDasharray="5 5" />
          <circle cx="-29" cy="-8" r="8" fill="#faf6ee" />
          <circle cx="29" cy="-8" r="8" fill="#faf6ee" />
          <rect x="-39" y="10" width="20" height="10" rx="2" fill="#faf6ee" opacity="0.7" />
          <rect x="19" y="10" width="20" height="10" rx="2" fill="#faf6ee" opacity="0.7" />
        </g>
      )}
    </svg>
  );
};

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedMode,
  onSelectMode,
  orientation,
  isCompactLandscape,
  challengeVariant,
  onSelectChallengeVariant,
  timeAttackDuration,
  onSelectTimeAttackDuration,
  selectedPuzzleIdx,
  onSelectPuzzleIdx,
  selectedMissionIdx,
  onSelectMissionIdx,
  progress,
  muted,
  onToggleMute,
  previewSkin,
  getSpectrumSnapshot,
  dailySpec,
  onStart,
}) => {
  const [countdownText, setCountdownText] = useState(() =>
    formatCountdownHMS(getMsUntilNextDaily())
  );
  const eqBarRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const smoothedBarsRef = React.useRef<number[]>(EQ_HEIGHTS.map((h) => h / 100));

  useEffect(() => {
    if (selectedMode !== 'daily') return;
    setCountdownText(formatCountdownHMS(getMsUntilNextDaily()));
    const id = window.setInterval(() => {
      setCountdownText(formatCountdownHMS(getMsUntilNextDaily()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [selectedMode, dailySpec.dateKey]);

  useEffect(() => {
    let rafId = 0;
    const beatHz = Math.max(40, previewSkin.bpm) / 60;
    const updateBars = (nowMs: number) => {
      const t = nowMs / 1000;
      const spec = getSpectrumSnapshot?.();
      const useLive = Boolean(spec?.hasLiveAudio && !muted);
      const bars = smoothedBarsRef.current;

      for (let i = 0; i < EQ_HEIGHTS.length; i++) {
        const el = eqBarRefs.current[i];
        if (!el) continue;
        const target = useLive
          ? Math.max(0.16, Math.min(1, spec!.bands[i] * 1.45))
          : 0.24 +
            0.56 *
              Math.pow(
                0.5 + 0.5 * Math.sin(t * beatHz * Math.PI * 1.5 - i * 0.55),
                1.6
              );
        bars[i] += (target - bars[i]) * (useLive ? 0.34 : 0.16);
        el.style.transform = `scaleY(${bars[i].toFixed(3)})`;
      }
      rafId = window.requestAnimationFrame(updateBars);
    };
    rafId = window.requestAnimationFrame(updateBars);
    return () => window.cancelAnimationFrame(rafId);
  }, [getSpectrumSnapshot, muted, previewSkin.bpm]);

  const { palette } = previewSkin;
  const activeModeObj =
    MODE_LIST.find((m) => m.id === selectedMode) ?? MODE_LIST[0];

  const modeBest =
    progress.highScores[
      selectedMode === 'time_attack'
        ? `time_attack_${timeAttackDuration}`
        : selectedMode
    ] ?? 0;

  const darkWater = getHexLuminance(palette.waterSurface) < 0.55;
  const darkSky = isHexColorDark(palette.skyMid);

  const dailyRecord = progress.dailyHistory[dailySpec.dateKey];
  const dailyCompletedToday = isDailyCompletedForDate(progress, dailySpec.dateKey);
  const dailyStreak = getEffectiveDailyStreak(progress, dailySpec.dateKey);
  const dailySkin = SKINS[dailySpec.skinIndex] ?? previewSkin;
  const startBlocked = selectedMode === 'daily' && dailyCompletedToday;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none overflow-y-auto lg:overflow-hidden">
      {/* Main Split Architectural Layout */}
      <div
        className={`flex-1 flex ${
          isCompactLandscape ? 'flex-row' : 'flex-col lg:flex-row'
        } items-stretch w-full min-h-0`}
      >
        {/* Left Diagonal Blueprint Wing */}
        <aside
          className={`${
            isCompactLandscape
              ? 'w-[205px] shrink-0 px-3 py-3 gap-3'
              : 'lg:w-[25%] lg:min-w-[248px] lg:max-w-[320px] shrink-0 px-4 py-2.5 sm:px-5 sm:py-3.5 lg:py-8 lg:pl-8 lg:pr-14 gap-2 sm:gap-4 lg:gap-6'
          } flex flex-col justify-between pointer-events-auto title-diagonal-wing transition-colors duration-700`}
          style={{
            backgroundColor: darkSky
              ? 'rgba(18, 24, 38, 0.84)'
              : 'rgba(40, 36, 56, 0.82)',
            backgroundImage:
              'radial-gradient(rgba(250, 246, 238, 0.14) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            color: '#faf6ee',
          }}
        >
          {/* Brand Crest Lockup */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <svg
                width="40"
                height="40"
                viewBox="0 0 48 48"
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-300 hover:rotate-90 ${
                  isCompactLandscape ? 'w-8 h-8' : 'sm:w-11 sm:h-11'
                }`}
              >
                <rect
                  x="4"
                  y="4"
                  width="19"
                  height="19"
                  rx="6"
                  fill={palette.blockA.fill}
                  stroke="#faf6ee"
                  strokeOpacity="0.65"
                  strokeWidth="1.2"
                />
                <rect
                  x="25"
                  y="4"
                  width="19"
                  height="19"
                  rx="2"
                  fill={palette.blockB.fill}
                  stroke="#faf6ee"
                  strokeOpacity="0.65"
                  strokeWidth="1.2"
                />
                <rect
                  x="4"
                  y="25"
                  width="19"
                  height="19"
                  rx="2"
                  fill={palette.blockB.fill}
                  stroke="#faf6ee"
                  strokeOpacity="0.65"
                  strokeWidth="1.2"
                />
                <rect
                  x="25"
                  y="25"
                  width="19"
                  height="19"
                  rx="6"
                  fill={palette.blockA.fill}
                  stroke="#faf6ee"
                  strokeOpacity="0.65"
                  strokeWidth="1.2"
                />
              </svg>
              <div>
                <h1
                  className={`font-display ${
                    isCompactLandscape ? 'text-lg' : 'text-xl sm:text-2xl lg:text-3xl'
                  } font-semibold tracking-tight leading-none text-[#faf6ee]`}
                >
                  Iluminado
                </h1>
                <p className="text-[11px] text-[#faf6ee]/75 mt-0.5 sm:mt-1 font-mono-tabular">
                  {orientation === 'portrait' ? '10×14' : '16×10'} · Zen Puzzle
                </p>
              </div>
            </div>

            {!isCompactLandscape && (
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
                className="lg:hidden px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#faf6ee]/14 hover:bg-[#faf6ee]/24 text-[#faf6ee] transition-colors cursor-pointer whitespace-nowrap min-h-[34px]"
              >
                {muted ? 'Muted' : 'Sound On'}
              </button>
            )}
          </div>

          {/* Quiet Architectural Pond Study (pure ambient artwork, no world chrome) */}
          <div className="hidden lg:flex flex-col gap-3 lg:pr-6 my-auto">
            <div className="w-full max-w-[190px] rounded-xl p-4 border border-[#faf6ee]/15 bg-[#faf6ee]/6">
              <svg viewBox="0 0 120 76" className="w-full h-auto" aria-hidden="true">
                <line x1="8" y1="54" x2="112" y2="54" stroke="#faf6ee" strokeOpacity="0.28" strokeWidth="1" />
                <ellipse cx="60" cy="54" rx="44" ry="8" fill="none" stroke="#faf6ee" strokeOpacity="0.22" strokeWidth="1" />
                <rect x="26" y="18" width="22" height="22" rx="7" fill={palette.blockA.fill} stroke="#faf6ee" strokeOpacity="0.6" strokeWidth="1.4" />
                <polygon points="78,16 96,29 78,42 60,29" fill={palette.blockB.fill} stroke="#faf6ee" strokeOpacity="0.6" strokeWidth="1.4" />
              </svg>
              <p className="text-[11px] leading-relaxed text-[#faf6ee]/75 mt-2">
                Place falling blocks to shape monochromatic 2×2 squares before each sweep dissolves them into still water.
              </p>
            </div>
          </div>

          {/* Left Footer Actions */}
          <div className={`${isCompactLandscape ? 'flex' : 'hidden lg:flex'} items-center justify-between gap-2 pt-0.5 lg:pr-6`}>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#faf6ee]/12 hover:bg-[#faf6ee]/22 text-[#faf6ee] transition-colors cursor-pointer whitespace-nowrap min-h-[34px]"
            >
              {muted ? 'Audio Muted' : 'Sound Active'}
            </button>
            {modeBest > 0 && (
              <div className="text-right font-mono-tabular text-[11px] text-[#faf6ee]/80 whitespace-nowrap">
                Best {modeBest.toLocaleString()}
              </div>
            )}
          </div>
        </aside>

        {/* Center-Right Scenic Stage: Diagonal Mode Rail + Tilted Hero Emblem + Mode Details */}
        <div
          className={`flex-1 flex flex-col justify-start ${
            isCompactLandscape
              ? 'justify-center px-3 py-2 overflow-y-auto'
              : 'sm:justify-center px-4 py-2.5 sm:px-5 sm:py-4 lg:px-8 lg:py-6'
          } min-w-0`}
        >
          <div
            className={`max-w-5xl w-full mx-auto grid ${
              isCompactLandscape
                ? 'grid-cols-12 gap-2.5 items-stretch'
                : 'grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 lg:gap-8 items-center'
            }`}
          >
            {/* Column 1: Diagonal Active Header + Equalizer + Mode Stack */}
            <div
              className={`${
                isCompactLandscape ? 'col-span-5' : 'lg:col-span-4'
              } flex flex-col pointer-events-auto`}
            >
              {/* Slanted Active Mode Bar with Equalizer */}
              <div className="mb-1.5 sm:mb-3 lg:-rotate-3 origin-left">
                <div className="flex items-end justify-between gap-2 pb-1 sm:pb-1.5 border-b-2" style={{
                  borderColor: darkSky ? 'rgba(250, 247, 242, 0.85)' : palette.hudInk,
                }}>
                  <span
                    className={`font-display ${
                      isCompactLandscape ? 'text-lg' : 'text-xl sm:text-2xl lg:text-3xl'
                    } font-semibold tracking-tight leading-none`}
                    style={{
                      color: darkSky ? '#faf6ee' : palette.hudInk,
                      textShadow: darkSky ? '0 1px 4px rgba(32, 28, 44, 0.35)' : 'none',
                    }}
                  >
                    {activeModeObj.label}
                  </span>
                  <div
                    className="flex items-end gap-[3px] h-5 sm:h-7 shrink-0 pb-0.5"
                    aria-hidden="true"
                  >
                    {EQ_HEIGHTS.map((h, i) => (
                      <span
                        key={i}
                        ref={(el) => {
                          eqBarRefs.current[i] = el;
                        }}
                        className="w-1 h-4 sm:h-6 rounded-t-xs origin-bottom transition-colors duration-200"
                        style={{
                          transform: `scaleY(${(h / 100).toFixed(2)})`,
                          backgroundColor: darkSky
                            ? '#faf7f2'
                            : palette.hudAccent,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Mode Selector Stack */}
              <div
                className={`grid ${
                  isCompactLandscape ? 'grid-cols-2 gap-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1 lg:pl-2'
                }`}
                role="tablist"
                aria-label="Game Modes"
              >
                {MODE_LIST.map((m) => {
                  const active = m.id === selectedMode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onSelectMode(m.id)}
                      className={`text-left ${
                        isCompactLandscape ? 'px-2.5 py-1 text-[11px] min-h-[30px]' : 'px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm min-h-[34px] sm:min-h-[40px]'
                      } rounded-lg font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap truncate flex items-center justify-between`}
                      style={{
                        backgroundColor: active
                          ? palette.hudCardBg
                          : darkSky
                          ? 'rgba(28, 30, 48, 0.44)'
                          : 'rgba(250, 246, 238, 0.56)',
                        color: active
                          ? palette.hudAccent
                          : darkSky
                          ? '#faf6ee'
                          : palette.hudInk,
                        boxShadow: active
                          ? '0 6px 18px rgba(24, 20, 36, 0.14)'
                          : 'none',
                        transform: active ? 'translateX(4px)' : 'none',
                      }}
                    >
                      <span>{m.label}</span>
                      {active && (
                        <span
                          className="text-xs font-mono-tabular"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Tilted Hero Mode Emblem Tile */}
            <div className={`${isCompactLandscape ? 'hidden' : 'lg:col-span-3 hidden sm:flex'} items-center justify-center pointer-events-auto`}>
              <button
                type="button"
                disabled={startBlocked}
                onClick={onStart}
                aria-label={`Launch ${activeModeObj.label}`}
                className="group relative w-44 h-44 lg:w-52 lg:h-52 rounded-2xl shadow-2xl overflow-hidden -rotate-3 hover:rotate-0 transition-transform duration-300 cursor-pointer disabled:cursor-default disabled:hover:-rotate-3 focus-visible:outline-2 focus-visible:outline-offset-4"
                style={{
                  backgroundColor: palette.boardSurface,
                  border: `3px solid ${
                    darkSky ? 'rgba(250, 246, 238, 0.85)' : palette.hudInk
                  }`,
                }}
              >
                <div className="w-full h-[78%] flex items-center justify-center p-2">
                  <ModeArtworkSvg mode={selectedMode} skin={previewSkin} />
                </div>
                <div
                  className="h-[22%] w-full flex items-center justify-center px-2 text-xs font-bold tracking-wide text-[#faf6ee]"
                  style={{ backgroundColor: palette.hudInk }}
                >
                  {activeModeObj.label}
                </div>
              </button>
            </div>

            {/* Column 3: Mode Details, Options, Best Score & Primary Start CTA */}
            <div
              className={`${
                isCompactLandscape ? 'col-span-7 p-3' : 'lg:col-span-5 p-3.5 sm:p-5 lg:p-6'
              } rounded-2xl shadow-xl pointer-events-auto transition-colors duration-500 animate-modal-in flex flex-col justify-between`}
              style={{
                backgroundColor: palette.hudCardBg,
                color: palette.hudInk,
                border: '1px solid rgba(32, 28, 44, 0.08)',
              }}
            >
              {/* Status Line & Best Score */}
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span
                  className="text-xs font-semibold font-mono-tabular"
                  style={{ color: palette.hudMuted }}
                >
                  {selectedMode === 'daily'
                    ? `Daily ${dailySpec.dateKey} · Streak ${dailyStreak}`
                    : orientation === 'portrait'
                    ? '10×14 Courtyard'
                    : '16×10 Courtyard'}
                </span>
                {modeBest > 0 && (
                  <span
                    className="font-mono-tabular text-xs font-semibold"
                    style={{ color: palette.hudAccent }}
                  >
                    Best {modeBest.toLocaleString()}
                  </span>
                )}
              </div>

              <h2 className="hidden sm:block font-display text-2xl font-semibold tracking-tight pb-2 border-b border-[#201c2c]/10">
                {activeModeObj.label}
              </h2>
              <p
                className="text-xs lg:text-sm leading-relaxed mt-1 sm:mt-2.5 mb-2.5 sm:mb-3.5"
                style={{ color: palette.hudMuted }}
              >
                {activeModeObj.summary}
              </p>

              {/* Mode-Specific Options */}
              {selectedMode === 'daily' && (
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug">
                        {dailySpec.mission.title}
                      </div>
                      <div
                        className="text-xs leading-snug mt-0.5"
                        style={{ color: palette.hudMuted }}
                      >
                        {dailySpec.mission.description}
                      </div>
                    </div>

                    {/* Deterministic Miniature 16x10 Starting Board Preview */}
                    <svg
                      viewBox="0 0 64 40"
                      width="88"
                      height="55"
                      aria-label="Today's generated board layout preview"
                      className="shrink-0 rounded-lg border border-[#201c2c]/12"
                      style={{ backgroundColor: dailySkin.palette.boardSurface }}
                    >
                      {dailySpec.previewRows.map((row, r) =>
                        row.map((cellColor, c) =>
                          cellColor !== null ? (
                            <rect
                              key={`${r}-${c}`}
                              x={c * 4 + 0.35}
                              y={r * 4 + 0.35}
                              width="3.3"
                              height="3.3"
                              rx={cellColor === 0 ? '1.1' : '0.3'}
                              fill={
                                cellColor === 0
                                  ? dailySkin.palette.blockA.fill
                                  : dailySkin.palette.blockB.fill
                              }
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>

                  <div
                    className="text-[11px] font-mono-tabular mb-2 whitespace-nowrap"
                    style={{ color: palette.hudMuted }}
                  >
                    {dailySpec.mission.timeLimit}s limit
                  </div>

                  {dailyCompletedToday ? (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#201c2c]/10 text-xs">
                      <span
                        className="font-semibold whitespace-nowrap"
                        style={{ color: palette.hudAccent }}
                      >
                        Cleared · {(dailyRecord?.bestScore ?? 0).toLocaleString()} pts
                        {dailyRecord?.clearTimeSec
                          ? ` (${dailyRecord.clearTimeSec}s)`
                          : ''}
                      </span>
                      <span
                        className="font-mono-tabular whitespace-nowrap"
                        style={{ color: palette.hudMuted }}
                      >
                        Next {countdownText}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between gap-2 pt-2 border-t border-[#201c2c]/10 text-[11px] font-mono-tabular"
                      style={{ color: palette.hudMuted }}
                    >
                      <span className="whitespace-nowrap">1 win per 24h cycle</span>
                      <span className="whitespace-nowrap">Resets {countdownText}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedMode === 'challenge' && (
                <div className="flex items-center gap-2 mb-3 sm:mb-5">
                  {(['basic', 'endless', 'shuffle'] as ChallengeVariant[]).map(
                    (v) => {
                      const active = challengeVariant === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onSelectChallengeVariant(v)}
                          className="flex-1 py-1.5 sm:py-2 px-3 rounded-lg text-xs font-semibold capitalize cursor-pointer whitespace-nowrap min-h-[36px] sm:min-h-[40px]"
                          style={{
                            backgroundColor: active
                              ? palette.hudInk
                              : 'rgba(32, 28, 44, 0.055)',
                            color: active ? '#faf6ee' : palette.hudInk,
                          }}
                        >
                          {v}
                        </button>
                      );
                    }
                  )}
                </div>
              )}

              {selectedMode === 'time_attack' && (
                <div className="flex items-center gap-2 mb-5">
                  {([60, 180, 300] as const).map((dur) => {
                    const active = timeAttackDuration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => onSelectTimeAttackDuration(dur)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold font-mono-tabular cursor-pointer whitespace-nowrap min-h-[40px]"
                        style={{
                          backgroundColor: active
                            ? palette.hudInk
                            : 'rgba(32, 28, 44, 0.055)',
                          color: active ? '#faf6ee' : palette.hudInk,
                        }}
                      >
                        {dur}s
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedMode === 'puzzle' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-5">
                  {PUZZLE_LEVELS.map((p, idx) => {
                    const active = idx === selectedPuzzleIdx;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPuzzleIdx(idx)}
                        className="px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer truncate whitespace-nowrap text-left min-h-[40px]"
                        style={{
                          backgroundColor: active
                            ? palette.hudInk
                            : 'rgba(32, 28, 44, 0.055)',
                          color: active ? '#faf6ee' : palette.hudInk,
                        }}
                      >
                        {idx + 1}. {p.title}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedMode === 'mission' && (
                <div className="grid grid-cols-2 gap-1.5 mb-5">
                  {MISSION_LEVELS.map((m, idx) => {
                    const active = idx === selectedMissionIdx;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onSelectMissionIdx(idx)}
                        className="px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer truncate whitespace-nowrap text-left min-h-[40px]"
                        style={{
                          backgroundColor: active
                            ? palette.hudInk
                            : 'rgba(32, 28, 44, 0.055)',
                          color: active ? '#faf6ee' : palette.hudInk,
                        }}
                      >
                        {idx + 1}. {m.title}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Primary Start CTA */}
              <button
                type="button"
                data-start="true"
                disabled={startBlocked}
                onClick={onStart}
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-sm text-[#faf6ee] transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap shadow-md min-h-[48px]"
                style={{
                  backgroundColor: startBlocked
                    ? palette.hudInk
                    : palette.hudAccent,
                }}
              >
                {startBlocked
                  ? `Completed Today · Next in ${countdownText}`
                  : selectedMode === 'daily'
                  ? 'Start Daily Challenge'
                  : 'Start Game'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Flat Borderless Control Hint (Desktop Keyboard Only) */}
      <div
        className="kbd-hint-bar text-center text-xs font-medium py-2.5 px-4 pointer-events-none transition-colors duration-300 shrink-0"
        style={{
          color: darkWater ? 'rgba(250, 246, 238, 0.92)' : palette.hudInk,
          textShadow: darkWater ? '0 1px 3px rgba(32, 28, 44, 0.45)' : 'none',
        }}
      >
        Arrow Keys / A D Move · Up / W / Space Rotate · Z CCW · C / Shift Slam · Esc Pause · Enter Start
      </div>
    </div>
  );
};
