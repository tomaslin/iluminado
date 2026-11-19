import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameModals } from './components/GameModals';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ShiftSettingsModal } from './components/ShiftSettingsModal';
import { TitleScreen } from './components/TitleScreen';
import { IluminadoAudioEngine, computeStemLevels } from './game/audio';
import { IluminadoCanvasRenderer } from './game/canvasRenderer';
import {
  createSeededRng,
  generateDailyChallenge,
  getDailyDateKey,
} from './game/daily';
import {
  BOARD_COLS,
  StageProgressionState,
  advanceSweepStageProgression,
  advanceTimedStageProgression,
  applyMetronomeChargeBonus,
  computeEncoreState,
  computeStageProgressMetrics,
  computeTimeAttackPaceDelta,
  countBoardCells,
  createInitialBoardState,
  detectBoardMarks,
  finalizeSweep,
  flushPendingGarbage,
  getDimensionsForOrientation,
  getPieceLandingColumns,
  hardDropPiece,
  resolveBattleGarbageSwap,
  rotateActivePiece,
  softDropStep,
  steerPiece,
  stepCeilingPressSweep,
  stepPassiveGravity,
  stepRisingTideSweep,
  stepTimelineColumn,
  swapHeldPiece,
  transformBoardForOrientation,
} from './game/engine';
import {
  MISSION_LEVELS,
  PUZZLE_LEVELS,
  buildMissionPresetGrid,
  checkPuzzlePatternMatch,
  computeCpuBestMove,
  CpuTargetPlan,
} from './game/modes';
import {
  advanceShiftStageTurn,
  applyBoardShift,
  getShiftLabel,
  getShiftPolarity,
  getSweepBeatsForShift,
  pickNextShift,
  pickStartShift,
  stepConveyorFloor,
  stepPatrollingBumper,
  tickShiftEffects,
} from './game/shifts';
import {
  SKINS,
  advanceShuffledSkinDeck,
  createShuffledSkinDeck,
  pickRandomSkinIndex,
} from './game/skins';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  applyDailyResultToProgress,
  applyTimeAttackSplitsToProgress,
  getEffectiveDailyStreak,
  isDailyCompletedForDate,
  loadProgress,
  saveProgress,
} from './game/storage';
import {
  BoardOrientation,
  BoardState,
  CellColor,
  ChallengeVariant,
  DailyChallengeSpec,
  GameMode,
  GameStatus,
  HudSnapshot,
  Piece,
  SavedProgress,
  ShiftType,
  SkinConfig,
} from './game/types';

interface SimState {
  status: GameStatus;
  mode: GameMode;
  challengeVariant: ChallengeVariant;
  timeAttackDuration: 60 | 180 | 300;
  puzzleIdx: number;
  missionIdx: number;
  dailySpec: DailyChallengeSpec | null;
  dailyRng: (() => number) | null;
  skinEditEndless: boolean;
  playlistSkinIds: string[];
  playlistPos: number;
  skinIndex: number;
  skinDeck: number[];
  skinDeckPos: number;
  prevSkinIndex: number | null;
  transitionAlpha: number;
  level: number;
  progression: StageProgressionState;
  beatAccum: number;
  sweepPhase: number;
  lastStepCol: number;
  hadClearsThisSweep: boolean;
  p2HadClearsThisSweep: boolean;
  timeElapsed: number;
  timeRemaining: number | null;
  board: BoardState | null;
  board2: BoardState | null;
  cpuPlan: CpuTargetPlan | null;
  cpuMoveAccum: number;
  cpuRotationsDone: number;
  missionChainCleared: number;
  missionSingleColorAchieved: boolean;
  worldsCleared: number;
  timeAttackSplitsRecorded: number[];
  encoreBonusBpm: number;
  encoreIntensity: number;
  preloadedNextKey: string | null;
  outcomeTitle: string;
  outcomeSubtitle: string;
  isVictory: boolean;
}

function getSkinByIndex(idx: number): SkinConfig {
  return SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
}

function injectStarterChainCell(piece: Piece | null): void {
  if (!piece) return;
  for (let py = piece.cells.length - 1; py >= 0; py--) {
    for (let px = 0; px < (piece.cells[py]?.length ?? 0); px++) {
      const cell = piece.cells[py]?.[px];
      if (cell && !cell.isBlocked) {
        cell.isChain = true;
        cell.color = 0;
        return;
      }
    }
  }
}

function extractPieceColumnColors(piece: Piece): (CellColor | null)[] {
  const rows = piece.cells.length;
  const cols = piece.cells[0]?.length ?? 0;
  const colors: (CellColor | null)[] = [];
  for (let px = 0; px < cols; px++) {
    let found: CellColor | null = null;
    for (let py = rows - 1; py >= 0; py--) {
      const cell = piece.cells[py]?.[px];
      if (cell && !cell.isBlocked) {
        found = cell.color;
        break;
      }
    }
    colors.push(found);
  }
  return colors;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<IluminadoCanvasRenderer>(new IluminadoCanvasRenderer());
  const audioRef = useRef<IluminadoAudioEngine>(new IluminadoAudioEngine());

  const [progress, setProgress] = useState<SavedProgress>(() => loadProgress());
  const progressRef = useRef<SavedProgress>(progress);
  progressRef.current = progress;

  // Title-screen configuration state
  const [selectedMode, setSelectedMode] = useState<GameMode>('challenge');
  const [challengeVariant, setChallengeVariant] = useState<ChallengeVariant>('basic');
  const [timeAttackDuration, setTimeAttackDuration] = useState<60 | 180 | 300>(180);
  const [selectedPuzzleIdx, setSelectedPuzzleIdx] = useState<number>(0);
  const [selectedMissionIdx, setSelectedMissionIdx] = useState<number>(0);
  const [isShiftSettingsOpen, setIsShiftSettingsOpen] = useState<boolean>(false);
  const isShiftSettingsOpenRef = useRef<boolean>(false);
  isShiftSettingsOpenRef.current = isShiftSettingsOpen;
  const [previewSkinIdx, setPreviewSkinIdx] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const qSkin = new URLSearchParams(window.location.search).get('skin');
      if (qSkin) {
        const byId = SKINS.findIndex((s) => s.id === qSkin);
        if (byId >= 0) return byId;
        const num = Number(qSkin);
        if (Number.isInteger(num) && num >= 1 && num <= SKINS.length) {
          return num - 1;
        }
      }
    }
    return pickRandomSkinIndex();
  });
  const lastStartedSkinRef = useRef<number | null>(null);
  const [dailyDateKey, setDailyDateKey] = useState<string>(() => getDailyDateKey());
  const [viewportInfo, setViewportInfo] = useState<{
    orientation: BoardOrientation;
    isCompactLandscape: boolean;
  }>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 720;
    const orientation: BoardOrientation = h > w ? 'portrait' : 'landscape';
    const isCompactLandscape = orientation === 'landscape' && (h <= 560 || w < 980);
    return { orientation, isCompactLandscape };
  });
  const orientationRef = useRef<BoardOrientation>(viewportInfo.orientation);
  orientationRef.current = viewportInfo.orientation;
  const lastViewportOrientationRef = useRef<BoardOrientation>(viewportInfo.orientation);
  const dailySpec = useMemo(
    () => generateDailyChallenge(dailyDateKey),
    [dailyDateKey]
  );

  // Automatically roll over daily seed if midnight crosses while on the title screen
  useEffect(() => {
    const id = window.setInterval(() => {
      const nextKey = getDailyDateKey();
      setDailyDateKey((curr) => (curr === nextKey ? curr : nextKey));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Preload current preview world and immediate neighbors while browsing the title screen (strict 3-buffer cap)
  useEffect(() => {
    const total = SKINS.length;
    const urls = [0, 1, -1].map(
      (offset) =>
        getSkinByIndex((previewSkinIdx + offset + total) % total).music.audioTrackUrl
    );
    audioRef.current.preloadTracks(urls);
  }, [previewSkinIdx]);

  // Keep AudioEngine volume, mute & renderer accessibility state synced on mount
  useEffect(() => {
    audioRef.current.setMuted(progressRef.current.muted);
    audioRef.current.setHapticsEnabled(progressRef.current.hapticsEnabled);
    audioRef.current.setMusicVolume(
      progressRef.current.musicVolume ?? DEFAULT_MUSIC_VOLUME
    );
    audioRef.current.setSfxVolume(
      progressRef.current.sfxVolume ?? DEFAULT_SFX_VOLUME
    );
    rendererRef.current.setAccessibility({
      reducedMotion: Boolean(progressRef.current.reducedMotion),
      patternMode: Boolean(progressRef.current.patternMode),
    });
  }, []);

  const simRef = useRef<SimState>({
    status: 'title',
    mode: 'challenge',
    challengeVariant: 'basic',
    timeAttackDuration: 180,
    puzzleIdx: 0,
    missionIdx: 0,
    dailySpec: null,
    dailyRng: null,
    skinEditEndless: false,
    playlistSkinIds: progress.skinEditPlaylist,
    playlistPos: 0,
    skinIndex: previewSkinIdx,
    skinDeck: createShuffledSkinDeck(SKINS.length),
    skinDeckPos: 0,
    prevSkinIndex: null,
    transitionAlpha: 1,
    level: 1,
    progression: {
      level: 1,
      levelSquaresCleared: 0,
      skinLevelsCleared: 0,
      stageTimeSec: 0,
    },
    beatAccum: 0,
    sweepPhase: 0,
    lastStepCol: -1,
    hadClearsThisSweep: false,
    p2HadClearsThisSweep: false,
    timeElapsed: 0,
    timeRemaining: null,
    board: null,
    board2: null,
    cpuPlan: null,
    cpuMoveAccum: 0,
    cpuRotationsDone: 0,
    missionChainCleared: 0,
    missionSingleColorAchieved: false,
    worldsCleared: 0,
    timeAttackSplitsRecorded: [],
    encoreBonusBpm: 0,
    encoreIntensity: 0,
    preloadedNextKey: null,
    outcomeTitle: '',
    outcomeSubtitle: '',
    isVictory: false,
  });

  const heldKeysRef = useRef<Set<string>>(new Set());
  const p1DasRef = useRef<{ dir: -1 | 0 | 1; hold: number; repeat: number }>({
    dir: 0,
    hold: 0,
    repeat: 0,
  });
  const p2DasRef = useRef<{ dir: -1 | 0 | 1; hold: number; repeat: number }>({
    dir: 0,
    hold: 0,
    repeat: 0,
  });
  const bufferClockSyncRef = useRef<{
    trackUrl: string | null;
    lastRawBufBeat: number;
  }>({
    trackUrl: null,
    lastRawBufBeat: 0,
  });

  const buildHudSnapshot = useCallback((sim: SimState): HudSnapshot => {
    const skin = getSkinByIndex(sim.skinIndex);
    const modeKey =
      sim.mode === 'time_attack'
        ? `time_attack_${sim.timeAttackDuration}`
        : sim.mode;
    const savedBest = progressRef.current.highScores[modeKey] ?? 0;
    const score = sim.board?.score ?? 0;
    const highScore = Math.max(savedBest, score);
    const comboLevel = sim.board?.comboLevel ?? 0;
    const comboMultiplier = comboLevel > 0 ? Math.min(16, comboLevel * 4) : 1;

    const activeMission =
      sim.mode === 'mission'
        ? MISSION_LEVELS[sim.missionIdx]
        : sim.mode === 'daily'
        ? sim.dailySpec?.mission
        : undefined;
    const activePuzzle =
      sim.mode === 'puzzle' ? PUZZLE_LEVELS[sim.puzzleIdx] : undefined;
    const dailyKey = sim.dailySpec?.dateKey ?? getDailyDateKey();
    const dailyCompletedToday = isDailyCompletedForDate(progressRef.current, dailyKey);
    const dailyStreak = getEffectiveDailyStreak(progressRef.current, dailyKey);

    let missionProgress = 0;
    if (activeMission && sim.board) {
      switch (activeMission.type) {
        case 'sweep_squares':
          missionProgress = sim.board.sweepState.squaresThisSweep;
          break;
        case 'total_squares':
          missionProgress = sim.board.squaresClearedTotal;
          break;
        case 'combo_level':
          missionProgress = sim.board.maxCombo;
          break;
        case 'chain_cells':
          missionProgress = sim.missionChainCleared;
          break;
        case 'all_clear':
          missionProgress = countBoardCells(sim.board.grid) === 0 ? 1 : 0;
          break;
        case 'single_color':
          missionProgress = sim.missionSingleColorAchieved ? 1 : 0;
          break;
      }
    }

    const { stageSquares, stageGoal } = computeStageProgressMetrics(
      sim.progression,
      skin
    );

    const pbSplits =
      sim.mode === 'time_attack'
        ? progressRef.current.timeAttackSplits?.[String(sim.timeAttackDuration)]
        : undefined;
    const pace =
      sim.mode === 'time_attack'
        ? computeTimeAttackPaceDelta(
            pbSplits,
            savedBest,
            sim.timeElapsed,
            sim.timeAttackDuration,
            score
          )
        : { delta: null, pbFraction: null, currentFraction: null };

    const hasNextStage =
      (sim.mode === 'puzzle' && sim.puzzleIdx + 1 < PUZZLE_LEVELS.length) ||
      (sim.mode === 'mission' && sim.missionIdx + 1 < MISSION_LEVELS.length);

    const fallbackDims = getDimensionsForOrientation(orientationRef.current);
    return {
      status: sim.status,
      mode: sim.mode,
      orientation: sim.board?.orientation ?? orientationRef.current,
      gravityDirection: sim.board?.gravityDirection ?? 'down',
      boardCols: sim.board?.cols ?? fallbackDims.cols,
      boardRows: sim.board?.rows ?? fallbackDims.rows,
      activeShift: sim.board?.activeShift ?? null,
      activeShiftLabel: getShiftLabel(sim.board?.activeShift ?? null),
      upcomingShift: sim.board?.upcomingShift ?? null,
      upcomingShiftLabel: getShiftLabel(sim.board?.upcomingShift ?? null),
      upcomingShiftPolarity: getShiftPolarity(sim.board?.upcomingShift ?? null),
      heldPiece: sim.board?.heldPiece ? { ...sim.board.heldPiece } : null,
      stashUsedThisTurn: Boolean(sim.board?.stashUsedThisTurn),
      vetoTokens: sim.board?.vetoTokens ?? 0,
      beatChargeAccum: sim.board?.beatChargeAccum ?? 0,
      risingTideRows: sim.board?.risingTideRows ?? 0,
      ceilingLockRows: sim.board?.ceilingLockRows ?? 0,
      sweepBeats: getSweepBeatsForShift(sim.board?.activeShift ?? null),
      pieceShapeMode: sim.board?.pieceShapeMode ?? 'standard_2x2',
      colorCount: sim.board?.colorCount ?? 2,
      enabledShiftCount: progressRef.current.enabledShifts.length,
      challengeVariant: sim.challengeVariant,
      score,
      highScore,
      level: sim.progression.level,
      skinIndex: sim.skinIndex,
      musicGenre: skin.music.genreLabel,
      bpm: skin.bpm + sim.encoreBonusBpm,
      squaresThisSweep: sim.board?.sweepState.squaresThisSweep ?? 0,
      squaresTotal: sim.board?.squaresClearedTotal ?? 0,
      stageSquares,
      stageGoal,
      comboLevel,
      maxCombo: sim.board?.maxCombo ?? 0,
      comboMultiplier,
      timeRemaining: sim.timeRemaining,
      timeElapsed: sim.timeElapsed,
      nextPieces: sim.board?.nextQueue ? [...sim.board.nextQueue] : [],
      outcomeTitle: sim.outcomeTitle,
      outcomeSubtitle: sim.outcomeSubtitle,
      isVictory: sim.isVictory,
      activeMission,
      activePuzzle,
      missionProgress,
      activeDailyDateKey: sim.mode === 'daily' ? dailyKey : undefined,
      dailyCompletedToday: sim.mode === 'daily' ? dailyCompletedToday : undefined,
      dailyStreak: sim.mode === 'daily' ? dailyStreak : undefined,
      p2Score: sim.board2?.score,
      p2Squares: sim.board2?.squaresClearedTotal,
      p2Combo: sim.board2?.comboLevel,
      worldsCleared: sim.worldsCleared,
      biggestSweep: sim.board?.biggestSweep ?? 0,
      chainClears: sim.board?.chainClearsTotal ?? 0,
      singleColorBonuses: sim.board?.singleColorCount ?? 0,
      allClearBonuses: sim.board?.allClearCount ?? 0,
      pendingGarbage: sim.board?.pendingGarbage ?? 0,
      p2PendingGarbage: sim.board2?.pendingGarbage ?? 0,
      encoreBonusBpm: sim.encoreBonusBpm,
      timeAttackPaceDelta: pace.delta,
      timeAttackPbFraction: pace.pbFraction,
      timeAttackCurrentFraction: pace.currentFraction,
      hasNextStage,
      reducedMotion: Boolean(progressRef.current.reducedMotion),
      patternMode: Boolean(progressRef.current.patternMode),
    };
  }, [dailyDateKey]);

  const [hud, setHud] = useState<HudSnapshot>(() =>
    buildHudSnapshot(simRef.current)
  );

  const handleChangeEnabledShifts = useCallback(
    (nextShifts: ShiftType[]) => {
      const updated: SavedProgress = {
        ...progressRef.current,
        enabledShifts: nextShifts,
      };
      progressRef.current = updated;
      saveProgress(updated);
      setProgress(updated);
      setHud(buildHudSnapshot(simRef.current));
    },
    [buildHudSnapshot]
  );

  const toggleReducedMotion = useCallback(() => {
    setProgress((prev) => {
      const nextVal = !prev.reducedMotion;
      const next: SavedProgress = { ...prev, reducedMotion: nextVal };
      progressRef.current = next;
      saveProgress(next);
      rendererRef.current.setAccessibility({
        reducedMotion: nextVal,
        patternMode: Boolean(next.patternMode),
      });
      setHud(buildHudSnapshot(simRef.current));
      return next;
    });
  }, [buildHudSnapshot]);

  const togglePatternMode = useCallback(() => {
    setProgress((prev) => {
      const nextVal = !prev.patternMode;
      const next: SavedProgress = { ...prev, patternMode: nextVal };
      progressRef.current = next;
      saveProgress(next);
      rendererRef.current.setAccessibility({
        reducedMotion: Boolean(next.reducedMotion),
        patternMode: nextVal,
      });
      setHud(buildHudSnapshot(simRef.current));
      return next;
    });
  }, [buildHudSnapshot]);

  const syncBodyState = useCallback((status: GameStatus) => {
    document.body.dataset.state = status;
  }, []);

  const commitHighScoreAndUnlocks = useCallback(
    (mode: GameMode, timeDur: number, score: number, unlockUpToIdx?: number) => {
      const modeKey = mode === 'time_attack' ? `time_attack_${timeDur}` : mode;
      setProgress((prev) => {
        const prevBest = prev.highScores[modeKey] ?? 0;
        const unlockedSet = new Set(prev.unlockedSkins);
        if (unlockUpToIdx !== undefined) {
          for (let i = 0; i <= Math.min(unlockUpToIdx, SKINS.length - 1); i++) {
            unlockedSet.add(SKINS[i].id);
          }
        }
        const nextProg: SavedProgress = {
          ...prev,
          highScores: {
            ...prev.highScores,
            [modeKey]: Math.max(prevBest, Math.round(score)),
          },
          unlockedSkins: Array.from(unlockedSet),
        };
        saveProgress(nextProg);
        return nextProg;
      });
    },
    []
  );

  const finishRun = useCallback(
    (title: string, subtitle: string, isVictory: boolean) => {
      const sim = simRef.current;
      if (sim.status === 'gameover') return;
      sim.status = 'gameover';
      sim.outcomeTitle = title;
      sim.outcomeSubtitle = subtitle;
      sim.isVictory = isVictory;
      if (
        isVictory &&
        (sim.mode === 'puzzle' || sim.mode === 'mission' || sim.mode === 'daily')
      ) {
        sim.worldsCleared = Math.max(1, sim.worldsCleared + 1);
      }
      syncBodyState('gameover');
      heldKeysRef.current.clear();

      audioRef.current.setPlaybackTempoScale(1);
      audioRef.current.updateShiftRiser(0);
      if (isVictory) {
        audioRef.current.playSkinTransition(getSkinByIndex(sim.skinIndex));
      } else {
        audioRef.current.playGameOver();
      }
      audioRef.current.syncWorldMusic(getSkinByIndex(sim.skinIndex), 'gameover');

      if (sim.mode === 'daily' && sim.dailySpec) {
        const skinForDay = getSkinByIndex(sim.dailySpec.skinIndex);
        const nextProg = applyDailyResultToProgress(progressRef.current, {
          dateKey: sim.dailySpec.dateKey,
          missionTitle: sim.dailySpec.mission.title,
          score: sim.board?.score ?? 0,
          timeElapsedSec: sim.timeElapsed,
          completed: isVictory,
          unlockSkinId: skinForDay.id,
        });
        progressRef.current = nextProg;
        saveProgress(nextProg);
        setProgress(nextProg);
      } else if (sim.mode === 'time_attack') {
        const finalSplits = [...sim.timeAttackSplitsRecorded];
        const expectedTotalBuckets = Math.floor(sim.timeAttackDuration / 5);
        const finalScore = Math.round(sim.board?.score ?? 0);
        if (isVictory && finalSplits.length < expectedTotalBuckets) {
          while (finalSplits.length < expectedTotalBuckets) {
            finalSplits.push(finalScore);
          }
        }
        const nextProg = applyTimeAttackSplitsToProgress(
          progressRef.current,
          sim.timeAttackDuration,
          finalScore,
          finalSplits
        );
        progressRef.current = nextProg;
        saveProgress(nextProg);
        setProgress(nextProg);
      } else {
        commitHighScoreAndUnlocks(
          sim.mode,
          sim.timeAttackDuration,
          sim.board?.score ?? 0,
          sim.skinIndex
        );
      }
      setHud(buildHudSnapshot(sim));
    },
    [buildHudSnapshot, commitHighScoreAndUnlocks, syncBodyState]
  );

  const startNewGame = useCallback(
    (
      overrideMode?: GameMode,
      fromUserGesture: boolean = true,
      stageOverride?: { puzzleIdx?: number; missionIdx?: number }
    ) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (fromUserGesture) {
        audioRef.current.unlock();
      }
      audioRef.current.setMuted(progressRef.current.muted);
      audioRef.current.setHapticsEnabled(progressRef.current.hapticsEnabled);
      audioRef.current.setMusicVolume(
        progressRef.current.musicVolume ?? DEFAULT_MUSIC_VOLUME
      );
      audioRef.current.setSfxVolume(
        progressRef.current.sfxVolume ?? DEFAULT_SFX_VOLUME
      );
      audioRef.current.setPlaybackTempoScale(1);
      audioRef.current.resetStepTrack();
      bufferClockSyncRef.current = { trackUrl: null, lastRawBufBeat: 0 };

      const mode = overrideMode ?? selectedMode;
      const effectivePuzzleIdx = stageOverride?.puzzleIdx ?? selectedPuzzleIdx;
      const effectiveMissionIdx = stageOverride?.missionIdx ?? selectedMissionIdx;
      const todayKey = getDailyDateKey();
      setDailyDateKey((curr) => (curr === todayKey ? curr : todayKey));

      if (mode === 'daily' && isDailyCompletedForDate(progressRef.current, todayKey)) {
        return;
      }

      const activeDailySpec =
        mode === 'daily' ? generateDailyChallenge(todayKey) : null;
      const activeDailyRng = activeDailySpec
        ? createSeededRng(activeDailySpec.seedKey)
        : null;

      const playlist =
        progressRef.current.skinEditPlaylist.length > 0
          ? progressRef.current.skinEditPlaylist
          : [SKINS[0].id];

      let startDeck = createShuffledSkinDeck(
        SKINS.length,
        lastStartedSkinRef.current
      );
      let startDeckPos = 0;
      let startSkinIndex = startDeck[0] ?? 0;

      if (mode === 'daily' && activeDailySpec) {
        startSkinIndex = activeDailySpec.skinIndex;
        startDeck = [startSkinIndex];
      } else if (mode === 'skin_edit') {
        const foundIdx = SKINS.findIndex((s) => s.id === playlist[0]);
        startSkinIndex = foundIdx >= 0 ? foundIdx : 0;
        startDeck = [startSkinIndex];
      } else if (mode === 'challenge') {
        if (challengeVariant === 'shuffle') {
          const unlockedIndices = SKINS.filter((s) =>
            progressRef.current.unlockedSkins.includes(s.id)
          ).map((s) => s.index);
          const pool =
            unlockedIndices.length > 0
              ? unlockedIndices
              : SKINS.map((s) => s.index);
          startSkinIndex = pickRandomSkinIndex(pool, lastStartedSkinRef.current);
          startDeck = createShuffledSkinDeck(SKINS.length, lastStartedSkinRef.current);
        } else if (lastStartedSkinRef.current === null) {
          // On initial launch from title, preserve the randomized title preview skin as stage 1 of the shuffled deck
          const idxInDeck = startDeck.indexOf(previewSkinIdx);
          if (idxInDeck > 0) {
            const tmp = startDeck[0];
            startDeck[0] = startDeck[idxInDeck];
            startDeck[idxInDeck] = tmp;
          }
          startSkinIndex = startDeck[0] ?? previewSkinIdx;
        }
      } else {
        // Time Attack, Puzzle, Mission, VS CPU, 2P Battle all randomize starting worlds across plays
        startSkinIndex =
          lastStartedSkinRef.current === null
            ? previewSkinIdx
            : pickRandomSkinIndex(undefined, lastStartedSkinRef.current);
        const idxInDeck = startDeck.indexOf(startSkinIndex);
        if (idxInDeck > 0) {
          const tmp = startDeck[0];
          startDeck[0] = startDeck[idxInDeck];
          startDeck[idxInDeck] = tmp;
        }
      }

      if (mode !== 'daily') {
        lastStartedSkinRef.current = startSkinIndex;
      }

      const startSkin = getSkinByIndex(startSkinIndex);
      const chainFreq =
        mode === 'puzzle' ? 0 : startSkin.chainFrequency;
      const startOrientation = orientationRef.current;

      const board = createInitialBoardState(
        chainFreq,
        activeDailyRng ?? Math.random,
        startOrientation
      );
      let timeRemaining: number | null = null;

      if (mode === 'time_attack') {
        timeRemaining = timeAttackDuration;
      } else if (mode === 'puzzle') {
        timeRemaining = PUZZLE_LEVELS[effectivePuzzleIdx].timeLimit;
      } else if (mode === 'mission') {
        const mission = MISSION_LEVELS[effectiveMissionIdx];
        timeRemaining = mission.timeLimit;
        if (mission.presetGrid) {
          board.grid = buildMissionPresetGrid(
            mission.presetGrid,
            board.cols,
            board.rows
          );
          board.squares = detectBoardMarks(board.grid);
        }
        if (mission.type === 'chain_cells' && board.activePiece) {
          // Ensure player gets a Chain Block early for Chain Sanctuary mission
          injectStarterChainCell(board.activePiece);
        }
      } else if (mode === 'daily' && activeDailySpec) {
        timeRemaining = activeDailySpec.mission.timeLimit;
        board.grid = activeDailySpec.startingGrid.map((row) =>
          row.map((cell) => (cell ? { ...cell } : null))
        );
        board.cols = board.grid[0]?.length ?? BOARD_COLS;
        board.rows = board.grid.length;
        board.baseCols = board.cols;
        board.baseRows = board.rows;
        board.squares = detectBoardMarks(board.grid);
        if (startOrientation === 'portrait') {
          transformBoardForOrientation(board, 'portrait', false);
        }
        if (activeDailySpec.mission.type === 'chain_cells' && board.activePiece) {
          injectStarterChainCell(board.activePiece);
        }
      }

      let board2: BoardState | null = null;
      if (mode === 'vs_cpu' || mode === 'battle_2p') {
        board2 = createInitialBoardState(chainFreq, Math.random, startOrientation);
      }

      let openingShiftLabel: string | null = null;
      if (mode !== 'puzzle') {
        const startShift = pickStartShift(
          progressRef.current.enabledShifts,
          activeDailyRng ?? Math.random,
          board
        );
        if (startShift) {
          const startShiftRes = applyBoardShift(board, startShift, {
            animateBricks: false,
            level: 1,
            chainFrequency: chainFreq,
            rng: activeDailyRng ?? Math.random,
          });
          if (board2) {
            applyBoardShift(board2, startShift, {
              animateBricks: false,
              level: 1,
              chainFrequency: chainFreq,
            });
          }
          if (startShiftRes.applied) {
            openingShiftLabel = startShiftRes.label;
          }
        }
      }

      const upcomingIdx =
        startDeck.length > 1
          ? startDeck[1]
          : (startSkinIndex + 1) % SKINS.length;
      const thirdIdx =
        startDeck.length > 2
          ? startDeck[2]
          : (upcomingIdx + 1) % SKINS.length;

      const sim = simRef.current;
      sim.status = 'playing';
      sim.mode = mode;
      sim.challengeVariant = challengeVariant;
      sim.timeAttackDuration = timeAttackDuration;
      sim.puzzleIdx = effectivePuzzleIdx;
      sim.missionIdx = effectiveMissionIdx;
      sim.dailySpec = activeDailySpec;
      sim.dailyRng = activeDailyRng;
      sim.skinEditEndless = false;
      sim.playlistSkinIds = playlist;
      sim.playlistPos = 0;
      sim.skinIndex = startSkinIndex;
      sim.skinDeck = startDeck;
      sim.skinDeckPos = startDeckPos;
      sim.prevSkinIndex = null;
      sim.transitionAlpha = 1;
      sim.level = 1;
      sim.progression = {
        level: 1,
        levelSquaresCleared: 0,
        skinLevelsCleared: 0,
        stageTimeSec: 0,
      };
      sim.beatAccum = 0;
      sim.sweepPhase = 0;
      sim.lastStepCol = -1;
      sim.hadClearsThisSweep = false;
      sim.p2HadClearsThisSweep = false;
      sim.timeElapsed = 0;
      sim.timeRemaining = timeRemaining;
      sim.board = board;
      sim.board2 = board2;
      sim.cpuPlan = board2 ? computeCpuBestMove(board2) : null;
      sim.cpuMoveAccum = 0;
      sim.cpuRotationsDone = 0;
      sim.missionChainCleared = 0;
      sim.missionSingleColorAchieved = false;
      sim.worldsCleared = 0;
      sim.timeAttackSplitsRecorded = [];
      sim.encoreBonusBpm = 0;
      sim.encoreIntensity = 0;
      sim.preloadedNextKey = `${startSkinIndex}->${upcomingIdx}`;
      sim.outcomeTitle = '';
      sim.outcomeSubtitle = '';
      sim.isVictory = false;

      heldKeysRef.current.clear();
      p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      syncBodyState('playing');
      audioRef.current.syncWorldMusic(startSkin, 'playing');
      audioRef.current.preloadTracks([
        startSkin.music.audioTrackUrl,
        getSkinByIndex(upcomingIdx).music.audioTrackUrl,
        getSkinByIndex(thirdIdx).music.audioTrackUrl,
      ]);
      if (openingShiftLabel) {
        rendererRef.current.spawnScorePopup(
          0,
          'OPENING SHIFT',
          openingShiftLabel,
          startSkin.palette.hudAccent
        );
      }
      setHud(buildHudSnapshot(sim));
    },
    [
      buildHudSnapshot,
      challengeVariant,
      previewSkinIdx,
      selectedMissionIdx,
      selectedMode,
      selectedPuzzleIdx,
      syncBodyState,
      timeAttackDuration,
    ]
  );

  const handleNextStage = useCallback(() => {
    const sim = simRef.current;
    if (sim.mode === 'puzzle' && sim.puzzleIdx + 1 < PUZZLE_LEVELS.length) {
      const nextPuzzle = sim.puzzleIdx + 1;
      setSelectedPuzzleIdx(nextPuzzle);
      startNewGame('puzzle', true, { puzzleIdx: nextPuzzle });
    } else if (sim.mode === 'mission' && sim.missionIdx + 1 < MISSION_LEVELS.length) {
      const nextMission = sim.missionIdx + 1;
      setSelectedMissionIdx(nextMission);
      startNewGame('mission', true, { missionIdx: nextMission });
    }
  }, [startNewGame]);

  // Support ?autostart=1, ?autostart=daily, or ?autostart=vs_cpu on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('autostart');
    if (auto === 'daily') {
      setSelectedMode('daily');
      startNewGame('daily', false);
    } else if (auto === 'vs_cpu') {
      setSelectedMode('vs_cpu');
      startNewGame('vs_cpu', false);
    } else if (auto === '1') {
      startNewGame('challenge', false);
    } else {
      syncBodyState('title');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    setProgress((prev) => {
      const nextMuted = !prev.muted;
      audioRef.current.setMuted(nextMuted);
      if (!nextMuted) {
        audioRef.current.unlock();
        const sim = simRef.current;
        if (sim.status === 'title' || sim.status === 'playing') {
          audioRef.current.syncWorldMusic(getSkinByIndex(sim.skinIndex), sim.status);
        }
      }
      const next = { ...prev, muted: nextMuted };
      progressRef.current = next;
      saveProgress(next);
      return next;
    });
  }, []);

  const handleChangeMusicVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
    audioRef.current.unlock();
    audioRef.current.setMusicVolume(clamped);
    setProgress((prev) => {
      const next = { ...prev, musicVolume: clamped };
      progressRef.current = next;
      saveProgress(next);
      return next;
    });
  }, []);

  const handleChangeSfxVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(volume * 100) / 100));
    audioRef.current.unlock();
    audioRef.current.setSfxVolume(clamped);
    setProgress((prev) => {
      const next = { ...prev, sfxVolume: clamped };
      progressRef.current = next;
      saveProgress(next);
      return next;
    });
  }, []);

  const togglePause = useCallback(() => {
    const sim = simRef.current;
    const activeSkin = getSkinByIndex(sim.skinIndex);
    if (sim.status === 'playing') {
      sim.status = 'paused';
      heldKeysRef.current.clear();
      p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      syncBodyState('paused');
      audioRef.current.setPlaybackTempoScale(1);
      audioRef.current.updateShiftRiser(0);
      audioRef.current.syncWorldMusic(activeSkin, 'paused');
      setHud(buildHudSnapshot(sim));
    } else if (sim.status === 'paused') {
      audioRef.current.unlock();
      sim.status = 'playing';
      syncBodyState('playing');
      bufferClockSyncRef.current = { trackUrl: null, lastRawBufBeat: 0 };
      audioRef.current.notifyClockReset();
      audioRef.current.syncWorldMusic(activeSkin, 'playing');
      setHud(buildHudSnapshot(sim));
    }
  }, [buildHudSnapshot, syncBodyState]);

  const returnToTitle = useCallback(() => {
    const sim = simRef.current;
    const nextPreview =
      selectedMode === 'daily'
        ? dailySpec.skinIndex
        : pickRandomSkinIndex(undefined, sim.skinIndex);
    setPreviewSkinIdx(nextPreview);
    sim.status = 'title';
    sim.board = null;
    sim.board2 = null;
    sim.skinIndex = nextPreview;
    sim.prevSkinIndex = null;
    sim.transitionAlpha = 1;
    sim.encoreBonusBpm = 0;
    sim.encoreIntensity = 0;
    sim.preloadedNextKey = null;
    bufferClockSyncRef.current = { trackUrl: null, lastRawBufBeat: 0 };
    heldKeysRef.current.clear();
    p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
    p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
    syncBodyState('title');
    audioRef.current.setPlaybackTempoScale(1);
    audioRef.current.resetStepTrack();
    audioRef.current.syncWorldMusic(getSkinByIndex(nextPreview), 'title');
    setHud(buildHudSnapshot(sim));
  }, [buildHudSnapshot, dailySpec.skinIndex, selectedMode, syncBodyState]);

  const handleSelectMode = useCallback(
    (mode: GameMode) => {
      setSelectedMode(mode);
      audioRef.current.unlock();
      const sim = simRef.current;
      if (mode === 'daily') {
        const nextIdx = dailySpec.skinIndex;
        setPreviewSkinIdx(nextIdx);
        if (sim.status === 'title') {
          if (sim.skinIndex !== nextIdx) {
            sim.prevSkinIndex = sim.skinIndex;
            sim.skinIndex = nextIdx;
            sim.transitionAlpha = 0;
            setHud(buildHudSnapshot(sim));
          }
          audioRef.current.resetStepTrack();
          audioRef.current.syncWorldMusic(getSkinByIndex(nextIdx), 'title');
        }
      } else if (sim.status === 'title') {
        if (sim.skinIndex === dailySpec.skinIndex) {
          const nextIdx = pickRandomSkinIndex(undefined, dailySpec.skinIndex);
          setPreviewSkinIdx(nextIdx);
          sim.prevSkinIndex = sim.skinIndex;
          sim.skinIndex = nextIdx;
          sim.transitionAlpha = 0;
          setHud(buildHudSnapshot(sim));
          audioRef.current.resetStepTrack();
        }
        audioRef.current.syncWorldMusic(getSkinByIndex(sim.skinIndex), 'title');
      }
    },
    [buildHudSnapshot, dailySpec.skinIndex]
  );

  const stepPreviewSkin = useCallback(
    (delta: -1 | 1) => {
      audioRef.current.unlock();
      const sim = simRef.current;
      const total = SKINS.length;
      const nextIdx = (((sim.skinIndex + delta) % total) + total) % total;
      setPreviewSkinIdx(nextIdx);
      if (sim.status === 'title') {
        sim.prevSkinIndex = sim.skinIndex;
        sim.skinIndex = nextIdx;
        sim.transitionAlpha = 0;
        const nextSkin = getSkinByIndex(nextIdx);
        audioRef.current.resetStepTrack();
        audioRef.current.syncWorldMusic(nextSkin, 'title');
        audioRef.current.preloadTrack(
          getSkinByIndex((nextIdx + delta + total) % total).music.audioTrackUrl
        );
        setHud(buildHudSnapshot(sim));
      }
    },
    [buildHudSnapshot]
  );

  const getTitleSpectrumSnapshot = useCallback(
    () => audioRef.current.getSpectrumSnapshot(),
    []
  );

  const handlePlayerAction = useCallback(
    (player: 1 | 2, action: 'left' | 'right' | 'rotate' | 'rotate_ccw' | 'hard_drop' | 'hold') => {
      const sim = simRef.current;
      if (sim.status !== 'playing') return;
      audioRef.current.unlock();
      const targetBoard = player === 1 ? sim.board : sim.board2;
      if (!targetBoard || targetBoard.isGameOver) return;

      const skin = getSkinByIndex(sim.skinIndex);
      const chainFreq = sim.mode === 'puzzle' ? 0 : skin.chainFrequency;
      const boardIdx: 0 | 1 = player === 1 ? 0 : 1;

      if (action === 'left') {
        if (steerPiece(targetBoard, -1)) {
          audioRef.current.playMove(skin);
          if (player === 1) rendererRef.current.triggerMoveShift(-1);
        }
      } else if (action === 'right') {
        if (steerPiece(targetBoard, 1)) {
          audioRef.current.playMove(skin);
          if (player === 1) rendererRef.current.triggerMoveShift(1);
        }
      } else if (action === 'rotate' || action === 'rotate_ccw') {
        const rotDir = action === 'rotate_ccw' ? 'ccw' : 'cw';
        if (rotateActivePiece(targetBoard, rotDir)) {
          audioRef.current.playRotate(skin);
          rendererRef.current.triggerPieceRotateTween(boardIdx, rotDir);
        }
      } else if (action === 'hold') {
        const pieceRng =
          player === 1 && sim.mode === 'daily' && sim.dailyRng
            ? sim.dailyRng
            : Math.random;
        if (swapHeldPiece(targetBoard, chainFreq, pieceRng)) {
          audioRef.current.playRotate(skin);
          setHud(buildHudSnapshot(sim));
        }
      } else if (action === 'hard_drop') {
        const gravDir = targetBoard.gravityDirection ?? 'down';
        const pieceRng =
          player === 1 && sim.mode === 'daily' && sim.dailyRng
            ? sim.dailyRng
            : Math.random;
        const activePieceSnapshot = targetBoard.activePiece;
        const preX = activePieceSnapshot?.x ?? 0;
        const preY = activePieceSnapshot?.y ?? 0;
        const landingInfo = activePieceSnapshot
          ? getPieceLandingColumns(targetBoard, activePieceSnapshot)
          : null;
        const isZen = sim.mode === 'challenge' && sim.challengeVariant === 'zen';
        const res = hardDropPiece(targetBoard, chainFreq, pieceRng, {
          zenNoLoss: isZen && player === 1,
        });
        if (res.bouncePositions?.length) {
          audioRef.current.playRotate(skin);
          for (const pt of res.bouncePositions) {
            rendererRef.current.spawnSpringBounce(boardIdx, pt.x, pt.y, skin);
          }
        }
        if (res.landed) {
          const landCol =
            gravDir === 'left' || gravDir === 'right'
              ? res.finalPieceX ?? preX
              : (res.finalPieceX ?? preX) + 0.5;
          const landRow =
            gravDir === 'down' || gravDir === 'up'
              ? res.finalPieceY ??
                Math.min(
                  targetBoard.rows - 1,
                  Math.max(0, preY + res.rowsDropped + 1)
                )
              : (res.finalPieceY ?? preY) + 0.5;
          if (activePieceSnapshot && landingInfo) {
            rendererRef.current.triggerHardDropBeam(
              boardIdx,
              preX,
              Math.max(0, preY),
              landingInfo.colBottomRows,
              extractPieceColumnColors(activePieceSnapshot),
              gravDir
            );
          }
          const effectiveDropBpm = skin.bpm + sim.encoreBonusBpm;
          rendererRef.current.triggerLandRipple(boardIdx, landCol, landRow);
          audioRef.current.playLand(skin, effectiveDropBpm, sim.beatAccum);
          const met = applyMetronomeChargeBonus(
            targetBoard,
            ((sim.beatAccum % 1) + 1) % 1
          );
          if (met.onBeat) {
            rendererRef.current.spawnScorePopup(
              boardIdx,
              `+${met.bonusPoints}`,
              met.tokenGranted ? 'BEAT VETO TOKEN!' : 'ON-BEAT CHARGE',
              skin.palette.hudAccent
            );
          }
          if (res.squaresFormed > 0) {
            audioRef.current.playSquareFormed(
              skin,
              targetBoard.squares.length,
              res.chainActivated ? 2 : 0,
              effectiveDropBpm,
              sim.beatAccum
            );
          }
          if (res.chainActivated) audioRef.current.playChainTrigger(skin);
          if (res.zenTrimmed) {
            rendererRef.current.spawnScorePopup(
              boardIdx,
              'ZEN FLOW',
              'ROWS TRIMMED',
              skin.palette.hudAccent
            );
          }
          setHud(buildHudSnapshot(sim));
        } else if (res.bouncePositions?.length) {
          setHud(buildHudSnapshot(sim));
        }
      }
    },
    [buildHudSnapshot]
  );

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isShiftSettingsOpenRef.current) return;
      const sim = simRef.current;

      if (sim.status === 'title') {
        if (e.code === 'KeyM') {
          e.preventDefault();
          toggleMute();
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startNewGame();
        }
        return;
      }

      if (sim.status === 'gameover') {
        if (e.code === 'Enter') {
          e.preventDefault();
          if (sim.mode === 'daily' && sim.isVictory) {
            returnToTitle();
          } else if (
            sim.isVictory &&
            ((sim.mode === 'puzzle' && sim.puzzleIdx + 1 < PUZZLE_LEVELS.length) ||
              (sim.mode === 'mission' && sim.missionIdx + 1 < MISSION_LEVELS.length))
          ) {
            handleNextStage();
          } else {
            startNewGame(sim.mode);
          }
        } else if (e.code === 'Escape') {
          e.preventDefault();
          returnToTitle();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        togglePause();
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
        return;
      }

      if (e.code === 'KeyR' && sim.status === 'playing') {
        e.preventDefault();
        startNewGame(sim.mode);
        return;
      }

      if (sim.status !== 'playing') return;

      audioRef.current.unlock();
      heldKeysRef.current.add(e.code);

      if (sim.mode === 'battle_2p') {
        // Player 1: WASD + Q CCW + Left Shift Slam
        if (e.code === 'KeyA') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'left');
        } else if (e.code === 'KeyD') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'right');
        } else if (e.code === 'KeyW') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'rotate');
        } else if (e.code === 'KeyQ') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'rotate_ccw');
        } else if (e.code === 'ShiftLeft' || e.code === 'KeyS') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'hard_drop');
        }
        // Player 2: Arrow keys + Right Shift / Slash Slam
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(2, 'left');
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(2, 'right');
        } else if (e.code === 'ArrowUp') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(2, 'rotate');
        } else if (e.code === 'ShiftRight' || e.code === 'Slash' || e.code === 'ArrowDown') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(2, 'hard_drop');
        }
      } else {
        // Single-player / VS CPU: Left/Right + Rotate + Slam
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'left');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'right');
        } else if (
          e.code === 'ArrowUp' ||
          e.code === 'KeyW' ||
          e.code === 'Space' ||
          e.code === 'KeyX'
        ) {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'rotate');
        } else if (e.code === 'KeyZ') {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'rotate_ccw');
        } else if (
          (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') &&
          sim.board?.activeShift === 'stash_hold'
        ) {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'hold');
        } else if (
          e.code === 'ArrowDown' ||
          e.code === 'KeyS' ||
          e.code === 'KeyC' ||
          e.code === 'ShiftLeft' ||
          e.code === 'ShiftRight'
        ) {
          e.preventDefault();
          if (!e.repeat) handlePlayerAction(1, 'hard_drop');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
    };

    const onPointerUnlock = () => {
      const sim = simRef.current;
      if (sim.status === 'playing' || sim.status === 'title') {
        audioRef.current.unlock();
        if (sim.status === 'title') {
          audioRef.current.syncWorldMusic(getSkinByIndex(sim.skinIndex), 'title');
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const nx = (e.clientX / w - 0.5) * 2;
      const ny = (e.clientY / h - 0.5) * 2;
      rendererRef.current.setPointerOffset(nx, ny);
    };

    const clearHeld = () => {
      heldKeysRef.current.clear();
      p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerUnlock);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', clearHeld);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerUnlock);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', clearHeld);
    };
  }, [handleNextStage, handlePlayerAction, returnToTitle, startNewGame, toggleMute, togglePause]);

  // Mount Canvas once and drive 60Hz simulation & rendering loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full';
    canvas.dataset.testid = 'iluminado-canvas';
    container.innerHTML = '';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const nextOrientation: BoardOrientation = height > width ? 'portrait' : 'landscape';
      const nextCompactLandscape =
        nextOrientation === 'landscape' && (height <= 560 || width < 980);
      const prevViewportOrientation = lastViewportOrientationRef.current;

      setViewportInfo((curr) =>
        curr.orientation === nextOrientation &&
        curr.isCompactLandscape === nextCompactLandscape
          ? curr
          : { orientation: nextOrientation, isCompactLandscape: nextCompactLandscape }
      );
      orientationRef.current = nextOrientation;
      lastViewportOrientationRef.current = nextOrientation;

      // Live in-game orientation pivot only when the actual viewport orientation flips
      const sim = simRef.current;
      if (
        prevViewportOrientation !== nextOrientation &&
        sim.board &&
        (sim.status === 'playing' || sim.status === 'paused') &&
        sim.board.orientation !== nextOrientation
      ) {
        const res1 = transformBoardForOrientation(sim.board, nextOrientation, true);
        if (sim.board2) {
          transformBoardForOrientation(sim.board2, nextOrientation, true);
          if (sim.mode === 'vs_cpu') {
            sim.cpuPlan = computeCpuBestMove(sim.board2);
            sim.cpuRotationsDone = 0;
          }
        }
        if (res1.transformed) {
          rendererRef.current.triggerOrientationShift(prevViewportOrientation, nextOrientation);
          const timelineNorm = ((sim.sweepPhase % 1) + 1) % 1;
          const liveCols = sim.board.cols || BOARD_COLS;
          sim.lastStepCol = Math.floor(timelineNorm * liveCols) % liveCols;
          const skin = getSkinByIndex(sim.skinIndex);
          audioRef.current.playRotate(skin);
          if (res1.displacedBonusPoints > 0) {
            rendererRef.current.spawnScorePopup(
              0,
              `+${res1.displacedBonusPoints}`,
              'ORIENTATION HARMONY',
              skin.palette.hudAccent
            );
          }
          setHud(buildHudSnapshot(sim));
        }
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);

    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;
    let lastHudSignature = '';

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      const sim = simRef.current;
      const skin = getSkinByIndex(sim.skinIndex);
      const prevSkin =
        sim.prevSkinIndex !== null ? getSkinByIndex(sim.prevSkinIndex) : null;

      // Gradual ~9s organic world crossfade (unhurried soundtrack progression)
      if (sim.transitionAlpha < 1) {
        sim.transitionAlpha = Math.min(1, sim.transitionAlpha + dt * 0.11);
        if (sim.transitionAlpha >= 1) {
          sim.prevSkinIndex = null;
        }
      }

      if (sim.status === 'title') {
        sim.beatAccum += dt * (skin.bpm / 60);
        if (audioRef.current.isAudioUnlocked() && !skin.music.audioTrackUrl) {
          const titleNorm = (sim.beatAccum % 8) / 8;
          const titleCol = Math.floor(titleNorm * BOARD_COLS) % BOARD_COLS;
          audioRef.current.syncStep(titleCol, skin, {
            percussion: 0.78,
            bass: 0.45,
            lead: 0.28,
            vocal: 0.14,
          });
        }
      } else if (sim.status === 'playing' && sim.board) {
        sim.timeElapsed += dt;

        // Timer countdown for Time Attack / Puzzle / Mission
        if (sim.timeRemaining !== null) {
          sim.timeRemaining = Math.max(0, sim.timeRemaining - dt);
          if (sim.timeRemaining <= 0) {
            if (sim.mode === 'time_attack') {
              finishRun(
                'Time Up',
                `Cleared ${sim.board.squaresClearedTotal} squares in ${sim.timeAttackDuration}s`,
                true
              );
            } else if (sim.mode === 'puzzle') {
              finishRun(
                'Time Up',
                `Puzzle "${PUZZLE_LEVELS[sim.puzzleIdx].title}" incomplete`,
                false
              );
            } else if (sim.mode === 'mission') {
              finishRun(
                'Mission Expired',
                `Trial "${MISSION_LEVELS[sim.missionIdx].title}" timed out`,
                false
              );
            } else if (sim.mode === 'daily' && sim.dailySpec) {
              finishRun(
                'Daily Expired',
                `Today's challenge "${sim.dailySpec.mission.title}" timed out`,
                false
              );
            }
          }
        }

        if (sim.status === 'playing') {
          if (sim.mode === 'time_attack' && sim.board) {
            const expectedBuckets = Math.floor(sim.timeElapsed / 5);
            while (sim.timeAttackSplitsRecorded.length < expectedBuckets) {
              sim.timeAttackSplitsRecorded.push(Math.round(sim.board.score));
            }
          }

          const isFinalWorld = Boolean(skin.finalStageTimerSec);
          const encore = computeEncoreState(isFinalWorld, sim.board.comboLevel);
          sim.encoreBonusBpm = encore.encoreBonusBpm;
          sim.encoreIntensity = encore.encoreIntensity;
          const effectiveBpm = skin.bpm + encore.encoreBonusBpm;
          audioRef.current.setPlaybackTempoScale(
            effectiveBpm / Math.max(1, skin.bpm)
          );

          // Preload the next two worlds' MP3s early so transitions stay instantaneous
          if (sim.mode === 'challenge' || sim.mode === 'skin_edit') {
            const { stageSquares, stageGoal } = computeStageProgressMetrics(
              sim.progression,
              skin
            );
            if (stageSquares / Math.max(1, stageGoal) >= 0.25) {
              let upcomingIdx: number | null = null;
              let followUpIdx: number | null = null;
              if (sim.mode === 'challenge' && sim.challengeVariant !== 'shuffle') {
                const loopForever =
                  sim.challengeVariant === 'endless' || sim.challengeVariant === 'zen';
                if (loopForever || sim.skinDeckPos + 1 < sim.skinDeck.length) {
                  upcomingIdx =
                    sim.skinDeck[(sim.skinDeckPos + 1) % sim.skinDeck.length];
                }
                if (loopForever || sim.skinDeckPos + 2 < sim.skinDeck.length) {
                  followUpIdx =
                    sim.skinDeck[(sim.skinDeckPos + 2) % sim.skinDeck.length];
                }
              } else if (sim.mode === 'skin_edit') {
                if (sim.playlistPos + 1 < sim.playlistSkinIds.length) {
                  const targetId = sim.playlistSkinIds[sim.playlistPos + 1];
                  const found = SKINS.findIndex((s) => s.id === targetId);
                  if (found >= 0) upcomingIdx = found;
                } else if (sim.skinEditEndless && sim.playlistSkinIds.length > 0) {
                  const targetId = sim.playlistSkinIds[0];
                  const found = SKINS.findIndex((s) => s.id === targetId);
                  if (found >= 0) upcomingIdx = found;
                }
              }
              if (upcomingIdx !== null) {
                const preloadKey = `${sim.skinIndex}->${upcomingIdx}->${followUpIdx ?? ''}`;
                if (sim.preloadedNextKey !== preloadKey) {
                  sim.preloadedNextKey = preloadKey;
                  audioRef.current.preloadTracks([
                    getSkinByIndex(upcomingIdx).music.audioTrackUrl,
                    followUpIdx !== null
                      ? getSkinByIndex(followUpIdx).music.audioTrackUrl
                      : undefined,
                  ]);
                }
              }
            }
          }

          const chainFreq = sim.mode === 'puzzle' ? 0 : skin.chainFrequency;
          const prevBeat = sim.beatAccum;
          const prevSweepPhase = sim.sweepPhase;
          const activeTrackUrl = skin.music.audioTrackUrl ?? null;
          const rawBufBeat = audioRef.current.getBufferBeatPosition();
          const syncState = bufferClockSyncRef.current;

          if (rawBufBeat !== null && activeTrackUrl) {
            if (
              syncState.trackUrl === activeTrackUrl &&
              rawBufBeat >= syncState.lastRawBufBeat &&
              rawBufBeat - syncState.lastRawBufBeat <= 0.75
            ) {
              sim.beatAccum += rawBufBeat - syncState.lastRawBufBeat;
              syncState.lastRawBufBeat = rawBufBeat;
            } else {
              const targetMod = ((rawBufBeat % 8) + 8) % 8;
              const prevMod = ((prevBeat % 8) + 8) % 8;
              const diffMod = ((targetMod - prevMod + 12) % 8) - 4;
              if (diffMod >= 0 && diffMod < 0.75) {
                sim.beatAccum = prevBeat + diffMod;
                syncState.trackUrl = activeTrackUrl;
                syncState.lastRawBufBeat = rawBufBeat;
              } else if (diffMod < 0 && diffMod > -0.5) {
                // Hold briefly for buffer cursor to catch up (<0.5 beats) without jumping backward
                sim.beatAccum = prevBeat;
              } else {
                const forwardShift = (targetMod - prevMod + 8) % 8;
                sim.beatAccum = prevBeat + forwardShift;
                syncState.trackUrl = activeTrackUrl;
                syncState.lastRawBufBeat = rawBufBeat;
              }
            }
          } else {
            syncState.trackUrl = null;
            sim.beatAccum += audioRef.current.consumeTimelineBeatDelta(dt, effectiveBpm);
          }

          const beatDelta = Math.max(0, sim.beatAccum - prevBeat);
          const sweepBeats = getSweepBeatsForShift(sim.board.activeShift);
          sim.sweepPhase += beatDelta / sweepBeats;

          // Beat-synced movement for patrolling 2x2 bumper & conveyor floor (steps every 2 beats)
          if (Math.floor(sim.beatAccum / 2) > Math.floor(prevBeat / 2)) {
            if (sim.board?.activeShift === 'patrolling_bumper') {
              stepPatrollingBumper(sim.board);
            } else if (sim.board?.activeShift === 'conveyor_floor') {
              stepConveyorFloor(sim.board);
            }
            if (sim.board2?.activeShift === 'patrolling_bumper') {
              stepPatrollingBumper(sim.board2);
            } else if (sim.board2?.activeShift === 'conveyor_floor') {
              stepConveyorFloor(sim.board2);
            }
          }

          const prevSweepIdx = Math.floor(prevSweepPhase);
          const currSweepIdx = Math.floor(sim.sweepPhase);
          const timelineNorm = ((sim.sweepPhase % 1) + 1) % 1;
          const liveCols = sim.board.cols || BOARD_COLS;
          const isRtlSweep = sim.board.activeShift === 'reverse_sweep';
          const isTwinSweep = sim.board.activeShift === 'twin_sweep';
          const targetCol = isRtlSweep
            ? Math.max(0, liveCols - 1 - (Math.floor(timelineNorm * liveCols) % liveCols))
            : Math.floor(timelineNorm * liveCols) % liveCols;
          const twinOffset = Math.floor(liveCols / 2);

          // DJ-style Shift riser + Telegraph upcoming shift during the final sweep before trigger
          if (sim.mode !== 'puzzle' && !skin.finalStageTimerSec) {
            const pendingSquares = Math.max(
              sim.board.squares.length,
              sim.board.sweepState.squaresThisSweep
            );
            const squaresIntoLevel =
              sim.progression.levelSquaresCleared + pendingSquares;
            const shiftReady = squaresIntoLevel >= Math.max(1, skin.squaresPerLevel);
            if (shiftReady && !sim.board.upcomingShift) {
              const previewRng =
                sim.mode === 'daily' && sim.dailyRng ? sim.dailyRng : Math.random;
              sim.board.upcomingShift = pickNextShift(
                progressRef.current.enabledShifts,
                sim.board.activeShift,
                previewRng,
                sim.board
              );
            } else if (!shiftReady && sim.board.upcomingShift) {
              sim.board.upcomingShift = null;
            }
            audioRef.current.updateShiftRiser(
              shiftReady && timelineNorm >= 0.5 ? (timelineNorm - 0.5) / 0.5 : 0
            );
          } else {
            if (sim.board.upcomingShift) sim.board.upcomingShift = null;
            audioRef.current.updateShiftRiser(0);
          }

          // Step through every column crossed since last frame
          const processColumn = (col: number) => {
            if (!sim.board) return;
            const stems = computeStemLevels(sim.board, skin);
            audioRef.current.syncStep(col, skin, stems);
            audioRef.current.updateMusicMix(skin, stems, sim.board.comboLevel);

            const activeMission =
              sim.mode === 'mission'
                ? MISSION_LEVELS[sim.missionIdx]
                : sim.mode === 'daily'
                ? sim.dailySpec?.mission
                : undefined;

            const stepPrimaryCol = (sweepCol: number, dir: 'ltr' | 'rtl') => {
              if (!sim.board) return;
              const prevChainCount = sim.board.sweepState.chainClearedThisSweep;
              const r1 = stepTimelineColumn(sim.board, sweepCol, dir);
              if (r1.cellsRemovedNow > 0) {
                sim.hadClearsThisSweep = true;
                audioRef.current.playSweepColumnNote(
                  skin,
                  sim.board.sweepState.squaresThisSweep,
                  r1.cellsRemovedNow
                );
                if (activeMission?.type === 'chain_cells') {
                  sim.missionChainCleared += Math.max(
                    0,
                    sim.board.sweepState.chainClearedThisSweep - prevChainCount
                  );
                }
                rendererRef.current.spawnClearBurst(0, r1.clearedPositions, skin);
              }
            };

            stepPrimaryCol(col, isRtlSweep ? 'rtl' : 'ltr');
            if (isTwinSweep) {
              stepPrimaryCol((col + twinOffset) % liveCols, 'ltr');
            }

            if (sim.board2) {
              const p2Rtl = sim.board2.activeShift === 'reverse_sweep';
              const p2Cols = sim.board2.cols || BOARD_COLS;
              const r2 = stepTimelineColumn(sim.board2, col % p2Cols, p2Rtl ? 'rtl' : 'ltr');
              if (r2.cellsRemovedNow > 0) {
                sim.p2HadClearsThisSweep = true;
                rendererRef.current.spawnClearBurst(1, r2.clearedPositions, skin);
              }
              if (sim.board2.activeShift === 'twin_sweep') {
                const r2b = stepTimelineColumn(
                  sim.board2,
                  (col + Math.floor(p2Cols / 2)) % p2Cols,
                  'ltr'
                );
                if (r2b.cellsRemovedNow > 0) {
                  sim.p2HadClearsThisSweep = true;
                  rendererRef.current.spawnClearBurst(1, r2b.clearedPositions, skin);
                }
              }
            }
          };

          const applyNextSkinIndex = (nextIdx: number, preloadIdx: number) => {
            if (!sim.board || nextIdx === sim.skinIndex) return;
            sim.worldsCleared += 1;
            advanceShiftStageTurn(sim.board);
            advanceShiftStageTurn(sim.board2);
            sim.prevSkinIndex = sim.skinIndex;
            sim.skinIndex = nextIdx;
            sim.transitionAlpha = 0;
            sim.encoreBonusBpm = 0;
            sim.encoreIntensity = 0;
            sim.preloadedNextKey = null;
            sim.board.upcomingShift = null;
            if (sim.board2) sim.board2.upcomingShift = null;
            bufferClockSyncRef.current = { trackUrl: null, lastRawBufBeat: 0 };
            const nextSkin = getSkinByIndex(nextIdx);
            audioRef.current.playSkinTransition(nextSkin);
            audioRef.current.syncWorldMusic(nextSkin, 'playing');
            rendererRef.current.spawnScorePopup(
              0,
              nextSkin.name,
              `${nextSkin.music.genreLabel} · ${nextSkin.bpm} BPM`,
              nextSkin.palette.hudAccent
            );
            audioRef.current.preloadTrack(
              getSkinByIndex(preloadIdx).music.audioTrackUrl
            );
            commitHighScoreAndUnlocks(
              sim.mode,
              sim.timeAttackDuration,
              sim.board.score,
              nextIdx
            );
          };

          const handleSweepWrap = () => {
            if (!sim.board) return;
            const ev1 = finalizeSweep(sim.board, sim.hadClearsThisSweep);
            sim.hadClearsThisSweep = false;

            if (ev1) {
              if (ev1.clearedPositions.length > 0) {
                rendererRef.current.spawnClearBurst(0, ev1.clearedPositions, skin);
              }
              if (ev1.squaresCleared > 0 || ev1.cellsRemoved > 0) {
                audioRef.current.playSweepClear(
                  ev1.squaresCleared,
                  ev1.comboLevel,
                  skin
                );
                rendererRef.current.triggerSweepBloom(
                  Math.max(1, ev1.squaresCleared)
                );
              }
              if (ev1.allDeletedBonus) {
                audioRef.current.playBonusSting(skin, 'all_deleted', effectiveBpm);
              } else if (ev1.singleColorBonus) {
                audioRef.current.playBonusSting(skin, 'single_color', effectiveBpm);
              }
              if (ev1.pointsAwarded > 0) {
                const sub = ev1.allDeletedBonus
                  ? 'ALL DELETED +10,000'
                  : ev1.singleColorBonus
                  ? 'SINGLE COLOR +1,000'
                  : ev1.comboLevel > 0
                  ? `${Math.min(16, ev1.comboLevel * 4)}× COMBO`
                  : ev1.squaresCleared > 0
                  ? `${ev1.squaresCleared} SQ`
                  : `CHAIN ×${ev1.cellsRemoved}`;
                rendererRef.current.spawnScorePopup(
                  0,
                  `+${ev1.pointsAwarded.toLocaleString()}`,
                  sub,
                  skin.palette.hudAccent
                );
              }
              if (ev1.singleColorBonus) {
                sim.missionSingleColorAchieved = true;
              }
            }

            const ev2 = sim.board2
              ? finalizeSweep(sim.board2, sim.p2HadClearsThisSweep)
              : null;
            if (sim.board2) {
              sim.p2HadClearsThisSweep = false;
              if (ev2 && ev2.clearedPositions.length > 0) {
                rendererRef.current.spawnClearBurst(1, ev2.clearedPositions, skin);
              }

              // VS Counter-play: 4+ squares first cancel pending incoming garbage, then queue net pressure for the next sweep
              const p1Out = ev1 && ev1.squaresCleared >= 4 ? ev1.squaresCleared : 0;
              const p2Out = ev2 && ev2.squaresCleared >= 4 ? ev2.squaresCleared : 0;
              const p1Countered = Math.min(sim.board.pendingGarbage, p1Out);
              sim.board.pendingGarbage -= p1Countered;
              const p2Countered = Math.min(sim.board2.pendingGarbage, p2Out);
              sim.board2.pendingGarbage -= p2Countered;

              const droppedOnP1 = flushPendingGarbage(sim.board);
              const droppedOnP2 = flushPendingGarbage(sim.board2);
              if (droppedOnP1 > 0) {
                rendererRef.current.spawnScorePopup(
                  0,
                  `+${droppedOnP1} BLOCKS`,
                  'GARBAGE DROPPED',
                  skin.palette.hudAccent
                );
              }
              if (droppedOnP2 > 0) {
                rendererRef.current.spawnScorePopup(
                  1,
                  `+${droppedOnP2} BLOCKS`,
                  'GARBAGE DROPPED',
                  skin.palette.hudInk
                );
              }

              const netP1Out = Math.max(0, p1Out - p1Countered);
              const netP2Out = Math.max(0, p2Out - p2Countered);
              const clashCancel = Math.min(netP1Out, netP2Out);
              const swap1 = resolveBattleGarbageSwap(
                sim.board,
                sim.board2,
                netP1Out - clashCancel
              );
              const swap2 = resolveBattleGarbageSwap(
                sim.board2,
                sim.board,
                netP2Out - clashCancel
              );

              if (p1Countered + clashCancel > 0) {
                rendererRef.current.spawnScorePopup(
                  0,
                  `-${p1Countered + clashCancel} DEFENDED`,
                  'COUNTERED!',
                  skin.palette.hudAccent
                );
              }
              if (p2Countered + clashCancel > 0) {
                rendererRef.current.spawnScorePopup(
                  1,
                  `-${p2Countered + clashCancel} DEFENDED`,
                  'COUNTERED!',
                  skin.palette.hudAccent
                );
              }
              if (swap1.netSent > 0) {
                rendererRef.current.spawnScorePopup(
                  1,
                  `+${swap1.netSent} INCOMING`,
                  'NEXT SWEEP',
                  skin.palette.hudInk
                );
              }
              if (swap2.netSent > 0) {
                rendererRef.current.spawnScorePopup(
                  0,
                  `+${swap2.netSent} INCOMING`,
                  'RIVAL ATTACK',
                  skin.palette.hudAccent
                );
              }
            }

            const triggerSkinAdvance = () => {
              if (!sim.board) return;
              sim.board.stageSquaresCleared = 0;
              sim.progression.skinLevelsCleared = 0;
              sim.progression.stageTimeSec = 0;

              let nextIdx = sim.skinIndex;
              let completedLap = false;

              if (sim.mode === 'challenge') {
                if (sim.challengeVariant === 'shuffle') {
                  const unlockedIndices = SKINS.filter((s) =>
                    progressRef.current.unlockedSkins.includes(s.id)
                  ).map((s) => s.index);
                  nextIdx = pickRandomSkinIndex(
                    unlockedIndices.length > 0 ? unlockedIndices : undefined,
                    sim.skinIndex
                  );
                } else {
                  const res = advanceShuffledSkinDeck(
                    sim.skinDeck,
                    sim.skinDeckPos,
                    sim.challengeVariant === 'endless' ||
                      sim.challengeVariant === 'zen'
                  );
                  sim.skinDeck = res.nextDeck;
                  sim.skinDeckPos = res.nextPos;
                  nextIdx = res.nextIdx;
                  completedLap = res.completed;
                }
              } else if (sim.mode === 'skin_edit') {
                if (sim.playlistPos + 1 >= sim.playlistSkinIds.length) {
                  if (!sim.skinEditEndless) {
                    completedLap = true;
                  } else {
                    sim.playlistPos = 0;
                  }
                } else {
                  sim.playlistPos += 1;
                }
                const targetId = sim.playlistSkinIds[sim.playlistPos];
                const found = SKINS.findIndex((s) => s.id === targetId);
                nextIdx = found >= 0 ? found : 0;
              }

              if (completedLap) {
                sim.worldsCleared += 1;
                finishRun(
                  'Sanctuary Cleared',
                  `Completed all ${SKINS.length} stages!`,
                  true
                );
                return;
              }

              const preloadIdx =
                sim.skinDeck.length > 1
                  ? sim.skinDeck[(sim.skinDeckPos + 1) % sim.skinDeck.length]
                  : (nextIdx + 1) % SKINS.length;
              applyNextSkinIndex(nextIdx, preloadIdx);
            };

            // Beat-sweep level-up (excess sweep overflow discarded) + multi-level skin transition
            const allowSkinTransition = sim.mode === 'challenge' || sim.mode === 'skin_edit';
            const progRes = advanceSweepStageProgression(
              sim.progression,
              ev1?.squaresCleared ?? 0,
              skin,
              allowSkinTransition
            );
            sim.level = sim.progression.level;
            if (progRes.leveledUp && sim.mode !== 'puzzle') {
              const chosenShift =
                sim.board.upcomingShift ??
                pickNextShift(
                  progressRef.current.enabledShifts,
                  sim.board.activeShift,
                  Math.random,
                  sim.board
                );
              sim.board.upcomingShift = null;
              if (chosenShift) {
                const shiftRes = applyBoardShift(sim.board, chosenShift, {
                  animateBricks: true,
                  level: sim.progression.level,
                  chainFrequency: chainFreq,
                });
                if (sim.board2) {
                  applyBoardShift(sim.board2, chosenShift, {
                    animateBricks: true,
                    level: sim.progression.level,
                    chainFrequency: chainFreq,
                  });
                  if (sim.mode === 'vs_cpu') {
                    sim.cpuPlan = computeCpuBestMove(sim.board2);
                    sim.cpuRotationsDone = 0;
                  }
                }
                if (shiftRes.applied) {
                  if (shiftRes.didRotate90) {
                    rendererRef.current.triggerBoardRotate90(shiftRes.rotateDir);
                  }
                  rendererRef.current.triggerShiftActivationFlash(
                    getShiftPolarity(chosenShift) ?? 'neutral'
                  );
                  rendererRef.current.triggerBoardTremor(0.6);
                  const activeSkinForShift = getSkinByIndex(sim.skinIndex);
                  audioRef.current.playShiftChord(activeSkinForShift);
                  rendererRef.current.spawnScorePopup(
                    0,
                    `LEVEL ${sim.progression.level}`,
                    shiftRes.label,
                    activeSkinForShift.palette.hudAccent
                  );
                }
              }
            } else if (!progRes.shouldTransitionSkin) {
              const sweepRng =
                sim.mode === 'daily' && sim.dailyRng ? sim.dailyRng : Math.random;
              const tideChanged = stepRisingTideSweep(
                sim.board,
                ev1?.squaresCleared ?? 0,
                sweepRng
              );
              const pressChanged = stepCeilingPressSweep(
                sim.board,
                ev1?.squaresCleared ?? 0
              );
              if (sim.board2) {
                stepRisingTideSweep(sim.board2, ev2?.squaresCleared ?? 0, Math.random);
                stepCeilingPressSweep(sim.board2, ev2?.squaresCleared ?? 0);
              }
              if (tideChanged || pressChanged) {
                rendererRef.current.triggerBoardTremor(0.55);
              }
            }
            if (progRes.shouldTransitionSkin) {
              triggerSkinAdvance();
            }

            setHud(buildHudSnapshot(sim));
          };

          // Final stage timed exception (flat timer transitions final stage instead of square quota)
          const allowTimedTransition = sim.mode === 'challenge' || sim.mode === 'skin_edit';
          if (
            advanceTimedStageProgression(
              sim.progression,
              dt,
              skin,
              allowTimedTransition
            )
          ) {
            sim.board.stageSquaresCleared = 0;
            sim.progression.skinLevelsCleared = 0;
            sim.progression.stageTimeSec = 0;
            if (sim.mode === 'challenge' && sim.challengeVariant !== 'shuffle') {
              const res = advanceShuffledSkinDeck(
                sim.skinDeck,
                sim.skinDeckPos,
                sim.challengeVariant === 'endless' ||
                  sim.challengeVariant === 'zen'
              );
              if (res.completed) {
                sim.worldsCleared += 1;
                finishRun(
                  'Sanctuary Cleared',
                  `Completed all ${SKINS.length} stages!`,
                  true
                );
              } else {
                sim.skinDeck = res.nextDeck;
                sim.skinDeckPos = res.nextPos;
                const preloadIdx =
                  sim.skinDeck[(sim.skinDeckPos + 1) % sim.skinDeck.length];
                applyNextSkinIndex(res.nextIdx, preloadIdx);
                setHud(buildHudSnapshot(sim));
              }
            } else {
              const nextIdx =
                sim.mode === 'challenge' && sim.challengeVariant === 'shuffle'
                  ? pickRandomSkinIndex(undefined, sim.skinIndex)
                  : (sim.skinIndex + 1) % SKINS.length;
              applyNextSkinIndex(nextIdx, (nextIdx + 1) % SKINS.length);
              setHud(buildHudSnapshot(sim));
            }
          }

          if (sim.status === 'playing' && sim.lastStepCol === -1) {
            sim.lastStepCol = targetCol;
            processColumn(targetCol);
          } else if (currSweepIdx > prevSweepIdx || targetCol !== sim.lastStepCol) {
            let c = Math.max(0, Math.min(liveCols - 1, sim.lastStepCol));
            let safety = 0;
            while (c !== targetCol && safety < liveCols + 4) {
              c = isRtlSweep
                ? (c - 1 + liveCols) % liveCols
                : (c + 1) % liveCols;
              const wrapped = isRtlSweep
                ? c === liveCols - 1
                : c === 0 || (isTwinSweep && (c + twinOffset) % liveCols === 0);
              if (wrapped) {
                handleSweepWrap();
                if (sim.status !== 'playing') break;
                if ((sim.board?.cols || BOARD_COLS) !== liveCols) break;
              }
              processColumn(c);
              safety++;
            }
            const latestCols = sim.board?.cols || BOARD_COLS;
            const latestRtl = sim.board?.activeShift === 'reverse_sweep';
            sim.lastStepCol = latestRtl
              ? Math.max(0, latestCols - 1 - (Math.floor(timelineNorm * latestCols) % latestCols))
              : Math.floor(timelineNorm * latestCols) % latestCols;
          }

          // Continuous held controls (DAS/ARR directional) & passive gravity + lock delay
          if (sim.status === 'playing' && sim.board) {
            const p1LeftHeld =
              sim.mode === 'battle_2p'
                ? heldKeysRef.current.has('KeyA')
                : heldKeysRef.current.has('ArrowLeft') || heldKeysRef.current.has('KeyA');
            const p1RightHeld =
              sim.mode === 'battle_2p'
                ? heldKeysRef.current.has('KeyD')
                : heldKeysRef.current.has('ArrowRight') || heldKeysRef.current.has('KeyD');
            const p1Dir: -1 | 0 | 1 =
              p1LeftHeld && !p1RightHeld ? -1 : p1RightHeld && !p1LeftHeld ? 1 : 0;

            if (p1Dir !== 0 && p1Dir === p1DasRef.current.dir) {
              p1DasRef.current.hold += dt;
              if (p1DasRef.current.hold >= 0.145) {
                p1DasRef.current.repeat += dt;
                while (p1DasRef.current.repeat >= 0.042) {
                  p1DasRef.current.repeat -= 0.042;
                  if (steerPiece(sim.board, p1Dir)) {
                    audioRef.current.playMove(skin);
                    rendererRef.current.triggerMoveShift(p1Dir);
                  } else {
                    break;
                  }
                }
              }
            } else {
              p1DasRef.current = { dir: p1Dir, hold: 0, repeat: 0 };
            }

            // Passive gravity & lock delay for Player 1
            if (sim.board.activePiece && !sim.board.isGameOver) {
              const pieceRng =
                sim.mode === 'daily' && sim.dailyRng ? sim.dailyRng : Math.random;
              const preX = sim.board.activePiece.x;
              const preY = sim.board.activePiece.y;
              const isZen = sim.mode === 'challenge' && sim.challengeVariant === 'zen';
              const res = stepPassiveGravity(
                sim.board,
                dt,
                skin.gravitySpeed,
                skin.spawnDelay,
                chainFreq,
                pieceRng,
                { zenNoLoss: isZen }
              );
              if (res.bouncePositions?.length) {
                audioRef.current.playRotate(skin);
                for (const pt of res.bouncePositions) {
                  rendererRef.current.spawnSpringBounce(0, pt.x, pt.y, skin);
                }
              }
              if (res.landed) {
                const gravDir = sim.board.gravityDirection ?? 'down';
                const landCol =
                  gravDir === 'left' || gravDir === 'right'
                    ? res.finalPieceX ?? preX
                    : (res.finalPieceX ?? preX) + 0.5;
                const landRow =
                  gravDir === 'down' || gravDir === 'up'
                    ? res.finalPieceY ??
                      Math.min(sim.board.rows - 1, Math.max(0, preY + 1))
                    : (res.finalPieceY ?? preY) + 0.5;
                rendererRef.current.triggerLandRipple(0, landCol, landRow);
                audioRef.current.playLand(skin, effectiveBpm, sim.beatAccum);
                const met = applyMetronomeChargeBonus(
                  sim.board,
                  ((sim.beatAccum % 1) + 1) % 1
                );
                if (met.onBeat) {
                  rendererRef.current.spawnScorePopup(
                    0,
                    `+${met.bonusPoints}`,
                    met.tokenGranted ? 'BEAT VETO TOKEN!' : 'ON-BEAT CHARGE',
                    skin.palette.hudAccent
                  );
                }
                if (res.squaresFormed > 0) {
                  audioRef.current.playSquareFormed(
                    skin,
                    sim.board.squares.length,
                    res.chainActivated ? 2 : 0,
                    effectiveBpm,
                    sim.beatAccum
                  );
                }
                if (res.chainActivated) audioRef.current.playChainTrigger(skin);
                if (res.zenTrimmed) {
                  rendererRef.current.spawnScorePopup(
                    0,
                    'ZEN FLOW',
                    'ROWS TRIMMED',
                    skin.palette.hudAccent
                  );
                }
                setHud(buildHudSnapshot(sim));
              }
            }

            // Player 2 or CPU board update
            if (sim.board2 && !sim.board2.isGameOver) {
              if (sim.mode === 'battle_2p') {
                const p2Left = heldKeysRef.current.has('ArrowLeft');
                const p2Right = heldKeysRef.current.has('ArrowRight');
                const p2Dir: -1 | 0 | 1 =
                  p2Left && !p2Right ? -1 : p2Right && !p2Left ? 1 : 0;
                if (p2Dir !== 0 && p2Dir === p2DasRef.current.dir) {
                  p2DasRef.current.hold += dt;
                  if (p2DasRef.current.hold >= 0.145) {
                    p2DasRef.current.repeat += dt;
                    while (p2DasRef.current.repeat >= 0.042) {
                      p2DasRef.current.repeat -= 0.042;
                      if (!steerPiece(sim.board2, p2Dir)) break;
                    }
                  }
                } else {
                  p2DasRef.current = { dir: p2Dir, hold: 0, repeat: 0 };
                }
              } else if (sim.mode === 'vs_cpu' && sim.board2.activePiece) {
                if (!sim.cpuPlan) {
                  sim.cpuPlan = computeCpuBestMove(sim.board2);
                  sim.cpuRotationsDone = 0;
                }
                sim.cpuMoveAccum += dt;
                if (sim.cpuMoveAccum >= 0.14) {
                  sim.cpuMoveAccum = 0;
                  const cpuGrav = sim.board2.gravityDirection ?? 'down';
                  const isHorizGrav = cpuGrav === 'left' || cpuGrav === 'right';
                  if (sim.cpuRotationsDone < sim.cpuPlan.targetRotations) {
                    rotateActivePiece(sim.board2, 'cw');
                    sim.cpuRotationsDone++;
                  } else if (isHorizGrav) {
                    const targetY = sim.cpuPlan.targetY ?? sim.board2.activePiece.y;
                    if (sim.board2.activePiece.y < targetY) {
                      steerPiece(sim.board2, 1);
                    } else if (sim.board2.activePiece.y > targetY) {
                      steerPiece(sim.board2, -1);
                    } else {
                      const dropRes = softDropStep(sim.board2, chainFreq);
                      if (dropRes.landed) {
                        sim.cpuPlan = null;
                        sim.cpuRotationsDone = 0;
                      }
                    }
                  } else if (sim.board2.activePiece.x < sim.cpuPlan.targetX) {
                    steerPiece(sim.board2, 1);
                  } else if (sim.board2.activePiece.x > sim.cpuPlan.targetX) {
                    steerPiece(sim.board2, -1);
                  } else {
                    const dropRes = softDropStep(sim.board2, chainFreq);
                    if (dropRes.landed) {
                      sim.cpuPlan = null;
                      sim.cpuRotationsDone = 0;
                    }
                  }
                }
              }

              // Passive gravity & lock delay for board2
              if (sim.board2.activePiece && !sim.board2.isGameOver) {
                const res = stepPassiveGravity(
                  sim.board2,
                  dt,
                  skin.gravitySpeed,
                  skin.spawnDelay,
                  chainFreq
                );
                if (res.landed && sim.mode === 'vs_cpu') {
                  sim.cpuPlan = null;
                  sim.cpuRotationsDone = 0;
                }
              }
            }

            // Check win / loss conditions
            if (sim.board.isGameOver) {
              if (sim.mode === 'vs_cpu') {
                finishRun('CPU Prevails', 'Your stack reached the top.', false);
              } else if (sim.mode === 'battle_2p') {
                finishRun('Player 2 Wins', 'Player 1 stack overflowed.', true);
              } else {
                finishRun(
                  'Game Over',
                  `Level ${sim.level} · ${sim.board.squaresClearedTotal} Squares`,
                  false
                );
              }
            } else if (sim.board2?.isGameOver) {
              finishRun(
                sim.mode === 'vs_cpu' ? 'Victory' : 'Player 1 Wins',
                sim.mode === 'vs_cpu'
                  ? 'You outlasted the CPU strategist!'
                  : 'Player 2 stack overflowed.',
                true
              );
            } else if (sim.mode === 'puzzle') {
              const puzzle = PUZZLE_LEVELS[sim.puzzleIdx];
              if (checkPuzzlePatternMatch(sim.board.grid, puzzle)) {
                finishRun(
                  'Puzzle Solved',
                  `Sculpted "${puzzle.title}" in ${Math.round(sim.timeElapsed)}s`,
                  true
                );
              }
            } else if (sim.mode === 'mission' || (sim.mode === 'daily' && sim.dailySpec)) {
              const mission =
                sim.mode === 'mission'
                  ? MISSION_LEVELS[sim.missionIdx]
                  : sim.dailySpec!.mission;
              let met = false;
              if (
                mission.type === 'sweep_squares' &&
                sim.board.sweepState.squaresThisSweep >= mission.targetValue
              ) {
                met = true;
              } else if (
                mission.type === 'total_squares' &&
                sim.board.squaresClearedTotal >= mission.targetValue
              ) {
                met = true;
              } else if (
                mission.type === 'combo_level' &&
                sim.board.maxCombo >= mission.targetValue
              ) {
                met = true;
              } else if (
                mission.type === 'chain_cells' &&
                sim.missionChainCleared >= mission.targetValue
              ) {
                met = true;
              } else if (
                mission.type === 'all_clear' &&
                countBoardCells(sim.board.grid) === 0
              ) {
                met = true;
              } else if (
                mission.type === 'single_color' &&
                sim.missionSingleColorAchieved
              ) {
                met = true;
              }
              if (met) {
                if (sim.mode === 'daily') {
                  finishRun(
                    'Daily Complete',
                    `${mission.title} · Cleared in ${Math.round(sim.timeElapsed)}s`,
                    true
                  );
                } else {
                  finishRun('Mission Complete', mission.title, true);
                }
              }
            }
          }
        }
      }

      // Update visual particles, shift visual seams & cell settling interpolation
      tickShiftEffects(sim.board, dt);
      tickShiftEffects(sim.board2, dt);
      const activeGrids: ((typeof sim.board) extends infer B
        ? B extends { grid: infer G }
          ? G
          : never
        : never)[] = [];
      if (sim.board) activeGrids.push(sim.board.grid);
      if (sim.board2) activeGrids.push(sim.board2.grid);
      rendererRef.current.updateEffects(dt, activeGrids);

      // Render Canvas
      if (ctx) {
        const beatPhase = ((sim.beatAccum % 1) + 1) % 1;
        const timelineNorm = ((sim.sweepPhase % 1) + 1) % 1;
        const spectrum = audioRef.current.getSpectrumSnapshot();
        rendererRef.current.render(ctx, width, height, {
          skin,
          prevSkin,
          transitionAlpha: sim.transitionAlpha,
          timeSec: now / 1000,
          beatPhase,
          timelineNorm,
          primaryBoard: sim.board,
          secondaryBoard: sim.board2,
          isTitleScreen: sim.status === 'title',
          secondaryLabel: sim.mode === 'vs_cpu' ? 'CPU' : 'PLAYER 2',
          audioSpectrum: spectrum,
          encoreIntensity: sim.encoreIntensity,
        });
      }

      // Throttled HUD sync: only re-render React HUD when discrete visible values change
      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.12 && sim.status === 'playing') {
        hudSyncAccum = 0;
        const b = sim.board;
        const b2 = sim.board2;
        const timeBucket = sim.timeRemaining !== null ? Math.ceil(sim.timeRemaining) : -1;
        const stageSecBucket = skin.finalStageTimerSec ? Math.floor(sim.progression.stageTimeSec) : 0;
        const taElapsedBucket = sim.mode === 'time_attack' ? Math.floor(sim.timeElapsed) : 0;
        const sig = `${sim.status}|${sim.skinIndex}|${sim.progression.level}|${sim.progression.levelSquaresCleared}|${sim.progression.skinLevelsCleared}|${stageSecBucket}|${taElapsedBucket}|${b?.score ?? 0}|${b?.squaresClearedTotal ?? 0}|${b?.sweepState.squaresThisSweep ?? 0}|${b?.comboLevel ?? 0}|${b?.maxCombo ?? 0}|${b?.pendingGarbage ?? 0}|${b2?.pendingGarbage ?? 0}|${sim.encoreBonusBpm}|${timeBucket}|${b2?.score ?? 0}|${sim.missionChainCleared}|${b?.cols ?? 0}x${b?.rows ?? 0}|${b?.activeShift ?? ''}|${b?.upcomingShift ?? ''}|${b?.heldPiece ? 1 : 0}|${b?.stashUsedThisTurn ? 1 : 0}|${b?.risingTideRows ?? 0}|${b?.ceilingLockRows ?? 0}|${b?.beatChargeAccum ?? 0}|${b?.vetoTokens ?? 0}`;
        if (sig !== lastHudSignature) {
          lastHudSignature = sig;
          setHud(buildHudSnapshot(sim));
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
    };
  }, [buildHudSnapshot, commitHighScoreAndUnlocks, finishRun]);

  const activeSkin = getSkinByIndex(hud.skinIndex);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Isolated Canvas Mount */}
      <div ref={mountRef} className="fixed inset-0 z-0" />

      {hud.status === 'title' && (
        <TitleScreen
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          isCompactLandscape={viewportInfo.isCompactLandscape}
          challengeVariant={challengeVariant}
          onSelectChallengeVariant={setChallengeVariant}
          timeAttackDuration={timeAttackDuration}
          onSelectTimeAttackDuration={setTimeAttackDuration}
          selectedPuzzleIdx={selectedPuzzleIdx}
          onSelectPuzzleIdx={setSelectedPuzzleIdx}
          selectedMissionIdx={selectedMissionIdx}
          onSelectMissionIdx={setSelectedMissionIdx}
          progress={progress}
          muted={progress.muted}
          onToggleMute={toggleMute}
          musicVolume={progress.musicVolume ?? DEFAULT_MUSIC_VOLUME}
          sfxVolume={progress.sfxVolume ?? DEFAULT_SFX_VOLUME}
          onChangeMusicVolume={handleChangeMusicVolume}
          onChangeSfxVolume={handleChangeSfxVolume}
          previewSkin={getSkinByIndex(previewSkinIdx)}
          onStepPreviewSkin={stepPreviewSkin}
          getSpectrumSnapshot={getTitleSpectrumSnapshot}
          dailySpec={dailySpec}
          onStart={() => startNewGame()}
          onOpenShiftSettings={() => setIsShiftSettingsOpen(true)}
          reducedMotion={Boolean(progress.reducedMotion)}
          patternMode={Boolean(progress.patternMode)}
          onToggleReducedMotion={toggleReducedMotion}
          onTogglePatternMode={togglePatternMode}
        />
      )}

      {hud.status !== 'title' && (
        <GameHud
          hud={hud}
          skin={activeSkin}
          isCompactLandscape={viewportInfo.isCompactLandscape}
          muted={progress.muted}
          onToggleMute={toggleMute}
          onPause={togglePause}
          onRestart={() => startNewGame(simRef.current.mode)}
          onTouchAction={(act) => handlePlayerAction(1, act)}
        />
      )}

      {(hud.status === 'paused' || hud.status === 'gameover') && (
        <GameModals
          hud={hud}
          skin={activeSkin}
          musicVolume={progress.musicVolume ?? DEFAULT_MUSIC_VOLUME}
          sfxVolume={progress.sfxVolume ?? DEFAULT_SFX_VOLUME}
          onChangeMusicVolume={handleChangeMusicVolume}
          onChangeSfxVolume={handleChangeSfxVolume}
          onResume={togglePause}
          onRestart={() => startNewGame(simRef.current.mode)}
          onNextStage={handleNextStage}
          onOpenShiftSettings={() => setIsShiftSettingsOpen(true)}
          onBackToMenu={returnToTitle}
          reducedMotion={Boolean(progress.reducedMotion)}
          patternMode={Boolean(progress.patternMode)}
          onToggleReducedMotion={toggleReducedMotion}
          onTogglePatternMode={togglePatternMode}
        />
      )}

      <ShiftSettingsModal
        isOpen={isShiftSettingsOpen}
        enabledShifts={progress.enabledShifts}
        skin={hud.status === 'title' ? getSkinByIndex(previewSkinIdx) : activeSkin}
        onChangeEnabledShifts={handleChangeEnabledShifts}
        onClose={() => setIsShiftSettingsOpen(false)}
      />

      <OfflineIndicator
        skin={hud.status === 'title' ? getSkinByIndex(previewSkinIdx) : activeSkin}
      />
    </div>
  );
}
