import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { GameModals } from './components/GameModals';
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
  applyGarbageToBoard,
  computeStageProgressMetrics,
  countBoardCells,
  createInitialBoardState,
  detectBoardMarks,
  finalizeSweep,
  getDimensionsForOrientation,
  hardDropPiece,
  movePieceHorizontal,
  rotateActivePiece,
  rotateBoard90,
  softDropStep,
  stepPassiveGravity,
  stepTimelineColumn,
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
  SKINS,
  advanceShuffledSkinDeck,
  createShuffledSkinDeck,
  pickRandomSkinIndex,
} from './game/skins';
import {
  applyDailyResultToProgress,
  getEffectiveDailyStreak,
  isDailyCompletedForDate,
  loadProgress,
  saveProgress,
} from './game/storage';
import {
  BoardOrientation,
  BoardState,
  ChallengeVariant,
  DailyChallengeSpec,
  GameMode,
  GameStatus,
  HudSnapshot,
  SavedProgress,
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
  outcomeTitle: string;
  outcomeSubtitle: string;
  isVictory: boolean;
}

function getSkinByIndex(idx: number): SkinConfig {
  return SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
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
  const [previewSkinIdx, setPreviewSkinIdx] = useState<number>(() =>
    pickRandomSkinIndex()
  );
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

    const fallbackDims = getDimensionsForOrientation(orientationRef.current);
    return {
      status: sim.status,
      mode: sim.mode,
      orientation: sim.board?.orientation ?? orientationRef.current,
      boardCols: sim.board?.cols ?? fallbackDims.cols,
      boardRows: sim.board?.rows ?? fallbackDims.rows,
      challengeVariant: sim.challengeVariant,
      score,
      highScore,
      level: sim.progression.level,
      skinIndex: sim.skinIndex,
      musicGenre: skin.music.genreLabel,
      bpm: skin.bpm,
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
    };
  }, [dailyDateKey]);

  const [hud, setHud] = useState<HudSnapshot>(() =>
    buildHudSnapshot(simRef.current)
  );

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
      syncBodyState('gameover');
      heldKeysRef.current.clear();

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
    (overrideMode?: GameMode, fromUserGesture: boolean = true) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (fromUserGesture) {
        audioRef.current.unlock();
      }
      audioRef.current.setMuted(progressRef.current.muted);
      audioRef.current.setHapticsEnabled(progressRef.current.hapticsEnabled);
      audioRef.current.resetStepTrack();

      const mode = overrideMode ?? selectedMode;
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
        timeRemaining = PUZZLE_LEVELS[selectedPuzzleIdx].timeLimit;
      } else if (mode === 'mission') {
        const mission = MISSION_LEVELS[selectedMissionIdx];
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
          board.activePiece.cells[1][0].isChain = true;
          board.activePiece.cells[1][0].color = 0;
        }
      } else if (mode === 'daily' && activeDailySpec) {
        timeRemaining = activeDailySpec.mission.timeLimit;
        board.grid = activeDailySpec.startingGrid.map((row) =>
          row.map((cell) => (cell ? { ...cell } : null))
        );
        board.cols = board.grid[0]?.length ?? BOARD_COLS;
        board.rows = board.grid.length;
        board.squares = detectBoardMarks(board.grid);
        if (startOrientation === 'portrait') {
          transformBoardForOrientation(board, 'portrait', false);
        }
        if (activeDailySpec.mission.type === 'chain_cells' && board.activePiece) {
          board.activePiece.cells[1][0].isChain = true;
          board.activePiece.cells[1][0].color = 0;
        }
      }

      let board2: BoardState | null = null;
      if (mode === 'vs_cpu' || mode === 'battle_2p') {
        board2 = createInitialBoardState(chainFreq, Math.random, startOrientation);
      }

      const sim = simRef.current;
      sim.status = 'playing';
      sim.mode = mode;
      sim.challengeVariant = challengeVariant;
      sim.timeAttackDuration = timeAttackDuration;
      sim.puzzleIdx = selectedPuzzleIdx;
      sim.missionIdx = selectedMissionIdx;
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
      sim.outcomeTitle = '';
      sim.outcomeSubtitle = '';
      sim.isVictory = false;

      heldKeysRef.current.clear();
      p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
      syncBodyState('playing');
      audioRef.current.syncWorldMusic(startSkin, 'playing');
      const upcomingIdx =
        startDeck.length > 1
          ? startDeck[1]
          : (startSkinIndex + 1) % SKINS.length;
      audioRef.current.preloadTrack(getSkinByIndex(upcomingIdx).music.audioTrackUrl);
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

  // Support ?autostart=1 or ?autostart=daily on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('autostart');
    if (auto === 'daily') {
      setSelectedMode('daily');
      startNewGame('daily', false);
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
      audioRef.current.syncWorldMusic(activeSkin, 'paused');
      setHud(buildHudSnapshot(sim));
    } else if (sim.status === 'paused') {
      audioRef.current.unlock();
      sim.status = 'playing';
      syncBodyState('playing');
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
    heldKeysRef.current.clear();
    p1DasRef.current = { dir: 0, hold: 0, repeat: 0 };
    p2DasRef.current = { dir: 0, hold: 0, repeat: 0 };
    syncBodyState('title');
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

  const getTitleSpectrumSnapshot = useCallback(
    () => audioRef.current.getSpectrumSnapshot(),
    []
  );

  const handlePlayerAction = useCallback(
    (player: 1 | 2, action: 'left' | 'right' | 'rotate' | 'rotate_ccw' | 'hard_drop') => {
      const sim = simRef.current;
      if (sim.status !== 'playing') return;
      audioRef.current.unlock();
      const targetBoard = player === 1 ? sim.board : sim.board2;
      if (!targetBoard || targetBoard.isGameOver) return;

      const skin = getSkinByIndex(sim.skinIndex);
      const chainFreq = sim.mode === 'puzzle' ? 0 : skin.chainFrequency;
      const boardIdx: 0 | 1 = player === 1 ? 0 : 1;

      if (action === 'left') {
        if (movePieceHorizontal(targetBoard, -1)) {
          audioRef.current.playMove(skin);
          if (player === 1) rendererRef.current.triggerMoveShift(-1);
        }
      } else if (action === 'right') {
        if (movePieceHorizontal(targetBoard, 1)) {
          audioRef.current.playMove(skin);
          if (player === 1) rendererRef.current.triggerMoveShift(1);
        }
      } else if (action === 'rotate' || action === 'rotate_ccw') {
        if (rotateActivePiece(targetBoard, action === 'rotate_ccw' ? 'ccw' : 'cw')) {
          audioRef.current.playRotate(skin);
        }
      } else if (action === 'hard_drop') {
        const pieceRng =
          player === 1 && sim.mode === 'daily' && sim.dailyRng
            ? sim.dailyRng
            : Math.random;
        const preX = targetBoard.activePiece?.x ?? 0;
        const preY = targetBoard.activePiece?.y ?? 0;
        const res = hardDropPiece(targetBoard, chainFreq, pieceRng);
        if (res.landed) {
          const landRow = Math.min(
            targetBoard.rows - 1,
            Math.max(0, preY + res.rowsDropped + 1)
          );
          rendererRef.current.triggerLandRipple(boardIdx, preX + 0.5, landRow);
          audioRef.current.playLand(skin);
          if (res.squaresFormed > 0) audioRef.current.playSquareFormed(skin);
          if (res.chainActivated) audioRef.current.playChainTrigger(skin);
          setHud(buildHudSnapshot(sim));
        }
      }
    },
    [buildHudSnapshot]
  );

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        } else if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
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
  }, [handlePlayerAction, returnToTitle, startNewGame, toggleMute, togglePause]);

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
          const timelineNorm = (sim.beatAccum % 8) / 8;
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
          const chainFreq = sim.mode === 'puzzle' ? 0 : skin.chainFrequency;
          const prevBeat = sim.beatAccum;
          sim.beatAccum += dt * (skin.bpm / 60);

          const prevSweepIdx = Math.floor(prevBeat / 8);
          const currSweepIdx = Math.floor(sim.beatAccum / 8);
          const timelineNorm = (sim.beatAccum % 8) / 8;
          const liveCols = sim.board.cols || BOARD_COLS;
          const targetCol = Math.floor(timelineNorm * liveCols) % liveCols;

          // Step through every column crossed since last frame
          const processColumn = (col: number) => {
            if (!sim.board) return;
            const stems = computeStemLevels(sim.board, skin);
            audioRef.current.syncStep(col, skin, stems);
            audioRef.current.updateMusicMix(skin, stems, sim.board.comboLevel);

            const prevChainCount = sim.board.sweepState.chainClearedThisSweep;
            const r1 = stepTimelineColumn(sim.board, col);
            if (r1.cellsRemovedNow > 0) {
              sim.hadClearsThisSweep = true;
              const activeMission =
                sim.mode === 'mission'
                  ? MISSION_LEVELS[sim.missionIdx]
                  : sim.mode === 'daily'
                  ? sim.dailySpec?.mission
                  : undefined;
              if (activeMission?.type === 'chain_cells') {
                sim.missionChainCleared += Math.max(
                  0,
                  sim.board.sweepState.chainClearedThisSweep - prevChainCount
                );
              }
              rendererRef.current.spawnClearBurst(0, r1.clearedPositions, skin);
            }

            if (sim.board2) {
              const r2 = stepTimelineColumn(sim.board2, col);
              if (r2.cellsRemovedNow > 0) {
                sim.p2HadClearsThisSweep = true;
                rendererRef.current.spawnClearBurst(1, r2.clearedPositions, skin);
              }
            }
          };

          const handleSweepWrap = () => {
            if (!sim.board) return;
            const ev1 = finalizeSweep(sim.board, sim.hadClearsThisSweep);
            sim.hadClearsThisSweep = false;

            if (ev1) {
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
              // Send VS pressure on >= 4 squares sweep
              if (sim.board2 && ev1.squaresCleared >= 4) {
                applyGarbageToBoard(sim.board2, ev1.squaresCleared);
                rendererRef.current.spawnScorePopup(
                  1,
                  `+${ev1.squaresCleared} BLOCKS`,
                  'PRESSURE SENT',
                  skin.palette.hudInk
                );
              }
            }

            if (sim.board2) {
              const ev2 = finalizeSweep(sim.board2, sim.p2HadClearsThisSweep);
              sim.p2HadClearsThisSweep = false;
              if (ev2 && ev2.squaresCleared >= 4) {
                applyGarbageToBoard(sim.board, ev2.squaresCleared);
                rendererRef.current.spawnScorePopup(
                  0,
                  `+${ev2.squaresCleared} BLOCKS`,
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
                    sim.challengeVariant === 'endless'
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
                finishRun(
                  'Sanctuary Cleared',
                  `Completed all ${SKINS.length} stages!`,
                  true
                );
                return;
              }

              if (nextIdx !== sim.skinIndex) {
                sim.prevSkinIndex = sim.skinIndex;
                sim.skinIndex = nextIdx;
                sim.transitionAlpha = 0;
                const nextSkin = getSkinByIndex(nextIdx);
                audioRef.current.playSkinTransition(nextSkin);
                audioRef.current.syncWorldMusic(nextSkin, 'playing');
                const preloadIdx =
                  sim.skinDeck.length > 1
                    ? sim.skinDeck[(sim.skinDeckPos + 1) % sim.skinDeck.length]
                    : (nextIdx + 1) % SKINS.length;
                audioRef.current.preloadTrack(
                  getSkinByIndex(preloadIdx).music.audioTrackUrl
                );
                commitHighScoreAndUnlocks(
                  sim.mode,
                  sim.timeAttackDuration,
                  sim.board.score,
                  nextIdx
                );
              }
            };

            // Classic Lumines level-up (excess sweep overflow discarded) + multi-level skin transition
            const allowSkinTransition = sim.mode === 'challenge' || sim.mode === 'skin_edit';
            const progRes = advanceSweepStageProgression(
              sim.progression,
              ev1?.squaresCleared ?? 0,
              skin,
              allowSkinTransition
            );
            sim.level = sim.progression.level;
            if (progRes.leveledUp && sim.mode !== 'puzzle') {
              const rotDir: 'cw' | 'ccw' =
                sim.progression.level % 2 === 0 ? 'cw' : 'ccw';
              const rotRes = rotateBoard90(sim.board, rotDir, true);
              if (sim.board2) {
                rotateBoard90(sim.board2, rotDir, true);
                if (sim.mode === 'vs_cpu') {
                  sim.cpuPlan = computeCpuBestMove(sim.board2);
                  sim.cpuRotationsDone = 0;
                }
              }
              if (rotRes.rotated) {
                rendererRef.current.triggerBoardRotate90(rotDir);
                const activeSkinForRot = getSkinByIndex(sim.skinIndex);
                audioRef.current.playRotate(activeSkinForRot);
                rendererRef.current.spawnScorePopup(
                  0,
                  `LEVEL ${sim.progression.level}`,
                  `${sim.board.cols}×${sim.board.rows} ROTATED`,
                  activeSkinForRot.palette.hudAccent
                );
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
                sim.challengeVariant === 'endless'
              );
              if (res.completed) {
                finishRun(
                  'Sanctuary Cleared',
                  `Completed all ${SKINS.length} stages!`,
                  true
                );
              } else {
                sim.skinDeck = res.nextDeck;
                sim.skinDeckPos = res.nextPos;
                sim.prevSkinIndex = sim.skinIndex;
                sim.skinIndex = res.nextIdx;
                sim.transitionAlpha = 0;
                const nextSkin = getSkinByIndex(res.nextIdx);
                audioRef.current.playSkinTransition(nextSkin);
                audioRef.current.syncWorldMusic(nextSkin, 'playing');
                const preloadIdx =
                  sim.skinDeck[(sim.skinDeckPos + 1) % sim.skinDeck.length];
                audioRef.current.preloadTrack(
                  getSkinByIndex(preloadIdx).music.audioTrackUrl
                );
                setHud(buildHudSnapshot(sim));
              }
            } else {
              const nextIdx =
                sim.mode === 'challenge' && sim.challengeVariant === 'shuffle'
                  ? pickRandomSkinIndex(undefined, sim.skinIndex)
                  : (sim.skinIndex + 1) % SKINS.length;
              sim.prevSkinIndex = sim.skinIndex;
              sim.skinIndex = nextIdx;
              sim.transitionAlpha = 0;
              const nextSkin = getSkinByIndex(nextIdx);
              audioRef.current.playSkinTransition(nextSkin);
              audioRef.current.syncWorldMusic(nextSkin, 'playing');
              audioRef.current.preloadTrack(
                getSkinByIndex((nextIdx + 1) % SKINS.length).music.audioTrackUrl
              );
              setHud(buildHudSnapshot(sim));
            }
          }

          if (sim.status === 'playing' && sim.lastStepCol === -1) {
            sim.lastStepCol = targetCol;
            processColumn(targetCol);
          } else if (currSweepIdx > prevSweepIdx || targetCol !== sim.lastStepCol) {
            let c = sim.lastStepCol % liveCols;
            let safety = 0;
            while (c !== targetCol && safety < liveCols + 4) {
              c = (c + 1) % liveCols;
              processColumn(c);
              if (c === 0) {
                handleSweepWrap();
                if (sim.status !== 'playing') break;
                if ((sim.board?.cols || BOARD_COLS) !== liveCols) break;
              }
              safety++;
            }
            const latestCols = sim.board?.cols || BOARD_COLS;
            sim.lastStepCol = Math.floor(timelineNorm * latestCols) % latestCols;
          }

          // Continuous held controls (DAS/ARR horizontal) & passive gravity + lock delay
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
                  if (movePieceHorizontal(sim.board, p1Dir)) {
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

            // Passive gravity & Lumines lock delay for Player 1
            if (sim.board.activePiece && !sim.board.isGameOver) {
              const pieceRng =
                sim.mode === 'daily' && sim.dailyRng ? sim.dailyRng : Math.random;
              const preX = sim.board.activePiece.x;
              const preY = sim.board.activePiece.y;
              const res = stepPassiveGravity(
                sim.board,
                dt,
                skin.gravitySpeed,
                skin.spawnDelay,
                chainFreq,
                pieceRng
              );
              if (res.landed) {
                const landRow = Math.min(sim.board.rows - 1, Math.max(0, preY + 1));
                rendererRef.current.triggerLandRipple(0, preX + 0.5, landRow);
                audioRef.current.playLand(skin);
                if (res.squaresFormed > 0) audioRef.current.playSquareFormed(skin);
                if (res.chainActivated) audioRef.current.playChainTrigger(skin);
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
                      if (!movePieceHorizontal(sim.board2, p2Dir)) break;
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
                  if (sim.cpuRotationsDone < sim.cpuPlan.targetRotations) {
                    rotateActivePiece(sim.board2, 'cw');
                    sim.cpuRotationsDone++;
                  } else if (sim.board2.activePiece.x < sim.cpuPlan.targetX) {
                    movePieceHorizontal(sim.board2, 1);
                  } else if (sim.board2.activePiece.x > sim.cpuPlan.targetX) {
                    movePieceHorizontal(sim.board2, -1);
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

      // Update visual particles & cell settling interpolation
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
        const beatPhase = sim.beatAccum % 1;
        const timelineNorm = (sim.beatAccum % 8) / 8;
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
        const sig = `${sim.status}|${sim.skinIndex}|${sim.progression.level}|${sim.progression.levelSquaresCleared}|${sim.progression.skinLevelsCleared}|${stageSecBucket}|${b?.score ?? 0}|${b?.squaresClearedTotal ?? 0}|${b?.sweepState.squaresThisSweep ?? 0}|${b?.comboLevel ?? 0}|${b?.maxCombo ?? 0}|${timeBucket}|${b2?.score ?? 0}|${sim.missionChainCleared}`;
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
          orientation={viewportInfo.orientation}
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
          previewSkin={getSkinByIndex(previewSkinIdx)}
          getSpectrumSnapshot={getTitleSpectrumSnapshot}
          dailySpec={dailySpec}
          onStart={() => startNewGame()}
        />
      )}

      {hud.status !== 'title' && (
        <GameHud
          hud={hud}
          skin={activeSkin}
          orientation={viewportInfo.orientation}
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
          onResume={togglePause}
          onRestart={() => startNewGame(simRef.current.mode)}
          onBackToMenu={returnToTitle}
        />
      )}
    </div>
  );
}
