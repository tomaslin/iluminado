import {
  BOARD_COLS,
  allocCellId,
  createEmptyGrid,
  createShiftSchedulerState,
  createSweepState,
  detectBoardMarks,
  getPieceDimensions,
  getPieceInitialPos,
  getSpawnColForWidth,
  refreshQueueForBoardRules,
  rotateBoard90,
  settleBoard,
  settleBoardForDirection,
  stepCeilingPressSweep,
  stepRisingTideSweep,
} from './engine';
import {
  BoardState,
  Cell,
  CellColor,
  GravityDirection,
  ObstacleVisualStyle,
  PatrollingBumperState,
  PieceShapeMode,
  ShiftDraftOption,
  ShiftPolarity,
  ShiftType,
} from './types';

export type ShiftCategory = 'core' | 'silhouette' | 'obstacles' | 'bricks' | 'swaps';

export interface ShiftDefinition {
  id: ShiftType;
  name: string;
  shortLabel: string;
  category: ShiftCategory;
  polarity: ShiftPolarity;
  requiresBricks: boolean;
  description: string;
}

export const SHIFT_CATEGORY_LABELS: Record<ShiftCategory, string> = {
  core: 'Core & Dimension Shifts',
  silhouette: 'Size & Silhouette Reshapes',
  obstacles: 'Obstacles & Multi-Story Mechanics',
  bricks: 'Brick Shapes & 3-Color Shifts',
  swaps: 'Dramatic Row & Column Swaps',
};

export const SHIFT_DEFINITIONS: ShiftDefinition[] = [
  {
    id: 'rotate_90',
    name: '90° Board Rotate',
    shortLabel: '90° Rotate',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Turns the entire playfield 90° clockwise or counter-clockwise and drops stacks to the new floor.',
  },
  {
    id: 'board_resize',
    name: 'Expand / Contract (±2)',
    shortLabel: 'Size Shift',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Grows or shrinks board width and height by up to 2 blocks while preserving your stacks.',
  },
  {
    id: 'line_color_shift',
    name: 'Monochrome Line / Diagonal',
    shortLabel: 'Color Line',
    category: 'core',
    polarity: 'boon',
    requiresBricks: true,
    description:
      'Converts a single horizontal row, vertical column, or diagonal line into one uniform color.',
  },
  {
    id: 'flow_direction',
    name: 'Directional Gravity Flow',
    shortLabel: 'Gravity Flow',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Shifts gravity and piece entry to arrive from the left, right, or bottom edge instead of the top.',
  },
  {
    id: 'split_canyon',
    name: 'The Split Canyon',
    shortLabel: 'Split Canyon',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Cracks stacks left and right to carve an impassable 2-block-wide stone chasm down the center.',
  },
  {
    id: 'hourglass_funnel',
    name: 'Hourglass / Funnel Walls',
    shortLabel: 'Funnel Walls',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Steps neutral side bumpers inward by 1–2 blocks across middle or lower rows.',
  },
  {
    id: 'twin_elevators',
    name: 'Twin Elevators',
    shortLabel: 'Twin Elevators',
    category: 'silhouette',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Lifts the left half up +2 blocks and lowers the right stage by 1 block into an asymmetric step.',
  },
  {
    id: 'rolling_wave_floor',
    name: 'Rolling Wave Floor',
    shortLabel: 'Wave Floor',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Undulates the stone floor into a +0 to +2 sine wave, lifting stacks into rolling hills.',
  },
  {
    id: 'octagon_cutoffs',
    name: 'Octagon Cutoffs',
    shortLabel: 'Octagon Arena',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Locks stepped neutral stone blocks into all four corners to form an octagonal playfield.',
  },
  {
    id: 'floating_shelf',
    name: 'Floating Mid-Air Shelf',
    shortLabel: 'Mid-Air Shelf',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Spawns a solid horizontal girder mid-air, turning the board into a two-story bunker.',
  },
  {
    id: 'castle_battlements',
    name: 'Castle Battlements',
    shortLabel: 'Battlements',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Raises 2-block neutral stone pillars every 3rd column from the floor to form narrow trenches.',
  },
  {
    id: 'patrolling_bumper',
    name: 'Patrolling 2×2 Bumper',
    shortLabel: '2×2 Bumper',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Suspends a metallic 2×2 obstacle mid-air that slides left and right on the beat.',
  },
  {
    id: 'corner_edge_block',
    name: 'Corner Bastion (4×4)',
    shortLabel: 'Corner Block',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Seals a compact 4×4 stone bastion in one lower corner once per run while keeping main drop lanes open.',
  },
  {
    id: 'bottom_edge_block',
    name: 'Bottom Plinth (4×3)',
    shortLabel: 'Bottom Plinth',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Raises a low stone plinth along the bottom edge once per run without blocking central drops.',
  },
  {
    id: 'side_edge_ledge',
    name: 'Side Margin Ledge (3×4)',
    shortLabel: 'Side Ledge',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Places a stepped stone margin along the left or right wall once per run to narrow the wing gently.',
  },
  {
    id: 'brick_2x1',
    name: '2×1 / 1×2 Domino Bricks',
    shortLabel: '2×1 Bricks',
    category: 'bricks',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Transforms incoming falling pieces into nimble 2×1 / 1×2 domino bricks for one turn.',
  },
  {
    id: 'brick_3x1',
    name: '1×3 / 3×1 Trio Bricks',
    shortLabel: '1×3 Bricks',
    category: 'bricks',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Transforms incoming falling pieces into linear 1×3 and 3×1 trio bricks for one turn.',
  },
  {
    id: 'brick_3x2',
    name: '3×2 / 2×3 Slab Bricks',
    shortLabel: '3×2 Bricks',
    category: 'bricks',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Transforms incoming falling pieces into wide 3×2 / 2×3 six-tile slabs for one turn.',
  },
  {
    id: 'brick_tetromino',
    name: 'Tetromino Bricks',
    shortLabel: 'Tetrominoes',
    category: 'bricks',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Transforms incoming falling pieces into classic 4-tile I, O, T, S, Z, J, L shapes for one turn.',
  },
  {
    id: 'brick_blocked',
    name: 'Obsidian Blocked Bricks',
    shortLabel: 'Blocked 2×2',
    category: 'bricks',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Mixes a solid dark obsidian block into occasional 2×2 pieces for one turn; shatters beside clears.',
  },
  {
    id: 'three_color_mode',
    name: '3-Color Spectrum',
    shortLabel: '3 Colors',
    category: 'bricks',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Introduces a third block color onto the board and incoming queue for one turn.',
  },
  {
    id: 'inside_out_swap',
    name: 'Inside-Out Swap',
    shortLabel: 'Inside-Out',
    category: 'swaps',
    polarity: 'boon',
    requiresBricks: true,
    description:
      'Swaps outer columns with inner columns, flipping a central mountain into twin outer cliffs.',
  },
  {
    id: 'sawtooth_shear',
    name: 'Sawtooth Shear',
    shortLabel: 'Sawtooth',
    category: 'swaps',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Juts even rows right and odd rows left to transform straight walls into jagged zigzag teeth.',
  },
  {
    id: 'horizon_shear',
    name: 'Horizon Shear',
    shortLabel: 'Fault Line',
    category: 'swaps',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Cuts a glowing fault seam across the stack, sliding upper rows right and lower rows left.',
  },
  {
    id: 'zipper_merge',
    name: 'The Zipper Merge',
    shortLabel: 'Zipper Merge',
    category: 'swaps',
    polarity: 'boon',
    requiresBricks: true,
    description:
      'Interleaves top and bottom occupied rows cleanly like a zipper while keeping exact color ratios.',
  },
  {
    id: 'cyclotron_flow',
    name: 'Cyclotron Gravity Orbit',
    shortLabel: 'Orbit Flow',
    category: 'core',
    polarity: 'bane',
    requiresBricks: true,
    description:
      'Gravity orbits 90° clockwise after every dropped piece—top to right, bottom, left, and back.',
  },
  {
    id: 'portal_wrap',
    name: 'Portal Edge Wrap',
    shortLabel: 'Portal Wrap',
    category: 'core',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Opens dimensional edges so steering past the left or right wall warps your piece to the opposite side.',
  },
  {
    id: 'reverse_sweep',
    name: 'Reverse Timeline Sweep',
    shortLabel: 'RTL Sweep',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Flips the beat-locked timeline beam to sweep from right to left across the playfield.',
  },
  {
    id: 'split_half_sweep',
    name: 'Split-Half Timeline',
    shortLabel: 'Split Line',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Splits the sweep bar horizontally at mid-screen so the top and bottom halves clear 4 beats apart.',
  },
  {
    id: 'diagonal_slant_sweep',
    name: 'Diagonal Slant Line',
    shortLabel: 'Slant Line',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Tilts the timeline sweep into a diagonal slash so upper rows clear ahead of lower rows.',
  },
  {
    id: 'staircase_terraces',
    name: 'Staircase Terraces',
    shortLabel: 'Terraces',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Sculpts symmetrical 1–2–3 stone steps rising along both wings, funneling stacks toward the center.',
  },
  {
    id: 'center_spire',
    name: 'Twin-Basin Center Spire',
    shortLabel: 'Center Spire',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Raises a central stone monolith in the middle two columns to split play into twin flanking basins.',
  },
  {
    id: 'dome_pedestal',
    name: 'Central Dome Pedestal',
    shortLabel: 'Dome Mound',
    category: 'silhouette',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Lifts the center four columns into a vaulted arched mound while keeping outer valleys deep.',
  },
  {
    id: 'spring_bounce',
    name: 'Springboard Floor',
    shortLabel: 'Spring Pads',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Mounts amber trampoline pads along the floor that bounce incoming pieces skyward before locking.',
  },
  {
    id: 'conveyor_floor',
    name: 'Belt Conveyor Floor',
    shortLabel: 'Conveyor Belt',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Drives a motorized track along the bottom row, shifting settled floor blocks one column every 2 beats.',
  },
  {
    id: 'twin_sweep',
    name: 'Dual Twin Timeline',
    shortLabel: 'Twin Sweep',
    category: 'obstacles',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Splits the timeline into two synchronized beams sweeping 4 beats apart for double-tempo clears.',
  },
  {
    id: 'crumble_blocks',
    name: 'Crumble Crystal Ledges',
    shortLabel: 'Crumble Ledges',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Suspends brittle crystal ledges mid-board; two impacts or adjacent clears crack and shatter them.',
  },
  {
    id: 'brick_l_trio',
    name: '3-Tile Corner L-Bricks',
    shortLabel: 'L-Trio Bricks',
    category: 'bricks',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Carves incoming pieces into crisp 3-tile L-trominoes with a missing corner pocket for interlocking fits.',
  },
  {
    id: 'chameleon_rotate',
    name: 'Chameleon Rotate',
    shortLabel: 'Chameleon',
    category: 'bricks',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Rotating a falling brick cycles every tile color forward, letting you paint matches mid-air.',
  },
  {
    id: 'prism_wild_bricks',
    name: 'Prism Wild Bricks',
    shortLabel: 'Prism Wild',
    category: 'bricks',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Embeds achromatic diamond Prism Wild tiles into incoming 2×2 bricks that match any adjacent color.',
  },
  {
    id: 'mirror_flip',
    name: 'Mirror Symmetry Flip',
    shortLabel: 'Mirror Flip',
    category: 'swaps',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Reflects the entire occupied board horizontally across the center line in a crisp specular flip.',
  },
  {
    id: 'vortex_swirl',
    name: 'Orbital Vortex Swirl',
    shortLabel: 'Vortex Swirl',
    category: 'swaps',
    polarity: 'neutral',
    requiresBricks: true,
    description:
      'Rotates occupied blocks clockwise around concentric perimeter rings like a slow architectural whirlpool.',
  },
  {
    id: 'double_time_sweep',
    name: 'Double-Time Sweep',
    shortLabel: '4-Beat Sweep',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Accelerates the timeline beam to cross the board in 4 beats instead of 8 for rapid-fire clears.',
  },
  {
    id: 'half_time_sweep',
    name: 'Half-Time Sweep',
    shortLabel: '16-Beat Sweep',
    category: 'core',
    polarity: 'neutral',
    requiresBricks: false,
    description:
      'Stretches the timeline sweep to 16 beats so you can stack huge multi-square sweeps.',
  },
  {
    id: 'lantern_sweep',
    name: 'Lantern Spotlight',
    shortLabel: 'Lantern Beam',
    category: 'core',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Dims distant columns into monochrome silhouettes while the timeline beam illuminates nearby colors.',
  },
  {
    id: 'crash_gem',
    name: 'Crash Gem Surge',
    shortLabel: 'Crash Gems',
    category: 'bricks',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Embeds radiant Crash Gems into pieces; clearing one detonates all connected matching-color blocks.',
  },
  {
    id: 'anchored_viruses',
    name: 'Anchored Color Nodes',
    shortLabel: 'Color Nodes',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Suspends fixed chromatic nodes mid-air that resist gravity until cleared by a 2×2 square or chain (+500 purge).',
  },
  {
    id: 'rising_tide',
    name: 'Rising Tide Floor',
    shortLabel: 'Rising Tide',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Sweeps with under 4 squares raise a new floor row; 4+ square sweeps push the tide back down.',
  },
  {
    id: 'ceiling_press',
    name: 'Ceiling Press Shutters',
    shortLabel: 'Ceiling Press',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: false,
    description:
      'Flank ceiling shutters descend on small sweeps and lift back up whenever you clear 4+ squares.',
  },
  {
    id: 'frost_tiles',
    name: 'Frost-Rimed Surface',
    shortLabel: 'Frost Tiles',
    category: 'obstacles',
    polarity: 'bane',
    requiresBricks: true,
    description:
      'Freezes top-layer tiles in crystal frost that cracks on the first sweep and shatters on the second.',
  },
  {
    id: 'stash_hold',
    name: 'Architectural Stash Hold',
    shortLabel: 'Stash Hold',
    category: 'bricks',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Unlocks a Hold slot (C / Shift / button) to bank and swap your active falling brick once per drop.',
  },
  {
    id: 'metronome_charge',
    name: 'Metronome Beat Charge',
    shortLabel: 'Beat Charge',
    category: 'core',
    polarity: 'boon',
    requiresBricks: false,
    description:
      'Locking a piece on the beat awards +150 bonus points and charges Veto Tokens every 3 beat-locks.',
  },
];

export const ALL_SHIFT_TYPES: ShiftType[] = SHIFT_DEFINITIONS.map((d) => d.id);
export const VALID_SHIFT_SET = new Set<ShiftType>(ALL_SHIFT_TYPES);

export const START_FRIENDLY_SHIFTS: ShiftType[] = SHIFT_DEFINITIONS.filter(
  (d) => !d.requiresBricks
).map((d) => d.id);

export const POPULATED_BOARD_SHIFTS: ShiftType[] = SHIFT_DEFINITIONS.filter(
  (d) => d.requiresBricks
).map((d) => d.id);

export const START_FRIENDLY_SHIFT_SET = new Set<ShiftType>(START_FRIENDLY_SHIFTS);

const SHIFT_MAP = new Map<ShiftType, ShiftDefinition>(
  SHIFT_DEFINITIONS.map((d) => [d.id, d])
);

export function isShiftStartFriendly(type: ShiftType): boolean {
  const def = SHIFT_MAP.get(type);
  return def ? !def.requiresBricks : false;
}

export function getShiftPolarity(type: ShiftType | null): ShiftPolarity | null {
  if (!type) return null;
  return SHIFT_MAP.get(type)?.polarity ?? 'neutral';
}

export function getSweepBeatsForShift(shift: ShiftType | null): number {
  if (shift === 'double_time_sweep') return 4;
  if (shift === 'half_time_sweep') return 16;
  return 8;
}

export const OBSTACLE_SHIFT_SET = new Set<ShiftType>([
  'split_canyon',
  'hourglass_funnel',
  'rolling_wave_floor',
  'octagon_cutoffs',
  'floating_shelf',
  'castle_battlements',
  'patrolling_bumper',
  'corner_edge_block',
  'bottom_edge_block',
  'side_edge_ledge',
  'staircase_terraces',
  'center_spire',
  'dome_pedestal',
  'spring_bounce',
  'crumble_blocks',
  'anchored_viruses',
  'rising_tide',
  'ceiling_press',
  'frost_tiles',
]);

export const TILE_TYPE_SHIFT_SET = new Set<ShiftType>([
  'brick_2x1',
  'brick_3x1',
  'brick_3x2',
  'brick_tetromino',
  'brick_blocked',
  'three_color_mode',
  'brick_l_trio',
  'chameleon_rotate',
  'prism_wild_bricks',
  'crash_gem',
]);

const ONE_TIME_SHIFT_SET = new Set<ShiftType>([
  'corner_edge_block',
  'bottom_edge_block',
  'side_edge_ledge',
  'split_canyon',
  'octagon_cutoffs',
]);

export function getNominalBoardDims(state: BoardState): { cols: number; rows: number } {
  const baseIsPortrait = state.baseCols < state.baseRows;
  const currIsPortrait = state.cols < state.rows;
  const isRotated90 = baseIsPortrait !== currIsPortrait;
  return isRotated90
    ? { cols: state.baseRows, rows: state.baseCols }
    : { cols: state.baseCols, rows: state.baseRows };
}

export function advanceShiftStageTurn(state: BoardState | null | undefined): void {
  if (!state) return;
  if (!state.shiftScheduler) {
    state.shiftScheduler = createShiftSchedulerState();
  }
  state.shiftScheduler.stageTurnIndex = 0;
  state.shiftScheduler.obstaclesInCurrentTurn = 0;
  state.shiftScheduler.tileShiftsInCurrentTurn = 0;
  state.shiftScheduler.usedTileTypesInCurrentTurn = [];
}

export function getShiftDefinition(type: ShiftType): ShiftDefinition | undefined {
  return SHIFT_MAP.get(type);
}

export function getShiftLabel(type: ShiftType | null): string | null {
  if (!type) return null;
  return SHIFT_MAP.get(type)?.shortLabel ?? null;
}

function makeObstacleCell(
  style: ObstacleVisualStyle,
  fixed: boolean = true
): Cell {
  return {
    id: allocCellId(),
    color: 0,
    isChain: false,
    isObstacle: true,
    obstacleFixed: fixed,
    obstacleStyle: style,
    chainMarked: false,
    inSquare: false,
    pendingClear: false,
    sweptCol: false,
    fallOffset: 0,
    landFlash: 0.45,
  };
}

export function stripBoardObstacles(state: BoardState): void {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell) continue;
      if (cell.isObstacle) {
        state.grid[r][c] = null;
      } else {
        if (cell.isVirus) cell.isVirus = undefined;
        if (cell.frostHp) cell.frostHp = undefined;
      }
    }
  }
  state.patrollingBumper = null;
  state.shiftEffect = null;
  state.conveyorDir = undefined;
  state.ceilingLockRows = 0;
  state.risingTideRows = 0;
  state.beatChargeAccum = 0;
}

export function resizeBoardSafely(
  state: BoardState,
  targetCols: number,
  targetRows: number,
  animateBricks: boolean = true
): boolean {
  const oldRows = state.grid.length;
  const oldCols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const newCols = Math.max(8, targetCols);
  const newRows = Math.max(8, targetRows);

  if (oldCols === newCols && oldRows === newRows) {
    return false;
  }

  const newGrid = createEmptyGrid(newCols, newRows);
  const centerShift = Math.floor((newCols - oldCols) / 2);
  const newSpawnX = getSpawnColForWidth(newCols);
  const isSpawnCol = (c: number) => c === newSpawnX || c === newSpawnX + 1;

  const colWriteRow = Array<number>(newCols).fill(newRows - 1);
  const overflowPool: Array<{ cell: Cell; oldC: number; oldR: number; side: -1 | 1 }> = [];

  for (let oldC = 0; oldC < oldCols; oldC++) {
    const dstC = oldC + centerShift;
    const side: -1 | 1 = oldC < oldCols / 2 ? -1 : 1;
    const colEntries: Array<{ cell: Cell; oldR: number }> = [];
    for (let oldR = oldRows - 1; oldR >= 0; oldR--) {
      const cell = state.grid[oldR][oldC];
      if (cell && !cell.isObstacle) {
        colEntries.push({
          cell: {
            ...cell,
            pendingClear: false,
            sweptCol: false,
            fallOffset: 0,
            animOffsetX: 0,
            animOffsetY: 0,
          },
          oldR,
        });
      }
    }

    if (dstC < 0 || dstC >= newCols) {
      for (const entry of colEntries) {
        overflowPool.push({ cell: entry.cell, oldC, oldR: entry.oldR, side });
      }
      continue;
    }

    const minTopRow = isSpawnCol(dstC) ? 3 : 1;
    for (const entry of colEntries) {
      if (colWriteRow[dstC] >= minTopRow) {
        const dstR = colWriteRow[dstC]--;
        if (animateBricks) {
          entry.cell.animOffsetX = oldC - dstC;
          entry.cell.animOffsetY = Math.max(0.8, (entry.oldR - dstR) * 0.35 + 0.6);
          entry.cell.landFlash = 0.35;
        }
        newGrid[dstR][dstC] = entry.cell;
      } else {
        overflowPool.push({ cell: entry.cell, oldC, oldR: entry.oldR, side });
      }
    }
  }

  for (const item of overflowPool) {
    let chosenCol = -1;
    let bestWriteRow = -1;
    for (let offset = 0; offset < newCols; offset++) {
      const c = item.side === -1 ? offset : newCols - 1 - offset;
      if (isSpawnCol(c)) continue;
      if (colWriteRow[c] >= 1 && colWriteRow[c] > bestWriteRow) {
        bestWriteRow = colWriteRow[c];
        chosenCol = c;
      }
    }
    if (chosenCol < 0) {
      for (let c = 0; c < newCols; c++) {
        if (colWriteRow[c] >= 1 && colWriteRow[c] > bestWriteRow) {
          bestWriteRow = colWriteRow[c];
          chosenCol = c;
        }
      }
    }
    if (chosenCol >= 0) {
      const dstR = colWriteRow[chosenCol]--;
      if (animateBricks) {
        item.cell.animOffsetX = item.oldC - chosenCol;
        item.cell.animOffsetY = 1.4;
        item.cell.landFlash = 0.45;
      }
      newGrid[dstR][chosenCol] = item.cell;
    }
  }

  state.grid = newGrid;
  state.cols = newCols;
  state.rows = newRows;
  state.orientation = newCols >= newRows ? 'landscape' : 'portrait';
  state.isGameOver = false;

  const maxEachSide = Math.max(0, Math.floor((newCols - 6) / 2));
  state.lockedColumnsLeft = Math.min(state.lockedColumnsLeft, maxEachSide);
  state.lockedColumnsRight = Math.min(state.lockedColumnsRight, maxEachSide);

  stabilizeActivePieceAfterShift(state, animateBricks);
  return true;
}

function stabilizeActivePieceAfterShift(
  state: BoardState,
  animateBricks: boolean
): void {
  const cols = state.cols;
  const rows = state.rows;
  const dir = state.gravityDirection ?? 'down';

  if (state.activePiece) {
    const dim = getPieceDimensions(state.activePiece);
    const pieceCols = Math.max(1, dim.cols);
    const pieceRows = Math.max(1, dim.rows);
    const initPos = getPieceInitialPos(state, state.activePiece);

    if (dir === 'right') {
      const clampedY = Math.max(0, Math.min(rows - pieceRows, state.activePiece.y));
      let safeX = Math.min(state.activePiece.x, 0);
      for (let c = 0; c < cols; c++) {
        let occupied = false;
        for (let py = 0; py < pieceRows; py++) {
          if (clampedY + py < rows && state.grid[clampedY + py][c] !== null) {
            occupied = true;
            break;
          }
        }
        if (occupied) {
          safeX = Math.min(safeX, c - pieceCols - 1);
          break;
        }
      }
      state.activePiece = {
        ...state.activePiece,
        x: Math.max(initPos.x, Math.min(0, safeX)),
        y: clampedY,
      };
    } else if (dir === 'left') {
      const clampedY = Math.max(0, Math.min(rows - pieceRows, state.activePiece.y));
      let safeX = Math.max(state.activePiece.x, cols - pieceCols);
      for (let c = cols - 1; c >= 0; c--) {
        let occupied = false;
        for (let py = 0; py < pieceRows; py++) {
          if (clampedY + py < rows && state.grid[clampedY + py][c] !== null) {
            occupied = true;
            break;
          }
        }
        if (occupied) {
          safeX = Math.max(safeX, c + 1);
          break;
        }
      }
      state.activePiece = {
        ...state.activePiece,
        x: Math.min(initPos.x, Math.max(cols - pieceCols, safeX)),
        y: clampedY,
      };
    } else if (dir === 'up') {
      const minPlayCol = state.lockedColumnsLeft;
      const maxPlayCol = Math.max(minPlayCol, cols - pieceCols - state.lockedColumnsRight);
      const clampedX = Math.max(minPlayCol, Math.min(maxPlayCol, state.activePiece.x));
      let safeY = Math.max(state.activePiece.y, rows - pieceRows);
      for (let r = rows - 1; r >= 0; r--) {
        let occupied = false;
        for (let px = 0; px < pieceCols; px++) {
          if (clampedX + px < cols && state.grid[r][clampedX + px] !== null) {
            occupied = true;
            break;
          }
        }
        if (occupied) {
          safeY = Math.max(safeY, r + 1);
          break;
        }
      }
      state.activePiece = {
        ...state.activePiece,
        x: clampedX,
        y: Math.min(initPos.y, Math.max(rows - pieceRows, safeY)),
      };
    } else {
      const minPlayCol = state.lockedColumnsLeft;
      const maxPlayCol = Math.max(minPlayCol, cols - pieceCols - state.lockedColumnsRight);
      const clampedX = Math.max(minPlayCol, Math.min(maxPlayCol, state.activePiece.x));
      let safeY = Math.min(state.activePiece.y, 0);
      for (let r = 0; r < rows; r++) {
        let occupiedInFootprint = false;
        for (let px = 0; px < pieceCols; px++) {
          if (clampedX + px < cols && state.grid[r][clampedX + px] !== null) {
            occupiedInFootprint = true;
            break;
          }
        }
        if (occupiedInFootprint) {
          safeY = Math.min(safeY, r - pieceRows - 1);
          break;
        }
      }
      state.activePiece = {
        ...state.activePiece,
        x: clampedX,
        y: Math.max(initPos.y, Math.min(0, safeY)),
      };
    }

    state.spawnTimer = 0;
    state.gravityAccum = 0;
    state.lockTimer = 0;
    state.lockResetCount = 0;
    state.orientationGraceTimer = animateBricks ? 0.95 : 0;
  }

  state.nextQueue = state.nextQueue.map((p) => ({
    ...p,
    ...getPieceInitialPos(state, p),
  }));
}

function rescueDisplacedCells(
  grid: (Cell | null)[][],
  displaced: Cell[],
  forbiddenCols?: Set<number>
): void {
  if (displaced.length === 0) return;
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  const spawnX = getSpawnColForWidth(cols);

  for (const cell of displaced) {
    let placed = false;
    let bestC = -1;
    let bestR = -1;
    for (let c = 0; c < cols; c++) {
      if (forbiddenCols?.has(c)) continue;
      const minTop = c === spawnX || c === spawnX + 1 ? 3 : 1;
      for (let r = rows - 1; r >= minTop; r--) {
        if (grid[r][c] === null) {
          if (r > bestR) {
            bestR = r;
            bestC = c;
          }
          break;
        }
      }
    }
    if (bestC >= 0 && bestR >= 0) {
      grid[bestR][bestC] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        landFlash: 0.45,
      };
      placed = true;
    }
    if (!placed) {
      for (let r = 1; r < rows && !placed; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] === null) {
            grid[r][c] = { ...cell, pendingClear: false, sweptCol: false };
            placed = true;
            break;
          }
        }
      }
    }
  }
}

function placeColumnShiftUp(
  grid: (Cell | null)[][],
  col: number,
  liftBy: number,
  obstacleRowsFromBottom: number,
  style: ObstacleVisualStyle,
  displacedOut: Cell[],
  animateBricks: boolean
): void {
  const rows = grid.length;
  const existing: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    const cell = grid[r][col];
    if (cell && !cell.isObstacle) {
      existing.push(cell);
    }
    grid[r][col] = null;
  }

  for (let k = 0; k < obstacleRowsFromBottom && rows - 1 - k >= 0; k++) {
    grid[rows - 1 - k][col] = makeObstacleCell(style, true);
  }

  const lowestAvail = rows - 1 - obstacleRowsFromBottom;
  let writeRow = lowestAvail;
  for (let i = existing.length - 1; i >= 0; i--) {
    const cell = existing[i];
    if (writeRow >= 1) {
      grid[writeRow][col] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        animOffsetY: animateBricks ? Math.max(0.4, liftBy * 0.65) : 0,
        landFlash: animateBricks ? 0.35 : 0,
      };
      writeRow--;
    } else {
      displacedOut.push(cell);
    }
  }
}

function applySplitCanyon(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const leftMid = Math.floor(cols / 2) - 1;
  const rightMid = leftMid + 1;
  const newGrid = createEmptyGrid(cols, rows);
  const displaced: Cell[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      if (c <= leftMid) {
        const targetC = c - 1;
        if (targetC >= 0) {
          newGrid[r][targetC] = {
            ...cell,
            animOffsetX: animateBricks ? 1 : 0,
            landFlash: animateBricks ? 0.4 : 0,
          };
        } else {
          displaced.push(cell);
        }
      } else {
        const targetC = c + 1;
        if (targetC < cols) {
          newGrid[r][targetC] = {
            ...cell,
            animOffsetX: animateBricks ? -1 : 0,
            landFlash: animateBricks ? 0.4 : 0,
          };
        } else {
          displaced.push(cell);
        }
      }
    }
  }

  const startRow = Math.min(2, Math.max(0, rows - 4));
  for (let r = startRow; r < rows; r++) {
    newGrid[r][leftMid] = makeObstacleCell('chasm', true);
    newGrid[r][rightMid] = makeObstacleCell('chasm', true);
  }

  rescueDisplacedCells(newGrid, displaced, new Set([leftMid, rightMid]));
  state.grid = newGrid;
  settleBoard(state.grid);
}

function applyHourglassFunnel(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const rows = state.rows;
  const cols = state.cols;
  const useHourglass = rng() < 0.5;
  const wallCoords: Array<[number, number]> = [];

  if (useHourglass) {
    const midTop = Math.max(2, Math.floor(rows * 0.25));
    const midBot = Math.min(rows - 2, Math.floor(rows * 0.72));
    const innerTop = Math.max(midTop + 1, Math.floor(rows * 0.4));
    const innerBot = Math.min(midBot - 1, Math.floor(rows * 0.58));
    for (let r = midTop; r <= midBot; r++) {
      wallCoords.push([r, 0], [r, cols - 1]);
      if (r >= innerTop && r <= innerBot && cols >= 10) {
        wallCoords.push([r, 1], [r, cols - 2]);
      }
    }
  } else {
    const outerStart = Math.max(3, Math.floor(rows * 0.5));
    const innerStart = Math.max(outerStart + 1, rows - 2);
    for (let r = outerStart; r < rows; r++) {
      wallCoords.push([r, 0], [r, cols - 1]);
      if (r >= innerStart && cols >= 10) {
        wallCoords.push([r, 1], [r, cols - 2]);
      }
    }
  }

  const blockedCols = new Set<number>([0, 1, cols - 2, cols - 1]);
  const displaced: Cell[] = [];
  for (const [r, c] of wallCoords) {
    const existing = state.grid[r][c];
    if (existing && !existing.isObstacle) {
      displaced.push(existing);
    }
    const obstacle = makeObstacleCell('stone', true);
    obstacle.landFlash = animateBricks ? 0.65 : 0;
    state.grid[r][c] = obstacle;
  }

  rescueDisplacedCells(state.grid, displaced, blockedCols);
  settleBoard(state.grid);
}

function applyTwinElevators(state: BoardState, animateBricks: boolean): void {
  const nominal = getNominalBoardDims(state);
  const targetRows = nominal.rows + 1;
  resizeBoardSafely(state, nominal.cols, targetRows, animateBricks);

  const cols = state.cols;
  const half = Math.floor(cols / 2);
  const displaced: Cell[] = [];

  for (let c = 0; c < half; c++) {
    placeColumnShiftUp(state.grid, c, 2, 2, 'stone', displaced, animateBricks);
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyRollingWaveFloor(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const cols = state.cols;
  const phaseOffset = rng() * Math.PI * 2;
  const displaced: Cell[] = [];

  for (let c = 0; c < cols; c++) {
    const angle = (c / Math.max(1, cols - 1)) * Math.PI * 2 + phaseOffset;
    const waveH = Math.max(0, Math.min(2, Math.round(1 + Math.sin(angle))));
    if (waveH > 0) {
      placeColumnShiftUp(
        state.grid,
        c,
        waveH,
        waveH,
        'stone',
        displaced,
        animateBricks
      );
    }
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyOctagonCutoffs(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, 1],
    [1, 0],
    [0, cols - 1],
    [0, cols - 2],
    [1, cols - 1],
    [rows - 1, 0],
    [rows - 1, 1],
    [rows - 2, 0],
    [rows - 1, cols - 1],
    [rows - 1, cols - 2],
    [rows - 2, cols - 1],
  ];

  const displaced: Cell[] = [];
  for (const [r, c] of corners) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    const existing = state.grid[r][c];
    if (existing && !existing.isObstacle) {
      displaced.push(existing);
    }
    const stone = makeObstacleCell('stone', true);
    stone.landFlash = animateBricks ? 0.65 : 0;
    state.grid[r][c] = stone;
  }
  rescueDisplacedCells(
    state.grid,
    displaced,
    new Set([0, 1, cols - 2, cols - 1])
  );
  settleBoard(state.grid);
}

function applyFloatingShelf(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const shelfRow = Math.max(4, Math.min(rows - 3, Math.floor(rows * 0.5)));
  const shelfWidth = cols >= 13 ? 6 : 4;
  const startC = Math.max(1, Math.floor((cols - shelfWidth) / 2));
  const endC = Math.min(cols - 2, startC + shelfWidth - 1);

  const displaced: Cell[] = [];
  for (let c = startC; c <= endC; c++) {
    const existing = state.grid[shelfRow][c];
    if (existing && !existing.isObstacle) {
      if (shelfRow - 1 >= 1 && state.grid[shelfRow - 1][c] === null) {
        state.grid[shelfRow - 1][c] = {
          ...existing,
          animOffsetY: animateBricks ? 0.6 : 0,
        };
      } else {
        displaced.push(existing);
      }
    }
    const girder = makeObstacleCell('girder', true);
    girder.landFlash = animateBricks ? 0.7 : 0;
    state.grid[shelfRow][c] = girder;
  }

  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyCastleBattlements(state: BoardState, animateBricks: boolean): void {
  const cols = state.cols;
  const displaced: Cell[] = [];
  for (let c = 1; c < cols - 1; c += 3) {
    placeColumnShiftUp(state.grid, c, 2, 2, 'stone', displaced, animateBricks);
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyPatrollingBumper(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const by = Math.max(4, Math.min(rows - 4, Math.floor(rows * 0.44)));
  const bx = Math.max(2, Math.floor((cols - 2) / 2));
  const minX = Math.max(1, bx - 2);
  const maxX = Math.min(cols - 3, bx + 2);

  const displaced: Cell[] = [];
  for (let r = by; r < by + 2; r++) {
    for (let c = bx; c < bx + 2; c++) {
      const existing = state.grid[r][c];
      if (existing && !existing.isObstacle) {
        displaced.push(existing);
      }
      const bCell = makeObstacleCell('bumper', true);
      bCell.landFlash = animateBricks ? 0.75 : 0;
      state.grid[r][c] = bCell;
    }
  }

  const bumper: PatrollingBumperState = {
    x: bx,
    y: by,
    width: 2,
    height: 2,
    minX,
    maxX,
    dir: 1,
    beatAccum: 0,
  };
  state.patrollingBumper = bumper;

  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyCornerEdgeBlock(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const rows = state.rows;
  const cols = state.cols;
  const blockW = Math.min(4, cols >= 12 ? 4 : 3);
  const blockH = Math.min(4, Math.max(2, rows - 5));
  const useRight = rng() < 0.5;
  const startC = useRight ? cols - blockW : 0;
  const endC = startC + blockW - 1;
  const displaced: Cell[] = [];
  const forbiddenCols = new Set<number>();

  for (let c = startC; c <= endC; c++) {
    forbiddenCols.add(c);
    placeColumnShiftUp(state.grid, c, blockH, blockH, 'stone', displaced, animateBricks);
  }

  rescueDisplacedCells(state.grid, displaced, forbiddenCols);
  settleBoard(state.grid);
}

function applyBottomEdgeBlock(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const rows = state.rows;
  const cols = state.cols;
  const spawnX = getSpawnColForWidth(cols, 2);
  const blockW = Math.min(4, cols >= 13 ? 4 : 3);
  const blockH = Math.min(3, Math.max(2, rows - 5));
  const useRightSide = rng() < 0.5;
  const startC = useRightSide
    ? Math.min(cols - blockW - 1, Math.max(0, spawnX + 3))
    : Math.max(1, spawnX - blockW - 1);
  const endC = Math.min(cols - 1, startC + blockW - 1);

  const displaced: Cell[] = [];
  const forbiddenCols = new Set<number>();
  for (let c = startC; c <= endC; c++) {
    forbiddenCols.add(c);
    placeColumnShiftUp(state.grid, c, blockH, blockH, 'stone', displaced, animateBricks);
  }

  rescueDisplacedCells(state.grid, displaced, forbiddenCols);
  settleBoard(state.grid);
}

function applySideEdgeLedge(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const rows = state.rows;
  const cols = state.cols;
  const wallCols = cols >= 12 ? 3 : 2;
  const maxH = Math.min(4, Math.max(2, rows - 5));
  const useRightWall = rng() < 0.5;
  const displaced: Cell[] = [];
  const forbiddenCols = new Set<number>();

  for (let step = 0; step < wallCols; step++) {
    const c = useRightWall ? cols - 1 - step : step;
    const colH = Math.max(2, maxH - step);
    forbiddenCols.add(c);
    placeColumnShiftUp(state.grid, c, colH, colH, 'stone', displaced, animateBricks);
  }

  rescueDisplacedCells(state.grid, displaced, forbiddenCols);
  settleBoard(state.grid);
}

function convertColor2CellsToBinary(state: BoardState, animateBricks: boolean): void {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle && cell.color === 2) {
        cell.color = (r + c) % 2 === 0 ? 0 : 1;
        cell.landFlash = animateBricks ? 0.5 : 0;
      }
    }
  }
}

function applyThreeColorMode(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  state.colorCount = 3;
  state.pieceShapeMode = 'standard_2x2';

  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  const looseCells: Cell[] = [];
  const allPlayerCells: Cell[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      allPlayerCells.push(cell);
      if (!cell.inSquare) {
        looseCells.push(cell);
      }
    }
  }

  const targetPool = looseCells.length > 0 ? looseCells : allPlayerCells;
  if (targetPool.length > 0) {
    let converted = 0;
    for (const cell of targetPool) {
      if (rng() < 0.28) {
        cell.color = 2;
        cell.landFlash = animateBricks ? 0.85 : 0;
        converted++;
      }
    }
    if (converted === 0) {
      const pick = targetPool[Math.floor(rng() * targetPool.length)];
      pick.color = 2;
      pick.landFlash = animateBricks ? 0.85 : 0;
    }
  }
}

function applyInsideOutSwap(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const half = Math.floor(cols / 2);
  const q = Math.max(1, Math.floor(half / 2));
  const colMapping = Array.from({ length: cols }, (_, c) => c);

  for (let i = 0; i < q; i++) {
    const outerL = i;
    const innerL = half - q + i;
    colMapping[outerL] = innerL;
    colMapping[innerL] = outerL;

    const innerR = half + i;
    const outerR = cols - q + i;
    colMapping[innerR] = outerR;
    colMapping[outerR] = innerR;
  }

  const newGrid = createEmptyGrid(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const dstC = colMapping[c];
      newGrid[r][dstC] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        animOffsetX: animateBricks ? c - dstC : 0,
        landFlash: animateBricks ? 0.45 : 0,
      };
    }
  }

  state.grid = newGrid;
  settleBoard(state.grid);
}

function applySawtoothShear(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const newGrid = createEmptyGrid(cols, rows);
  const displaced: Cell[] = [];
  const startWallRow = Math.min(2, Math.max(0, rows - 4));

  for (let r = 0; r < rows; r++) {
    const dir = r % 2 === 0 ? 1 : -1;
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const dstC = c + dir;
      if (dstC >= 0 && dstC < cols) {
        newGrid[r][dstC] = {
          ...cell,
          pendingClear: false,
          sweptCol: false,
          animOffsetX: animateBricks ? -dir : 0,
          landFlash: animateBricks ? 0.35 : 0,
        };
      } else {
        displaced.push(cell);
      }
    }

    if (r >= startWallRow) {
      const toothCol = dir === 1 ? 0 : cols - 1;
      const existing = newGrid[r][toothCol];
      if (existing && !existing.isObstacle) {
        displaced.push(existing);
      }
      newGrid[r][toothCol] = makeObstacleCell('sawtooth', true);
    }
  }

  rescueDisplacedCells(newGrid, displaced, new Set([0, cols - 1]));
  state.grid = newGrid;
  settleBoard(state.grid);
}

function applyHorizonShear(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  let topOccupied = rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (state.grid[r][c] && !state.grid[r][c]!.isObstacle) {
        topOccupied = r;
        break;
      }
    }
    if (topOccupied < rows) break;
  }

  const faultRow =
    topOccupied < rows
      ? Math.max(2, Math.min(rows - 2, Math.floor((topOccupied + rows) / 2)))
      : Math.floor(rows / 2);

  const newGrid = createEmptyGrid(cols, rows);
  for (let r = 0; r < rows; r++) {
    const shift = r < faultRow ? 2 : -2;
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const dstC = ((c + shift) % cols + cols) % cols;
      newGrid[r][dstC] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        animOffsetX: animateBricks ? -shift : 0,
        landFlash: animateBricks ? 0.45 : 0,
      };
    }
  }

  state.grid = newGrid;
  settleBoard(state.grid);
  state.shiftEffect = {
    type: 'horizon_shear',
    life: 1.5,
    maxLife: 1.5,
    faultRow,
  };
}

function applyZipperMerge(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;

  let topOccupied = rows;
  for (let r = 0; r < rows; r++) {
    if (state.grid[r].some((cell) => cell !== null && !cell.isObstacle)) {
      topOccupied = r;
      break;
    }
  }

  if (topOccupied >= rows - 1) {
    return;
  }

  const bandRows: Array<Array<Cell | null>> = [];
  for (let r = topOccupied; r < rows; r++) {
    bandRows.push(
      state.grid[r].map((c) => (c && !c.isObstacle ? c : null))
    );
  }

  const mid = Math.floor(bandRows.length / 2);
  const topHalf = bandRows.slice(0, mid);
  const bottomHalf = bandRows.slice(mid);
  const interleaved: Array<{ rowCells: Array<Cell | null>; srcOffset: number }> = [];

  const maxLen = Math.max(topHalf.length, bottomHalf.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < bottomHalf.length) {
      interleaved.push({
        rowCells: bottomHalf[i],
        srcOffset: topOccupied + mid + i,
      });
    }
    if (i < topHalf.length) {
      interleaved.push({
        rowCells: topHalf[i],
        srcOffset: topOccupied + i,
      });
    }
  }

  const newGrid = createEmptyGrid(cols, rows);
  for (let i = 0; i < interleaved.length; i++) {
    const dstR = topOccupied + i;
    if (dstR >= rows) break;
    const { rowCells, srcOffset } = interleaved[i];
    for (let c = 0; c < cols; c++) {
      const cell = rowCells[c];
      if (!cell) continue;
      newGrid[dstR][c] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        animOffsetY: animateBricks ? srcOffset - dstR : 0,
        landFlash: animateBricks ? 0.45 : 0,
      };
    }
  }

  state.grid = newGrid;
  settleBoard(state.grid);
}

function applyLineColorShift(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): void {
  const rows = state.rows;
  const cols = state.cols;

  type CandidateLine = {
    coords: Array<{ r: number; c: number }>;
    colorsPresent: number;
  };
  const candidates: CandidateLine[] = [];
  const countColors = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);

  for (let r = 0; r < rows; r++) {
    const coords: Array<{ r: number; c: number }> = [];
    let colorMask = 0;
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle) {
        coords.push({ r, c });
        colorMask |= 1 << cell.color;
      }
    }
    if (coords.length >= 2) {
      candidates.push({ coords, colorsPresent: countColors(colorMask) });
    }
  }

  for (let c = 0; c < cols; c++) {
    const coords: Array<{ r: number; c: number }> = [];
    let colorMask = 0;
    for (let r = 0; r < rows; r++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle) {
        coords.push({ r, c });
        colorMask |= 1 << cell.color;
      }
    }
    if (coords.length >= 2) {
      candidates.push({ coords, colorsPresent: countColors(colorMask) });
    }
  }

  for (let startC = -(rows - 1); startC < cols; startC++) {
    const downRight: Array<{ r: number; c: number }> = [];
    let maskDR = 0;
    for (let r = 0; r < rows; r++) {
      const c = startC + r;
      if (c >= 0 && c < cols) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          downRight.push({ r, c });
          maskDR |= 1 << cell.color;
        }
      }
    }
    if (downRight.length >= 2) {
      candidates.push({ coords: downRight, colorsPresent: countColors(maskDR) });
    }
  }
  for (let startC = 0; startC < cols + rows - 1; startC++) {
    const downLeft: Array<{ r: number; c: number }> = [];
    let maskDL = 0;
    for (let r = 0; r < rows; r++) {
      const c = startC - r;
      if (c >= 0 && c < cols) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          downLeft.push({ r, c });
          maskDL |= 1 << cell.color;
        }
      }
    }
    if (downLeft.length >= 2) {
      candidates.push({ coords: downLeft, colorsPresent: countColors(maskDL) });
    }
  }

  if (candidates.length === 0) {
    const fallbackCoords: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          fallbackCoords.push({ r, c });
        }
      }
    }
    if (fallbackCoords.length === 0) return;
    candidates.push({ coords: fallbackCoords, colorsPresent: 1 });
  }

  const mixed = candidates.filter((cand) => cand.colorsPresent > 1);
  const pool = mixed.length > 0 ? mixed : candidates;
  const chosen = pool[Math.floor(rng() * pool.length)];

  let count0 = 0;
  let count1 = 0;
  for (const { r, c } of chosen.coords) {
    const cell = state.grid[r][c];
    if (cell) {
      if (cell.color === 0) count0++;
      else count1++;
    }
  }
  const targetColor: CellColor =
    count0 === count1 ? (rng() < 0.5 ? 0 : 1) : count0 > count1 ? 0 : 1;

  for (const { r, c } of chosen.coords) {
    const cell = state.grid[r][c];
    if (cell && !cell.isObstacle) {
      cell.color = targetColor;
      cell.landFlash = animateBricks ? 0.9 : 0;
    }
  }

  state.shiftEffect = {
    type: 'line_color_shift',
    life: 1.25,
    maxLife: 1.25,
    lineCells: chosen.coords,
    lineColor: targetColor,
  };
}

function applyFlowDirectionShift(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): { direction: GravityDirection; label: string } {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  const candidates: GravityDirection[] = (['right', 'left', 'up'] as GravityDirection[]).filter(
    (d) => d !== state.gravityDirection
  );
  const nextDir = candidates[Math.floor(rng() * candidates.length)] ?? 'right';

  state.gravityDirection = nextDir;
  settleBoardForDirection(state.grid, nextDir, animateBricks);

  const marginDepth = 3;
  const overflow: Cell[] = [];
  if (nextDir === 'right') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < Math.min(marginDepth, cols); c++) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          overflow.push(cell);
          state.grid[r][c] = null;
        }
      }
    }
    for (const cell of overflow) {
      let bestC = -1;
      let bestR = -1;
      for (let r = 0; r < rows; r++) {
        for (let c = cols - 1; c >= marginDepth; c--) {
          if (state.grid[r][c] === null) {
            if (c > bestC) {
              bestC = c;
              bestR = r;
            }
            break;
          }
        }
      }
      if (bestC >= 0 && bestR >= 0) {
        state.grid[bestR][bestC] = { ...cell, landFlash: animateBricks ? 0.55 : 0 };
      }
    }
  } else if (nextDir === 'left') {
    const startSafeCol = Math.max(0, cols - marginDepth);
    for (let r = 0; r < rows; r++) {
      for (let c = startSafeCol; c < cols; c++) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          overflow.push(cell);
          state.grid[r][c] = null;
        }
      }
    }
    for (const cell of overflow) {
      let bestC = cols;
      let bestR = -1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < startSafeCol; c++) {
          if (state.grid[r][c] === null) {
            if (c < bestC) {
              bestC = c;
              bestR = r;
            }
            break;
          }
        }
      }
      if (bestC < cols && bestR >= 0) {
        state.grid[bestR][bestC] = { ...cell, landFlash: animateBricks ? 0.55 : 0 };
      }
    }
  } else if (nextDir === 'up') {
    const startSafeRow = Math.max(0, rows - marginDepth);
    for (let r = startSafeRow; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.grid[r][c];
        if (cell && !cell.isObstacle) {
          overflow.push(cell);
          state.grid[r][c] = null;
        }
      }
    }
    for (const cell of overflow) {
      let bestR = rows;
      let bestC = -1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < startSafeRow; r++) {
          if (state.grid[r][c] === null) {
            if (r < bestR) {
              bestR = r;
              bestC = c;
            }
            break;
          }
        }
      }
      if (bestR < rows && bestC >= 0) {
        state.grid[bestR][bestC] = { ...cell, landFlash: animateBricks ? 0.55 : 0 };
      }
    }
  }

  settleBoardForDirection(state.grid, nextDir, false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle && animateBricks) {
        cell.landFlash = Math.max(cell.landFlash, 0.42);
      }
    }
  }

  state.shiftEffect = {
    type: 'flow_direction',
    life: 1.5,
    maxLife: 1.5,
  };

  const label =
    nextDir === 'right'
      ? 'TILES FROM LEFT →'
      : nextDir === 'left'
      ? '← TILES FROM RIGHT'
      : '↑ TILES FROM BOTTOM';
  return { direction: nextDir, label };
}

function applyCyclotronFlow(state: BoardState, animateBricks: boolean): void {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  const nextDir: GravityDirection = 'right';
  state.gravityDirection = nextDir;
  settleBoardForDirection(state.grid, nextDir, animateBricks);

  const marginDepth = 3;
  const overflow: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.min(marginDepth, cols); c++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle) {
        overflow.push(cell);
        state.grid[r][c] = null;
      }
    }
  }
  for (const cell of overflow) {
    let bestC = -1;
    let bestR = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = cols - 1; c >= marginDepth; c--) {
        if (state.grid[r][c] === null) {
          if (c > bestC) {
            bestC = c;
            bestR = r;
          }
          break;
        }
      }
    }
    if (bestC >= 0 && bestR >= 0) {
      state.grid[bestR][bestC] = { ...cell, landFlash: animateBricks ? 0.55 : 0 };
    }
  }

  settleBoardForDirection(state.grid, nextDir, false);
  state.shiftEffect = {
    type: 'cyclotron_flow',
    life: 1.4,
    maxLife: 1.4,
  };
}

function applyStaircaseTerraces(state: BoardState, animateBricks: boolean): void {
  const cols = state.cols;
  const rows = state.rows;
  const maxStep = Math.min(3, Math.max(2, rows - 6));
  const wingSteps = cols >= 12 ? [maxStep, maxStep - 1, 1] : [maxStep - 1, 1];
  const displaced: Cell[] = [];

  for (let i = 0; i < wingSteps.length; i++) {
    const h = Math.max(1, wingSteps[i]);
    placeColumnShiftUp(state.grid, i, h, h, 'stone', displaced, animateBricks);
    placeColumnShiftUp(state.grid, cols - 1 - i, h, h, 'stone', displaced, animateBricks);
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyCenterSpire(state: BoardState, animateBricks: boolean): void {
  const cols = state.cols;
  const rows = state.rows;
  const midR = Math.floor(cols / 2);
  const midL = Math.max(0, midR - 1);
  const spireH = Math.min(3, Math.max(2, rows - 6));
  const displaced: Cell[] = [];

  placeColumnShiftUp(state.grid, midL, spireH, spireH, 'stone', displaced, animateBricks);
  if (midR !== midL) {
    placeColumnShiftUp(state.grid, midR, spireH, spireH, 'stone', displaced, animateBricks);
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyDomePedestal(state: BoardState, animateBricks: boolean): void {
  const cols = state.cols;
  const rows = state.rows;
  const mid = Math.floor(cols / 2);
  const outerH = 1;
  const innerH = Math.min(2, Math.max(1, rows - 6));
  const domeOffsets: Array<[number, number]> = [
    [mid - 2, outerH],
    [mid - 1, innerH],
    [mid, innerH],
    [mid + 1, outerH],
  ];
  const displaced: Cell[] = [];

  for (const [c, h] of domeOffsets) {
    if (c >= 0 && c < cols) {
      placeColumnShiftUp(state.grid, c, h, h, 'stone', displaced, animateBricks);
    }
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applySpringBounce(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const padCols =
    cols >= 13
      ? [2, Math.floor(cols / 2), cols - 3]
      : [1, cols - 2];
  const displaced: Cell[] = [];

  for (const c of padCols) {
    if (c < 0 || c >= cols) continue;
    const existing: Cell[] = [];
    for (let r = 0; r < rows; r++) {
      const cell = state.grid[r][c];
      if (cell && !cell.isObstacle) {
        existing.push(cell);
      }
      state.grid[r][c] = null;
    }
    const pad = makeObstacleCell('spring', true);
    pad.landFlash = animateBricks ? 0.8 : 0;
    state.grid[rows - 1][c] = pad;
    let writeRow = rows - 2;
    for (let i = existing.length - 1; i >= 0; i--) {
      if (writeRow >= 1) {
        state.grid[writeRow][c] = {
          ...existing[i],
          animOffsetY: animateBricks ? 0.65 : 0,
        };
        writeRow--;
      } else {
        displaced.push(existing[i]);
      }
    }
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyConveyorFloor(state: BoardState, rng: () => number): void {
  state.conveyorDir = rng() < 0.5 ? 1 : -1;
  state.shiftEffect = {
    type: 'conveyor_floor',
    life: 1.25,
    maxLife: 1.25,
  };
}

export function stepConveyorFloor(state: BoardState): boolean {
  if (state.activeShift !== 'conveyor_floor' || state.isGameOver) {
    return false;
  }
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  const bottomRow = rows - 1;
  const dir: -1 | 1 = state.conveyorDir === -1 ? -1 : 1;
  const minCol = state.lockedColumnsLeft;
  const maxCol = cols - 1 - state.lockedColumnsRight;
  if (bottomRow < 0 || maxCol - minCol < 1) return false;

  const rowSnap = state.grid[bottomRow].slice();
  let moved = false;
  const span = maxCol - minCol + 1;
  for (let c = minCol; c <= maxCol; c++) {
    const srcC = minCol + (((c - minCol - dir) % span + span) % span);
    const srcCell = rowSnap[srcC];
    if (srcCell && !srcCell.isObstacle) {
      state.grid[bottomRow][c] = {
        ...srcCell,
        animOffsetX: -dir,
        pendingClear: false,
        sweptCol: false,
      };
      moved = true;
    } else if (!rowSnap[c]?.isObstacle) {
      state.grid[bottomRow][c] = null;
    }
  }

  if (moved) {
    settleBoardForDirection(state.grid, state.gravityDirection, true);
    state.squares = detectBoardMarks(state.grid);
  }
  return moved;
}

function applyCrumbleBlocks(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const shelfRow = Math.max(3, Math.min(rows - 3, Math.floor(rows * 0.56)));
  const rawCols = cols >= 14 ? [1, 4, cols - 5, cols - 2] : [1, cols - 2];
  const uniqueCols = Array.from(new Set(rawCols.filter((c) => c >= 0 && c < cols)));
  const displaced: Cell[] = [];

  for (const c of uniqueCols) {
    const existing = state.grid[shelfRow][c];
    if (existing && !existing.isObstacle) {
      if (shelfRow - 1 >= 1 && state.grid[shelfRow - 1][c] === null) {
        state.grid[shelfRow - 1][c] = {
          ...existing,
          animOffsetY: animateBricks ? 0.6 : 0,
        };
      } else {
        displaced.push(existing);
      }
    }
    const crystal = makeObstacleCell('crumble', true);
    crystal.crumbleHp = 2;
    crystal.landFlash = animateBricks ? 0.85 : 0;
    state.grid[shelfRow][c] = crystal;
  }
  rescueDisplacedCells(state.grid, displaced);
  settleBoard(state.grid);
}

function applyMirrorFlip(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  const newGrid = createEmptyGrid(cols, rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const dstC = cols - 1 - c;
      newGrid[r][dstC] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        animOffsetX: animateBricks ? c - dstC : 0,
        landFlash: animateBricks ? 0.5 : 0,
      };
    }
  }
  state.grid = newGrid;
  settleBoard(state.grid);
  state.shiftEffect = {
    type: 'mirror_flip',
    life: 1.35,
    maxLife: 1.35,
    mirrorCol: cols / 2,
  };
}

function applyVortexSwirl(state: BoardState, animateBricks: boolean): void {
  const rows = state.rows;
  const cols = state.cols;
  let topR = rows;
  for (let r = 0; r < rows; r++) {
    if (state.grid[r].some((c) => c && !c.isObstacle)) {
      topR = r;
      break;
    }
  }
  if (topR >= rows - 1) {
    state.shiftEffect = {
      type: 'vortex_swirl',
      life: 1.35,
      maxLife: 1.35,
      swirlDir: 1,
    };
    return;
  }

  let rMin = topR;
  let rMax = rows - 1;
  let cMin = 0;
  let cMax = cols - 1;
  const newGrid = createEmptyGrid(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (state.grid[r][c]) {
        newGrid[r][c] = state.grid[r][c];
      }
    }
  }

  while (rMin < rMax && cMin < cMax) {
    const ring: Array<[number, number]> = [];
    for (let c = cMin; c <= cMax; c++) ring.push([rMin, c]);
    for (let r = rMin + 1; r <= rMax; r++) ring.push([r, cMax]);
    for (let c = cMax - 1; c >= cMin; c--) ring.push([rMax, c]);
    for (let r = rMax - 1; r > rMin; r--) ring.push([r, cMin]);

    const step = Math.max(2, Math.floor(ring.length / 4));
    const snap = ring.map(([r, c]) => state.grid[r][c]);
    for (let i = 0; i < ring.length; i++) {
      const [dstR, dstC] = ring[(i + step) % ring.length];
      const [srcR, srcC] = ring[i];
      const cell = snap[i];
      newGrid[dstR][dstC] = cell
        ? {
            ...cell,
            pendingClear: false,
            sweptCol: false,
            animOffsetX: animateBricks ? srcC - dstC : 0,
            animOffsetY: animateBricks ? srcR - dstR : 0,
            landFlash: animateBricks ? 0.5 : 0,
          }
        : null;
    }
    rMin++;
    rMax--;
    cMin++;
    cMax--;
  }

  state.grid = newGrid;
  settleBoard(state.grid);
  state.shiftEffect = {
    type: 'vortex_swirl',
    life: 1.4,
    maxLife: 1.4,
    swirlDir: 1,
  };
}

function applyBoardResizeShift(
  state: BoardState,
  animateBricks: boolean,
  rng: () => number
): { targetCols: number; targetRows: number } {
  const nominal = getNominalBoardDims(state);
  const minCols = Math.max(8, nominal.cols - 2);
  const maxCols = nominal.cols + 2;
  const minRows = Math.max(8, nominal.rows - 2);
  const maxRows = nominal.rows + 2;

  const candidates: Array<{ c: number; r: number }> = [];
  for (let dc = -2; dc <= 2; dc += 1) {
    for (let dr = -2; dr <= 2; dr += 1) {
      if (dc === 0 && dr === 0) continue;
      if (Math.abs(dc) === 1 && Math.abs(dr) === 1) continue;
      const nc = nominal.cols + dc;
      const nr = nominal.rows + dr;
      if (nc < minCols || nc > maxCols || nr < minRows || nr > maxRows) continue;
      if (nc === state.cols && nr === state.rows) continue;
      if (Math.abs(nc - state.cols) > 2 || Math.abs(nr - state.rows) > 2) continue;
      candidates.push({ c: nc, r: nr });
    }
  }

  const chosen =
    candidates.length > 0
      ? candidates[Math.floor(rng() * candidates.length)]
      : {
          c: state.cols === nominal.cols ? Math.min(maxCols, nominal.cols + 2) : nominal.cols,
          r: state.rows,
        };

  resizeBoardSafely(state, chosen.c, chosen.r, animateBricks);
  return { targetCols: state.cols, targetRows: state.rows };
}

export function pickStartShift(
  enabledShifts: ShiftType[],
  rng: () => number = Math.random,
  board?: BoardState
): ShiftType | null {
  const valid = enabledShifts.filter((s) => VALID_SHIFT_SET.has(s));
  if (valid.length === 0) return null;

  const usedOneTimeSet = new Set<ShiftType>(board?.shiftScheduler?.usedOneTimeShifts ?? []);
  let pool = valid.filter((s) => isShiftStartFriendly(s));
  if (pool.length === 0) {
    pool = valid;
  }

  const unusedOneTime = pool.filter((s) => !usedOneTimeSet.has(s));
  if (unusedOneTime.length > 0) {
    pool = unusedOneTime;
  }

  return pool[Math.floor(rng() * pool.length)];
}

export function pickNextShift(
  enabledShifts: ShiftType[],
  lastShift: ShiftType | null,
  rng: () => number = Math.random,
  board?: BoardState
): ShiftType | null {
  const valid = enabledShifts.filter((s) => VALID_SHIFT_SET.has(s));
  if (valid.length === 0) return null;

  let pool = valid;
  if (pool.length > 1 && lastShift !== null) {
    const withoutLast = pool.filter((s) => s !== lastShift);
    if (withoutLast.length > 0) pool = withoutLast;
  }

  let occupancy = 0;
  if (board) {
    const sched = board.shiftScheduler ?? createShiftSchedulerState();
    const freshTurnWindow = sched.stageTurnIndex >= 3;
    const obsCount = freshTurnWindow ? 0 : sched.obstaclesInCurrentTurn;
    const tileCount = freshTurnWindow ? 0 : sched.tileShiftsInCurrentTurn;
    const usedTileSet = new Set<ShiftType>(
      freshTurnWindow ? [] : sched.usedTileTypesInCurrentTurn
    );
    const usedOneTimeSet = new Set<ShiftType>(sched.usedOneTimeShifts);
    const turnsSinceTile = sched.turnsSinceTileShift ?? 1;

    let playerCount = 0;
    const totalCells = Math.max(1, board.rows * board.cols);
    for (let r = 0; r < board.grid.length; r++) {
      for (let c = 0; c < board.grid[r].length; c++) {
        const cell = board.grid[r][c];
        if (cell && !cell.isObstacle) playerCount++;
      }
    }
    occupancy = playerCount / totalCells;

    if (sched.turnsSinceRotation < 2 && pool.length > 1 && pool.includes('rotate_90')) {
      const nonRot = pool.filter((s) => s !== 'rotate_90');
      if (nonRot.length > 0) pool = nonRot;
    }

    const withoutOneTime = pool.filter((s) => !usedOneTimeSet.has(s));
    if (withoutOneTime.length > 0) {
      pool = withoutOneTime;
    }

    if (playerCount < 6) {
      const startFriendly = pool.filter((s) => isShiftStartFriendly(s));
      if (startFriendly.length > 0) {
        pool = startFriendly;
      }
    }

    if (obsCount >= 1) {
      const nonObstacles = pool.filter((s) => !OBSTACLE_SHIFT_SET.has(s));
      if (nonObstacles.length > 0) {
        pool = nonObstacles;
      }
    }

    if (tileCount >= 1) {
      const nonTiles = pool.filter((s) => !TILE_TYPE_SHIFT_SET.has(s));
      if (nonTiles.length > 0) {
        pool = nonTiles;
      }
    } else {
      const unusedTilePool = pool.filter(
        (s) => !TILE_TYPE_SHIFT_SET.has(s) || !usedTileSet.has(s)
      );
      if (unusedTilePool.length > 0) {
        pool = unusedTilePool;
      }
    }

    if (pool.length > 1 && lastShift !== null) {
      const withoutLast = pool.filter((s) => s !== lastShift);
      if (withoutLast.length > 0) pool = withoutLast;
    }

    const tileCandidates: ShiftType[] = [];
    const nonTileCandidates: ShiftType[] = [];
    let hasRotate90 = false;
    for (const s of pool) {
      if (s === 'rotate_90') hasRotate90 = true;
      if (TILE_TYPE_SHIFT_SET.has(s)) tileCandidates.push(s);
      else nonTileCandidates.push(s);
    }

    if (hasRotate90 && sched.turnsSinceRotation >= 4 && rng() < 0.45) {
      return 'rotate_90';
    }

    if (tileCount === 0 && turnsSinceTile >= 3 && tileCandidates.length > 0) {
      return tileCandidates[Math.floor(rng() * tileCandidates.length)];
    }

    if (tileCount === 0 && turnsSinceTile === 2 && tileCandidates.length > 0 && rng() < 0.72) {
      return tileCandidates[Math.floor(rng() * tileCandidates.length)];
    }

    if (nonTileCandidates.length > 0) {
      pool = nonTileCandidates;
    }

    if (playerCount < 2 && pool.length > 1 && pool.includes('line_color_shift')) {
      const nonLine = pool.filter((s) => s !== 'line_color_shift');
      if (nonLine.length > 0) pool = nonLine;
    }
  }

  let totalW = 0;
  const weights = new Float64Array(pool.length);
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    const pol = SHIFT_MAP.get(s)?.polarity ?? 'neutral';
    let w = 1;
    if (occupancy >= 0.52) {
      w = pol === 'boon' ? 3.5 : pol === 'neutral' ? 1.4 : 0.35;
    } else if (occupancy <= 0.28) {
      w = pol === 'bane' ? 2.2 : pol === 'neutral' ? 1.4 : 0.9;
    }
    if (s === 'rotate_90') w *= 0.5;
    weights[i] = w;
    totalW += w;
  }

  if (totalW > 0) {
    let roll = rng() * totalW;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
  }
  return pool[Math.floor(rng() * pool.length)];
}

export function getShiftDraftOptions(
  enabledShifts: ShiftType[],
  lastShift: ShiftType | null,
  rng: () => number = Math.random,
  board?: BoardState
): ShiftDraftOption[] {
  const first = pickNextShift(enabledShifts, lastShift, rng, board);
  if (!first) return [];

  const remainingEnabled = enabledShifts.filter((s) => s !== first);
  const second =
    remainingEnabled.length > 0
      ? pickNextShift(remainingEnabled, lastShift, rng, board)
      : null;

  const picked: ShiftType[] = second && second !== first ? [first, second] : [first];
  return picked.map((id) => {
    const def = SHIFT_MAP.get(id);
    return {
      id,
      name: def?.name ?? id,
      shortLabel: def?.shortLabel ?? id,
      polarity: def?.polarity ?? 'neutral',
      description: def?.description ?? '',
    };
  });
}

export interface ApplyShiftResult {
  applied: boolean;
  shiftType: ShiftType;
  label: string;
  didRotate90: boolean;
  rotateDir: 'cw' | 'ccw';
}

function recordShiftTurn(state: BoardState, shiftType: ShiftType): void {
  if (!state.shiftScheduler) {
    state.shiftScheduler = createShiftSchedulerState();
  }
  const sched = state.shiftScheduler;
  if (sched.stageTurnIndex >= 3) {
    sched.stageTurnIndex = 0;
    sched.obstaclesInCurrentTurn = 0;
    sched.tileShiftsInCurrentTurn = 0;
    sched.usedTileTypesInCurrentTurn = [];
  }
  sched.shiftTurnCount += 1;
  sched.stageTurnIndex += 1;
  if (shiftType === 'rotate_90') {
    sched.turnsSinceRotation = 0;
  } else {
    sched.turnsSinceRotation += 1;
  }
  if (OBSTACLE_SHIFT_SET.has(shiftType)) {
    sched.obstaclesInCurrentTurn += 1;
  }
  if (TILE_TYPE_SHIFT_SET.has(shiftType)) {
    sched.tileShiftsInCurrentTurn += 1;
    sched.turnsSinceTileShift = 0;
    if (!sched.usedTileTypesInCurrentTurn.includes(shiftType)) {
      sched.usedTileTypesInCurrentTurn.push(shiftType);
    }
  } else {
    sched.turnsSinceTileShift = (sched.turnsSinceTileShift ?? 0) + 1;
  }
  if (
    ONE_TIME_SHIFT_SET.has(shiftType) &&
    !sched.usedOneTimeShifts.includes(shiftType)
  ) {
    sched.usedOneTimeShifts.push(shiftType);
  }
}

export function applyBoardShift(
  state: BoardState,
  shiftType: ShiftType,
  options?: {
    animateBricks?: boolean;
    level?: number;
    chainFrequency?: number;
    rng?: () => number;
  }
): ApplyShiftResult {
  const animateBricks = options?.animateBricks !== false;
  const level = options?.level ?? 2;
  const chainFrequency = options?.chainFrequency ?? 0.05;
  const rng = options?.rng ?? Math.random;
  const rotDir: 'cw' | 'ccw' = level % 2 === 0 ? 'cw' : 'ccw';

  const prevShapeMode = state.pieceShapeMode ?? 'standard_2x2';
  const prevColorCount = state.colorCount ?? 2;
  const prevGravityDir: GravityDirection = state.gravityDirection ?? 'down';

  stripBoardObstacles(state);

  if (shiftType !== 'flow_direction' && shiftType !== 'cyclotron_flow' && prevGravityDir !== 'down') {
    state.gravityDirection = 'down';
    settleBoardForDirection(state.grid, 'down', animateBricks);
  }

  if (shiftType !== 'three_color_mode' && state.colorCount === 3) {
    state.colorCount = 2;
    convertColor2CellsToBinary(state, animateBricks);
  }

  const nextShapeMode: PieceShapeMode =
    shiftType === 'brick_2x1'
      ? 'domino_2x1'
      : shiftType === 'brick_3x1'
      ? 'trio_3x1'
      : shiftType === 'brick_3x2'
      ? 'rect_3x2'
      : shiftType === 'brick_tetromino'
      ? 'tetromino'
      : shiftType === 'brick_blocked'
      ? 'blocked_2x2'
      : shiftType === 'brick_l_trio'
      ? 'l_trio_2x2'
      : shiftType === 'prism_wild_bricks'
      ? 'prism_wild_2x2'
      : 'standard_2x2';
  state.pieceShapeMode = nextShapeMode;

  const syncQueueIfRulesChanged = () => {
    if (
      state.pieceShapeMode !== prevShapeMode ||
      state.colorCount !== prevColorCount ||
      (state.gravityDirection ?? 'down') !== prevGravityDir ||
      shiftType === 'three_color_mode' ||
      TILE_TYPE_SHIFT_SET.has(shiftType)
    ) {
      refreshQueueForBoardRules(state, chainFrequency, rng);
    }
  };

  if (shiftType === 'rotate_90') {
    const nominal = getNominalBoardDims(state);
    if (state.cols !== nominal.cols || state.rows !== nominal.rows) {
      resizeBoardSafely(state, nominal.cols, nominal.rows, false);
    }
    rotateBoard90(state, rotDir, animateBricks);
    syncQueueIfRulesChanged();
    recordShiftTurn(state, shiftType);
    return {
      applied: true,
      shiftType,
      label: `${state.cols}×${state.rows} ROTATED`,
      didRotate90: true,
      rotateDir: rotDir,
    };
  }

  if (shiftType === 'board_resize') {
    const nominal = getNominalBoardDims(state);
    if (
      state.activeShift !== 'board_resize' &&
      (state.cols !== nominal.cols || state.rows !== nominal.rows)
    ) {
      resizeBoardSafely(state, nominal.cols, nominal.rows, false);
    }
    applyBoardResizeShift(state, animateBricks, rng);
    state.activeShift = 'board_resize';
    state.squares = detectBoardMarks(state.grid);
    state.sweepState = createSweepState();
    syncQueueIfRulesChanged();
    recordShiftTurn(state, shiftType);
    return {
      applied: true,
      shiftType,
      label: `RESIZED ${state.cols}×${state.rows}`,
      didRotate90: false,
      rotateDir: rotDir,
    };
  }

  const nominal = getNominalBoardDims(state);
  if (
    shiftType !== 'twin_elevators' &&
    (state.cols !== nominal.cols || state.rows !== nominal.rows)
  ) {
    resizeBoardSafely(state, nominal.cols, nominal.rows, false);
  }

  if (shiftType !== 'stash_hold') {
    state.heldPiece = null;
    state.stashUsedThisTurn = false;
  }

  let customLabel: string | null = null;
  switch (shiftType) {
    case 'line_color_shift':
      applyLineColorShift(state, animateBricks, rng);
      break;
    case 'flow_direction': {
      const flowRes = applyFlowDirectionShift(state, animateBricks, rng);
      customLabel = flowRes.label;
      break;
    }
    case 'split_canyon':
      applySplitCanyon(state, animateBricks);
      break;
    case 'hourglass_funnel':
      applyHourglassFunnel(state, animateBricks, rng);
      break;
    case 'twin_elevators':
      applyTwinElevators(state, animateBricks);
      break;
    case 'rolling_wave_floor':
      applyRollingWaveFloor(state, animateBricks, rng);
      break;
    case 'octagon_cutoffs':
      applyOctagonCutoffs(state, animateBricks);
      break;
    case 'floating_shelf':
      applyFloatingShelf(state, animateBricks);
      break;
    case 'castle_battlements':
      applyCastleBattlements(state, animateBricks);
      break;
    case 'patrolling_bumper':
      applyPatrollingBumper(state, animateBricks);
      break;
    case 'corner_edge_block':
      applyCornerEdgeBlock(state, animateBricks, rng);
      break;
    case 'bottom_edge_block':
      applyBottomEdgeBlock(state, animateBricks, rng);
      break;
    case 'side_edge_ledge':
      applySideEdgeLedge(state, animateBricks, rng);
      break;
    case 'brick_2x1':
    case 'brick_3x1':
    case 'brick_3x2':
    case 'brick_tetromino':
    case 'brick_blocked':
      break;
    case 'three_color_mode':
      applyThreeColorMode(state, animateBricks, rng);
      break;
    case 'inside_out_swap':
      applyInsideOutSwap(state, animateBricks);
      break;
    case 'sawtooth_shear':
      applySawtoothShear(state, animateBricks);
      break;
    case 'horizon_shear':
      applyHorizonShear(state, animateBricks);
      break;
    case 'zipper_merge':
      applyZipperMerge(state, animateBricks);
      break;
    case 'cyclotron_flow':
      applyCyclotronFlow(state, animateBricks);
      break;
    case 'staircase_terraces':
      applyStaircaseTerraces(state, animateBricks);
      break;
    case 'center_spire':
      applyCenterSpire(state, animateBricks);
      break;
    case 'dome_pedestal':
      applyDomePedestal(state, animateBricks);
      break;
    case 'spring_bounce':
      applySpringBounce(state, animateBricks);
      break;
    case 'conveyor_floor':
      applyConveyorFloor(state, rng);
      break;
    case 'crumble_blocks':
      applyCrumbleBlocks(state, animateBricks);
      break;
    case 'mirror_flip':
      applyMirrorFlip(state, animateBricks);
      break;
    case 'vortex_swirl':
      applyVortexSwirl(state, animateBricks);
      break;
    case 'anchored_viruses': {
      const rows = state.grid.length;
      const cols = state.grid[0]?.length ?? state.cols;
      const midR0 = Math.max(3, Math.floor(rows * 0.35));
      const midR1 = Math.min(rows - 2, Math.floor(rows * 0.65));
      const candidateCols = [1, Math.floor(cols * 0.3), Math.floor(cols * 0.7), cols - 2];
      const colorCount = state.colorCount ?? 2;
      candidateCols.forEach((c, idx) => {
        if (c < 0 || c >= cols) return;
        const r = midR0 + (idx % Math.max(1, midR1 - midR0 + 1));
        if (state.grid[r][c] === null) {
          state.grid[r][c] = {
            id: allocCellId(),
            color: (idx % colorCount) as CellColor,
            isChain: false,
            isVirus: true,
            chainMarked: false,
            inSquare: false,
            pendingClear: false,
            sweptCol: false,
            fallOffset: 0,
            landFlash: animateBricks ? 0.8 : 0,
          };
        }
      });
      state.shiftEffect = { type: shiftType, life: 1.2, maxLife: 1.2 };
      break;
    }
    case 'frost_tiles': {
      const rows = state.grid.length;
      const cols = state.grid[0]?.length ?? state.cols;
      let frozen = 0;
      for (let c = 0; c < cols && frozen < 6; c++) {
        for (let r = 0; r < rows; r++) {
          const cell = state.grid[r][c];
          if (cell && !cell.isObstacle) {
            cell.frostHp = 2;
            cell.landFlash = animateBricks ? 0.75 : 0;
            frozen++;
            break;
          }
        }
      }
      state.shiftEffect = { type: shiftType, life: 1.2, maxLife: 1.2 };
      break;
    }
    case 'rising_tide':
      state.activeShift = 'rising_tide';
      state.risingTideRows = 0;
      stepRisingTideSweep(state, 0, rng);
      state.shiftEffect = { type: shiftType, life: 1.2, maxLife: 1.2 };
      break;
    case 'ceiling_press':
      state.activeShift = 'ceiling_press';
      state.ceilingLockRows = 0;
      stepCeilingPressSweep(state, 0);
      state.shiftEffect = { type: shiftType, life: 1.2, maxLife: 1.2 };
      break;
    case 'crash_gem':
    case 'double_time_sweep':
    case 'half_time_sweep':
    case 'lantern_sweep':
    case 'stash_hold':
    case 'metronome_charge':
    case 'portal_wrap':
    case 'reverse_sweep':
    case 'twin_sweep':
    case 'split_half_sweep':
    case 'diagonal_slant_sweep':
    case 'brick_l_trio':
    case 'chameleon_rotate':
    case 'prism_wild_bricks':
      state.shiftEffect = {
        type: shiftType,
        life: 1.2,
        maxLife: 1.2,
      };
      break;
  }

  state.activeShift = shiftType;
  if (shiftType === 'crash_gem') {
    refreshQueueForBoardRules(state, chainFrequency, rng);
  } else {
    syncQueueIfRulesChanged();
  }
  if ((state.gravityDirection ?? 'down') !== prevGravityDir && state.activePiece) {
    const newInit = getPieceInitialPos(state, state.activePiece);
    state.activePiece = {
      ...state.activePiece,
      x: newInit.x,
      y: newInit.y,
    };
  }
  state.squares = detectBoardMarks(state.grid);
  state.sweepState = createSweepState();
  state.isGameOver = false;
  stabilizeActivePieceAfterShift(state, animateBricks);
  recordShiftTurn(state, shiftType);

  return {
    applied: true,
    shiftType,
    label: customLabel ?? (SHIFT_MAP.get(shiftType)?.name ?? shiftType).toUpperCase(),
    didRotate90: false,
    rotateDir: rotDir,
  };
}

export function stepPatrollingBumper(state: BoardState): boolean {
  const b = state.patrollingBumper;
  if (!b || state.activeShift !== 'patrolling_bumper' || state.isGameOver) {
    return false;
  }

  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols;
  if (b.y < 0 || b.y + 1 >= rows || b.maxX <= b.minX) return false;

  let nextDir = b.dir;
  let nextX = b.x + nextDir;
  if (nextX < b.minX || nextX > b.maxX || nextX < 0 || nextX + 1 >= cols) {
    nextDir = nextDir === 1 ? -1 : 1;
    nextX = b.x + nextDir;
  }
  if (nextX < 0 || nextX + 1 >= cols) return false;

  if (state.activePiece) {
    const pLeft = state.activePiece.x;
    const pRight = state.activePiece.x + 1;
    const pTop = state.activePiece.y;
    const pBot = state.activePiece.y + 1;
    const hOverlap = !(pRight < nextX || pLeft > nextX + 1);
    const vOverlap = !(pBot < b.y || pTop > b.y + 1);
    if (hOverlap && vOverlap) {
      if (pTop - 1 >= -2) {
        state.activePiece = { ...state.activePiece, y: pTop - 1 };
      } else {
        b.dir = nextDir === 1 ? -1 : 1;
        return false;
      }
    }
  }

  for (let r = b.y; r < b.y + 2; r++) {
    for (let c = b.x; c < b.x + 2; c++) {
      if (state.grid[r][c]?.isObstacle) {
        state.grid[r][c] = null;
      }
    }
  }

  const leadingCol = nextDir === 1 ? nextX + 1 : nextX;
  const trailingCol = nextDir === 1 ? b.x : b.x + 1;
  for (let r = b.y; r < b.y + 2; r++) {
    const blocking = state.grid[r][leadingCol];
    if (blocking && !blocking.isObstacle) {
      state.grid[r][leadingCol] = null;
      if (state.grid[r][trailingCol] === null) {
        state.grid[r][trailingCol] = {
          ...blocking,
          animOffsetX: leadingCol - trailingCol,
        };
      } else if (b.y - 1 >= 1 && state.grid[b.y - 1][leadingCol] === null) {
        state.grid[b.y - 1][leadingCol] = blocking;
      } else {
        rescueDisplacedCells(state.grid, [blocking]);
      }
    }
  }

  for (let r = b.y; r < b.y + 2; r++) {
    for (let c = nextX; c < nextX + 2; c++) {
      const bCell = makeObstacleCell('bumper', true);
      bCell.landFlash = 0.25;
      bCell.animOffsetX = b.x - nextX;
      state.grid[r][c] = bCell;
    }
  }

  b.x = nextX;
  b.dir = nextDir;

  settleBoard(state.grid);
  state.squares = detectBoardMarks(state.grid);
  return true;
}

export function tickShiftEffects(state: BoardState | null, dt: number): void {
  if (!state?.shiftEffect) return;
  state.shiftEffect.life = Math.max(0, state.shiftEffect.life - dt);
  if (state.shiftEffect.life <= 0) {
    state.shiftEffect = null;
  }
}
