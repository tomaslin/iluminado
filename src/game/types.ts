export type CellColor = 0 | 1 | 2;
export type BoardOrientation = 'landscape' | 'portrait';

export type GravityDirection = 'down' | 'left' | 'right' | 'up';

export type PieceShapeMode =
  | 'standard_2x2'
  | 'domino_2x1'
  | 'trio_3x1'
  | 'l_trio_2x2'
  | 'rect_3x2'
  | 'tetromino'
  | 'blocked_2x2'
  | 'prism_wild_2x2'
  | 'peggle_1x1';

export type TetrominoKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type ShiftType =
  | 'rotate_90'
  | 'flow_direction'
  | 'cyclotron_flow'
  | 'portal_wrap'
  | 'reverse_sweep'
  | 'board_resize'
  | 'line_color_shift'
  | 'split_canyon'
  | 'hourglass_funnel'
  | 'twin_elevators'
  | 'rolling_wave_floor'
  | 'octagon_cutoffs'
  | 'staircase_terraces'
  | 'center_spire'
  | 'dome_pedestal'
  | 'floating_shelf'
  | 'castle_battlements'
  | 'patrolling_bumper'
  | 'corner_edge_block'
  | 'bottom_edge_block'
  | 'side_edge_ledge'
  | 'spring_bounce'
  | 'conveyor_floor'
  | 'twin_sweep'
  | 'crumble_blocks'
  | 'brick_2x1'
  | 'brick_3x1'
  | 'brick_l_trio'
  | 'brick_3x2'
  | 'brick_tetromino'
  | 'brick_blocked'
  | 'brick_peggle'
  | 'chameleon_rotate'
  | 'prism_wild_bricks'
  | 'three_color_mode'
  | 'inside_out_swap'
  | 'sawtooth_shear'
  | 'horizon_shear'
  | 'zipper_merge'
  | 'mirror_flip'
  | 'vortex_swirl'
  | 'split_half_sweep'
  | 'diagonal_slant_sweep';

export type ObstacleVisualStyle =
  | 'stone'
  | 'girder'
  | 'bumper'
  | 'chasm'
  | 'sawtooth'
  | 'blocked'
  | 'spring'
  | 'crumble';

export interface PatrollingBumperState {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  dir: -1 | 1;
  beatAccum: number;
}

export interface ShiftVisualEffect {
  type: ShiftType;
  life: number;
  maxLife: number;
  faultRow?: number;
  lineCells?: Array<{ r: number; c: number }>;
  lineColor?: CellColor;
  mirrorCol?: number;
  swirlDir?: -1 | 1;
}

export interface Cell {
  id: number;
  color: CellColor;
  isChain: boolean;
  isPeggle?: boolean;
  isWild?: boolean;
  isObstacle?: boolean;
  obstacleFixed?: boolean;
  obstacleStyle?: ObstacleVisualStyle;
  crumbleHp?: number;
  chainMarked: boolean;
  inSquare: boolean;
  pendingClear: boolean;
  sweptCol: boolean;
  fallOffset: number; // visual interpolation in rows (>0 means animating downward)
  landFlash: number; // 0..1 impact pulse
  animOffsetX?: number; // temporary column translation offset for orientation pivot / flow slide
  animOffsetY?: number; // temporary row translation offset (>0 = raised upward)
}

export interface PieceCellData {
  color: CellColor;
  isChain: boolean;
  isBlocked?: boolean;
  isPeggle?: boolean;
  isWild?: boolean;
}

export type PieceCell = PieceCellData | null;

export interface Piece {
  x: number; // column of top-left cell
  y: number; // row of top-left cell (can start at -2..-4 above board)
  cells: PieceCell[][]; // rows x cols bounding grid, null for empty tetromino slots
  shapeMode?: PieceShapeMode;
  tetrominoKind?: TetrominoKind;
  isPeggle?: boolean;
  peggleVel?: -1 | 1;
  peggleBounces?: number;
  peggleTrail?: Array<{ x: number; y: number }>;
  springBounced?: boolean;
}

export interface ShiftSchedulerState {
  shiftTurnCount: number;
  stageTurnIndex: number;
  obstaclesInCurrentTurn: number;
  tileShiftsInCurrentTurn: number;
  usedTileTypesInCurrentTurn: ShiftType[];
  usedOneTimeShifts: ShiftType[];
  turnsSinceRotation: number;
  turnsSinceTileShift: number;
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

export type ChallengeVariant = 'basic' | 'endless' | 'shuffle' | 'zen';

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
  | 'aurora_prism'
  | 'sumi_bamboo'
  | 'cubist_atelier'
  | 'detroit_visor'
  | 'miami_vice'
  | 'neo_andean'
  | 'neko_sketchbook'
  | 'stained_glass'
  | 'constructivist'
  | 'botanical_herbarium'
  | 'memphis_milano';

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
  | 'fresco_crackle'
  | 'sumi_brush'
  | 'washi_fiber'
  | 'cubist_facet'
  | 'visor_hud'
  | 'chrome_plate'
  | 'neon_louvre'
  | 'chakana_step'
  | 'aguayo_weave'
  | 'cat_doodle'
  | 'paw_print'
  | 'stained_glass'
  | 'constructivist_wedge'
  | 'leaf_vein'
  | 'petal_press'
  | 'memphis_squiggle';

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
  | 'post_rock'
  | 'shamisen_chill'
  | 'cubist_chamber'
  | 'industrial_synth'
  | 'miami_boogie'
  | 'andean_cumbia'
  | 'cat_step_jazz'
  | 'cathedral_organ'
  | 'constructivist_march'
  | 'botanical_waltz'
  | 'memphis_electro';

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
  levelsPerSkin: number; // 3 levels inside this skin before transitioning
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
    blockC: BlockStyle;
    squareHighlight: string;
  };
  music: {
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
  baseCols: number;
  baseRows: number;
  orientation: BoardOrientation;
  gravityDirection?: GravityDirection;
  orientationGraceTimer: number; // brief gravity pause after orientation switch
  activeShift: ShiftType | null;
  pieceShapeMode: PieceShapeMode;
  colorCount: 2 | 3;
  conveyorDir?: -1 | 1;
  shiftScheduler: ShiftSchedulerState;
  patrollingBumper: PatrollingBumperState | null;
  shiftEffect: ShiftVisualEffect | null;
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
  pendingGarbage: number;
  biggestSweep: number;
  chainClearsTotal: number;
  singleColorCount: number;
  allClearCount: number;
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
  gravityDirection?: GravityDirection;
  boardCols: number;
  boardRows: number;
  activeShift: ShiftType | null;
  activeShiftLabel: string | null;
  pieceShapeMode?: PieceShapeMode;
  colorCount?: 2 | 3;
  enabledShiftCount: number;
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
  worldsCleared: number;
  biggestSweep: number;
  chainClears: number;
  singleColorBonuses: number;
  allClearBonuses: number;
  pendingGarbage: number;
  p2PendingGarbage: number;
  encoreBonusBpm: number;
  timeAttackPaceDelta: number | null;
  timeAttackPbFraction: number | null;
  timeAttackCurrentFraction: number | null;
  hasNextStage: boolean;
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
  timeAttackSplits?: Record<string, number[]>;
  enabledShifts: ShiftType[];
}
