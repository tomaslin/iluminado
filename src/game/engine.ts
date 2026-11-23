import {
  BoardOrientation,
  BoardState,
  BoardWellRegion,
  Cell,
  CellColor,
  ClearEvent,
  GravityDirection,
  PentominoKind,
  Piece,
  PieceCell,
  PieceShapeMode,
  ShiftSchedulerState,
  SkinConfig,
  SquareCoord,
  SweepState,
  TetrominoKind,
} from './types';

export const BOARD_COLS = 16;
export const BOARD_ROWS = 10;
export const PORTRAIT_COLS = 10;
export const PORTRAIT_ROWS = 14;
export const LOCK_DELAY_SEC = 0.45;
export const MAX_LOCK_RESETS = 6;

export function getActiveWellRegion(
  state: Pick<BoardState, 'wellRegions' | 'activeWellIndex'>
): BoardWellRegion | null {
  if (!state.wellRegions || state.wellRegions.length === 0) return null;
  const idx =
    (((state.activeWellIndex ?? 0) % state.wellRegions.length) + state.wellRegions.length) %
    state.wellRegions.length;
  return state.wellRegions[idx] ?? null;
}

export function getActiveGravityDirection(
  state: Pick<BoardState, 'gravityDirection' | 'wellRegions' | 'activeWellIndex'>
): GravityDirection {
  const region = getActiveWellRegion(state);
  return region?.gravity ?? state.gravityDirection ?? 'down';
}

export function getGravityVector(dir?: GravityDirection): { gx: number; gy: number } {
  switch (dir) {
    case 'left':
      return { gx: -1, gy: 0 };
    case 'right':
      return { gx: 1, gy: 0 };
    case 'up':
      return { gx: 0, gy: -1 };
    default:
      return { gx: 0, gy: 1 };
  }
}

export function getDimensionsForOrientation(orientation: BoardOrientation): {
  cols: number;
  rows: number;
} {
  return orientation === 'portrait'
    ? { cols: PORTRAIT_COLS, rows: PORTRAIT_ROWS }
    : { cols: BOARD_COLS, rows: BOARD_ROWS };
}

export function getSpawnColForWidth(cols: number, pieceCols: number = 2): number {
  return Math.max(0, Math.floor((cols - pieceCols) / 2));
}

export function getPieceDimensions(piece: Piece): { rows: number; cols: number } {
  const rows = piece.cells.length;
  const cols = piece.cells[0]?.length ?? 0;
  return { rows, cols };
}

export function getPieceInitialY(piece: Piece): number {
  return -Math.max(1, piece.cells.length);
}

export function getPieceInitialPos(
  state: Pick<
    BoardState,
    | 'cols'
    | 'rows'
    | 'grid'
    | 'gravityDirection'
    | 'lockedColumnsLeft'
    | 'lockedColumnsRight'
    | 'wellRegions'
    | 'activeWellIndex'
  >,
  piece: Piece
): { x: number; y: number } {
  const rows = state.grid.length || state.rows || BOARD_ROWS;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const pRows = Math.max(1, piece.cells.length);
  const pCols = Math.max(1, piece.cells[0]?.length ?? 1);
  const region = getActiveWellRegion(state);
  const dir = region?.gravity ?? state.gravityDirection ?? 'down';
  const minCol = region
    ? Math.max(state.lockedColumnsLeft, region.minCol)
    : state.lockedColumnsLeft;
  const maxCol = region
    ? Math.max(minCol, Math.min(cols - 1 - state.lockedColumnsRight, region.maxCol) - pCols + 1)
    : Math.max(minCol, cols - pCols - state.lockedColumnsRight);

  if (region) {
    const wellSpan = Math.max(1, region.maxCol - region.minCol + 1);
    const spawnX = Math.max(
      minCol,
      Math.min(maxCol, region.minCol + getSpawnColForWidth(wellSpan, pCols))
    );
    if (dir === 'up') {
      return { x: spawnX, y: region.maxRow + 1 };
    }
    return { x: spawnX, y: region.minRow - pRows };
  }

  if (dir === 'right') {
    return {
      x: -pCols,
      y: Math.max(0, Math.floor((rows - pRows) / 2)),
    };
  }
  if (dir === 'left') {
    return {
      x: cols,
      y: Math.max(0, Math.floor((rows - pRows) / 2)),
    };
  }
  if (dir === 'up') {
    return {
      x: Math.max(minCol, Math.min(maxCol, getSpawnColForWidth(cols, pCols))),
      y: rows,
    };
  }
  return {
    x: Math.max(minCol, Math.min(maxCol, getSpawnColForWidth(cols, pCols))),
    y: -pRows,
  };
}

export function isPieceInStaging(
  state: Pick<BoardState, 'cols' | 'rows' | 'grid' | 'gravityDirection' | 'wellRegions' | 'activeWellIndex'>,
  piece: Piece
): boolean {
  const rows = state.grid.length || state.rows || BOARD_ROWS;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const pRows = Math.max(1, piece.cells.length);
  const pCols = Math.max(1, piece.cells[0]?.length ?? 1);
  const region = getActiveWellRegion(state);
  const dir = region?.gravity ?? state.gravityDirection ?? 'down';
  if (region) {
    if (dir === 'up') return piece.y + pRows - 1 > region.maxRow;
    if (dir === 'down') return piece.y < region.minRow;
    if (dir === 'right') return piece.x < region.minCol;
    return piece.x + pCols - 1 > region.maxCol;
  }
  if (dir === 'right') return piece.x < 0;
  if (dir === 'left') return piece.x + pCols > cols;
  if (dir === 'up') return piece.y + pRows > rows;
  return piece.y < 0;
}

export function createShiftSchedulerState(): ShiftSchedulerState {
  return {
    shiftTurnCount: 0,
    stageTurnIndex: 0,
    obstaclesInCurrentTurn: 0,
    tileShiftsInCurrentTurn: 0,
    usedTileTypesInCurrentTurn: [],
    usedOneTimeShifts: [],
    turnsSinceRotation: 0,
    turnsSinceTileShift: 1,
  };
}

let nextCellId = 1;
export function allocCellId(): number {
  return nextCellId++;
}

let bfsVisited = new Uint8Array(256);
let bfsQueue = new Int32Array(256);

export function createEmptyGrid(
  cols: number = BOARD_COLS,
  rows: number = BOARD_ROWS
): (Cell | null)[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
}

export function createSweepState(): SweepState {
  return {
    lastCol: -1,
    squaresThisSweep: 0,
    chainClearedThisSweep: 0,
    cellsClearedThisSweep: 0,
    countedSquareKeys: new Set<string>(),
  };
}

export function createPieceFromPattern(
  pattern: [CellColor, CellColor, CellColor, CellColor],
  chainIndex: number = -1,
  spawnX: number = 7
): Piece {
  return {
    x: spawnX,
    y: -2,
    shapeMode: 'standard_2x2',
    cells: [
      [
        { color: pattern[0], isChain: chainIndex === 0 },
        { color: pattern[1], isChain: chainIndex === 1 },
      ],
      [
        { color: pattern[2], isChain: chainIndex === 2 },
        { color: pattern[3], isChain: chainIndex === 3 },
      ],
    ],
  };
}

const PIECE_PATTERNS: Array<{ pattern: [CellColor, CellColor, CellColor, CellColor]; weight: number }> = [
  { pattern: [0, 0, 0, 0], weight: 6 },
  { pattern: [1, 1, 1, 1], weight: 6 },
  { pattern: [0, 0, 0, 1], weight: 7 },
  { pattern: [0, 0, 1, 0], weight: 7 },
  { pattern: [0, 1, 0, 0], weight: 7 },
  { pattern: [1, 0, 0, 0], weight: 7 },
  { pattern: [1, 1, 1, 0], weight: 7 },
  { pattern: [1, 1, 0, 1], weight: 7 },
  { pattern: [1, 0, 1, 1], weight: 7 },
  { pattern: [0, 1, 1, 1], weight: 7 },
  { pattern: [0, 0, 1, 1], weight: 9 },
  { pattern: [1, 1, 0, 0], weight: 9 },
  { pattern: [0, 1, 0, 1], weight: 9 },
  { pattern: [1, 0, 1, 0], weight: 9 },
  { pattern: [0, 1, 1, 0], weight: 6 },
  { pattern: [1, 0, 0, 1], weight: 6 },
];

const TOTAL_PATTERN_WEIGHT = PIECE_PATTERNS.reduce((acc, p) => acc + p.weight, 0);

const TETROMINO_MASKS: Record<TetrominoKind, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const TETROMINO_KINDS: TetrominoKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const PENTOMINO_MASKS: Record<PentominoKind, number[][]> = {
  F: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ],
  I: [[1, 1, 1, 1, 1]],
  L: [
    [1, 0],
    [1, 0],
    [1, 0],
    [1, 1],
  ],
  P: [
    [1, 1],
    [1, 1],
    [1, 0],
  ],
  N: [
    [0, 1],
    [1, 1],
    [1, 0],
    [1, 0],
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
  ],
  U: [
    [1, 0, 1],
    [1, 1, 1],
  ],
  V: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  W: [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 1],
  ],
  X: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  Y: [
    [0, 1],
    [1, 1],
    [0, 1],
    [0, 1],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
  ],
};

export const PENTOMINO_KINDS: PentominoKind[] = [
  'F', 'I', 'L', 'P', 'N', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

function pickPieceColor(colorCount: 2 | 3, rng: () => number): CellColor {
  if (colorCount === 3) {
    const r = rng();
    if (r < 0.34) return 0;
    if (r < 0.68) return 1;
    return 2;
  }
  return rng() < 0.5 ? 0 : 1;
}

export interface GeneratePieceOptions {
  colorCount?: 2 | 3;
  shapeMode?: PieceShapeMode;
  boardCols?: number;
  ensureBlocked?: boolean;
  ensureWild?: boolean;
  ensureCrashGem?: boolean;
  ensureColossus?: boolean;
  allowCrashGem?: boolean;
}

export function generateRandomPiece(
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  spawnX: number = 7,
  options?: GeneratePieceOptions
): Piece {
  const colorCount: 2 | 3 = options?.colorCount === 3 ? 3 : 2;
  const shapeMode: PieceShapeMode = options?.shapeMode ?? 'standard_2x2';
  const boardCols = options?.boardCols;

  const resolveSpawnX = (pieceCols: number): number =>
    typeof boardCols === 'number'
      ? getSpawnColForWidth(boardCols, pieceCols)
      : Math.max(0, spawnX - Math.floor((pieceCols - 2) / 2));

  if (shapeMode === 'domino_2x1') {
    const c0 = pickPieceColor(colorCount, rng);
    const c1 = rng() < 0.35 ? c0 : pickPieceColor(colorCount, rng);
    const hasChain = rng() < chainFrequency;
    const chainPos = hasChain ? Math.floor(rng() * 2) : -1;
    return {
      x: resolveSpawnX(2),
      y: -1,
      shapeMode,
      cells: [
        [
          { color: c0, isChain: chainPos === 0 },
          { color: c1, isChain: chainPos === 1 },
        ],
      ],
    };
  }

  if (shapeMode === 'trio_3x1') {
    const cA = pickPieceColor(colorCount, rng);
    let cB = pickPieceColor(colorCount, rng);
    if (cB === cA && rng() < 0.72) {
      cB = ((cA + 1) % colorCount) as CellColor;
    }
    const rollTrio = rng();
    const rowColors: [CellColor, CellColor, CellColor] =
      rollTrio < 0.22
        ? [cA, cA, cA]
        : rollTrio < 0.52
        ? [cA, cA, cB]
        : rollTrio < 0.82
        ? [cB, cA, cA]
        : [cA, cB, cA];
    const hasChain = rng() < chainFrequency;
    const chainPos = hasChain ? Math.floor(rng() * 3) : -1;
    return {
      x: resolveSpawnX(3),
      y: -1,
      shapeMode,
      cells: [
        [
          { color: rowColors[0], isChain: chainPos === 0 },
          { color: rowColors[1], isChain: chainPos === 1 },
          { color: rowColors[2], isChain: chainPos === 2 },
        ],
      ],
    };
  }

  if (shapeMode === 'rect_3x2') {
    const cMain = pickPieceColor(colorCount, rng);
    const cAlt = pickPieceColor(colorCount, rng);
    const cThird = colorCount === 3 && rng() < 0.5 ? (2 as CellColor) : pickPieceColor(colorCount, rng);
    const templateRoll = rng();
    const rawColors: CellColor[][] =
      templateRoll < 0.25
        ? [
            [cMain, cMain, cAlt],
            [cMain, cMain, cAlt],
          ]
        : templateRoll < 0.5
        ? [
            [cAlt, cMain, cMain],
            [cAlt, cMain, cMain],
          ]
        : templateRoll < 0.75
        ? [
            [cMain, cMain, cMain],
            [cAlt, cAlt, cThird],
          ]
        : [
            [cMain, cAlt, cMain],
            [cAlt, cMain, cThird],
          ];
    const hasChain = rng() < chainFrequency;
    const chainSlot = hasChain ? Math.floor(rng() * 6) : -1;
    let slotIdx = 0;
    const cells: PieceCell[][] = rawColors.map((row) =>
      row.map((col) => ({
        color: col,
        isChain: slotIdx++ === chainSlot,
      }))
    );
    return {
      x: resolveSpawnX(3),
      y: -2,
      shapeMode,
      cells,
    };
  }

  if (shapeMode === 'tetromino') {
    const kind = TETROMINO_KINDS[Math.floor(rng() * TETROMINO_KINDS.length) % TETROMINO_KINDS.length];
    const mask = TETROMINO_MASKS[kind];
    const primary = pickPieceColor(colorCount, rng);
    const secondary = pickPieceColor(colorCount, rng);
    const mono = rng() < 0.32;
    const occupiedCoords: Array<[number, number]> = [];
    const cells: PieceCell[][] = mask.map((row, r) =>
      row.map((val, c) => {
        if (!val) return null;
        occupiedCoords.push([r, c]);
        const color: CellColor = mono
          ? primary
          : rng() < 0.58
          ? primary
          : secondary;
        return { color, isChain: false };
      })
    );
    if (rng() < chainFrequency && occupiedCoords.length > 0) {
      const [cr, cc] = occupiedCoords[Math.floor(rng() * occupiedCoords.length)];
      if (cells[cr][cc]) {
        cells[cr][cc]!.isChain = true;
      }
    }
    const pieceCols = mask[0]?.length ?? 2;
    return {
      x: resolveSpawnX(pieceCols),
      y: -mask.length,
      shapeMode,
      tetrominoKind: kind,
      cells,
    };
  }

  if (shapeMode === 'pentomino') {
    const kind = PENTOMINO_KINDS[Math.floor(rng() * PENTOMINO_KINDS.length) % PENTOMINO_KINDS.length];
    const mask = PENTOMINO_MASKS[kind];
    const primary = pickPieceColor(colorCount, rng);
    const secondary = pickPieceColor(colorCount, rng);
    const mono = rng() < 0.28;
    const occupiedCoords: Array<[number, number]> = [];
    const cells: PieceCell[][] = mask.map((row, r) =>
      row.map((val, c) => {
        if (!val) return null;
        occupiedCoords.push([r, c]);
        const color: CellColor = mono
          ? primary
          : rng() < 0.58
          ? primary
          : secondary;
        return { color, isChain: false };
      })
    );
    if (rng() < chainFrequency && occupiedCoords.length > 0) {
      const [cr, cc] = occupiedCoords[Math.floor(rng() * occupiedCoords.length)];
      if (cells[cr][cc]) {
        cells[cr][cc]!.isChain = true;
      }
    }
    const pieceCols = mask[0]?.length ?? 3;
    return {
      x: resolveSpawnX(pieceCols),
      y: -mask.length,
      shapeMode,
      pentominoKind: kind,
      cells,
    };
  }

  if (shapeMode === 'colossus') {
    const isBig = Boolean(options?.ensureColossus) || rng() < 0.28;
    if (isBig) {
      const q00 = pickPieceColor(colorCount, rng);
      const q01 = rng() < 0.5 ? q00 : (((q00 + 1) % colorCount) as CellColor);
      const q10 = rng() < 0.5 ? (((q00 + 1) % colorCount) as CellColor) : q00;
      const q11 = rng() < 0.4 ? q01 : pickPieceColor(colorCount, rng);
      const quadColor = (r: number, c: number): CellColor =>
        r < 2 ? (c < 2 ? q00 : q01) : c < 2 ? q10 : q11;
      const cells: PieceCell[][] = Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 4 }, (__, c) => ({
          color: quadColor(r, c),
          isChain: false,
        }))
      );
      if (rng() < chainFrequency) {
        const cr = Math.floor(rng() * 4);
        const cc = Math.floor(rng() * 4);
        cells[cr][cc]!.isChain = true;
      }
      return {
        x: resolveSpawnX(4),
        y: -4,
        shapeMode: 'colossus',
        cells,
      };
    }
  }

  if (shapeMode === 'l_trio_2x2') {
    const cMain = pickPieceColor(colorCount, rng);
    const cAlt = rng() < 0.45 ? cMain : pickPieceColor(colorCount, rng);
    const missingIdx = Math.floor(rng() * 4) % 4;
    const hasChain = rng() < chainFrequency;
    let chainIdx = hasChain ? Math.floor(rng() * 4) % 4 : -1;
    if (chainIdx === missingIdx) chainIdx = (chainIdx + 1) % 4;
    const cells: PieceCell[][] = [[null, null], [null, null]];
    for (let idx = 0; idx < 4; idx++) {
      if (idx === missingIdx) continue;
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const color = idx === 0 || idx === 3 ? cMain : cAlt;
      cells[r][c] = { color, isChain: idx === chainIdx };
    }
    return {
      x: resolveSpawnX(2),
      y: -2,
      shapeMode,
      cells,
    };
  }

  if (shapeMode === 'prism_wild_2x2') {
    let roll = rng() * TOTAL_PATTERN_WEIGHT;
    let chosen = PIECE_PATTERNS[0].pattern;
    for (const entry of PIECE_PATTERNS) {
      roll -= entry.weight;
      if (roll <= 0) {
        chosen = entry.pattern;
        break;
      }
    }
    const piece = createPieceFromPattern(chosen, -1, resolveSpawnX(2));
    piece.shapeMode = 'prism_wild_2x2';
    const includeWild = options?.ensureWild || rng() < 0.62;
    const wildIdx = includeWild ? Math.floor(rng() * 4) % 4 : -1;
    if (wildIdx >= 0) {
      const wr = Math.floor(wildIdx / 2);
      const wc = wildIdx % 2;
      const existing = piece.cells[wr][wc];
      if (existing) {
        piece.cells[wr][wc] = { color: existing.color, isChain: false, isWild: true };
      }
    } else if (rng() < chainFrequency) {
      const ci = Math.floor(rng() * 4) % 4;
      const cr = Math.floor(ci / 2);
      const cc = ci % 2;
      if (piece.cells[cr][cc]) {
        piece.cells[cr][cc]!.isChain = true;
      }
    }
    return piece;
  }

  if (shapeMode === 'blocked_2x2') {
    let roll = rng() * TOTAL_PATTERN_WEIGHT;
    let chosen = PIECE_PATTERNS[0].pattern;
    for (const entry of PIECE_PATTERNS) {
      roll -= entry.weight;
      if (roll <= 0) {
        chosen = entry.pattern;
        break;
      }
    }
    const includeBlocked = options?.ensureBlocked || rng() < 0.58;
    const blockedIdx = includeBlocked ? Math.floor(rng() * 4) % 4 : -1;
    const hasChain = rng() < chainFrequency;
    let chainIdx = hasChain ? Math.floor(rng() * 4) % 4 : -1;
    if (chainIdx === blockedIdx) chainIdx = (chainIdx + 1) % 4;
    const piece = createPieceFromPattern(chosen, chainIdx, resolveSpawnX(2));
    piece.shapeMode = 'blocked_2x2';
    if (blockedIdx >= 0) {
      const br = Math.floor(blockedIdx / 2);
      const bc = blockedIdx % 2;
      piece.cells[br][bc] = { color: 0, isChain: false, isBlocked: true };
    }
    return piece;
  }

  if (colorCount === 3) {
    const cA = pickPieceColor(3, rng);
    let cB = pickPieceColor(3, rng);
    if (cB === cA && rng() < 0.75) {
      cB = ((cA + (rng() < 0.5 ? 1 : 2)) % 3) as CellColor;
    }
    let roll = rng() * TOTAL_PATTERN_WEIGHT;
    let basePat = PIECE_PATTERNS[0].pattern;
    for (const entry of PIECE_PATTERNS) {
      roll -= entry.weight;
      if (roll <= 0) {
        basePat = entry.pattern;
        break;
      }
    }
    const mapped: [CellColor, CellColor, CellColor, CellColor] = [
      basePat[0] === 0 ? cA : cB,
      basePat[1] === 0 ? cA : cB,
      basePat[2] === 0 ? cA : cB,
      basePat[3] === 0 ? cA : cB,
    ];
    if (rng() < 0.22) {
      const cC = (3 - cA - cB) as CellColor;
      if (cC === 0 || cC === 1 || cC === 2) {
        mapped[Math.floor(rng() * 4)] = cC;
      }
    }
    const hasChain = rng() < chainFrequency;
    const chainIndex = hasChain ? Math.floor(rng() * 4) : -1;
    return createPieceFromPattern(mapped, chainIndex, resolveSpawnX(2));
  }

  let roll = rng() * TOTAL_PATTERN_WEIGHT;
  let chosen = PIECE_PATTERNS[0].pattern;
  for (const entry of PIECE_PATTERNS) {
    roll -= entry.weight;
    if (roll <= 0) {
      chosen = entry.pattern;
      break;
    }
  }
  const hasChain = rng() < chainFrequency;
  const chainIndex = hasChain ? Math.floor(rng() * 4) : -1;
  const piece = createPieceFromPattern(chosen, chainIndex, resolveSpawnX(2));
  if (
    options?.ensureCrashGem ||
    (options?.allowCrashGem && rng() < 0.55)
  ) {
    const cr = Math.floor(rng() * 2);
    const cc = Math.floor(rng() * 2);
    const targetCell = piece.cells[cr]?.[cc];
    if (targetCell && !targetCell.isBlocked) {
      targetCell.isCrashGem = true;
      targetCell.isChain = false;
    }
  }
  return piece;
}

export function refreshQueueForBoardRules(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): void {
  const spawnX = getSpawnColForWidth(state.cols, 2);
  const opts: GeneratePieceOptions = {
    colorCount: state.colorCount,
    shapeMode: state.pieceShapeMode,
    boardCols: state.cols,
    allowCrashGem: state.activeShift === 'crash_gem',
  };
  const queueLen = Math.max(3, state.nextQueue.length);
  state.nextQueue = Array.from({ length: queueLen }, (_, i) => {
    const p = generateRandomPiece(chainFrequency, rng, spawnX, {
      ...opts,
      ensureBlocked: i === 0 && state.pieceShapeMode === 'blocked_2x2',
      ensureWild: i === 0 && state.pieceShapeMode === 'prism_wild_2x2',
      ensureColossus: i === 0 && state.pieceShapeMode === 'colossus',
      ensureCrashGem: i === 0 && state.activeShift === 'crash_gem',
    });
    const pos = getPieceInitialPos(state, p);
    return { ...p, x: pos.x, y: pos.y };
  });
  if (state.activePiece && isPieceInStaging(state, state.activePiece)) {
    const candidate = generateRandomPiece(chainFrequency, rng, spawnX, {
      ...opts,
      ensureBlocked: state.pieceShapeMode === 'blocked_2x2',
      ensureWild: state.pieceShapeMode === 'prism_wild_2x2',
      ensureColossus: state.pieceShapeMode === 'colossus',
      ensureCrashGem: state.activeShift === 'crash_gem',
    });
    const pos = getPieceInitialPos(state, candidate);
    candidate.x = pos.x;
    candidate.y = pos.y;
    if (canPlacePiece(state, candidate, 0, 0)) {
      state.activePiece = candidate;
    }
  }
}

export function createInitialBoardState(
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  orientation: BoardOrientation = 'landscape'
): BoardState {
  const { cols, rows } = getDimensionsForOrientation(orientation);
  const spawnX = getSpawnColForWidth(cols);
  return {
    grid: createEmptyGrid(cols, rows),
    cols,
    rows,
    baseCols: cols,
    baseRows: rows,
    orientation,
    gravityDirection: 'down',
    orientationGraceTimer: 0,
    activeShift: null,
    pieceShapeMode: 'standard_2x2',
    colorCount: 2,
    shiftScheduler: createShiftSchedulerState(),
    patrollingBumper: null,
    shiftEffect: null,
    activePiece: generateRandomPiece(chainFrequency, rng, spawnX),
    spawnTimer: 0,
    gravityAccum: 0,
    lockTimer: 0,
    lockResetCount: 0,
    nextQueue: [
      generateRandomPiece(chainFrequency, rng, spawnX),
      generateRandomPiece(chainFrequency, rng, spawnX),
      generateRandomPiece(chainFrequency, rng, spawnX),
    ],
    squares: [],
    sweepState: createSweepState(),
    comboLevel: 0,
    comboGraceUsed: false,
    score: 0,
    squaresClearedTotal: 0,
    stageSquaresCleared: 0,
    maxCombo: 0,
    isGameOver: false,
    lockedColumnsLeft: 0,
    lockedColumnsRight: 0,
    pendingGarbage: 0,
    biggestSweep: 0,
    chainClearsTotal: 0,
    singleColorCount: 0,
    allClearCount: 0,
    vetoTokens: 0,
    upcomingShift: null,
    shiftDraftChoices: null,
    heldPiece: null,
    stashUsedThisTurn: false,
    ceilingLockRows: 0,
    risingTideRows: 0,
    beatChargeAccum: 0,
  };
}

function clonePieceCell(cell: PieceCell): PieceCell {
  if (!cell) return null;
  return cell.isBlocked
    ? { color: cell.color, isChain: false, isBlocked: true }
    : {
        color: cell.color,
        isChain: cell.isChain,
        ...(cell.isWild ? { isWild: true } : {}),
        ...(cell.isCrashGem ? { isCrashGem: true } : {}),
      };
}

export function rotatePieceCellsCW(piece: Piece): Piece {
  const rows = piece.cells.length;
  const cols = piece.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return piece;
  const rotated: PieceCell[][] = Array.from({ length: cols }, () =>
    Array<PieceCell>(rows).fill(null)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = clonePieceCell(piece.cells[r][c]);
    }
  }
  return {
    ...piece,
    cells: rotated,
  };
}

export function rotatePieceCellsCCW(piece: Piece): Piece {
  const rows = piece.cells.length;
  const cols = piece.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return piece;
  const rotated: PieceCell[][] = Array.from({ length: cols }, () =>
    Array<PieceCell>(rows).fill(null)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[cols - 1 - c][r] = clonePieceCell(piece.cells[r][c]);
    }
  }
  return {
    ...piece,
    cells: rotated,
  };
}

export function canPlacePiece(
  state: BoardState,
  piece: Piece,
  dx: number = 0,
  dy: number = 0
): boolean {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const region = getActiveWellRegion(state);
  const minCol = region
    ? Math.max(state.lockedColumnsLeft, region.minCol)
    : state.lockedColumnsLeft;
  const maxCol = region
    ? Math.min(cols - 1 - state.lockedColumnsRight, region.maxCol)
    : cols - 1 - state.lockedColumnsRight;
  const pieceRows = piece.cells.length;
  const dir = region?.gravity ?? state.gravityDirection ?? 'down';

  for (let py = 0; py < pieceRows; py++) {
    const rowCells = piece.cells[py];
    for (let px = 0; px < rowCells.length; px++) {
      if (rowCells[px] === null) continue;
      const gx = piece.x + px + dx;
      const gy = piece.y + py + dy;
      if (region) {
        if (dir === 'down') {
          if (gx < minCol || gx > maxCol) return false;
          if (gy > region.maxRow) return false;
          const minLegalY = region.stagingMinRow ?? (region.minRow > 0 ? region.minRow - 4 : -8);
          if (region.minRow > 0 && gy < minLegalY) return false;
          const inRegionStaging =
            region.stagingMinRow !== undefined && region.stagingMaxRow !== undefined
              ? gy >= region.stagingMinRow && gy <= region.stagingMaxRow
              : gy < region.minRow;
          if (!inRegionStaging && gy >= 0 && gy < rows && state.grid[gy][gx] !== null) {
            return false;
          }
        } else if (dir === 'up') {
          if (gx < minCol || gx > maxCol) return false;
          if (gy < region.minRow) return false;
          const maxLegalY =
            region.stagingMaxRow ?? (region.maxRow < rows - 1 ? region.maxRow + 4 : rows + 8);
          if (region.maxRow < rows - 1 && gy > maxLegalY) return false;
          const inRegionStaging =
            region.stagingMinRow !== undefined && region.stagingMaxRow !== undefined
              ? gy >= region.stagingMinRow && gy <= region.stagingMaxRow
              : gy > region.maxRow;
          if (!inRegionStaging && gy >= 0 && gy < rows && state.grid[gy][gx] !== null) {
            return false;
          }
        } else if (dir === 'right') {
          if (gy < region.minRow || gy > region.maxRow) return false;
          if (gx > maxCol) return false;
          if (gx >= minCol && state.grid[gy][gx] !== null) return false;
        } else {
          if (gy < region.minRow || gy > region.maxRow) return false;
          if (gx < minCol) return false;
          if (gx <= maxCol && state.grid[gy][gx] !== null) return false;
        }
        continue;
      }

      if (dir === 'down') {
        if (gx < minCol || gx > maxCol) return false;
        if (gy >= rows) return false;
        if (gy >= 0 && state.grid[gy][gx] !== null) return false;
      } else if (dir === 'up') {
        if (gx < minCol || gx > maxCol) return false;
        if (gy < 0) return false;
        if (gy < rows && state.grid[gy][gx] !== null) return false;
      } else if (dir === 'right') {
        if (gy < 0 || gy >= rows) return false;
        if (gx > maxCol) return false;
        if (gx >= minCol && state.grid[gy][gx] !== null) return false;
      } else {
        if (gy < 0 || gy >= rows) return false;
        if (gx < minCol) return false;
        if (gx <= maxCol && state.grid[gy][gx] !== null) return false;
      }
    }
  }
  return true;
}

export function isActivePieceGrounded(state: BoardState): boolean {
  if (!state.activePiece) return false;
  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));
  return !canPlacePiece(state, state.activePiece, gx, gy);
}

export interface GhostCellLanding {
  x: number;
  y: number;
  color: CellColor;
  isBlocked?: boolean;
  isWild?: boolean;
}

export interface PieceLandingInfo {
  rigidDy: number;
  leftBottomRow: number;
  rightBottomRow: number;
  colBottomRows: number[];
  isSplit: boolean;
  gravityDirection: GravityDirection;
  ghostCells: GhostCellLanding[];
}

export function getPieceLandingColumns(
  state: BoardState,
  piece: Piece
): PieceLandingInfo {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const region = getActiveWellRegion(state);
  const dir = region?.gravity ?? state.gravityDirection ?? 'down';
  const minRow = region?.minRow ?? 0;
  const maxRow = region?.maxRow ?? rows - 1;
  const { gx: vecX, gy: vecY } = getGravityVector(dir);

  let rigidDy = 0;
  while (
    rigidDy < cols + rows &&
    canPlacePiece(state, piece, vecX * (rigidDy + 1), vecY * (rigidDy + 1))
  ) {
    rigidDy++;
  }

  const pieceRows = piece.cells.length;
  const pieceCols = piece.cells[0]?.length ?? 0;
  const ghostCells: GhostCellLanding[] = [];

  if (dir === 'down') {
    const colBottomRows: number[] = [];
    const relativeOffsets: number[] = [];

    for (let px = 0; px < pieceCols; px++) {
      let lowestPy = -1;
      const occRows: number[] = [];
      for (let py = 0; py < pieceRows; py++) {
        if (piece.cells[py]?.[px] !== null) {
          occRows.push(py);
          lowestPy = py;
        }
      }
      if (lowestPy < 0) {
        colBottomRows.push(-1);
        continue;
      }
      const col = piece.x + px;
      if (col < 0 || col >= cols) {
        colBottomRows.push(maxRow);
        continue;
      }
      const startRow = Math.max(minRow, piece.y + rigidDy + lowestPy + 1);
      let stopRow = maxRow + 1;
      for (let r = startRow; r <= maxRow; r++) {
        if (state.grid[r][col] !== null) {
          stopRow = r;
          break;
        }
      }
      const bot = stopRow - 1;
      colBottomRows.push(bot);
      relativeOffsets.push(bot - lowestPy);

      for (let idx = 0; idx < occRows.length; idx++) {
        const py = occRows[idx];
        const gy = bot - (occRows.length - 1 - idx);
        const pCell = piece.cells[py]?.[px];
        if (pCell && gy >= minRow && gy <= maxRow) {
          ghostCells.push({
            x: col,
            y: gy,
            color: pCell.color,
            isBlocked: pCell.isBlocked,
            isWild: pCell.isWild,
          });
        }
      }
    }

    const leftBottomRow = colBottomRows[0] ?? maxRow;
    const rightBottomRow =
      colBottomRows[Math.min(1, Math.max(0, colBottomRows.length - 1))] ?? leftBottomRow;
    const isSplit =
      relativeOffsets.length > 1 &&
      relativeOffsets.some((off) => off !== relativeOffsets[0]);

    return {
      rigidDy,
      leftBottomRow,
      rightBottomRow,
      colBottomRows,
      isSplit,
      gravityDirection: dir,
      ghostCells,
    };
  }

  if (dir === 'up') {
    const colTopRows: number[] = [];
    const relativeOffsets: number[] = [];
    for (let px = 0; px < pieceCols; px++) {
      const occRows: number[] = [];
      for (let py = 0; py < pieceRows; py++) {
        if (piece.cells[py]?.[px] !== null) occRows.push(py);
      }
      if (occRows.length === 0) {
        colTopRows.push(-1);
        continue;
      }
      const topPy = occRows[0];
      const col = piece.x + px;
      if (col < 0 || col >= cols) {
        colTopRows.push(minRow);
        continue;
      }
      const startRow = Math.min(maxRow, piece.y - rigidDy + topPy - 1);
      let stopRow = minRow - 1;
      for (let r = startRow; r >= minRow; r--) {
        if (state.grid[r][col] !== null) {
          stopRow = r;
          break;
        }
      }
      const topR = stopRow + 1;
      colTopRows.push(topR);
      relativeOffsets.push(topR - topPy);
      for (let idx = 0; idx < occRows.length; idx++) {
        const py = occRows[idx];
        const gy = topR + idx;
        const pCell = piece.cells[py]?.[px];
        if (pCell && gy >= minRow && gy <= maxRow) {
          ghostCells.push({
            x: col,
            y: gy,
            color: pCell.color,
            isBlocked: pCell.isBlocked,
            isWild: pCell.isWild,
          });
        }
      }
    }
    const isSplit =
      relativeOffsets.length > 1 &&
      relativeOffsets.some((off) => off !== relativeOffsets[0]);
    return {
      rigidDy,
      leftBottomRow: colTopRows[0] ?? minRow,
      rightBottomRow: colTopRows[Math.min(1, Math.max(0, colTopRows.length - 1))] ?? minRow,
      colBottomRows: colTopRows,
      isSplit,
      gravityDirection: dir,
      ghostCells,
    };
  }

  const rowStopCols: number[] = [];
  const relativeOffsets: number[] = [];
  for (let py = 0; py < pieceRows; py++) {
    const occCols: number[] = [];
    for (let px = 0; px < pieceCols; px++) {
      if (piece.cells[py]?.[px] !== null) occCols.push(px);
    }
    if (occCols.length === 0) {
      rowStopCols.push(-1);
      continue;
    }
    const row = piece.y + py;
    if (row < 0 || row >= rows) {
      rowStopCols.push(-1);
      continue;
    }
    if (dir === 'right') {
      const rightPx = occCols[occCols.length - 1];
      const startCol = Math.max(0, piece.x + rigidDy + rightPx + 1);
      let stopCol = cols;
      for (let c = startCol; c < cols; c++) {
        if (state.grid[row][c] !== null) {
          stopCol = c;
          break;
        }
      }
      const anchorC = stopCol - 1;
      rowStopCols.push(anchorC);
      relativeOffsets.push(anchorC - rightPx);
      for (let idx = 0; idx < occCols.length; idx++) {
        const px = occCols[idx];
        const gx = anchorC - (occCols.length - 1 - idx);
        const pCell = piece.cells[py]?.[px];
        if (pCell && gx >= 0 && gx < cols) {
          ghostCells.push({
            x: gx,
            y: row,
            color: pCell.color,
            isBlocked: pCell.isBlocked,
            isWild: pCell.isWild,
          });
        }
      }
    } else {
      const leftPx = occCols[0];
      const startCol = Math.min(cols - 1, piece.x - rigidDy + leftPx - 1);
      let stopCol = -1;
      for (let c = startCol; c >= 0; c--) {
        if (state.grid[row][c] !== null) {
          stopCol = c;
          break;
        }
      }
      const anchorC = stopCol + 1;
      rowStopCols.push(anchorC);
      relativeOffsets.push(anchorC - leftPx);
      for (let idx = 0; idx < occCols.length; idx++) {
        const px = occCols[idx];
        const gx = anchorC + idx;
        const pCell = piece.cells[py]?.[px];
        if (pCell && gx >= 0 && gx < cols) {
          ghostCells.push({
            x: gx,
            y: row,
            color: pCell.color,
            isBlocked: pCell.isBlocked,
            isWild: pCell.isWild,
          });
        }
      }
    }
  }

  const isSplit =
    relativeOffsets.length > 1 &&
    relativeOffsets.some((off) => off !== relativeOffsets[0]);

  return {
    rigidDy,
    leftBottomRow: rowStopCols[0] ?? 0,
    rightBottomRow: rowStopCols[Math.min(1, Math.max(0, rowStopCols.length - 1))] ?? 0,
    colBottomRows: rowStopCols,
    isSplit,
    gravityDirection: dir,
    ghostCells,
  };
}

function refreshLockResetOnManipulate(state: BoardState, wasGrounded: boolean): void {
  if (!state.activePiece) return;
  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));
  const nowGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
  if (!nowGrounded) {
    state.lockTimer = 0;
  } else if (wasGrounded && state.lockResetCount < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResetCount += 1;
  }
}

export function movePieceHorizontal(state: BoardState, dx: -1 | 1): boolean {
  if (!state.activePiece || state.isGameOver) return false;
  const dir = getActiveGravityDirection(state);
  if (canPlacePiece(state, state.activePiece, dx, 0)) {
    const { gx, gy } = getGravityVector(dir);
    const wasGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
    state.activePiece = {
      ...state.activePiece,
      x: state.activePiece.x + dx,
    };
    refreshLockResetOnManipulate(state, wasGrounded);
    return true;
  }
  if ((dir === 'down' || dir === 'up') && state.activeShift === 'portal_wrap') {
    const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
    const pieceCols = state.activePiece.cells[0]?.length ?? 1;
    const region = getActiveWellRegion(state);
    const minCol = region ? Math.max(state.lockedColumnsLeft, region.minCol) : state.lockedColumnsLeft;
    const maxPlayCol = region
      ? Math.min(cols - 1 - state.lockedColumnsRight, region.maxCol)
      : cols - 1 - state.lockedColumnsRight;
    const maxCol = Math.max(minCol, maxPlayCol - pieceCols + 1);
    let targetX: number | null = null;
    if (dx < 0 && state.activePiece.x <= minCol) {
      targetX = maxCol;
    } else if (dx > 0 && state.activePiece.x >= maxCol) {
      targetX = minCol;
    }
    if (targetX !== null && targetX !== state.activePiece.x) {
      const wrapped: Piece = { ...state.activePiece, x: targetX };
      if (canPlacePiece(state, wrapped, 0, 0)) {
        const { gx, gy } = getGravityVector(dir);
        const wasGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
        state.activePiece = wrapped;
        refreshLockResetOnManipulate(state, wasGrounded);
        return true;
      }
    }
  }
  return false;
}

export function movePieceVertical(state: BoardState, dy: -1 | 1): boolean {
  if (!state.activePiece || state.isGameOver) return false;
  const dir = getActiveGravityDirection(state);
  if (canPlacePiece(state, state.activePiece, 0, dy)) {
    const { gx, gy } = getGravityVector(dir);
    const wasGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
    state.activePiece = {
      ...state.activePiece,
      y: state.activePiece.y + dy,
    };
    refreshLockResetOnManipulate(state, wasGrounded);
    return true;
  }
  if ((dir === 'left' || dir === 'right') && state.activeShift === 'portal_wrap') {
    const rows = state.grid.length || state.rows || BOARD_ROWS;
    const pieceRows = Math.max(1, state.activePiece.cells.length);
    const maxRow = Math.max(0, rows - pieceRows);
    let targetY: number | null = null;
    if (dy < 0 && state.activePiece.y <= 0) {
      targetY = maxRow;
    } else if (dy > 0 && state.activePiece.y >= maxRow) {
      targetY = 0;
    }
    if (targetY !== null && targetY !== state.activePiece.y) {
      const wrapped: Piece = { ...state.activePiece, y: targetY };
      if (canPlacePiece(state, wrapped, 0, 0)) {
        const { gx, gy } = getGravityVector(dir);
        const wasGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
        state.activePiece = wrapped;
        refreshLockResetOnManipulate(state, wasGrounded);
        return true;
      }
    }
  }
  return false;
}

export function steerPiece(state: BoardState, delta: -1 | 1): boolean {
  const dir = getActiveGravityDirection(state);
  if (dir === 'left' || dir === 'right') {
    return movePieceVertical(state, delta);
  }
  return movePieceHorizontal(state, delta);
}

export function rotateActivePiece(state: BoardState, direction: 'cw' | 'ccw' = 'cw'): boolean {
  if (!state.activePiece || state.isGameOver) return false;

  const rotated =
    direction === 'cw'
      ? rotatePieceCellsCW(state.activePiece)
      : rotatePieceCellsCCW(state.activePiece);
  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));
  const px = Math.abs(gy);
  const py = Math.abs(gx);
  const kickOffsets: Array<[number, number]> = [
    [0, 0],
    [-px, -py],
    [px, py],
    [-2 * px, -2 * py],
    [2 * px, 2 * py],
    [-gx, -gy],
    [-px - gx, -py - gy],
    [px - gx, py - gy],
    [-2 * gx, -2 * gy],
  ];
  const inStaging = isPieceInStaging(state, state.activePiece);
  for (const [dx, dy] of kickOffsets) {
    const movesBackIntoStaging = dx * -gx + dy * -gy > 0;
    if (movesBackIntoStaging && inStaging) continue;
    const candidate: Piece =
      dx === 0 && dy === 0
        ? rotated
        : { ...rotated, x: rotated.x + dx, y: rotated.y + dy };
    if (canPlacePiece(state, candidate, 0, 0)) {
      const wasGrounded = !canPlacePiece(state, state.activePiece, gx, gy);
      if (state.activeShift === 'chameleon_rotate') {
        const cCount = state.colorCount ?? 2;
        candidate.cells = candidate.cells.map((row) =>
          row.map((cell) =>
            cell && !cell.isBlocked
              ? { ...cell, color: ((cell.color + 1) % cCount) as CellColor }
              : cell
          )
        );
      }
      state.activePiece = candidate;
      refreshLockResetOnManipulate(state, wasGrounded);
      return true;
    }
  }
  return false;
}

export function stepKaleidoscopePiece(state: BoardState): boolean {
  if (!state.activePiece || state.isGameOver || state.activeShift !== 'kaleidoscope_brick') {
    return false;
  }
  const piece = state.activePiece;
  const flatTiles: Exclude<PieceCell, null>[] = [];
  for (let py = 0; py < piece.cells.length; py++) {
    for (let px = 0; px < (piece.cells[py]?.length ?? 0); px++) {
      const c = piece.cells[py][px];
      if (c) flatTiles.push(clonePieceCell(c)!);
    }
  }
  if (flatTiles.length === 0) return false;

  const currKind = piece.tetrominoKind ?? 'O';
  const currIdx = TETROMINO_KINDS.indexOf(currKind);
  const nextKind = TETROMINO_KINDS[(currIdx + 1) % TETROMINO_KINDS.length];
  const mask = TETROMINO_MASKS[nextKind];
  let tileIdx = 0;
  const newCells: PieceCell[][] = mask.map((row) =>
    row.map((v) => {
      if (!v) return null;
      const src = flatTiles[tileIdx % flatTiles.length];
      tileIdx++;
      return clonePieceCell(src);
    })
  );

  const dir = getActiveGravityDirection(state);
  const { gx: gravX, gy: gravY } = getGravityVector(dir);
  const offsets: Array<[number, number]> = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [-2, 0],
    [2, 0],
    [-gravX, -gravY],
    [-1 - gravX, -gravY],
    [1 - gravX, -gravY],
  ];
  for (const [dx, dy] of offsets) {
    const candidate: Piece = {
      ...piece,
      x: piece.x + dx,
      y: piece.y + dy,
      tetrominoKind: nextKind,
      cells: newCells,
    };
    if (canPlacePiece(state, candidate, 0, 0)) {
      state.activePiece = candidate;
      return true;
    }
  }
  return false;
}

export function settleBoardForDirection(
  grid: (Cell | null)[][],
  dir: GravityDirection = 'down',
  recordOffsets: boolean = true
): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  let moved = false;

  if (dir === 'down') {
    for (let col = 0; col < cols; col++) {
      let writeRow = rows - 1;
      for (let row = rows - 1; row >= 0; row--) {
        const cell = grid[row][col];
        if (cell !== null) {
          if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
            writeRow = row - 1;
            continue;
          }
          if (row !== writeRow) {
            if (recordOffsets) {
              const dropDist = writeRow - row;
              cell.fallOffset = Math.max(cell.fallOffset, dropDist);
            }
            grid[writeRow][col] = cell;
            grid[row][col] = null;
            moved = true;
          }
          writeRow--;
        }
      }
    }
    return moved;
  }

  if (dir === 'up') {
    for (let col = 0; col < cols; col++) {
      let writeRow = 0;
      for (let row = 0; row < rows; row++) {
        const cell = grid[row][col];
        if (cell !== null) {
          if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
            writeRow = row + 1;
            continue;
          }
          if (row !== writeRow) {
            if (recordOffsets) {
              cell.animOffsetY = -(row - writeRow);
            }
            grid[writeRow][col] = cell;
            grid[row][col] = null;
            moved = true;
          }
          writeRow++;
        }
      }
    }
    return moved;
  }

  if (dir === 'left') {
    for (let row = 0; row < rows; row++) {
      let writeCol = 0;
      for (let col = 0; col < cols; col++) {
        const cell = grid[row][col];
        if (cell !== null) {
          if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
            writeCol = col + 1;
            continue;
          }
          if (col !== writeCol) {
            if (recordOffsets) {
              cell.animOffsetX = col - writeCol;
            }
            grid[row][writeCol] = cell;
            grid[row][col] = null;
            moved = true;
          }
          writeCol++;
        }
      }
    }
    return moved;
  }

  for (let row = 0; row < rows; row++) {
    let writeCol = cols - 1;
    for (let col = cols - 1; col >= 0; col--) {
      const cell = grid[row][col];
      if (cell !== null) {
        if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
          writeCol = col - 1;
          continue;
        }
        if (col !== writeCol) {
          if (recordOffsets) {
            cell.animOffsetX = -(writeCol - col);
          }
          grid[row][writeCol] = cell;
          grid[row][col] = null;
          moved = true;
        }
        writeCol--;
      }
    }
  }
  return moved;
}

export function settleBoardForState(
  state: BoardState,
  recordOffsets: boolean = true
): boolean {
  if (state.activeShift === 'clamshell' && state.wellRegions && state.wellRegions.length >= 2) {
    const grid = state.grid;
    const rows = grid.length;
    const cols = grid[0]?.length ?? state.cols ?? BOARD_COLS;
    let moved = false;
    const topMax = state.wellRegions[0].maxRow;
    const botMin = state.wellRegions[1].minRow;

    for (let col = 0; col < cols; col++) {
      let writeUp = 0;
      for (let row = 0; row <= topMax && row < rows; row++) {
        const cell = grid[row][col];
        if (cell !== null) {
          if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
            writeUp = row + 1;
            continue;
          }
          if (row !== writeUp) {
            if (recordOffsets) {
              cell.animOffsetY = -(row - writeUp);
            }
            grid[writeUp][col] = cell;
            grid[row][col] = null;
            moved = true;
          }
          writeUp++;
        }
      }

      let writeDown = rows - 1;
      for (let row = rows - 1; row >= botMin && row >= 0; row--) {
        const cell = grid[row][col];
        if (cell !== null) {
          if ((cell.isObstacle && cell.obstacleFixed) || cell.isVirus) {
            writeDown = row - 1;
            continue;
          }
          if (row !== writeDown) {
            if (recordOffsets) {
              cell.fallOffset = Math.max(cell.fallOffset, writeDown - row);
            }
            grid[writeDown][col] = cell;
            grid[row][col] = null;
            moved = true;
          }
          writeDown--;
        }
      }
    }
    return moved;
  }
  return settleBoardForDirection(state.grid, state.gravityDirection ?? 'down', recordOffsets);
}

export function settleBoard(grid: (Cell | null)[][]): boolean {
  return settleBoardForDirection(grid, 'down', true);
}

const MARK_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

export function detectBoardMarks(
  grid: (Cell | null)[][],
  options?: { splitSeamRow?: number }
): SquareCoord[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  const splitSeamRow = options?.splitSeamRow;
  const total = rows * cols;
  if (total > bfsVisited.length) {
    const nextCap = Math.max(total, bfsVisited.length * 2);
    bfsVisited = new Uint8Array(nextCap);
    bfsQueue = new Int32Array(nextCap);
  }
  bfsVisited.fill(0, 0, total);

  for (let r = 0; r < rows; r++) {
    const rowArr = grid[r];
    for (let c = 0; c < cols; c++) {
      const cell = rowArr[c];
      if (cell) {
        cell.inSquare = false;
        cell.chainMarked = false;
      }
    }
  }

  const sameSideOfSeam = (r1: number, r2: number): boolean =>
    splitSeamRow === undefined || (r1 <= splitSeamRow) === (r2 <= splitSeamRow);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = grid[r][c];
      const startIdx = r * cols + c;
      if (!start || start.isObstacle || !start.isChain || bfsVisited[startIdx]) continue;

      let targetColor = start.color;
      let touchesSameColor = false;
      if (start.isWild) {
        for (let d = 0; d < 4; d++) {
          const nr = r + MARK_DIRS[d][0];
          const nc = c + MARK_DIRS[d][1];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && sameSideOfSeam(r, nr)) {
            const neighbor = grid[nr][nc];
            if (neighbor && !neighbor.isObstacle && !neighbor.isWild) {
              targetColor = neighbor.color;
              touchesSameColor = true;
              break;
            }
          }
        }
        if (!touchesSameColor) {
          for (let d = 0; d < 4; d++) {
            const nr = r + MARK_DIRS[d][0];
            const nc = c + MARK_DIRS[d][1];
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && sameSideOfSeam(r, nr)) {
              const neighbor = grid[nr][nc];
              if (neighbor && !neighbor.isObstacle) {
                touchesSameColor = true;
                break;
              }
            }
          }
        }
      } else {
        for (let d = 0; d < 4; d++) {
          const nr = r + MARK_DIRS[d][0];
          const nc = c + MARK_DIRS[d][1];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && sameSideOfSeam(r, nr)) {
            const neighbor = grid[nr][nc];
            if (
              neighbor &&
              !neighbor.isObstacle &&
              (neighbor.isWild || neighbor.color === targetColor)
            ) {
              touchesSameColor = true;
              break;
            }
          }
        }
      }
      if (!touchesSameColor) continue;

      let head = 0;
      let tail = 0;
      bfsQueue[tail++] = startIdx;
      bfsVisited[startIdx] = 1;
      while (head < tail) {
        const idx = bfsQueue[head++];
        const cr = Math.floor(idx / cols);
        const cc = idx - cr * cols;
        const curr = grid[cr][cc];
        if (curr) {
          curr.chainMarked = true;
        }
        for (let d = 0; d < 4; d++) {
          const nr = cr + MARK_DIRS[d][0];
          const nc = cc + MARK_DIRS[d][1];
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && sameSideOfSeam(cr, nr)) {
            const nIdx = nr * cols + nc;
            if (!bfsVisited[nIdx]) {
              const neighbor = grid[nr][nc];
              if (
                neighbor &&
                !neighbor.isObstacle &&
                (neighbor.isWild || neighbor.color === targetColor)
              ) {
                bfsVisited[nIdx] = 1;
                bfsQueue[tail++] = nIdx;
              }
            }
          }
        }
      }
    }
  }

  const squares: SquareCoord[] = [];
  for (let r = 0; r < rows - 1; r++) {
    if (splitSeamRow !== undefined && r === splitSeamRow) continue;
    const row0 = grid[r];
    const row1 = grid[r + 1];
    for (let c = 0; c < cols - 1; c++) {
      const a = row0[c];
      const b = row0[c + 1];
      const d = row1[c];
      const e = row1[c + 1];
      if (!a || !b || !d || !e) continue;
      if (a.isObstacle || b.isObstacle || d.isObstacle || e.isObstacle) continue;
      if (
        a.chainMarked ||
        b.chainMarked ||
        d.chainMarked ||
        e.chainMarked ||
        a.isChain ||
        b.isChain ||
        d.isChain ||
        e.isChain
      ) {
        continue;
      }

      let refColor: CellColor | null = null;
      let match = true;
      if (!a.isWild) refColor = a.color;
      if (!b.isWild) {
        if (refColor === null) refColor = b.color;
        else if (b.color !== refColor) match = false;
      }
      if (match && !d.isWild) {
        if (refColor === null) refColor = d.color;
        else if (d.color !== refColor) match = false;
      }
      if (match && !e.isWild) {
        if (refColor === null) refColor = e.color;
        else if (e.color !== refColor) match = false;
      }

      if (match) {
        a.inSquare = true;
        b.inSquare = true;
        d.inSquare = true;
        e.inSquare = true;
        squares.push({ x: c, y: r, color: refColor ?? 0 });
      }
    }
  }

  return squares;
}

export function detectBoardMarksForState(state: BoardState): SquareCoord[] {
  return detectBoardMarks(
    state.grid,
    state.activeShift === 'clamshell' && state.wellRegions?.length
      ? { splitSeamRow: state.wellRegions[0].maxRow }
      : undefined
  );
}

export function trimOverflowForZenFlow(state: BoardState): number {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  let trimmed = 0;

  if (state.wellRegions && state.wellRegions.length > 0) {
    for (const region of state.wellRegions) {
      const regionW = region.maxCol - region.minCol + 1;
      const spawnX = region.minCol + Math.max(0, Math.floor((regionW - 2) / 2));
      if (region.gravity === 'up') {
        for (let c = region.minCol; c <= region.maxCol; c++) {
          const depth = c === spawnX || c === spawnX + 1 ? 3 : 2;
          const minR = Math.max(region.minRow, region.maxRow - depth + 1);
          for (let r = minR; r <= region.maxRow; r++) {
            const cell = state.grid[r][c];
            if (cell !== null && !cell.isObstacle) {
              state.grid[r][c] = null;
              trimmed++;
            }
          }
        }
      } else {
        for (let c = region.minCol; c <= region.maxCol; c++) {
          const depth = c === spawnX || c === spawnX + 1 ? 3 : 2;
          const maxR = Math.min(region.maxRow, region.minRow + depth - 1);
          for (let r = region.minRow; r <= maxR; r++) {
            const cell = state.grid[r][c];
            if (cell !== null && !cell.isObstacle) {
              state.grid[r][c] = null;
              trimmed++;
            }
          }
        }
      }
    }
    settleBoardForState(state, true);
    state.squares = detectBoardMarksForState(state);
    state.isGameOver = false;
    return trimmed;
  }

  const dir = state.gravityDirection ?? 'down';
  const spawnX = getSpawnColForWidth(cols);
  const spawnY = Math.max(0, Math.floor((rows - 2) / 2));

  if (dir === 'down') {
    for (let c = 0; c < cols; c++) {
      const maxClearRow = c === spawnX || c === spawnX + 1 ? 2 : 1;
      for (let r = 0; r <= Math.min(rows - 1, maxClearRow); r++) {
        const cell = state.grid[r][c];
        if (cell !== null && !cell.isObstacle) {
          state.grid[r][c] = null;
          trimmed++;
        }
      }
    }
  } else if (dir === 'up') {
    for (let c = 0; c < cols; c++) {
      const depth = c === spawnX || c === spawnX + 1 ? 3 : 2;
      for (let r = Math.max(0, rows - depth); r < rows; r++) {
        const cell = state.grid[r][c];
        if (cell !== null && !cell.isObstacle) {
          state.grid[r][c] = null;
          trimmed++;
        }
      }
    }
  } else if (dir === 'right') {
    for (let r = 0; r < rows; r++) {
      const maxClearCol = r === spawnY || r === spawnY + 1 ? 2 : 1;
      for (let c = 0; c <= Math.min(cols - 1, maxClearCol); c++) {
        const cell = state.grid[r][c];
        if (cell !== null && !cell.isObstacle) {
          state.grid[r][c] = null;
          trimmed++;
        }
      }
    }
  } else {
    for (let r = 0; r < rows; r++) {
      const depth = r === spawnY || r === spawnY + 1 ? 3 : 2;
      for (let c = Math.max(0, cols - depth); c < cols; c++) {
        const cell = state.grid[r][c];
        if (cell !== null && !cell.isObstacle) {
          state.grid[r][c] = null;
          trimmed++;
        }
      }
    }
  }

  settleBoardForState(state, true);
  state.squares = detectBoardMarksForState(state);
  state.isGameOver = false;
  return trimmed;
}

function buildPlacedGridCell(
  pCell: Exclude<PieceCell, null>,
  fallOffset: number,
  animOffsetX: number,
  animOffsetY: number
): Cell {
  return pCell.isBlocked
    ? {
        id: allocCellId(),
        color: 0,
        isChain: false,
        isObstacle: true,
        obstacleFixed: false,
        obstacleStyle: 'blocked',
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset,
        animOffsetX,
        animOffsetY,
        landFlash: 1,
      }
    : {
        id: allocCellId(),
        color: pCell.color,
        isChain: pCell.isChain,
        ...(pCell.isWild ? { isWild: true } : {}),
        ...(pCell.isCrashGem ? { isCrashGem: true } : {}),
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset,
        animOffsetX,
        animOffsetY,
        landFlash: 1,
      };
}

export function lockActivePiece(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  options?: { zenNoLoss?: boolean }
): { landed: boolean; squaresFormed: number; chainActivated: boolean; zenTrimmed: boolean } {
  const piece = state.activePiece;
  if (!piece) return { landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const pieceRows = piece.cells.length;
  const pieceCols = piece.cells[0]?.length ?? 0;
  const region = getActiveWellRegion(state);
  const dir: GravityDirection = region?.gravity ?? state.gravityDirection ?? 'down';
  const minRowBound = region ? region.minRow : 0;
  const maxRowBound = region ? region.maxRow : rows - 1;
  const minColBound = region ? region.minCol : 0;
  const maxColBound = region ? region.maxCol : cols - 1;

  settleBoardForState(state, true);

  let totalPieceCells = 0;
  for (let py = 0; py < pieceRows; py++) {
    for (let px = 0; px < pieceCols; px++) {
      if (piece.cells[py]?.[px] !== null) totalPieceCells++;
    }
  }

  let overflowed = false;
  let placedCellsCount = 0;
  let crumbleChanged = false;
  if (dir === 'down') {
    for (let px = 0; px < pieceCols; px++) {
      const gx = piece.x + px;
      if (gx < minColBound || gx > maxColBound || gx < 0 || gx >= cols) continue;

      let lowestPy = -1;
      for (let py = pieceRows - 1; py >= 0; py--) {
        if (piece.cells[py]?.[px] !== null) {
          lowestPy = py;
          break;
        }
      }
      if (lowestPy < 0) continue;

      const startScan = Math.max(minRowBound, piece.y + lowestPy);
      let stopRow = maxRowBound + 1;
      for (let scan = startScan; scan <= maxRowBound; scan++) {
        if (state.grid[scan][gx] !== null) {
          stopRow = scan;
          break;
        }
      }
      let writeRow = stopRow - 1;

      for (let py = pieceRows - 1; py >= 0; py--) {
        const pCell = piece.cells[py]?.[px];
        if (!pCell) continue;
        const sourceRow = piece.y + py;
        if (writeRow < minRowBound) {
          overflowed = true;
          continue;
        }
        state.grid[writeRow][gx] = buildPlacedGridCell(
          pCell,
          Math.max(0, writeRow - sourceRow),
          0,
          0
        );
        placedCellsCount++;
        writeRow--;
      }

      if (stopRow <= maxRowBound) {
        const hitCell = state.grid[stopRow][gx];
        if (hitCell && hitCell.isObstacle && hitCell.obstacleStyle === 'crumble') {
          const nextHp = (hitCell.crumbleHp ?? 2) - 1;
          if (nextHp <= 0) {
            state.grid[stopRow][gx] = null;
            crumbleChanged = true;
          } else {
            hitCell.crumbleHp = nextHp;
            hitCell.landFlash = 0.85;
          }
        }
      }
    }
  } else if (dir === 'up') {
    for (let px = 0; px < pieceCols; px++) {
      const gx = piece.x + px;
      if (gx < minColBound || gx > maxColBound || gx < 0 || gx >= cols) continue;

      let topPy = -1;
      for (let py = 0; py < pieceRows; py++) {
        if (piece.cells[py]?.[px] !== null) {
          topPy = py;
          break;
        }
      }
      if (topPy < 0) continue;

      const startScan = Math.min(maxRowBound, piece.y + topPy);
      let stopRow = minRowBound - 1;
      for (let scan = startScan; scan >= minRowBound; scan--) {
        if (state.grid[scan][gx] !== null) {
          stopRow = scan;
          break;
        }
      }
      let writeRow = stopRow + 1;

      for (let py = 0; py < pieceRows; py++) {
        const pCell = piece.cells[py]?.[px];
        if (!pCell) continue;
        const sourceRow = piece.y + py;
        if (writeRow > maxRowBound) {
          overflowed = true;
          continue;
        }
        state.grid[writeRow][gx] = buildPlacedGridCell(
          pCell,
          0,
          0,
          Math.min(0, writeRow - sourceRow)
        );
        placedCellsCount++;
        writeRow++;
      }
    }
  } else if (dir === 'right') {
    for (let py = 0; py < pieceRows; py++) {
      const gy = piece.y + py;
      if (gy < minRowBound || gy > maxRowBound || gy < 0 || gy >= rows) continue;

      let rightPx = -1;
      for (let px = pieceCols - 1; px >= 0; px--) {
        if (piece.cells[py]?.[px] !== null) {
          rightPx = px;
          break;
        }
      }
      if (rightPx < 0) continue;

      const startScan = Math.max(minColBound, piece.x + rightPx);
      let stopCol = maxColBound + 1;
      for (let scan = startScan; scan <= maxColBound; scan++) {
        if (state.grid[gy][scan] !== null) {
          stopCol = scan;
          break;
        }
      }
      let writeCol = stopCol - 1;

      for (let px = pieceCols - 1; px >= 0; px--) {
        const pCell = piece.cells[py]?.[px];
        if (!pCell) continue;
        const sourceCol = piece.x + px;
        if (writeCol < minColBound) {
          overflowed = true;
          continue;
        }
        state.grid[gy][writeCol] = buildPlacedGridCell(
          pCell,
          0,
          Math.min(0, sourceCol - writeCol),
          0
        );
        placedCellsCount++;
        writeCol--;
      }
    }
  } else {
    for (let py = 0; py < pieceRows; py++) {
      const gy = piece.y + py;
      if (gy < minRowBound || gy > maxRowBound || gy < 0 || gy >= rows) continue;

      let leftPx = -1;
      for (let px = 0; px < pieceCols; px++) {
        if (piece.cells[py]?.[px] !== null) {
          leftPx = px;
          break;
        }
      }
      if (leftPx < 0) continue;

      const startScan = Math.min(maxColBound, piece.x + leftPx);
      let stopCol = minColBound - 1;
      for (let scan = startScan; scan >= minColBound; scan--) {
        if (state.grid[gy][scan] !== null) {
          stopCol = scan;
          break;
        }
      }
      let writeCol = stopCol + 1;

      for (let px = 0; px < pieceCols; px++) {
        const pCell = piece.cells[py]?.[px];
        if (!pCell) continue;
        const sourceCol = piece.x + px;
        if (writeCol > maxColBound) {
          overflowed = true;
          continue;
        }
        state.grid[gy][writeCol] = buildPlacedGridCell(
          pCell,
          0,
          Math.max(0, sourceCol - writeCol),
          0
        );
        placedCellsCount++;
        writeCol++;
      }
    }
  }

  const noCellsEntered = totalPieceCells > 0 && placedCellsCount === 0;

  let zenTrimmed = false;
  if (overflowed && options?.zenNoLoss) {
    trimOverflowForZenFlow(state);
    zenTrimmed = true;
  }

  if (crumbleChanged) {
    settleBoardForState(state, true);
  }

  if ((!noCellsEntered || options?.zenNoLoss) && state.activeShift === 'cyclotron_flow') {
    const cwOrder: GravityDirection[] = ['down', 'right', 'up', 'left'];
    const nextDir = cwOrder[(cwOrder.indexOf(dir) + 1) % 4];
    state.gravityDirection = nextDir;
    settleBoardForDirection(state.grid, nextDir, true);

    const marginDepth = 3;
    const evicted: Cell[] = [];
    if (nextDir === 'right') {
      const limitC = Math.min(marginDepth, cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < limitC; c++) {
          const cell = state.grid[r][c];
          if (cell && !cell.isObstacle) {
            evicted.push(cell);
            state.grid[r][c] = null;
          }
        }
      }
      for (const cell of evicted) {
        let bestC = -1;
        let bestR = -1;
        for (let r = 0; r < rows; r++) {
          for (let c = cols - 1; c >= limitC; c--) {
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
          state.grid[bestR][bestC] = { ...cell, landFlash: 0.45 };
        }
      }
    } else if (nextDir === 'left') {
      const startC = Math.max(0, cols - marginDepth);
      for (let r = 0; r < rows; r++) {
        for (let c = startC; c < cols; c++) {
          const cell = state.grid[r][c];
          if (cell && !cell.isObstacle) {
            evicted.push(cell);
            state.grid[r][c] = null;
          }
        }
      }
      for (const cell of evicted) {
        let bestC = cols;
        let bestR = -1;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < startC; c++) {
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
          state.grid[bestR][bestC] = { ...cell, landFlash: 0.45 };
        }
      }
    } else if (nextDir === 'up') {
      const startR = Math.max(0, rows - marginDepth);
      for (let r = startR; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = state.grid[r][c];
          if (cell && !cell.isObstacle) {
            evicted.push(cell);
            state.grid[r][c] = null;
          }
        }
      }
      for (const cell of evicted) {
        let bestR = rows;
        let bestC = -1;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < startR; r++) {
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
          state.grid[bestR][bestC] = { ...cell, landFlash: 0.45 };
        }
      }
    } else {
      const limitR = Math.min(marginDepth, rows);
      for (let r = 0; r < limitR; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = state.grid[r][c];
          if (cell && !cell.isObstacle) {
            evicted.push(cell);
            state.grid[r][c] = null;
          }
        }
      }
      for (const cell of evicted) {
        let bestR = -1;
        let bestC = -1;
        for (let c = 0; c < cols; c++) {
          for (let r = rows - 1; r >= limitR; r--) {
            if (state.grid[r][c] === null) {
              if (r > bestR) {
                bestR = r;
                bestC = c;
              }
              break;
            }
          }
        }
        if (bestR >= 0 && bestC >= 0) {
          state.grid[bestR][bestC] = { ...cell, landFlash: 0.45 };
        }
      }
    }
    settleBoardForDirection(state.grid, nextDir, false);
  }

  if (state.wellRegions && state.wellRegions.length > 0 && (!noCellsEntered || options?.zenNoLoss)) {
    state.activeWellIndex = ((state.activeWellIndex ?? 0) + 1) % state.wellRegions.length;
  }

  const prevSquaresCount = state.squares.length;
  state.squares = detectBoardMarksForState(state);
  const chainActivated = state.grid.some((row) =>
    row.some((c) => c !== null && c.chainMarked)
  );

  const genOpts: GeneratePieceOptions = {
    colorCount: state.colorCount,
    shapeMode: state.pieceShapeMode,
    boardCols: cols,
    allowCrashGem: state.activeShift === 'crash_gem',
  };
  const fallbackSpawnX = getSpawnColForWidth(cols, 2);
  const popped =
    state.nextQueue.shift() ??
    generateRandomPiece(chainFrequency, rng, fallbackSpawnX, genOpts);
  const nextPos = getPieceInitialPos(state, popped);
  const next: Piece = {
    ...popped,
    x: nextPos.x,
    y: nextPos.y,
  };
  const queuedPiece = generateRandomPiece(chainFrequency, rng, fallbackSpawnX, genOpts);
  const queuedPos = getPieceInitialPos(state, queuedPiece);
  state.nextQueue = state.nextQueue.map((q) => {
    const qPos = getPieceInitialPos(state, q);
    return { ...q, x: qPos.x, y: qPos.y };
  });
  state.nextQueue.push({
    ...queuedPiece,
    x: queuedPos.x,
    y: queuedPos.y,
  });

  state.stashUsedThisTurn = false;

  if (noCellsEntered && !options?.zenNoLoss) {
    state.activePiece = null;
    state.isGameOver = true;
  } else {
    state.activePiece = next;
    state.spawnTimer = 0;
    state.gravityAccum = 0;
    state.lockTimer = 0;
    state.lockResetCount = 0;
  }

  return {
    landed: true,
    squaresFormed: Math.max(0, state.squares.length - prevSquaresCount),
    chainActivated,
    zenTrimmed,
  };
}

function trySpringBouncePiece(
  state: BoardState,
  bouncePositions?: Array<{ x: number; y: number }>
): boolean {
  const piece = state.activePiece;
  if (
    !piece ||
    state.activeShift !== 'spring_bounce' ||
    piece.springBounced ||
    getActiveGravityDirection(state) !== 'down'
  ) {
    return false;
  }

  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  let hitsSpring = false;
  let padGX = piece.x;
  let padGY = piece.y;

  for (let py = 0; py < piece.cells.length && !hitsSpring; py++) {
    for (let px = 0; px < (piece.cells[py]?.length ?? 0); px++) {
      if (!piece.cells[py]?.[px]) continue;
      const gx = piece.x + px;
      const gy = piece.y + py + 1;
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        const below = state.grid[gy][gx];
        if (below?.isObstacle && below.obstacleStyle === 'spring') {
          hitsSpring = true;
          padGX = gx;
          padGY = gy;
          below.landFlash = 1;
          break;
        }
      }
    }
  }

  if (!hitsSpring) return false;

  const kickDir = padGX < cols / 2 ? 1 : -1;
  const offsets: Array<[number, number]> = [
    [kickDir * 2, -2],
    [-kickDir * 2, -2],
    [kickDir, -2],
    [-kickDir, -2],
    [0, -2],
    [kickDir, -1],
    [-kickDir, -1],
    [0, -1],
  ];

  for (const [dx, dy] of offsets) {
    const candidate: Piece = {
      ...piece,
      x: piece.x + dx,
      y: piece.y + dy,
      springBounced: true,
    };
    if (canPlacePiece(state, candidate, 0, 0)) {
      state.activePiece = candidate;
      state.lockTimer = 0;
      state.gravityAccum = 0;
      bouncePositions?.push({ x: padGX, y: Math.max(0, padGY - 1) });
      return true;
    }
  }

  return false;
}

export function softDropStep(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  options?: { zenNoLoss?: boolean }
): {
  moved: boolean;
  landed: boolean;
  squaresFormed: number;
  chainActivated: boolean;
  zenTrimmed: boolean;
  bouncePositions?: Array<{ x: number; y: number }>;
} {
  if (!state.activePiece || state.isGameOver) {
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }
  state.orientationGraceTimer = 0;

  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));
  if (canPlacePiece(state, state.activePiece, gx, gy)) {
    state.activePiece = {
      ...state.activePiece,
      x: state.activePiece.x + gx,
      y: state.activePiece.y + gy,
    };
    state.gravityAccum = 0;
    state.lockTimer = 0;
    if (!isPieceInStaging(state, state.activePiece)) {
      state.score += 1;
    }
    return { moved: true, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }
  const bouncePositions: Array<{ x: number; y: number }> = [];
  if (trySpringBouncePiece(state, bouncePositions)) {
    return {
      moved: true,
      landed: false,
      squaresFormed: 0,
      chainActivated: false,
      zenTrimmed: false,
      bouncePositions,
    };
  }
  const res = lockActivePiece(state, chainFrequency, rng, options);
  return {
    moved: false,
    landed: res.landed,
    squaresFormed: res.squaresFormed,
    chainActivated: res.chainActivated,
    zenTrimmed: res.zenTrimmed,
  };
}

export function hardDropPiece(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  options?: { zenNoLoss?: boolean }
): {
  rowsDropped: number;
  landed: boolean;
  squaresFormed: number;
  chainActivated: boolean;
  zenTrimmed: boolean;
  bouncePositions?: Array<{ x: number; y: number }>;
  finalPieceX?: number;
  finalPieceY?: number;
} {
  if (!state.activePiece || state.isGameOver) {
    return { rowsDropped: 0, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }
  state.orientationGraceTimer = 0;
  let rowsDropped = 0;
  const bouncePositions: Array<{ x: number; y: number }> = [];

  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));
  const maxSteps = state.cols + state.rows + 8;
  while (rowsDropped < maxSteps && canPlacePiece(state, state.activePiece, gx, gy)) {
    state.activePiece = {
      ...state.activePiece,
      x: state.activePiece.x + gx,
      y: state.activePiece.y + gy,
    };
    rowsDropped++;
    if (!isPieceInStaging(state, state.activePiece)) {
      state.score += 1;
    }
  }
  if (trySpringBouncePiece(state, bouncePositions)) {
    return {
      rowsDropped,
      landed: false,
      squaresFormed: 0,
      chainActivated: false,
      zenTrimmed: false,
      bouncePositions,
      finalPieceX: state.activePiece.x,
      finalPieceY: state.activePiece.y,
    };
  }

  const finalPieceX = state.activePiece.x;
  const finalPieceY = state.activePiece.y;
  const res = lockActivePiece(state, chainFrequency, rng, options);
  return {
    rowsDropped,
    landed: res.landed,
    squaresFormed: res.squaresFormed,
    chainActivated: res.chainActivated,
    zenTrimmed: res.zenTrimmed,
    bouncePositions: bouncePositions.length > 0 ? bouncePositions : undefined,
    finalPieceX,
    finalPieceY,
  };
}

export function stepPassiveGravity(
  state: BoardState,
  dt: number,
  gravitySpeed: number,
  spawnDelay: number,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  options?: { zenNoLoss?: boolean }
): {
  moved: boolean;
  landed: boolean;
  squaresFormed: number;
  chainActivated: boolean;
  zenTrimmed: boolean;
  bouncePositions?: Array<{ x: number; y: number }>;
  finalPieceX?: number;
  finalPieceY?: number;
} {
  if (!state.activePiece || state.isGameOver) {
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }

  if (state.orientationGraceTimer > 0) {
    state.orientationGraceTimer = Math.max(0, state.orientationGraceTimer - dt);
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }

  const { gx, gy } = getGravityVector(getActiveGravityDirection(state));

  if (state.spawnTimer < spawnDelay) {
    const nextSpawn = state.spawnTimer + dt;
    if (nextSpawn < spawnDelay) {
      state.spawnTimer = nextSpawn;
      return { moved: false, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
    }
    const leftoverDt = nextSpawn - spawnDelay;
    state.spawnTimer = spawnDelay;
    state.gravityAccum = Math.max(state.gravityAccum, 1) + leftoverDt * gravitySpeed;
  }

  const canContinueMoving = () => {
    if (!state.activePiece) return false;
    return canPlacePiece(state, state.activePiece, gx, gy);
  };

  if (!canContinueMoving()) {
    const springBounce: Array<{ x: number; y: number }> = [];
    if (trySpringBouncePiece(state, springBounce)) {
      return {
        moved: true,
        landed: false,
        squaresFormed: 0,
        chainActivated: false,
        zenTrimmed: false,
        bouncePositions: springBounce,
      };
    }
    state.gravityAccum = 0;
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY_SEC) {
      const fx = state.activePiece.x;
      const fy = state.activePiece.y;
      const res = lockActivePiece(state, chainFrequency, rng, options);
      return {
        moved: false,
        landed: res.landed,
        squaresFormed: res.squaresFormed,
        chainActivated: res.chainActivated,
        zenTrimmed: res.zenTrimmed,
        finalPieceX: fx,
        finalPieceY: fy,
      };
    }
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false, zenTrimmed: false };
  }

  state.lockTimer = 0;
  state.gravityAccum += dt * gravitySpeed;
  let movedAny = false;
  const bouncePositions: Array<{ x: number; y: number }> = [];

  while (state.gravityAccum >= 1) {
    state.gravityAccum -= 1;
    if (canPlacePiece(state, state.activePiece, gx, gy)) {
      state.activePiece = {
        ...state.activePiece,
        x: state.activePiece.x + gx,
        y: state.activePiece.y + gy,
      };
      movedAny = true;
      if (!canPlacePiece(state, state.activePiece, gx, gy)) {
        trySpringBouncePiece(state, bouncePositions);
        state.gravityAccum = 0;
        break;
      }
    } else {
      state.gravityAccum = 0;
      break;
    }
  }

  return {
    moved: movedAny,
    landed: false,
    squaresFormed: 0,
    chainActivated: false,
    zenTrimmed: false,
    bouncePositions: bouncePositions.length > 0 ? bouncePositions : undefined,
  };
}

export function calculateSweepScore(squareCount: number, comboLevel: number): number {
  const base = squareCount * 40;
  if (squareCount < 4) {
    return base;
  }
  const effectiveLevel = Math.max(1, comboLevel);
  const multiplier = Math.min(4 * effectiveLevel, 16);
  const sizeBonus = Math.round(squareCount * (squareCount - 3) * 15);
  return (base + sizeBonus) * multiplier;
}

const SHATTER_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

function getChainCellEffectiveColor(
  grid: (Cell | null)[][],
  r: number,
  c: number
): CellColor {
  const cell = grid[r]?.[c];
  if (!cell) return 0;
  if (!cell.isWild) return cell.color;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let d = 0; d < 4; d++) {
    const nr = r + SHATTER_DIRS[d][0];
    const nc = c + SHATTER_DIRS[d][1];
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const neighbor = grid[nr][nc];
    if (neighbor && !neighbor.isObstacle && !neighbor.isWild) {
      return neighbor.color;
    }
  }
  return cell.color;
}

function flushPendingClearCells(
  state: BoardState,
  colorFilter?: CellColor | null
): {
  cellsRemoved: number;
  clearedPositions: Array<{ x: number; y: number; color: CellColor }>;
} {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const total = rows * cols;
  if (total > bfsVisited.length) {
    const nextCap = Math.max(total, bfsVisited.length * 2);
    bfsVisited = new Uint8Array(nextCap);
    bfsQueue = new Int32Array(nextCap);
  }
  bfsVisited.fill(0, 0, total);

  let cellsRemoved = 0;
  const clearedPositions: Array<{ x: number; y: number; color: CellColor }> = [];
  const pendingIndices: number[] = [];
  let qTail = 0;

  for (let r = 0; r < rows; r++) {
    const rowArr = state.grid[r];
    for (let c = 0; c < cols; c++) {
      const cell = rowArr[c];
      if (cell && cell.pendingClear) {
        if (colorFilter !== undefined && colorFilter !== null) {
          const effectivePendingColor = cell.pendingClearColor ?? cell.color;
          if (effectivePendingColor !== colorFilter) {
            continue;
          }
        }
        if ((cell.frostHp ?? 0) > 1) {
          cell.frostHp = 1;
          cell.pendingClear = false;
          cell.pendingClearColor = undefined;
          cell.landFlash = 0.95;
          continue;
        }
        const idx = r * cols + c;
        bfsVisited[idx] = 1;
        pendingIndices.push(idx);
        if (cell.isCrashGem) {
          bfsQueue[qTail++] = idx;
        }
      }
    }
  }

  let qHead = 0;
  while (qHead < qTail) {
    const curIdx = bfsQueue[qHead++];
    const cr = (curIdx / cols) | 0;
    const cc = curIdx % cols;
    const targetColor = state.grid[cr][cc]?.color ?? 0;
    for (let d = 0; d < 4; d++) {
      const nr = cr + SHATTER_DIRS[d][0];
      const nc = cc + SHATTER_DIRS[d][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nIdx = nr * cols + nc;
      if (bfsVisited[nIdx]) continue;
      const adj = state.grid[nr][nc];
      if (adj && !adj.isObstacle && (adj.color === targetColor || adj.isWild)) {
        bfsVisited[nIdx] = 1;
        pendingIndices.push(nIdx);
        bfsQueue[qTail++] = nIdx;
      }
    }
  }

  for (let i = 0; i < pendingIndices.length; i++) {
    const idx = pendingIndices[i];
    const r = (idx / cols) | 0;
    const c = idx % cols;
    const cell = state.grid[r][c];
    if (cell) {
      clearedPositions.push({ x: c, y: r, color: cell.color });
      state.grid[r][c] = null;
      cellsRemoved++;
    }
    for (let d = 0; d < 4; d++) {
      const nr = r + SHATTER_DIRS[d][0];
      const nc = c + SHATTER_DIRS[d][1];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const adj = state.grid[nr][nc];
      if (adj && adj.isObstacle && adj.obstacleStyle === 'blocked' && !adj.obstacleFixed) {
        clearedPositions.push({ x: nc, y: nr, color: 0 });
        state.grid[nr][nc] = null;
      } else if (adj && adj.isObstacle && adj.obstacleStyle === 'crumble') {
        const nextHp = (adj.crumbleHp ?? 2) - 1;
        if (nextHp <= 0) {
          clearedPositions.push({ x: nc, y: nr, color: 0 });
          state.grid[nr][nc] = null;
        } else {
          adj.crumbleHp = nextHp;
          adj.landFlash = 0.85;
        }
      }
    }
  }

  if (clearedPositions.length > 0 || pendingIndices.length === 0) {
    if (clearedPositions.length > 0) {
      settleBoardForState(state, true);
    }
    state.squares = detectBoardMarksForState(state);
  }

  return { cellsRemoved, clearedPositions };
}

export function getDiagonalSlantSpan(cols: number): number {
  return Math.max(2, Math.min(6, Math.floor(cols * 0.375)));
}

export function getSweepColumnForRow(
  state: Pick<BoardState, 'activeShift' | 'cols' | 'rows' | 'grid'>,
  row: number,
  col: number
): number {
  const rows = state.grid.length || state.rows;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  if (cols <= 0) return 0;
  const wrappedBase = ((col % cols) + cols) % cols;
  if (state.activeShift === 'split_half_sweep') {
    const midRow = Math.floor(rows / 2);
    if (row < midRow) return wrappedBase;
    return (wrappedBase + Math.floor(cols / 2)) % cols;
  }
  if (state.activeShift === 'diagonal_slant_sweep') {
    const slantCols = getDiagonalSlantSpan(cols);
    const clampedRow = Math.max(0, Math.min(rows - 1, row));
    const lag = Math.round((clampedRow * slantCols) / Math.max(1, rows - 1));
    return (((wrappedBase - lag) % cols) + cols) % cols;
  }
  return wrappedBase;
}

export function stepTimelineColumn(
  state: BoardState,
  col: number,
  direction: 'ltr' | 'rtl' = 'ltr',
  options?: { colorFilter?: CellColor | null }
): { cellsRemovedNow: number; clearedPositions: Array<{ x: number; y: number; color: CellColor }> } {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  if (col < 0 || col >= cols) {
    return { cellsRemovedNow: 0, clearedPositions: [] };
  }

  const colorFilter = options?.colorFilter ?? null;
  state.squares = detectBoardMarksForState(state);

  const isModifiedLineSweep =
    direction === 'ltr' &&
    (state.activeShift === 'split_half_sweep' ||
      state.activeShift === 'diagonal_slant_sweep');

  for (let r = 0; r < rows; r++) {
    const rowCol = isModifiedLineSweep ? getSweepColumnForRow(state, r, col) : col;
    const cell = state.grid[r][rowCol];
    if (!cell || cell.isObstacle) continue;
    const effColor = getChainCellEffectiveColor(state.grid, r, rowCol);
    const matchesColor = colorFilter === null || effColor === colorFilter;
    if ((cell.inSquare || cell.chainMarked) && matchesColor) {
      cell.sweptCol = true;
    }
    if (cell.chainMarked && !cell.pendingClear && matchesColor) {
      cell.pendingClear = true;
      cell.pendingClearColor = colorFilter ?? effColor;
      state.sweepState.chainClearedThisSweep++;
    }
  }

  const getSquareOwnerRow = (sqY: number): number =>
    state.activeShift === 'diagonal_slant_sweep'
      ? Math.min(rows - 1, sqY + 1)
      : sqY;

  for (let i = 0; i < state.squares.length; i++) {
    const sq = state.squares[i];
    if (colorFilter !== null && sq.color !== colorFilter) continue;
    const sqCol = isModifiedLineSweep
      ? getSweepColumnForRow(state, getSquareOwnerRow(sq.y), col)
      : col;
    const trailingMatch = direction === 'rtl' ? sq.x === sqCol : sq.x + 1 === sqCol;
    if (trailingMatch) {
      const key = `${sq.x},${sq.y}`;
      if (!state.sweepState.countedSquareKeys.has(key)) {
        state.sweepState.countedSquareKeys.add(key);
        state.sweepState.squaresThisSweep++;
      }
      const markColor = colorFilter ?? sq.color;
      const c00 = state.grid[sq.y][sq.x];
      const c01 = state.grid[sq.y][sq.x + 1];
      const c10 = state.grid[sq.y + 1][sq.x];
      const c11 = state.grid[sq.y + 1][sq.x + 1];
      if (c00) {
        c00.pendingClear = true;
        c00.pendingClearColor = markColor;
      }
      if (c01) {
        c01.pendingClear = true;
        c01.pendingClearColor = markColor;
      }
      if (c10) {
        c10.pendingClear = true;
        c10.pendingClearColor = markColor;
      }
      if (c11) {
        c11.pendingClear = true;
        c11.pendingClearColor = markColor;
      }
    }
  }

  const minActiveCol = state.lockedColumnsLeft;
  const maxActiveCol = cols - 1 - state.lockedColumnsRight;
  let bridgesNext = false;

  if (isModifiedLineSweep) {
    let hasPendingCells = false;
    for (let r = 0; r < rows && !hasPendingCells; r++) {
      const rowArr = state.grid[r];
      for (let c = 0; c < cols; c++) {
        const cell = rowArr[c];
        if (
          cell?.pendingClear &&
          (colorFilter === null || (cell.pendingClearColor ?? cell.color) === colorFilter)
        ) {
          hasPendingCells = true;
          break;
        }
      }
    }
    if (hasPendingCells) {
      for (let i = 0; i < state.squares.length; i++) {
        const sq = state.squares[i];
        if (colorFilter !== null && sq.color !== colorFilter) continue;
        const c00 = state.grid[sq.y][sq.x];
        const c01 = state.grid[sq.y][sq.x + 1];
        const c10 = state.grid[sq.y + 1][sq.x];
        const c11 = state.grid[sq.y + 1][sq.x + 1];
        if (c00?.pendingClear && c01?.pendingClear && c10?.pendingClear && c11?.pendingClear) {
          continue;
        }
        const touchesPending = Boolean(
          c00?.pendingClear || c01?.pendingClear || c10?.pendingClear || c11?.pendingClear
        );
        const sqCol = getSweepColumnForRow(state, getSquareOwnerRow(sq.y), col);
        const horizontallyBridged =
          sq.x === sqCol &&
          sqCol < maxActiveCol &&
          (Boolean(c00?.pendingClear) ||
            Boolean(c10?.pendingClear) ||
            (sq.x > 0 &&
              (Boolean(state.grid[sq.y][sq.x - 1]?.pendingClear) ||
                Boolean(state.grid[sq.y + 1][sq.x - 1]?.pendingClear))));
        if ((touchesPending || horizontallyBridged) && col < maxActiveCol) {
          bridgesNext = true;
          break;
        }
      }
      if (!bridgesNext) {
        for (let r = 0; r < rows && !bridgesNext; r++) {
          const rowCol = getSweepColumnForRow(state, r, col);
          if (rowCol >= maxActiveCol) continue;
          const cur = state.grid[r][rowCol];
          const nxt = state.grid[r][rowCol + 1];
          if (
            cur?.pendingClear &&
            cur.chainMarked &&
            nxt &&
            nxt.chainMarked &&
            !nxt.pendingClear &&
            (cur.isWild || nxt.isWild || cur.color === nxt.color) &&
            (colorFilter === null || getChainCellEffectiveColor(state.grid, r, rowCol) === colorFilter)
          ) {
            bridgesNext = true;
          }
        }
      }
    }
  } else if (direction === 'rtl') {
    if (col > minActiveCol) {
      for (let i = 0; i < state.squares.length; i++) {
        const sq = state.squares[i];
        if (colorFilter !== null && sq.color !== colorFilter) continue;
        if (sq.x + 1 === col) {
          bridgesNext = true;
          break;
        }
      }
      if (!bridgesNext) {
        for (let r = 0; r < rows; r++) {
          const cur = state.grid[r][col];
          const nxt = state.grid[r][col - 1];
          if (
            cur &&
            nxt &&
            cur.chainMarked &&
            nxt.chainMarked &&
            (cur.isWild || nxt.isWild || cur.color === nxt.color) &&
            (colorFilter === null || getChainCellEffectiveColor(state.grid, r, col) === colorFilter)
          ) {
            bridgesNext = true;
            break;
          }
        }
      }
    }
  } else if (col < maxActiveCol) {
    for (let i = 0; i < state.squares.length; i++) {
      const sq = state.squares[i];
      if (colorFilter !== null && sq.color !== colorFilter) continue;
      if (sq.x === col) {
        bridgesNext = true;
        break;
      }
    }
    if (!bridgesNext) {
      for (let r = 0; r < rows; r++) {
        const cur = state.grid[r][col];
        const nxt = state.grid[r][col + 1];
        if (
          cur &&
          nxt &&
          cur.chainMarked &&
          nxt.chainMarked &&
          (cur.isWild || nxt.isWild || cur.color === nxt.color) &&
          (colorFilter === null || getChainCellEffectiveColor(state.grid, r, col) === colorFilter)
        ) {
          bridgesNext = true;
          break;
        }
      }
    }
  }

  state.sweepState.lastCol = col;

  if (!bridgesNext) {
    const flushed = flushPendingClearCells(state, colorFilter);
    state.sweepState.cellsClearedThisSweep += flushed.cellsRemoved;
    return {
      cellsRemovedNow: flushed.cellsRemoved,
      clearedPositions: flushed.clearedPositions,
    };
  }

  return { cellsRemovedNow: 0, clearedPositions: [] };
}

export function stepLighthouseSweep(
  state: BoardState,
  prevAngle: number,
  currAngle: number,
  colorFilter: CellColor
): { cellsRemovedNow: number; clearedPositions: Array<{ x: number; y: number; color: CellColor }> } {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  if (rows === 0 || cols === 0) {
    return { cellsRemovedNow: 0, clearedPositions: [] };
  }

  state.squares = detectBoardMarksForState(state);
  const hiAngle = Math.max(prevAngle, currAngle) + 1e-6;
  const loAngle = Math.min(prevAngle, currAngle) - 1e-6;
  const originX = cols / 2;
  const originY = rows;
  const cellAngle = (cx: number, cy: number): number =>
    Math.atan2(originY - cy, cx - originX);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const effColor = getChainCellEffectiveColor(state.grid, r, c);
      if (effColor !== colorFilter) continue;
      const theta = cellAngle(c + 0.5, r + 0.5);
      if (theta <= hiAngle && theta >= loAngle) {
        if (cell.inSquare || cell.chainMarked) {
          cell.sweptCol = true;
        }
        if (cell.chainMarked && !cell.pendingClear) {
          cell.pendingClear = true;
          cell.pendingClearColor = colorFilter;
          state.sweepState.chainClearedThisSweep++;
        }
      }
    }
  }

  let bridgesNext = false;
  for (let i = 0; i < state.squares.length; i++) {
    const sq = state.squares[i];
    if (sq.color !== colorFilter) continue;
    const sqTheta = cellAngle(sq.x + 1, sq.y + 1);
    if (sqTheta <= hiAngle && sqTheta >= loAngle) {
      const key = `${sq.x},${sq.y}`;
      if (!state.sweepState.countedSquareKeys.has(key)) {
        state.sweepState.countedSquareKeys.add(key);
        state.sweepState.squaresThisSweep++;
      }
      const c00 = state.grid[sq.y][sq.x];
      const c01 = state.grid[sq.y][sq.x + 1];
      const c10 = state.grid[sq.y + 1][sq.x];
      const c11 = state.grid[sq.y + 1][sq.x + 1];
      if (c00) {
        c00.pendingClear = true;
        c00.pendingClearColor = colorFilter;
      }
      if (c01) {
        c01.pendingClear = true;
        c01.pendingClearColor = colorFilter;
      }
      if (c10) {
        c10.pendingClear = true;
        c10.pendingClearColor = colorFilter;
      }
      if (c11) {
        c11.pendingClear = true;
        c11.pendingClearColor = colorFilter;
      }
    } else if (sqTheta < currAngle) {
      const c00 = state.grid[sq.y][sq.x];
      const c01 = state.grid[sq.y][sq.x + 1];
      const c10 = state.grid[sq.y + 1][sq.x];
      const c11 = state.grid[sq.y + 1][sq.x + 1];
      if (c00?.pendingClear || c01?.pendingClear || c10?.pendingClear || c11?.pendingClear) {
        bridgesNext = true;
      }
    }
  }

  if (!bridgesNext && currAngle > -0.02) {
    for (let r = 0; r < rows && !bridgesNext; r++) {
      for (let c = 0; c < cols; c++) {
        const cur = state.grid[r][c];
        if (!cur?.pendingClear || !cur.chainMarked) continue;
        for (let d = 0; d < 4; d++) {
          const nr = r + SHATTER_DIRS[d][0];
          const nc = c + SHATTER_DIRS[d][1];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nxt = state.grid[nr][nc];
          if (
            nxt &&
            nxt.chainMarked &&
            !nxt.pendingClear &&
            getChainCellEffectiveColor(state.grid, nr, nc) === colorFilter &&
            cellAngle(nc + 0.5, nr + 0.5) < currAngle
          ) {
            bridgesNext = true;
            break;
          }
        }
        if (bridgesNext) break;
      }
    }
  }

  state.lighthouseAngle = currAngle;

  if (!bridgesNext) {
    const flushed = flushPendingClearCells(state, colorFilter);
    state.sweepState.cellsClearedThisSweep += flushed.cellsRemoved;
    return {
      cellsRemovedNow: flushed.cellsRemoved,
      clearedPositions: flushed.clearedPositions,
    };
  }

  return { cellsRemovedNow: 0, clearedPositions: [] };
}

export function finalizeSweep(state: BoardState, hadClearsDuringSweep: boolean): ClearEvent | null {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const flushed = flushPendingClearCells(state);
  const totalSquares = state.sweepState.squaresThisSweep;
  const totalChainCells = state.sweepState.chainClearedThisSweep;
  const totalCellsRemoved =
    state.sweepState.cellsClearedThisSweep + flushed.cellsRemoved;
  const anyCleared =
    hadClearsDuringSweep ||
    totalCellsRemoved > 0 ||
    totalSquares > 0 ||
    totalChainCells > 0;

  for (let r = 0; r < rows; r++) {
    const rowArr = state.grid[r];
    for (let c = 0; c < cols; c++) {
      const cell = rowArr[c];
      if (cell) {
        cell.sweptCol = false;
      }
    }
  }

  if (totalSquares >= 4) {
    state.comboLevel += 1;
    state.comboGraceUsed = false;
    state.maxCombo = Math.max(state.maxCombo, state.comboLevel);
    const tokenGain = totalSquares >= 8 ? 2 : 1;
    state.vetoTokens = Math.min(3, (state.vetoTokens ?? 0) + tokenGain);
  } else if (state.comboLevel > 0 && !state.comboGraceUsed) {
    state.comboGraceUsed = true;
  } else {
    state.comboLevel = 0;
    state.comboGraceUsed = false;
  }

  const squarePoints = calculateSweepScore(totalSquares, state.comboLevel);
  const chainPoints = totalChainCells * 20;
  let bonusPoints = 0;
  let singleColorBonus = false;
  let allDeletedBonus = false;

  if (anyCleared) {
    let remaining = 0;
    let remainingViruses = 0;
    let colorMask = 0;
    for (let r = 0; r < rows; r++) {
      const rowArr = state.grid[r];
      for (let c = 0; c < cols; c++) {
        const cell = rowArr[c];
        if (cell && !cell.isObstacle) {
          remaining++;
          if (cell.isVirus) remainingViruses++;
          if (!cell.isWild) {
            colorMask |= 1 << cell.color;
          }
        }
      }
    }

    if (state.activeShift === 'anchored_viruses' && remainingViruses === 0) {
      bonusPoints += 500;
    }

    if (remaining === 0) {
      allDeletedBonus = true;
      bonusPoints += 10000;
    } else if (colorMask === 0 || (colorMask & (colorMask - 1)) === 0) {
      singleColorBonus = true;
      bonusPoints += 1000;
    }
  }

  const totalAwarded = squarePoints + chainPoints + bonusPoints;
  state.score += totalAwarded;
  state.squaresClearedTotal += totalSquares;
  state.stageSquaresCleared += totalSquares;
  state.biggestSweep = Math.max(state.biggestSweep, totalSquares);
  state.chainClearsTotal += totalChainCells;
  if (singleColorBonus) state.singleColorCount += 1;
  if (allDeletedBonus) state.allClearCount += 1;

  state.sweepPassCount = (state.sweepPassCount ?? 0) + 1;
  state.sweepState = createSweepState();

  if (!anyCleared && totalSquares === 0) {
    return null;
  }

  return {
    squaresCleared: totalSquares,
    cellsRemoved: totalCellsRemoved,
    pointsAwarded: totalAwarded,
    comboLevel: state.comboLevel,
    singleColorBonus,
    allDeletedBonus,
    clearedPositions: flushed.clearedPositions,
  };
}

export function swapHeldPiece(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): boolean {
  if (!state.activePiece || state.isGameOver) return false;
  if (state.activeShift !== 'stash_hold') return false;
  if (state.stashUsedThisTurn) return false;

  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const current: Piece = {
    ...state.activePiece,
    cells: state.activePiece.cells.map((row) => row.map((c) => clonePieceCell(c))),
  };

  let incoming: Piece;
  if (state.heldPiece) {
    incoming = {
      ...state.heldPiece,
      cells: state.heldPiece.cells.map((row) => row.map((c) => clonePieceCell(c))),
    };
  } else {
    const genOpts: GeneratePieceOptions = {
      colorCount: state.colorCount,
      shapeMode: state.pieceShapeMode,
      boardCols: cols,
    };
    const popped =
      state.nextQueue.shift() ??
      generateRandomPiece(chainFrequency, rng, getSpawnColForWidth(cols, 2), genOpts);
    const queuedPiece = generateRandomPiece(
      chainFrequency,
      rng,
      getSpawnColForWidth(cols, 2),
      genOpts
    );
    const queuedPos = getPieceInitialPos(state, queuedPiece);
    state.nextQueue.push({ ...queuedPiece, x: queuedPos.x, y: queuedPos.y });
    incoming = popped;
  }

  const initPos = getPieceInitialPos(state, incoming);
  const candidate: Piece = { ...incoming, x: initPos.x, y: initPos.y };
  if (!canPlacePiece(state, candidate, 0, 0)) {
    return false;
  }

  const heldPos = getPieceInitialPos(state, current);
  state.heldPiece = { ...current, x: heldPos.x, y: heldPos.y };
  state.activePiece = candidate;
  state.stashUsedThisTurn = true;
  state.spawnTimer = 0;
  state.gravityAccum = 0;
  state.lockTimer = 0;
  state.lockResetCount = 0;
  return true;
}

export function stepRisingTideSweep(
  state: BoardState,
  squaresThisSweep: number,
  rng: () => number = Math.random
): boolean {
  if (state.activeShift !== 'rising_tide' || state.isGameOver) return false;
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const currTide = state.risingTideRows ?? 0;

  if (squaresThisSweep >= 4) {
    if (currTide <= 0) return false;
    for (let r = rows - 1; r > 0; r--) {
      for (let c = 0; c < cols; c++) {
        state.grid[r][c] = state.grid[r - 1][c];
      }
    }
    for (let c = 0; c < cols; c++) {
      state.grid[0][c] = null;
    }
    state.risingTideRows = Math.max(0, currTide - 1);
    settleBoardForState(state, true);
    state.squares = detectBoardMarksForState(state);
    return true;
  }

  if (currTide >= 3) return false;
  const spawnX = getSpawnColForWidth(cols, 2);
  for (let c = spawnX; c <= Math.min(cols - 1, spawnX + 1); c++) {
    if (state.grid[0][c] !== null || state.grid[1][c] !== null) {
      return false;
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const movedCell = state.grid[r + 1][c];
      if (movedCell) {
        movedCell.animOffsetY = -0.8;
      }
      state.grid[r][c] = movedCell;
    }
  }
  const colorCount = state.colorCount ?? 2;
  const phase = Math.floor(rng() * colorCount);
  for (let c = 0; c < cols; c++) {
    const color = ((c + phase) % colorCount) as CellColor;
    state.grid[rows - 1][c] = {
      id: allocCellId(),
      color,
      isChain: false,
      chainMarked: false,
      inSquare: false,
      pendingClear: false,
      sweptCol: false,
      fallOffset: 0,
      animOffsetY: -1,
      landFlash: 0.7,
    };
  }
  state.risingTideRows = currTide + 1;
  state.squares = detectBoardMarksForState(state);
  return true;
}

export function stepCeilingPressSweep(
  state: BoardState,
  squaresThisSweep: number
): boolean {
  if (state.activeShift !== 'ceiling_press' || state.isGameOver) return false;
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const spawnX = getSpawnColForWidth(cols, 2);
  const currLock = state.ceilingLockRows ?? 0;

  let nextLock = currLock;
  if (squaresThisSweep >= 4) {
    nextLock = Math.max(0, currLock - 1);
  } else {
    nextLock = Math.min(3, Math.min(Math.max(1, rows - 5), currLock + 1));
  }
  if (nextLock === currLock) return false;

  for (let r = 0; r < Math.min(rows, 4); r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell?.isObstacle && cell.obstacleStyle === 'girder') {
        state.grid[r][c] = null;
      }
    }
  }

  for (let r = 0; r < nextLock; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === spawnX || c === spawnX + 1) continue;
      const existing = state.grid[r][c];
      if (existing && !existing.isObstacle) {
        for (let dr = nextLock; dr < rows; dr++) {
          if (state.grid[dr][c] === null) {
            state.grid[dr][c] = existing;
            break;
          }
        }
      }
      state.grid[r][c] = {
        id: allocCellId(),
        color: 0,
        isChain: false,
        isObstacle: true,
        obstacleFixed: true,
        obstacleStyle: 'girder',
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset: 0,
        landFlash: 0.65,
      };
    }
  }
  state.ceilingLockRows = nextLock;
  settleBoardForState(state, true);
  state.squares = detectBoardMarksForState(state);
  return true;
}

export function applyMetronomeChargeBonus(
  state: BoardState,
  beatPhase: number
): { onBeat: boolean; bonusPoints: number; tokenGranted: boolean } {
  if (state.activeShift !== 'metronome_charge' || state.isGameOver) {
    return { onBeat: false, bonusPoints: 0, tokenGranted: false };
  }
  const wrapped = ((beatPhase % 1) + 1) % 1;
  const distToBeat = Math.min(wrapped, 1 - wrapped);
  if (distToBeat > 0.2) {
    return { onBeat: false, bonusPoints: 0, tokenGranted: false };
  }
  const bonusPoints = 150;
  state.score += bonusPoints;
  const nextCharge = (state.beatChargeAccum ?? 0) + 1;
  let tokenGranted = false;
  if (nextCharge >= 3) {
    state.beatChargeAccum = 0;
    state.vetoTokens = Math.min(3, (state.vetoTokens ?? 0) + 1);
    tokenGranted = true;
  } else {
    state.beatChargeAccum = nextCharge;
  }
  return { onBeat: true, bonusPoints, tokenGranted };
}

export function applyGarbageToBoard(
  state: BoardState,
  count: number,
  rng: () => number = Math.random
): void {
  if (count <= 0 || state.isGameOver) return;
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const minCol = state.lockedColumnsLeft;
  const maxCol = cols - 1 - state.lockedColumnsRight;
  for (let i = 0; i < count; i++) {
    const openCols: number[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      if (state.grid[0][c] === null) {
        openCols.push(c);
      }
    }
    if (openCols.length === 0) break;
    const col = openCols[Math.floor(rng() * openCols.length)];
    let topExisting: CellColor | null = null;
    for (let r = 1; r < rows; r++) {
      const existing = state.grid[r][col];
      if (existing !== null && !existing.isObstacle) {
        topExisting = existing.color;
        break;
      }
    }
    const colorPoolSize = state.colorCount === 3 ? 3 : 2;
    let color: CellColor;
    if (topExisting !== null && rng() < 0.72) {
      color = (((topExisting + 1 + (colorPoolSize === 3 && rng() < 0.5 ? 1 : 0)) % colorPoolSize) as CellColor);
    } else {
      color = (Math.floor(rng() * colorPoolSize) % colorPoolSize) as CellColor;
    }
    state.grid[0][col] = {
      id: allocCellId(),
      color,
      isChain: false,
      chainMarked: false,
      inSquare: false,
      pendingClear: false,
      sweptCol: false,
      fallOffset: 1,
      landFlash: 0.6,
    };
  }
  settleBoardForState(state, true);
  state.squares = detectBoardMarksForState(state);
}

export function resolveBattleGarbageSwap(
  attacker: BoardState,
  defender: BoardState,
  outgoingCount: number
): { countered: number; netSent: number } {
  if (outgoingCount <= 0) return { countered: 0, netSent: 0 };
  const countered = Math.min(attacker.pendingGarbage, outgoingCount);
  attacker.pendingGarbage = Math.max(0, attacker.pendingGarbage - countered);
  const netSent = outgoingCount - countered;
  if (netSent > 0) {
    defender.pendingGarbage = Math.min(24, defender.pendingGarbage + netSent);
  }
  return { countered, netSent };
}

export function flushPendingGarbage(
  state: BoardState,
  rng: () => number = Math.random
): number {
  if (state.pendingGarbage <= 0 || state.isGameOver) return 0;
  const count = state.pendingGarbage;
  state.pendingGarbage = 0;
  applyGarbageToBoard(state, count, rng);
  return count;
}

export function countBoardCells(grid: (Cell | null)[][]): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell !== null && !cell.isObstacle) count++;
    }
  }
  return count;
}

export function transformBoardForOrientation(
  state: BoardState,
  targetOrientation: BoardOrientation,
  animateBricks: boolean = true
): { transformed: boolean; displacedBonusPoints: number } {
  const oldRows = state.grid.length;
  const oldCols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const { cols: newCols, rows: newRows } = getDimensionsForOrientation(targetOrientation);

  if (oldCols === newCols && oldRows === newRows) {
    state.orientation = targetOrientation;
    state.baseCols = newCols;
    state.baseRows = newRows;
    return { transformed: false, displacedBonusPoints: 0 };
  }

  const newGrid = createEmptyGrid(newCols, newRows);
  const centerShift = Math.floor((newCols - oldCols) / 2);
  const rowDelta = newRows - oldRows;
  const newSpawnX = getSpawnColForWidth(newCols);

  const isSpawnCol = (c: number) => c === newSpawnX || c === newSpawnX + 1;

  interface OverflowEntry {
    cell: Cell;
    srcCol: number;
    srcRow: number;
    side: -1 | 1;
  }
  const overflowPool: OverflowEntry[] = [];
  const colWriteRow = Array<number>(newCols).fill(newRows - 1);

  for (let oldC = 0; oldC < oldCols; oldC++) {
    const dstC = oldC + centerShift;
    const isOuterWing = dstC < 0 || dstC >= newCols;
    const side: -1 | 1 = oldC < oldCols / 2 ? -1 : 1;

    const colEntries: Array<{ cell: Cell; oldR: number }> = [];
    for (let oldR = oldRows - 1; oldR >= 0; oldR--) {
      const cell = state.grid[oldR][oldC];
      if (cell && !cell.isObstacle) {
        colEntries.push({ cell: { ...cell, pendingClear: false, sweptCol: false, fallOffset: 0 }, oldR });
      }
    }

    if (isOuterWing) {
      for (const entry of colEntries) {
        overflowPool.push({
          cell: entry.cell,
          srcCol: oldC,
          srcRow: entry.oldR,
          side,
        });
      }
      continue;
    }

    const minTopRow = isSpawnCol(dstC) ? 4 : 2;
    const maxCentralHeight = Math.max(2, newRows - minTopRow);

    colEntries.forEach(({ cell, oldR }, idx) => {
      if (idx < maxCentralHeight && colWriteRow[dstC] >= minTopRow) {
        const dstR = colWriteRow[dstC]--;
        if (animateBricks) {
          const distFromFloor = newRows - 1 - dstR;
          cell.animOffsetX = oldC - dstC;
          cell.animOffsetY = Math.max(1.25, 2.35 + distFromFloor * 0.16);
          cell.landFlash = 0.35;
        } else {
          cell.animOffsetX = 0;
          cell.animOffsetY = 0;
        }
        newGrid[dstR][dstC] = cell;
      } else {
        overflowPool.push({
          cell,
          srcCol: oldC,
          srcRow: oldR,
          side,
        });
      }
    });
  }

  const leftTargets =
    targetOrientation === 'landscape'
      ? [2, 1, 0, 3, 4]
      : [2, 1, 0, 3];
  const rightTargets =
    targetOrientation === 'landscape'
      ? [13, 14, 15, 12, 11]
      : [7, 8, 9, 6];

  let displacedBonusPoints = 0;
  for (const item of overflowPool) {
    const primaryList = item.side === -1 ? leftTargets : rightTargets;
    const fallbackList = item.side === -1 ? rightTargets : leftTargets;
    const candidateCols = [...primaryList, ...fallbackList];

    let chosenCol = -1;
    let bestWriteRow = -1;
    for (const c of candidateCols) {
      if (c < 0 || c >= newCols || isSpawnCol(c)) continue;
      if (colWriteRow[c] >= 2 && colWriteRow[c] > bestWriteRow) {
        bestWriteRow = colWriteRow[c];
        chosenCol = c;
      }
    }

    if (chosenCol >= 0) {
      const dstR = colWriteRow[chosenCol]--;
      if (animateBricks) {
        const srcInNewCol = item.srcCol + centerShift;
        item.cell.animOffsetX = srcInNewCol - chosenCol;
        item.cell.animOffsetY = Math.max(2.6, dstR - (item.srcRow + rowDelta) + 3.1);
        item.cell.landFlash = 0.55;
      } else {
        item.cell.animOffsetX = 0;
        item.cell.animOffsetY = 0;
      }
      newGrid[dstR][chosenCol] = item.cell;
    } else {
      displacedBonusPoints += 40;
    }
  }

  state.grid = newGrid;
  state.cols = newCols;
  state.rows = newRows;
  state.baseCols = newCols;
  state.baseRows = newRows;
  state.orientation = targetOrientation;
  state.gravityDirection = 'down';
  state.activeShift = null;
  state.patrollingBumper = null;
  state.windmillState = null;
  state.pistonState = null;
  state.wellRegions = undefined;
  state.activeWellIndex = 0;
  state.lighthouseAngle = undefined;
  state.pieceShapeMode = 'standard_2x2';
  state.colorCount = 2;
  state.shiftEffect = null;
  state.score += displacedBonusPoints;
  state.isGameOver = false;

  const maxEachSide = Math.max(0, Math.floor((newCols - 6) / 2));
  state.lockedColumnsLeft = Math.min(state.lockedColumnsLeft, maxEachSide);
  state.lockedColumnsRight = Math.min(state.lockedColumnsRight, maxEachSide);

  state.squares = detectBoardMarks(state.grid);

  if (state.sweepState.lastCol >= 0) {
    state.sweepState.lastCol = Math.min(
      newCols - 1,
      Math.max(0, Math.floor((state.sweepState.lastCol / Math.max(1, oldCols)) * newCols))
    );
  }
  const shiftedKeys = new Set<string>();
  for (const key of state.sweepState.countedSquareKeys) {
    const [kx, ky] = key.split(',').map(Number);
    const nx = kx + centerShift;
    const ny = ky + rowDelta;
    if (nx >= 0 && nx < newCols - 1 && ny >= 0 && ny < newRows - 1) {
      shiftedKeys.add(`${nx},${ny}`);
    }
  }
  state.sweepState.countedSquareKeys = shiftedKeys;

  if (state.activePiece) {
    const pieceDim = getPieceDimensions(state.activePiece);
    const minPlayCol = state.lockedColumnsLeft;
    const maxPlayCol = Math.max(
      minPlayCol,
      newCols - pieceDim.cols - state.lockedColumnsRight
    );
    const nextX = Math.max(
      minPlayCol,
      Math.min(maxPlayCol, state.activePiece.x + centerShift)
    );
    let highestInPath = newRows;
    for (let r = 0; r < newRows; r++) {
      for (let px = 0; px < pieceDim.cols; px++) {
        if (nextX + px < newCols && state.grid[r][nextX + px] !== null) {
          highestInPath = r;
          break;
        }
      }
      if (highestInPath < newRows) break;
    }
    const initY = getPieceInitialY(state.activePiece);
    const safeY = Math.max(initY, Math.min(0, highestInPath - pieceDim.rows - 2));
    state.activePiece = {
      ...state.activePiece,
      x: nextX,
      y: safeY,
    };
    state.spawnTimer = 0;
    state.gravityAccum = 0;
    state.lockTimer = 0;
    state.lockResetCount = 0;
    state.orientationGraceTimer = animateBricks ? 1.25 : 0;
  }

  state.nextQueue = state.nextQueue.map((p) => {
    const pCols = p.cells[0]?.length ?? 2;
    return {
      ...p,
      x: getSpawnColForWidth(newCols, pCols),
      y: getPieceInitialY(p),
    };
  });

  return { transformed: true, displacedBonusPoints };
}

export function rotateBoard90(
  state: BoardState,
  direction: 'cw' | 'ccw' = 'cw',
  animateBricks: boolean = true
): { rotated: boolean; settledMoves: number } {
  const oldRows = state.grid.length;
  const oldCols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  if (oldRows <= 0 || oldCols <= 0) {
    return { rotated: false, settledMoves: 0 };
  }

  const newCols = oldRows;
  const newRows = oldCols;
  const newGrid = createEmptyGrid(newCols, newRows);

  for (let r = 0; r < oldRows; r++) {
    for (let c = 0; c < oldCols; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.isObstacle) continue;
      const rotR = direction === 'cw' ? c : oldCols - 1 - c;
      const rotC = direction === 'cw' ? oldRows - 1 - r : r;
      newGrid[rotR][rotC] = {
        ...cell,
        pendingClear: false,
        sweptCol: false,
        fallOffset: 0,
        animOffsetX: 0,
        animOffsetY: 0,
        landFlash: animateBricks ? 0.45 : 0,
      };
    }
  }

  const settled = settleBoard(newGrid);
  let settledMoves = 0;
  for (let r = 0; r < newRows; r++) {
    for (let c = 0; c < newCols; c++) {
      const cell = newGrid[r][c];
      if (!cell) continue;
      if (cell.fallOffset > 0) {
        settledMoves++;
        if (!animateBricks) {
          cell.fallOffset = 0;
        }
      }
    }
  }
  if (!settled) {
    settledMoves = 0;
  }

  state.grid = newGrid;
  state.cols = newCols;
  state.rows = newRows;
  state.orientation = newCols >= newRows ? 'landscape' : 'portrait';
  state.gravityDirection = 'down';
  state.activeShift = 'rotate_90';
  state.patrollingBumper = null;
  state.isGameOver = false;

  const maxEachSide = Math.max(0, Math.floor((newCols - 6) / 2));
  state.lockedColumnsLeft = Math.min(state.lockedColumnsLeft, maxEachSide);
  state.lockedColumnsRight = Math.min(state.lockedColumnsRight, maxEachSide);

  state.squares = detectBoardMarks(state.grid);
  state.sweepState = createSweepState();

  if (state.activePiece) {
    const rotatedPiece =
      direction === 'cw'
        ? rotatePieceCellsCW(state.activePiece)
        : rotatePieceCellsCCW(state.activePiece);
    const rotCols = rotatedPiece.cells[0]?.length ?? 2;
    const minPlayCol = state.lockedColumnsLeft;
    const maxPlayCol = Math.max(minPlayCol, newCols - rotCols - state.lockedColumnsRight);
    const safeX = Math.max(minPlayCol, Math.min(maxPlayCol, getSpawnColForWidth(newCols, rotCols)));
    state.activePiece = {
      ...rotatedPiece,
      x: safeX,
      y: getPieceInitialY(rotatedPiece),
    };
    state.spawnTimer = 0;
    state.gravityAccum = 0;
    state.lockTimer = 0;
    state.lockResetCount = 0;
    state.orientationGraceTimer = animateBricks ? 1.15 : 0;
  }

  state.nextQueue = state.nextQueue.map((p) => {
    const pCols = p.cells[0]?.length ?? 2;
    return {
      ...p,
      x: getSpawnColForWidth(newCols, pCols),
      y: getPieceInitialY(p),
    };
  });

  return { rotated: true, settledMoves };
}

export interface StageProgressionState {
  level: number;
  levelSquaresCleared: number;
  skinLevelsCleared: number;
  stageTimeSec: number;
}

export interface StageProgressionResult {
  leveledUp: boolean;
  shouldTransitionSkin: boolean;
}

export function advanceSweepStageProgression(
  prog: StageProgressionState,
  squaresClearedInSweep: number,
  skin: Pick<SkinConfig, 'squaresPerLevel' | 'levelsPerSkin' | 'finalStageTimerSec'>,
  allowSkinTransition: boolean
): StageProgressionResult {
  let leveledUp = false;
  let shouldTransitionSkin = false;

  if (squaresClearedInSweep > 0) {
    prog.levelSquaresCleared += squaresClearedInSweep;
    const req = Math.max(1, skin.squaresPerLevel);
    if (prog.levelSquaresCleared >= req) {
      prog.level += 1;
      prog.levelSquaresCleared = 0;
      leveledUp = true;

      if (allowSkinTransition && !skin.finalStageTimerSec) {
        prog.skinLevelsCleared += 1;
        if (prog.skinLevelsCleared >= Math.max(1, skin.levelsPerSkin)) {
          shouldTransitionSkin = true;
        }
      }
    }
  }

  return { leveledUp, shouldTransitionSkin };
}

export function advanceTimedStageProgression(
  prog: StageProgressionState,
  dt: number,
  skin: Pick<SkinConfig, 'finalStageTimerSec'>,
  allowSkinTransition: boolean
): boolean {
  prog.stageTimeSec += Math.max(0, dt);
  if (
    allowSkinTransition &&
    typeof skin.finalStageTimerSec === 'number' &&
    skin.finalStageTimerSec > 0 &&
    prog.stageTimeSec >= skin.finalStageTimerSec
  ) {
    return true;
  }
  return false;
}

export function computeStageProgressMetrics(
  prog: StageProgressionState,
  skin: Pick<SkinConfig, 'squaresPerLevel' | 'levelsPerSkin' | 'finalStageTimerSec'>
): { stageSquares: number; stageGoal: number } {
  if (typeof skin.finalStageTimerSec === 'number' && skin.finalStageTimerSec > 0) {
    return {
      stageSquares: Math.min(skin.finalStageTimerSec, Math.floor(prog.stageTimeSec)),
      stageGoal: skin.finalStageTimerSec,
    };
  }
  const req = Math.max(1, skin.squaresPerLevel);
  const levelsReq = Math.max(1, skin.levelsPerSkin);
  const completedSteps = Math.min(levelsReq, prog.skinLevelsCleared);
  const currentStepSquares = Math.min(req, prog.levelSquaresCleared);
  return {
    stageSquares: Math.min(req * levelsReq, completedSteps * req + currentStepSquares),
    stageGoal: req * levelsReq,
  };
}

export function computeEncoreState(
  isFinalWorld: boolean,
  comboLevel: number
): { encoreBonusBpm: number; encoreIntensity: number } {
  if (!isFinalWorld || comboLevel <= 0) {
    return { encoreBonusBpm: 0, encoreIntensity: 0 };
  }
  return {
    encoreBonusBpm: Math.min(20, comboLevel * 4),
    encoreIntensity: Math.min(1, comboLevel / 4),
  };
}

export function computeTimeAttackPaceDelta(
  pbSplits: number[] | undefined,
  pbBestScore: number,
  elapsedSec: number,
  durationSec: number,
  currentScore: number,
  splitIntervalSec: number = 5
): {
  delta: number | null;
  pbFraction: number | null;
  currentFraction: number | null;
} {
  if (!pbSplits || pbSplits.length === 0 || pbBestScore <= 0 || durationSec <= 0) {
    return { delta: null, pbFraction: null, currentFraction: null };
  }
  const clampedElapsed = Math.max(0, Math.min(durationSec, elapsedSec));
  const exactBucket = clampedElapsed / splitIntervalSec;
  const lowerIdx = Math.floor(exactBucket);
  const frac = exactBucket - lowerIdx;

  const getSplitAt = (bucketIdx: number): number => {
    if (bucketIdx <= 0) return 0;
    const arrIdx = bucketIdx - 1;
    if (arrIdx >= pbSplits.length) return pbSplits[pbSplits.length - 1] ?? pbBestScore;
    return pbSplits[arrIdx];
  };

  const s0 = getSplitAt(lowerIdx);
  const s1 = getSplitAt(lowerIdx + 1);
  const expectedPb = s0 + (s1 - s0) * frac;

  return {
    delta: Math.round(currentScore - expectedPb),
    pbFraction: Math.max(0, Math.min(1, expectedPb / pbBestScore)),
    currentFraction: Math.max(0, Math.min(1.5, currentScore / pbBestScore)),
  };
}

export function computeBeamProximity(
  col: number,
  beamCols: number[],
  boardCols: number,
  isRtl: boolean = false,
  horizonCols: number = 4
): number {
  if (boardCols <= 0 || beamCols.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < beamCols.length; i++) {
    const beamCol = ((beamCols[i] % boardCols) + boardCols) % boardCols;
    const aheadDist = isRtl
      ? (beamCol - col + boardCols) % boardCols
      : (col - beamCol + boardCols) % boardCols;
    if (aheadDist <= horizonCols) {
      const prox = 1 - aheadDist / (horizonCols + 0.5);
      if (prox > best) best = prox;
    }
  }
  return Math.max(0, Math.min(1, best));
}

export function countMarkedAheadOfBeam(
  grid: (Cell | null)[][],
  beamCol: number,
  isRtl: boolean = false,
  lookaheadCols: number = 4
): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return 0;
  const normBeam = ((beamCol % cols) + cols) % cols;
  let count = 0;
  const maxStep = Math.min(cols - 1, lookaheadCols);
  for (let step = 0; step <= maxStep; step++) {
    const c = isRtl
      ? (normBeam - step + cols) % cols
      : (normBeam + step) % cols;
    for (let r = 0; r < rows; r++) {
      const cell = grid[r][c];
      if (cell && (cell.inSquare || cell.chainMarked || cell.pendingClear)) {
        count++;
      }
    }
  }
  return count;
}
