import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
  ChallengeVariant,
  DailyChallengeSpec,
  GameMode,
  SavedProgress,
  SkinConfig,
} from '../game/types';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
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
  musicVolume: number;
  sfxVolume: number;
  onChangeMusicVolume: (val: number) => void;
  onChangeSfxVolume: (val: number) => void;
  previewSkin: SkinConfig;
  onStepPreviewSkin: (delta: -1 | 1) => void;
  getSpectrumSnapshot?: () => { bands: number[]; hasLiveAudio: boolean };
  dailySpec: DailyChallengeSpec;
  onStart: () => void;
  onOpenShiftSettings: () => void;
  reducedMotion?: boolean;
  patternMode?: boolean;
  onToggleReducedMotion?: () => void;
  onTogglePatternMode?: () => void;
}

const MODE_LIST: Array<{ id: GameMode; label: string; shortLabel: string; summary: string }> = [
  {
    id: 'challenge',
    label: 'Challenge',
    shortLabel: 'Challenge',
    summary: 'Match 2×2 squares to the beat as worlds and music evolve.',
  },
  {
    id: 'daily',
    label: 'Daily Challenge',
    shortLabel: 'Daily',
    summary: 'A fresh courtyard and goal shared every day.',
  },
  {
    id: 'time_attack',
    label: 'Time Attack',
    shortLabel: 'Time Attack',
    summary: 'Score as many clears as you can before time runs out.',
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    shortLabel: 'Puzzle',
    summary: 'Shape each target silhouette with contrasting tiles.',
  },
  {
    id: 'mission',
    label: 'Mission',
    shortLabel: 'Mission',
    summary: 'Take on focused clearing goals against the clock.',
  },
  {
    id: 'vs_cpu',
    label: 'VS CPU',
    shortLabel: 'VS CPU',
    summary: 'Go head-to-head against a clever rival board.',
  },
  {
    id: 'battle_2p',
    label: '2P Battle',
    shortLabel: '2P Battle',
    summary: 'Shared-screen two-player showdown with sweep attacks.',
  },
];

const EQ_HEIGHTS = [35, 58, 42, 82, 64, 95, 52, 74, 46, 62];

const VolumeSlider: React.FC<{
  id: string;
  testId: string;
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (val: number) => void;
  mutedColor: string;
  accentColor: string;
}> = ({ id, testId, label, ariaLabel, value, onChange, mutedColor, accentColor }) => {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold mb-1">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono-tabular text-[11px]" style={{ color: mutedColor }}>
          {pct}%
        </span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={ariaLabel}
        className="w-full h-1.5 rounded-full cursor-pointer"
        style={{ accentColor }}
      />
    </div>
  );
};

const ModeArtworkSvg: React.FC<{
  mode: GameMode;
  skin: SkinConfig;
}> = React.memo(({ mode, skin }) => {
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

      {mode === 'challenge' && (
        <g transform="translate(88, 92)">
          <rect
            x="-2"
            y="-64"
            width="4"
            height="128"
            rx="2"
            fill={palette.timelineBeam}
            fillOpacity="0.45"
          />

          <g fill={frame} fillOpacity="0.22" transform="translate(3, 5)">
            <rect x="-46" y="-46" width="42" height="42" rx="9" />
            <rect x="-46" y="4" width="42" height="42" rx="9" />
            <rect x="4" y="4" width="42" height="42" rx="9" />
          </g>

          <rect
            x="4"
            y="-46"
            width="42"
            height="42"
            rx="8"
            fill={frame}
            fillOpacity="0.08"
            stroke={palette.hudInk}
            strokeOpacity="0.45"
            strokeWidth="2.2"
            strokeDasharray="5 4"
          />

          <rect
            x="-46"
            y="-46"
            width="42"
            height="42"
            rx="9"
            fill={aFill}
            stroke={frame}
            strokeWidth="3"
          />
          <circle cx="-25" cy="-25" r="7" fill={aHi} fillOpacity="0.55" />

          <rect
            x="-46"
            y="4"
            width="42"
            height="42"
            rx="9"
            fill={bFill}
            stroke={frame}
            strokeWidth="3"
          />
          <rect
            x="-35"
            y="15"
            width="20"
            height="20"
            rx="4"
            fill="none"
            stroke="#faf6ee"
            strokeOpacity="0.42"
            strokeWidth="2"
          />

          <rect
            x="4"
            y="4"
            width="42"
            height="42"
            rx="9"
            fill={aFill}
            stroke={frame}
            strokeWidth="3"
          />
          <polygon
            points="25,15 35,25 25,35 15,25"
            fill={aHi}
            fillOpacity="0.6"
          />

          <g transform="translate(11, -11)">
            <rect
              x="6"
              y="-42"
              width="42"
              height="42"
              rx="10"
              fill={frame}
              fillOpacity="0.24"
            />
            <rect
              x="4"
              y="-46"
              width="42"
              height="42"
              rx="10"
              fill={palette.hudAccent}
              stroke={frame}
              strokeWidth="3"
            />
            <polygon
              points="25,-37 37,-25 25,-13 13,-25"
              fill="#faf6ee"
              stroke={frame}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="25" cy="-25" r="3.5" fill={aFill} />
          </g>
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
});

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedMode,
  onSelectMode,
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
  musicVolume,
  sfxVolume,
  onChangeMusicVolume,
  onChangeSfxVolume,
  previewSkin,
  onStepPreviewSkin,
  getSpectrumSnapshot,
  dailySpec,
  onStart,
  onOpenShiftSettings,
  reducedMotion = false,
  patternMode = false,
  onToggleReducedMotion,
  onTogglePatternMode,
}) => {
  const [countdownText, setCountdownText] = useState(() =>
    formatCountdownHMS(getMsUntilNextDaily())
  );
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const audioMenuRef = React.useRef<HTMLDivElement | null>(null);
  const eqBarRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const smoothedBarsRef = React.useRef<number[]>(EQ_HEIGHTS.map((h) => h / 100));

  useEffect(() => {
    if (!audioMenuOpen) return;
    const onDocDown = (e: PointerEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setAudioMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setAudioMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDocDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('pointerdown', onDocDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [audioMenuOpen]);

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

  const heroInk = darkSky ? '#faf6ee' : palette.hudInk;
  const heroMuted = darkSky ? 'rgba(250, 246, 238, 0.8)' : palette.hudMuted;
  const topChipBg = darkSky
    ? 'rgba(22, 24, 40, 0.54)'
    : 'rgba(250, 246, 238, 0.72)';
  const topChipBorder = darkSky
    ? '1px solid rgba(250, 246, 238, 0.16)'
    : '1px solid rgba(32, 28, 44, 0.1)';

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none overflow-y-auto lg:overflow-hidden">
      <header
        className={`w-full flex items-center justify-between gap-3 ${
          isCompactLandscape ? 'px-4 pt-2.5' : 'px-4 sm:px-8 pt-4 sm:pt-6'
        } shrink-0`}
      >
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <svg
            width="38"
            height="38"
            viewBox="0 0 48 48"
            aria-hidden="true"
            className="shrink-0 transition-transform duration-300 hover:rotate-90 drop-shadow-sm"
          >
            <rect
              x="4"
              y="4"
              width="19"
              height="19"
              rx="6"
              fill={palette.blockA.fill}
              stroke="#faf6ee"
              strokeOpacity="0.7"
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
              strokeOpacity="0.7"
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
              strokeOpacity="0.7"
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
              strokeOpacity="0.7"
              strokeWidth="1.2"
            />
          </svg>
          <h1
            className={`font-display ${
              isCompactLandscape ? 'text-xl' : 'text-2xl sm:text-3xl'
            } font-semibold tracking-tight leading-none`}
            style={{
              color: heroInk,
              textShadow: darkSky ? '0 2px 8px rgba(20, 18, 32, 0.4)' : 'none',
            }}
          >
            Iluminado
          </h1>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div
            className="hidden sm:flex items-center gap-1.5 rounded-xl px-2 py-1 transition-colors duration-300"
            style={{
              backgroundColor: topChipBg,
              color: heroInk,
              border: topChipBorder,
            }}
          >
            <button
              type="button"
              onClick={() => onStepPreviewSkin(-1)}
              aria-label="Previous world soundtrack"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#201c2c]/10 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-1">
              <div
                className="flex items-end gap-[2px] h-3.5 shrink-0"
                aria-hidden="true"
              >
                {EQ_HEIGHTS.slice(0, 5).map((h, i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      eqBarRefs.current[i] = el;
                    }}
                    className="w-[2.5px] h-3.5 rounded-t-xs origin-bottom"
                    style={{
                      transform: `scaleY(${(h / 100).toFixed(2)})`,
                      backgroundColor: darkSky ? '#faf6ee' : palette.hudAccent,
                    }}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold whitespace-nowrap">
                {previewSkin.name}
              </span>
              <span
                className="text-[11px] font-mono-tabular whitespace-nowrap hidden md:inline"
                style={{ color: heroMuted }}
              >
                · {previewSkin.music.genreLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onStepPreviewSkin(1)}
              aria-label="Next world soundtrack"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#201c2c]/10 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            data-testid="open-shift-settings-title"
            onClick={onOpenShiftSettings}
            aria-label="Board Shifts"
            className="h-9 px-3 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: topChipBg,
              color: heroInk,
              border: topChipBorder,
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Shifts</span>
          </button>

          <PWAInstallButton
            skin={previewSkin}
            chipBg={topChipBg}
            chipBorder={topChipBorder}
            heroInk={heroInk}
          />

          <div className="relative flex items-center" ref={audioMenuRef}>
            <div
              className="h-9 rounded-xl flex items-center overflow-hidden transition-colors"
              style={{
                backgroundColor: topChipBg,
                color: heroInk,
                border: topChipBorder,
              }}
            >
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
                className="h-9 px-2.5 flex items-center gap-1.5 text-xs font-semibold hover:bg-[#201c2c]/10 transition-colors cursor-pointer whitespace-nowrap"
              >
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
              </button>
              <button
                type="button"
                data-testid="title-volume-toggle"
                onClick={() => setAudioMenuOpen((v) => !v)}
                aria-label="Audio volume settings"
                aria-expanded={audioMenuOpen}
                className="h-9 px-2 border-l border-[#201c2c]/10 flex items-center justify-center hover:bg-[#201c2c]/10 transition-colors cursor-pointer text-[11px] font-mono-tabular"
              >
                ▾
              </button>
            </div>

            {audioMenuOpen && (
              <div
                data-testid="title-volume-popover"
                role="dialog"
                aria-label="Audio Volumes"
                className="absolute right-0 top-11 w-56 rounded-2xl p-4 shadow-xl z-40 space-y-3"
                style={{
                  backgroundColor: palette.hudCardBg,
                  color: palette.hudInk,
                  border: `1.5px solid ${palette.boardFrame}`,
                }}
              >
                <VolumeSlider
                  id="title-music-vol"
                  testId="title-music-volume-slider"
                  label="Music"
                  ariaLabel="Music volume"
                  value={musicVolume}
                  onChange={onChangeMusicVolume}
                  mutedColor={palette.hudMuted}
                  accentColor={palette.hudAccent}
                />
                <VolumeSlider
                  id="title-sfx-vol"
                  testId="title-sfx-volume-slider"
                  label="SFX"
                  ariaLabel="SFX volume"
                  value={sfxVolume}
                  onChange={onChangeSfxVolume}
                  mutedColor={palette.hudMuted}
                  accentColor={palette.hudAccent}
                />
                {(onToggleReducedMotion || onTogglePatternMode) && (
                  <div className="pt-2.5 border-t border-[#201c2c]/10 flex flex-col gap-1.5">
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
            )}
          </div>
        </div>
      </header>

      <main
        className={`flex-1 flex flex-col items-center justify-center ${
          isCompactLandscape ? 'px-4 py-1 gap-2' : 'px-4 sm:px-8 py-4 gap-4 sm:gap-5'
        } min-h-0`}
      >
        <div className="flex flex-col items-center text-center max-w-xl w-full pointer-events-auto">
          <button
            type="button"
            disabled={startBlocked}
            onClick={onStart}
            aria-label={`Launch ${activeModeObj.label}`}
            className={`group relative ${
              isCompactLandscape ? 'w-24 h-24' : 'w-32 h-32 sm:w-40 sm:h-40'
            } rounded-3xl shadow-2xl overflow-hidden -rotate-3 hover:rotate-0 transition-transform duration-300 cursor-pointer disabled:cursor-default disabled:hover:-rotate-3 focus-visible:outline-2 focus-visible:outline-offset-4 mb-3 sm:mb-4`}
            style={{
              backgroundColor: palette.boardSurface,
              border: `3px solid ${
                darkSky ? 'rgba(250, 246, 238, 0.85)' : palette.hudInk
              }`,
            }}
          >
            <div className="w-full h-full flex items-center justify-center p-2.5">
              <ModeArtworkSvg mode={selectedMode} skin={previewSkin} />
            </div>
          </button>

          <h2
            className={`font-display ${
              isCompactLandscape ? 'text-2xl' : 'text-3xl sm:text-4xl'
            } font-semibold tracking-tight leading-none`}
            style={{
              color: heroInk,
              textShadow: darkSky ? '0 2px 10px rgba(20, 18, 32, 0.38)' : 'none',
            }}
          >
            {activeModeObj.label}
          </h2>

          <p
            className={`${
              isCompactLandscape ? 'text-xs mt-1' : 'text-sm sm:text-base mt-2'
            } max-w-md leading-snug`}
            style={{
              color: heroMuted,
              textShadow: darkSky ? '0 1px 4px rgba(20, 18, 32, 0.35)' : 'none',
            }}
          >
            {selectedMode === 'challenge' && challengeVariant === 'zen'
              ? 'Relaxed no-loss flow where overflowing stacks gently clear away.'
              : activeModeObj.summary}
          </p>

          {selectedMode === 'challenge' && (
            <div
              className="flex flex-wrap items-center justify-center gap-1.5 mt-3 sm:mt-4 p-1 rounded-xl"
              style={{ backgroundColor: topChipBg, border: topChipBorder }}
            >
              {(['basic', 'endless', 'shuffle', 'zen'] as ChallengeVariant[]).map((v) => {
                const active = challengeVariant === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onSelectChallengeVariant(v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? palette.hudInk : 'transparent',
                      color: active ? '#faf6ee' : heroInk,
                    }}
                  >
                    {v === 'zen' ? 'Zen Flow' : v}
                  </button>
                );
              })}
            </div>
          )}

          {selectedMode === 'time_attack' && (
            <div
              className="flex items-center justify-center gap-1.5 mt-3 sm:mt-4 p-1 rounded-xl"
              style={{ backgroundColor: topChipBg, border: topChipBorder }}
            >
              {([60, 180, 300] as const).map((dur) => {
                const active = timeAttackDuration === dur;
                return (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => onSelectTimeAttackDuration(dur)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold font-mono-tabular cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? palette.hudInk : 'transparent',
                      color: active ? '#faf6ee' : heroInk,
                    }}
                  >
                    {dur / 60} min
                  </button>
                );
              })}
            </div>
          )}

          {selectedMode === 'puzzle' && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 sm:mt-4 max-w-md">
              {PUZZLE_LEVELS.map((p, idx) => {
                const active = idx === selectedPuzzleIdx;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPuzzleIdx(idx)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? palette.hudInk : topChipBg,
                      color: active ? '#faf6ee' : heroInk,
                      border: active ? '1px solid transparent' : topChipBorder,
                    }}
                  >
                    {idx + 1}. {p.title}
                  </button>
                );
              })}
            </div>
          )}

          {selectedMode === 'mission' && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 sm:mt-4 max-w-md">
              {MISSION_LEVELS.map((m, idx) => {
                const active = idx === selectedMissionIdx;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMissionIdx(idx)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? palette.hudInk : topChipBg,
                      color: active ? '#faf6ee' : heroInk,
                      border: active ? '1px solid transparent' : topChipBorder,
                    }}
                  >
                    {idx + 1}. {m.title}
                  </button>
                );
              })}
            </div>
          )}

          {selectedMode === 'daily' && (
            <div
              className="mt-3 sm:mt-4 px-4 py-3 rounded-2xl flex items-center gap-4 text-left max-w-md w-full"
              style={{
                backgroundColor: palette.hudCardBg,
                color: palette.hudInk,
                border: '1px solid rgba(32, 28, 44, 0.08)',
              }}
            >
              <svg
                viewBox="0 0 64 40"
                width="76"
                height="48"
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
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-snug truncate">
                  {dailySpec.mission.title}
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: palette.hudMuted }}>
                  {dailyCompletedToday
                    ? `Cleared (${(dailyRecord?.bestScore ?? 0).toLocaleString()} pts) · Next in ${countdownText}`
                    : `${dailySpec.mission.description} · Streak ${dailyStreak}`}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-2 mt-4 sm:mt-5">
            <button
              type="button"
              data-start="true"
              disabled={startBlocked}
              onClick={onStart}
              className={`${
                isCompactLandscape ? 'px-8 py-2.5 text-sm' : 'px-10 py-3.5 text-base'
              } rounded-2xl font-semibold text-[#faf6ee] shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 whitespace-nowrap min-h-[48px]`}
              style={{
                backgroundColor: startBlocked ? palette.hudInk : palette.hudAccent,
              }}
            >
              {startBlocked
                ? `Completed · Next in ${countdownText}`
                : selectedMode === 'daily'
                ? 'Play Daily'
                : 'Play'}
            </button>

            {modeBest > 0 && (
              <div
                className="text-xs font-mono-tabular font-semibold"
                style={{
                  color: heroMuted,
                  textShadow: darkSky ? '0 1px 4px rgba(20, 18, 32, 0.35)' : 'none',
                }}
              >
                Best {modeBest.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full flex flex-col items-center gap-2 pb-2 sm:pb-3 px-4 shrink-0">
        <div
          className="flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-2xl pointer-events-auto max-w-full"
          role="tablist"
          aria-label="Game Modes"
          style={{
            backgroundColor: topChipBg,
            border: topChipBorder,
          }}
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
                className={`${
                  isCompactLandscape ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs sm:text-sm'
                } rounded-xl font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap min-h-[36px]`}
                style={{
                  backgroundColor: active ? palette.hudCardBg : 'transparent',
                  color: active ? palette.hudAccent : heroInk,
                  boxShadow: active ? '0 4px 12px rgba(24, 20, 36, 0.12)' : 'none',
                }}
              >
                {m.shortLabel}
              </button>
            );
          })}
        </div>

        <div
          className="kbd-hint-bar text-center text-xs font-medium py-0.5 px-4 pointer-events-none transition-colors duration-300"
          style={{
            color: darkWater ? 'rgba(250, 246, 238, 0.92)' : palette.hudInk,
            textShadow: darkWater ? '0 1px 3px rgba(32, 28, 44, 0.45)' : 'none',
          }}
        >
          ← → Move · ↑ Rotate · ↓ Slam · Esc Pause · Enter Play
        </div>
      </footer>
    </div>
  );
};
