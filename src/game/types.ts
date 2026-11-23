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
  | 'pentomino'
  | 'colossus'
  | 'blocked_2x2'
  | 'prism_wild_2x2';

export type TetrominoKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type PentominoKind = 'F' | 'I' | 'L' | 'P' | 'N' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

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
  | 'brick_pentomino'
  | 'brick_colossus'
  | 'kaleidoscope_brick'
  | 'brick_blocked'
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
  | 'diagonal_slant_sweep'
  | 'double_time_sweep'
  | 'half_time_sweep'
  | 'lantern_sweep'
  | 'crash_gem'
  | 'anchored_viruses'
  | 'rising_tide'
  | 'ceiling_press'
  | 'frost_tiles'
  | 'stash_hold'
  | 'metronome_charge'
  | 'twin_wells'
  | 'dual_screen'
  | 'clamshell'
  | 'triptych'
  | 'chromatic_wells'
  | 'shell_game'
  | 'dueling_beams'
  | 'sun_moon'
  | 'trichroma_beams'
  | 'lighthouse'
  | 'diamond_arena'
  | 'cross_arena'
  | 'hillside_ramp'
  | 'windmill'
  | 'archipelago'
  | 'piston_walls'
  | 'stalactites';

export type ShiftPolarity = 'boon' | 'bane' | 'neutral';

export interface ShiftDraftOption {
  id: ShiftType;
  name: string;
  shortLabel: string;
  polarity: ShiftPolarity;
  description: string;
}

export type ObstacleVisualStyle =
  | 'stone'
  | 'girder'
  | 'bumper'
  | 'chasm'
  | 'sawtooth'
  | 'blocked'
  | 'spring'
  | 'crumble'
  | 'windmill'
  | 'piston'
  | 'stalactite';

export interface BoardWellRegion {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  gravity: GravityDirection;
  stagingMinRow?: number;
  stagingMaxRow?: number;
}

export interface WindmillState {
  cx: number;
  cy: number;
  armLength: number;
  orientation: 'horizontal' | 'vertical';
}

export interface PistonWallsState {
  leftDepth: number;
  rightDepth: number;
  maxDepth: number;
  startRow: number;
  endRow: number;
  dir: -1 | 1;
}

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
  isWild?: boolean;
  isCrashGem?: boolean;
  isVirus?: boolean;
  frostHp?: number;
  isObstacle?: boolean;
  obstacleFixed?: boolean;
  obstacleStyle?: ObstacleVisualStyle;
  crumbleHp?: number;
  chainMarked: boolean;
  inSquare: boolean;
  pendingClear: boolean;
  pendingClearColor?: CellColor;
  sweptCol: boolean;
  fallOffset: number;
  landFlash: number;
  animOffsetX?: number;
  animOffsetY?: number;
}

export interface PieceCellData {
  color: CellColor;
  isChain: boolean;
  isBlocked?: boolean;
  isWild?: boolean;
  isCrashGem?: boolean;
}

export type PieceCell = PieceCellData | null;

export interface Piece {
  x: number;
  y: number;
  cells: PieceCell[][];
  shapeMode?: PieceShapeMode;
  tetrominoKind?: TetrominoKind;
  pentominoKind?: PentominoKind;
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
  x: number;
  y: number;
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
  | 'memphis_milano'
  | 'scandi_showroom'
  | 'grand_budapest'
  | 'ghibli_express'
  | 'de_stijl'
  | 'ukiyoe_wave'
  | 'kodak_cinema'
  | 'kinetic_bauhaus'
  | 'synth_greenhouse'
  | 'vinyl_lounge'
  | 'space_terminal';

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
  | 'memphis_squiggle'
  | 'scandi_birch'
  | 'flatpack_blueprint'
  | 'hotel_keycard'
  | 'de_stijl_grid'
  | 'woodblock_wave'
  | 'kodak_slide'
  | 'bauhaus_arc'
  | 'terrarium_hex'
  | 'vinyl_groove'
  | 'space_porthole';

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
  | 'memphis_electro'
  | 'nordic_synth'
  | 'chamber_waltz'
  | 'studio_orchestral'
  | 'de_stijl_minimal'
  | 'koto_taiko'
  | 'analog_funk_70s'
  | 'kraut_motorik'
  | 'solarpunk_ambient'
  | 'tokyo_jazz_kissa'
  | 'space_age_lounge';

export interface SkinConfig {
  id: string;
  index: number;
  name: string;
  inspiration: string;
  subtitle: string;
  bpm: number;
  gravitySpeed: number;
  spawnDelay: number;
  chainFrequency: number;
  squaresPerLevel: number;
  levelsPerSkin: number;
  squaresToAdvance: number;
  finalStageTimerSec?: number;
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
    firstBeatSec?: number;
    loopSweeps?: number;
    loopEndSec?: number;
    rootMidi: number;
    scale: number[];
    chords: number[][];
    bassPattern: number[];
    arpPattern: number[];
    waveform: OscillatorType;
    bassWaveform: OscillatorType;
    intensity: number;
    swingRatio: number;
    distortion: number;
    subBassGain: number;
  };
}

export interface SweepState {
  lastCol: number;
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
  grid: (Cell | null)[][];
  cols: number;
  rows: number;
  baseCols: number;
  baseRows: number;
  orientation: BoardOrientation;
  gravityDirection?: GravityDirection;
  orientationGraceTimer: number;
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
  activeLockDelaySec?: number;
  nextQueue: Piece[];
  squares: SquareCoord[];
  sweepState: SweepState;
  comboLevel: number;
  comboGraceUsed?: boolean;
  vetoTokens?: number;
  upcomingShift?: ShiftType | null;
  shiftDraftChoices?: ShiftDraftOption[] | null;
  heldPiece?: Piece | null;
  stashUsedThisTurn?: boolean;
  ceilingLockRows?: number;
  risingTideRows?: number;
  beatChargeAccum?: number;
  wellRegions?: BoardWellRegion[];
  activeWellIndex?: number;
  sweepPassCount?: number;
  lighthouseAngle?: number;
  windmillState?: WindmillState | null;
  pistonState?: PistonWallsState | null;
  score: number;
  squaresClearedTotal: number;
  stageSquaresCleared: number;
  maxCombo: number;
  isGameOver: boolean;
  lockedColumnsLeft: number;
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
  upcomingShift?: ShiftType | null;
  upcomingShiftLabel?: string | null;
  upcomingShiftPolarity?: ShiftPolarity | null;
  heldPiece?: Piece | null;
  stashUsedThisTurn?: boolean;
  vetoTokens?: number;
  beatChargeAccum?: number;
  risingTideRows?: number;
  ceilingLockRows?: number;
  sweepBeats?: number;
  pieceShapeMode?: PieceShapeMode;
  colorCount?: 2 | 3;
  activeWellIndex?: number;
  wellCount?: number;
  sweepPassCount?: number;
  enabledShiftCount: number;
  challengeVariant: ChallengeVariant;
  score: number;
  highScore: number;
  level: number;
  speedMultiplier?: number;
  gravitySpeed?: number;
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
  reducedMotion?: boolean;
  patternMode?: boolean;
}

export interface SavedProgress {
  highScores: Record<string, number>;
  unlockedSkins: string[];
  skinEditPlaylist: string[];
  muted: boolean;
  musicVolume?: number;
  sfxVolume?: number;
  hapticsEnabled: boolean;
  dailyHistory: Record<string, DailyCompletionRecord>;
  dailyStreak: number;
  lastDailyCompletedDate: string | null;
  timeAttackSplits?: Record<string, number[]>;
  enabledShifts: ShiftType[];
  reducedMotion?: boolean;
  patternMode?: boolean;
}
