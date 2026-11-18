export type CellColor = 0 | 1;
export type BoardOrientation = 'landscape' | 'portrait';

export interface Cell {
  id: number;
  color: CellColor;
  isChain: boolean;
  chainMarked: boolean;
  inSquare: boolean;
  pendingClear: boolean;
  sweptCol: boolean;
  fallOffset: number; // visual interpolation in rows (>0 means animating downward)
  landFlash: number; // 0..1 impact pulse
  animOffsetX?: number; // temporary column translation offset for orientation pivot
  animOffsetY?: number; // temporary row translation offset (>0 = raised upward)
}

export interface Piece {
  x: number; // column of top-left cell (0..14)
  y: number; // row of top-left cell (can start at -2 above board)
  cells: [
    [ { color: CellColor; isChain: boolean }, { color: CellColor; isChain: boolean } ],
    [ { color: CellColor; isChain: boolean }, { color: CellColor; isChain: boolean } ]
  ];
}

export interface SquareCoord {
  x: number; // 0..14
  y: number; // 0..8
  color: CellColor;
}

export type GameMode =
  | 'challenge'
  | 'daily'
  | 'skin_edit'
  | 'time_attack'
  | 'puzzle'
  | 'mission'
  | 'vs_cpu'
  | 'battle_2p';

export type ChallengeVariant = 'basic' | 'endless' | 'shuffle';

export type GameStatus = 'title' | 'playing' | 'paused' | 'gameover';

export type SkinVisualTheme =
  | 'monument_valley'
  | 'gorogoa'
  | 'gris'
  | 'sennaar'
  | 'papetura'
  | 'old_mans_journey'
  | 'journey'
  | 'altos_odyssey'
  | 'hohokum'
  | 'kentucky_rz'
  | 'limbo_inside'
  | 'transistor'
  | 'hyper_light'
  | 'fez'
  | 'sable'
  | 'spiritfarer'
  | 'abzu'
  | 'sayonara'
  | 'machinarium'
  | 'ori'
  | 'cityscape_deco'
  | 'noland_target'
  | 'artisan_blocks'
  | 'verdigris_terrace'
  | 'terracotta_mosaic'
  | 'indigo_risograph'
  | 'amber_encaustic'
  | 'celadon_fresco'
  | 'ochre_skyline'
  | 'aurora_prism';

export type BlockTextureStyle =
  | 'carved_stone'
  | 'woodcut_ink'
  | 'watercolor'
  | 'clay_glyph'
  | 'cut_paper'
  | 'gouache'
  | 'silk_sand'
  | 'vector_matte'
  | 'enamel_pop'
  | 'crt_noir'
  | 'graphite'
  | 'art_deco'
  | 'crystal_prism'
  | 'pixel_bevel'
  | 'ligne_claire'
  | 'lacquer'
  | 'pearl_shell'
  | 'foil_velvet'
  | 'brass_rivet'
  | 'bioluminescent'
  | 'city_windows'
  | 'target_rings'
  | 'impasto_stroke'
  | 'terrazzo_speckle'
  | 'stipple_dots'
  | 'linen_weave'
  | 'risograph_dots'
  | 'fresco_crackle';

export type BlockFillVariant =
  | 'satin'
  | 'wash'
  | 'concentric'
  | 'split_plane'
  | 'matte_flat'
  | 'luminous';

export type BlockStrokeVariant =
  | 'crisp'
  | 'double'
  | 'painterly'
  | 'recessed'
  | 'corner_ticks'
  | 'offset_ink';

export interface BlockStyle {
  fill: string;
  fillGradientEnd: string;
  shade: string;
  highlight: string;
  border: string;
  emblemColor: string;
  emblem: 'diamond' | 'arch' | 'circle' | 'chevron' | 'petal' | 'lattice';
  texture: BlockTextureStyle;
  fillVariant: BlockFillVariant;
  strokeVariant: BlockStrokeVariant;
}

export type MusicStyleId =
  | 'ambient'
  | 'jazz_fusion'
  | 'trip_hop'
  | 'dark_zouk'
  | 'bossa_nova'
  | 'country'
  | 'salsa'
  | 'synthwave'
  | 'swing'
  | 'blues_rock'
  | 'dark_ambient'
  | 'funk_fusion'
  | 'trap'
  | 'chiptune_funk'
  | 'alt_rock'
  | 'bachata'
  | 'kizomba'
  | 'reggaeton'
  | 'heavy_metal'
  | 'liquid_dnb'
  | 'afrobeat_jazz'
  | 'neo_soul'
  | 'cumbia_dub'
  | 'flamenco_house'
  | 'city_pop'
  | 'ethio_jazz'
  | 'dub_techno'
  | 'tango_nuevo'
  | 'uk_garage'
  | 'post_rock';

export interface SkinConfig {
  id: string;
  index: number;
  name: string;
  inspiration: string;
  subtitle: string;
  bpm: number;
  gravitySpeed: number; // rows per second
  spawnDelay: number; // seconds before gravity starts
  chainFrequency: number; // probability 0..0.18 of a cell in a piece being a Chain Block
  squaresPerLevel: number; // hidden squares required per level-up (excess overflow discarded)
  levelsPerSkin: number; // 4-5 levels inside this skin before transitioning
  squaresToAdvance: number; // nominal stage square target (squaresPerLevel * levelsPerSkin)
  finalStageTimerSec?: number; // final stage transitions by flat timer instead of square quota
  theme: SkinVisualTheme;
  particleShape: 'square' | 'petal' | 'spark' | 'ink' | 'bubble';
  palette: {
    skyTop: string;
    skyMid: string;
    skyBottom: string;
    horizonMist: string;
    architectureLight: string;
    architectureMid: string;
    architectureShadow: string;
    waterSurface: string;
    boardSurface: string;
    boardFrame: string;
    gridLine: string;
    timelineBeam: string;
    timelineGlow: string;
    hudInk: string;
    hudMuted: string;
    hudCardBg: string;
    hudAccent: string;
    blockA: BlockStyle;
    blockB: BlockStyle;
    squareHighlight: string;
  };
  music: {
    /** False disables procedural stems when no external track is assigned. */
    enabled?: boolean;
    styleId: MusicStyleId;
    genreLabel: string;
    audioTrackUrl?: string;
    rootMidi: number;
    scale: number[];
    chords: number[][];
    bassPattern: number[];
    arpPattern: number[];
    waveform: OscillatorType;
    bassWaveform: OscillatorType;
    intensity: number;
    swingRatio: number; // 0 = straight, 0.33 = swing bounce
    distortion: number; // 0..1 wave shaper drive
    subBassGain: number; // 0..1 808/sub emphasis
  };
}

export interface SweepState {
  lastCol: number; // last column index (0..15) processed in current sweep
  squaresThisSweep: number;
  chainClearedThisSweep: number;
  cellsClearedThisSweep: number;
  countedSquareKeys: Set<string>;
}

export interface ClearEvent {
  squaresCleared: number;
  cellsRemoved: number;
  pointsAwarded: number;
  comboLevel: number;
  singleColorBonus: boolean;
  allDeletedBonus: boolean;
  clearedPositions: Array<{ x: number; y: number; color: CellColor }>;
}

export interface BoardState {
  grid: (Cell | null)[][]; // [row][col], 10x16 landscape or 14x10 portrait
  cols: number;
  rows: number;
  orientation: BoardOrientation;
  orientationGraceTimer: number; // brief gravity pause after orientation switch
  activePiece: Piece | null;
  spawnTimer: number;
  gravityAccum: number;
  lockTimer: number;
  lockResetCount: number;
  nextQueue: Piece[];
  squares: SquareCoord[];
  sweepState: SweepState;
  comboLevel: number; // consecutive sweeps with >= 4 squares
  score: number;
  squaresClearedTotal: number;
  stageSquaresCleared: number;
  maxCombo: number;
  isGameOver: boolean;
  lockedColumnsLeft: number; // for VS battle pressure
  lockedColumnsRight: number;
}

export interface PuzzleLevel {
  id: string;
  title: string;
  hint: string;
  targetColor: CellColor;
  pattern: string[];
  timeLimit: number;
}

export interface MissionLevel {
  id: string;
  title: string;
  description: string;
  timeLimit: number;
  type: 'sweep_squares' | 'total_squares' | 'combo_level' | 'chain_cells' | 'all_clear' | 'single_color';
  targetValue: number;
  presetGrid?: 'sparse' | 'tower' | 'chain_ready' | 'almost_single';
}

export interface DailyChallengeSpec {
  dateKey: string;
  mission: MissionLevel;
  skinIndex: number;
  seedKey: string;
  startingGrid: (Cell | null)[][];
  previewRows: (CellColor | null)[][];
}

export interface DailyCompletionRecord {
  dateKey: string;
  completed: boolean;
  bestScore: number;
  clearTimeSec: number | null;
  attempts: number;
  missionTitle: string;
}

export interface HudSnapshot {
  status: GameStatus;
  mode: GameMode;
  orientation: BoardOrientation;
  boardCols: number;
  boardRows: number;
  challengeVariant: ChallengeVariant;
  score: number;
  highScore: number;
  level: number;
  skinIndex: number;
  musicGenre: string;
  bpm: number;
  squaresThisSweep: number;
  squaresTotal: number;
  stageSquares: number;
  stageGoal: number;
  comboLevel: number;
  maxCombo: number;
  comboMultiplier: number;
  timeRemaining: number | null;
  timeElapsed: number;
  nextPieces: Piece[];
  outcomeTitle: string;
  outcomeSubtitle: string;
  isVictory: boolean;
  activeMission?: MissionLevel;
  activePuzzle?: PuzzleLevel;
  activeDailyDateKey?: string;
  dailyCompletedToday?: boolean;
  dailyStreak?: number;
  missionProgress?: number;
  p2Score?: number;
  p2Squares?: number;
  p2Combo?: number;
  winnerLabel?: string;
}

export interface SavedProgress {
  highScores: Record<string, number>;
  unlockedSkins: string[];
  skinEditPlaylist: string[];
  muted: boolean;
  hapticsEnabled: boolean;
  dailyHistory: Record<string, DailyCompletionRecord>;
  dailyStreak: number;
  lastDailyCompletedDate: string | null;
}
