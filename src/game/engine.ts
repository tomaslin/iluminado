import {
  BoardOrientation,
  BoardState,
  Cell,
  CellColor,
  ClearEvent,
  Piece,
  SkinConfig,
  SquareCoord,
  SweepState,
} from './types';

export const BOARD_COLS = 16;
export const BOARD_ROWS = 10;
export const PORTRAIT_COLS = 10;
export const PORTRAIT_ROWS = 14;
export const LOCK_DELAY_SEC = 0.45;
export const MAX_LOCK_RESETS = 6;

export function getDimensionsForOrientation(orientation: BoardOrientation): {
  cols: number;
  rows: number;
} {
  return orientation === 'portrait'
    ? { cols: PORTRAIT_COLS, rows: PORTRAIT_ROWS }
    : { cols: BOARD_COLS, rows: BOARD_ROWS };
}

export function getSpawnColForWidth(cols: number): number {
  return Math.max(0, Math.floor(cols / 2) - 1);
}

let nextCellId = 1;
function allocCellId(): number {
  return nextCellId++;
}

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
  // Solid (4 of same)
  { pattern: [0, 0, 0, 0], weight: 6 },
  { pattern: [1, 1, 1, 1], weight: 6 },
  // 3 + 1
  { pattern: [0, 0, 0, 1], weight: 7 },
  { pattern: [0, 0, 1, 0], weight: 7 },
  { pattern: [0, 1, 0, 0], weight: 7 },
  { pattern: [1, 0, 0, 0], weight: 7 },
  { pattern: [1, 1, 1, 0], weight: 7 },
  { pattern: [1, 1, 0, 1], weight: 7 },
  { pattern: [1, 0, 1, 1], weight: 7 },
  { pattern: [0, 1, 1, 1], weight: 7 },
  // 2 + 2 horizontal
  { pattern: [0, 0, 1, 1], weight: 9 },
  { pattern: [1, 1, 0, 0], weight: 9 },
  // 2 + 2 vertical
  { pattern: [0, 1, 0, 1], weight: 9 },
  { pattern: [1, 0, 1, 0], weight: 9 },
  // Diagonal
  { pattern: [0, 1, 1, 0], weight: 6 },
  { pattern: [1, 0, 0, 1], weight: 6 },
];

const TOTAL_PATTERN_WEIGHT = PIECE_PATTERNS.reduce((acc, p) => acc + p.weight, 0);

export function generateRandomPiece(
  chainFrequency: number = 0.05,
  rng: () => number = Math.random,
  spawnX: number = 7
): Piece {
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
  return createPieceFromPattern(chosen, chainIndex, spawnX);
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
    orientation,
    orientationGraceTimer: 0,
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
    score: 0,
    squaresClearedTotal: 0,
    stageSquaresCleared: 0,
    maxCombo: 0,
    isGameOver: false,
    lockedColumnsLeft: 0,
    lockedColumnsRight: 0,
  };
}

export function rotatePieceCellsCW(piece: Piece): Piece {
  const [[tl, tr], [bl, br]] = piece.cells;
  return {
    ...piece,
    cells: [
      [{ ...bl }, { ...tl }],
      [{ ...br }, { ...tr }],
    ],
  };
}

export function rotatePieceCellsCCW(piece: Piece): Piece {
  const [[tl, tr], [bl, br]] = piece.cells;
  return {
    ...piece,
    cells: [
      [{ ...tr }, { ...br }],
      [{ ...tl }, { ...bl }],
    ],
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
  const minCol = state.lockedColumnsLeft;
  const maxCol = cols - 1 - state.lockedColumnsRight;

  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const gx = piece.x + px + dx;
      const gy = piece.y + py + dy;
      if (gx < minCol || gx > maxCol) return false;
      if (gy >= rows) return false;
      if (gy >= 0 && state.grid[gy][gx] !== null) return false;
    }
  }
  return true;
}

export function isActivePieceGrounded(state: BoardState): boolean {
  if (!state.activePiece) return false;
  return !canPlacePiece(state, state.activePiece, 0, 1);
}

export interface PieceLandingInfo {
  rigidDy: number;
  leftBottomRow: number;
  rightBottomRow: number;
  isSplit: boolean;
}

export function getPieceLandingColumns(
  state: BoardState,
  piece: Piece
): PieceLandingInfo {
  const rows = state.grid.length;
  let rigidDy = 0;
  while (canPlacePiece(state, piece, 0, rigidDy + 1)) {
    rigidDy++;
  }

  const getColBottomRow = (col: number): number => {
    const startRow = Math.max(0, piece.y + rigidDy + 2);
    for (let r = startRow; r < rows; r++) {
      if (state.grid[r][col] !== null) {
        return r - 1;
      }
    }
    return rows - 1;
  };

  // Check if rigid stop already hits a cell above startRow (at piece.y + rigidDy + 1)
  const getTopOccupied = (col: number): number => {
    for (let r = 0; r < rows; r++) {
      if (state.grid[r][col] !== null) {
        return r;
      }
    }
    return rows;
  };

  const leftTopOcc = getTopOccupied(piece.x);
  const rightTopOcc = getTopOccupied(piece.x + 1);
  const leftBottomRow =
    piece.y + rigidDy + 1 < leftTopOcc ? leftTopOcc - 1 : getColBottomRow(piece.x);
  const rightBottomRow =
    piece.y + rigidDy + 1 < rightTopOcc ? rightTopOcc - 1 : getColBottomRow(piece.x + 1);

  return {
    rigidDy,
    leftBottomRow,
    rightBottomRow,
    isSplit: leftBottomRow !== rightBottomRow,
  };
}

function refreshLockResetOnManipulate(state: BoardState, wasGrounded: boolean): void {
  if (!state.activePiece) return;
  const nowGrounded = !canPlacePiece(state, state.activePiece, 0, 1);
  if (!nowGrounded) {
    state.lockTimer = 0;
  } else if (wasGrounded && state.lockResetCount < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResetCount += 1;
  }
}

export function movePieceHorizontal(state: BoardState, dx: -1 | 1): boolean {
  if (!state.activePiece || state.isGameOver) return false;
  if (canPlacePiece(state, state.activePiece, dx, 0)) {
    const wasGrounded = !canPlacePiece(state, state.activePiece, 0, 1);
    state.activePiece = {
      ...state.activePiece,
      x: state.activePiece.x + dx,
    };
    refreshLockResetOnManipulate(state, wasGrounded);
    return true;
  }
  return false;
}

export function rotateActivePiece(state: BoardState, direction: 'cw' | 'ccw' = 'cw'): boolean {
  if (!state.activePiece || state.isGameOver) return false;
  const rotated =
    direction === 'cw'
      ? rotatePieceCellsCW(state.activePiece)
      : rotatePieceCellsCCW(state.activePiece);
  if (canPlacePiece(state, rotated, 0, 0)) {
    const wasGrounded = !canPlacePiece(state, state.activePiece, 0, 1);
    state.activePiece = rotated;
    refreshLockResetOnManipulate(state, wasGrounded);
    return true;
  }
  return false;
}

export function settleBoard(grid: (Cell | null)[][]): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  let moved = false;
  for (let col = 0; col < cols; col++) {
    let writeRow = rows - 1;
    for (let row = rows - 1; row >= 0; row--) {
      const cell = grid[row][col];
      if (cell !== null) {
        if (row !== writeRow) {
          const dropDist = writeRow - row;
          cell.fallOffset = Math.max(cell.fallOffset, dropDist);
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

export function detectBoardMarks(grid: (Cell | null)[][]): SquareCoord[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  // Reset non-pending marks
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell) {
        cell.inSquare = false;
        cell.chainMarked = false;
      }
    }
  }

  // 1. Chain Block detection (4-directional orthogonal BFS)
  const visited = Array.from({ length: rows }, () =>
    Array<boolean>(cols).fill(false)
  );
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = grid[r][c];
      if (!start || !start.isChain || visited[r][c]) continue;

      // Check if it touches at least one other block of its own color
      let touchesSameColor = false;
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const neighbor = grid[nr][nc];
          if (neighbor && neighbor.color === start.color) {
            touchesSameColor = true;
            break;
          }
        }
      }
      if (!touchesSameColor) continue;

      // BFS to mark connected component
      const queue: Array<[number, number]> = [[r, c]];
      visited[r][c] = true;
      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        const curr = grid[cr][cc];
        if (curr) {
          curr.chainMarked = true;
        }
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (
            nr >= 0 &&
            nr < rows &&
            nc >= 0 &&
            nc < cols &&
            !visited[nr][nc]
          ) {
            const neighbor = grid[nr][nc];
            if (neighbor && neighbor.color === start.color) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  // 2. Monochromatic 2x2 square detection (overlapping allowed; chain-marked excluded)
  const squares: SquareCoord[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const d = grid[r + 1][c];
      const e = grid[r + 1][c + 1];
      if (!a || !b || !d || !e) continue;
      if (
        a.color === b.color &&
        a.color === d.color &&
        a.color === e.color &&
        !a.chainMarked &&
        !b.chainMarked &&
        !d.chainMarked &&
        !e.chainMarked &&
        !a.isChain &&
        !b.isChain &&
        !d.isChain &&
        !e.isChain
      ) {
        a.inSquare = true;
        b.inSquare = true;
        d.inSquare = true;
        e.inSquare = true;
        squares.push({ x: c, y: r, color: a.color });
      }
    }
  }

  return squares;
}

export function lockActivePiece(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): { landed: boolean; squaresFormed: number; chainActivated: boolean } {
  const piece = state.activePiece;
  if (!piece) return { landed: false, squaresFormed: 0, chainActivated: false };
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const spawnX = getSpawnColForWidth(cols);

  // Compact existing columns first so each column's open write row is exact
  settleBoard(state.grid);

  let overflowed = false;
  for (let px = 0; px < 2; px++) {
    const gx = piece.x + px;
    if (gx < 0 || gx >= cols) continue;

    // Find lowest open row above existing blocks in this column
    let writeRow = rows - 1;
    while (writeRow >= 0 && state.grid[writeRow][gx] !== null) {
      writeRow--;
    }

    // Settle bottom cell (py = 1) first, then top cell (py = 0) independently
    for (let py = 1; py >= 0; py--) {
      const pCell = piece.cells[py][px];
      const sourceRow = piece.y + py;
      if (writeRow < 0) {
        overflowed = true;
        continue;
      }
      state.grid[writeRow][gx] = {
        id: allocCellId(),
        color: pCell.color,
        isChain: pCell.isChain,
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset: Math.max(0, writeRow - sourceRow),
        landFlash: 1,
      };
      writeRow--;
    }
  }

  const prevSquaresCount = state.squares.length;
  state.squares = detectBoardMarks(state.grid);
  const chainActivated = state.grid.some((row) =>
    row.some((c) => c !== null && c.chainMarked)
  );

  // Advance queue
  const popped = state.nextQueue.shift() ?? generateRandomPiece(chainFrequency, rng, spawnX);
  const next: Piece = { ...popped, x: spawnX, y: -2 };
  state.nextQueue.push(generateRandomPiece(chainFrequency, rng, spawnX));

  // Allow the next piece to spawn on the top staging row (y = -2) so the player can
  // still move Left/Right and Rotate above row 0; Game Over only triggers if a locking
  // piece itself overflows above the top line (`overflowed`).
  if (overflowed) {
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
  };
}

export function softDropStep(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): { moved: boolean; landed: boolean; squaresFormed: number; chainActivated: boolean } {
  if (!state.activePiece || state.isGameOver) {
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false };
  }
  state.orientationGraceTimer = 0;
  if (canPlacePiece(state, state.activePiece, 0, 1)) {
    state.activePiece = {
      ...state.activePiece,
      y: state.activePiece.y + 1,
    };
    state.gravityAccum = 0;
    state.lockTimer = 0;
    if (state.activePiece.y >= 0) {
      state.score += 1; // 1 point per row soft-dropped
    }
    return { moved: true, landed: false, squaresFormed: 0, chainActivated: false };
  }
  const res = lockActivePiece(state, chainFrequency, rng);
  return {
    moved: false,
    landed: res.landed,
    squaresFormed: res.squaresFormed,
    chainActivated: res.chainActivated,
  };
}

export function hardDropPiece(
  state: BoardState,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): { rowsDropped: number; landed: boolean; squaresFormed: number; chainActivated: boolean } {
  if (!state.activePiece || state.isGameOver) {
    return { rowsDropped: 0, landed: false, squaresFormed: 0, chainActivated: false };
  }
  state.orientationGraceTimer = 0;
  let rowsDropped = 0;
  while (canPlacePiece(state, state.activePiece, 0, 1)) {
    state.activePiece = {
      ...state.activePiece,
      y: state.activePiece.y + 1,
    };
    rowsDropped++;
    if (state.activePiece.y >= 0) {
      state.score += 1;
    }
  }
  const res = lockActivePiece(state, chainFrequency, rng);
  return {
    rowsDropped,
    landed: res.landed,
    squaresFormed: res.squaresFormed,
    chainActivated: res.chainActivated,
  };
}

export function stepPassiveGravity(
  state: BoardState,
  dt: number,
  gravitySpeed: number,
  spawnDelay: number,
  chainFrequency: number = 0.05,
  rng: () => number = Math.random
): { moved: boolean; landed: boolean; squaresFormed: number; chainActivated: boolean } {
  if (!state.activePiece || state.isGameOver) {
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false };
  }

  // Brief post-orientation grace pause so rotating a phone never causes sudden drop or top-out
  if (state.orientationGraceTimer > 0) {
    state.orientationGraceTimer = Math.max(0, state.orientationGraceTimer - dt);
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false };
  }

  if (state.spawnTimer < spawnDelay) {
    const nextSpawn = state.spawnTimer + dt;
    if (nextSpawn < spawnDelay) {
      state.spawnTimer = nextSpawn;
      return { moved: false, landed: false, squaresFormed: 0, chainActivated: false };
    }
    const leftoverDt = nextSpawn - spawnDelay;
    state.spawnTimer = spawnDelay;
    // Begin descending into row -1 immediately once spawn hover ends
    state.gravityAccum = Math.max(state.gravityAccum, 1) + leftoverDt * gravitySpeed;
  } else if (!canPlacePiece(state, state.activePiece, 0, 1)) {
    // Grounded branch handled right below
  }

  // If grounded on floor/stack, count lock delay before locking
  if (!canPlacePiece(state, state.activePiece, 0, 1)) {
    state.gravityAccum = 0;
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY_SEC) {
      const res = lockActivePiece(state, chainFrequency, rng);
      return {
        moved: false,
        landed: res.landed,
        squaresFormed: res.squaresFormed,
        chainActivated: res.chainActivated,
      };
    }
    return { moved: false, landed: false, squaresFormed: 0, chainActivated: false };
  }

  state.lockTimer = 0;
  state.gravityAccum += dt * gravitySpeed;
  let movedAny = false;
  while (state.gravityAccum >= 1) {
    state.gravityAccum -= 1;
    if (canPlacePiece(state, state.activePiece, 0, 1)) {
      state.activePiece = {
        ...state.activePiece,
        y: state.activePiece.y + 1,
      };
      movedAny = true;
      if (!canPlacePiece(state, state.activePiece, 0, 1)) {
        // Just touched down; enter lock delay cleanly on next frame
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
  };
}

/**
 * Iluminado scoring formula:
 * Base = squareCount * 40
 * If squareCount < 4 -> base (no multiplier)
 * If squareCount >= 4 -> multiplier = Math.min(4 * comboLevel, 16)
 */
export function calculateSweepScore(squareCount: number, comboLevel: number): number {
  const base = squareCount * 40;
  if (squareCount < 4) {
    return base;
  }
  const effectiveLevel = Math.max(1, comboLevel);
  const multiplier = Math.min(4 * effectiveLevel, 16);
  return base * multiplier;
}

function flushPendingClearCells(state: BoardState): {
  cellsRemoved: number;
  clearedPositions: Array<{ x: number; y: number; color: CellColor }>;
} {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  let cellsRemoved = 0;
  const clearedPositions: Array<{ x: number; y: number; color: CellColor }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell && cell.pendingClear) {
        clearedPositions.push({ x: c, y: r, color: cell.color });
        state.grid[r][c] = null;
        cellsRemoved++;
      }
    }
  }

  if (cellsRemoved > 0) {
    settleBoard(state.grid);
    state.squares = detectBoardMarks(state.grid);
  }

  return { cellsRemoved, clearedPositions };
}

export function stepTimelineColumn(
  state: BoardState,
  col: number
): { cellsRemovedNow: number; clearedPositions: Array<{ x: number; y: number; color: CellColor }> } {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  if (col < 0 || col >= cols) {
    return { cellsRemovedNow: 0, clearedPositions: [] };
  }

  // Re-detect marks on non-pending cells before sweeping this column
  state.squares = detectBoardMarks(state.grid);

  // Mark swept cells in this column
  for (let r = 0; r < rows; r++) {
    const cell = state.grid[r][col];
    if (cell && (cell.inSquare || cell.chainMarked)) {
      cell.sweptCol = true;
    }
    if (cell && cell.chainMarked) {
      cell.pendingClear = true;
      state.sweepState.chainClearedThisSweep++;
    }
  }

  // Count completed squares whose right column is `col`
  for (const sq of state.squares) {
    if (sq.x + 1 === col) {
      const key = `${sq.x},${sq.y}`;
      if (!state.sweepState.countedSquareKeys.has(key)) {
        state.sweepState.countedSquareKeys.add(key);
        state.sweepState.squaresThisSweep++;
      }
      const c00 = state.grid[sq.y][sq.x];
      const c01 = state.grid[sq.y][sq.x + 1];
      const c10 = state.grid[sq.y + 1][sq.x];
      const c11 = state.grid[sq.y + 1][sq.x + 1];
      if (c00) c00.pendingClear = true;
      if (c01) c01.pendingClear = true;
      if (c10) c10.pendingClear = true;
      if (c11) c11.pendingClear = true;
    }
  }

  // Check if any square or chain group bridges into `col + 1`
  const maxActiveCol = cols - 1 - state.lockedColumnsRight;
  let bridgesRight = false;
  if (col < maxActiveCol) {
    // Any valid 2x2 square starting at `col` spans `col` and `col + 1`
    if (state.squares.some((sq) => sq.x === col)) {
      bridgesRight = true;
    }
    // Any chain-marked cell in `col` touching a chain-marked cell of the same color in `col + 1`
    if (!bridgesRight) {
      for (let r = 0; r < rows; r++) {
        const cur = state.grid[r][col];
        const nxt = state.grid[r][col + 1];
        if (cur && nxt && cur.chainMarked && nxt.chainMarked && cur.color === nxt.color) {
          bridgesRight = true;
          break;
        }
      }
    }
  }

  state.sweepState.lastCol = col;

  if (!bridgesRight) {
    const flushed = flushPendingClearCells(state);
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

  // Reset sweptCol flags
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = state.grid[r][c];
      if (cell) {
        cell.sweptCol = false;
      }
    }
  }

  if (totalSquares >= 4) {
    state.comboLevel += 1;
    state.maxCombo = Math.max(state.maxCombo, state.comboLevel);
  } else {
    state.comboLevel = 0;
  }

  const squarePoints = calculateSweepScore(totalSquares, state.comboLevel);
  const chainPoints = totalChainCells * 20;
  let bonusPoints = 0;
  let singleColorBonus = false;
  let allDeletedBonus = false;

  if (anyCleared) {
    let remaining = 0;
    const seenColors = new Set<CellColor>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.grid[r][c];
        if (cell) {
          remaining++;
          seenColors.add(cell.color);
        }
      }
    }

    if (remaining === 0) {
      allDeletedBonus = true;
      bonusPoints += 10000;
    } else if (seenColors.size === 1) {
      singleColorBonus = true;
      bonusPoints += 1000;
    }
  }

  const totalAwarded = squarePoints + chainPoints + bonusPoints;
  state.score += totalAwarded;
  state.squaresClearedTotal += totalSquares;
  state.stageSquaresCleared += totalSquares;

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
    // Prefer alternating color from top cell below to create real pressure rather than free squares
    let topExisting: CellColor | null = null;
    for (let r = 1; r < rows; r++) {
      if (state.grid[r][col] !== null) {
        topExisting = state.grid[r][col]!.color;
        break;
      }
    }
    const color: CellColor =
      topExisting !== null && rng() < 0.72
        ? topExisting === 0
          ? 1
          : 0
        : rng() < 0.5
        ? 0
        : 1;
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
  settleBoard(state.grid);
  state.squares = detectBoardMarks(state.grid);
}

export function countBoardCells(grid: (Cell | null)[][]): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== null) count++;
    }
  }
  return count;
}

/**
 * Translates board layout smoothly between Landscape (16x10) and Portrait (10x14):
 * - Preserves the central masonry silhouette, formed 2x2 squares, and chains.
 * - Portrait -> Landscape: lifts upper/overflowing tower stones out onto the newly revealed left/right wings.
 * - Landscape -> Portrait: folds wing columns upward and inward onto non-spawn flanks.
 * - Guarantees open spawn headroom and grants a brief gravity grace period so flipping never causes instant Game Over.
 */
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
    return { transformed: false, displacedBonusPoints: 0 };
  }

  const newGrid = createEmptyGrid(newCols, newRows);
  const centerShift = Math.floor((newCols - oldCols) / 2); // +3 (10->16) or -3 (16->10)
  const rowDelta = newRows - oldRows; // -4 (14->10) or +4 (10->14)
  const newSpawnX = getSpawnColForWidth(newCols);

  const isSpawnCol = (c: number) => c === newSpawnX || c === newSpawnX + 1;

  interface OverflowEntry {
    cell: Cell;
    srcCol: number;
    srcRow: number;
    side: -1 | 1;
  }
  const overflowPool: OverflowEntry[] = [];

  // Track write row (next empty row from bottom) per column in newGrid
  const colWriteRow = Array<number>(newCols).fill(newRows - 1);

  // Pass 1: Translate the central columns directly, retaining formed blocks & silhouette
  for (let oldC = 0; oldC < oldCols; oldC++) {
    const dstC = oldC + centerShift;
    const isOuterWing = dstC < 0 || dstC >= newCols;
    const side: -1 | 1 = oldC < oldCols / 2 ? -1 : 1;

    // Collect non-null cells in this column from bottom to top
    const colEntries: Array<{ cell: Cell; oldR: number }> = [];
    for (let oldR = oldRows - 1; oldR >= 0; oldR--) {
      const cell = state.grid[oldR][oldC];
      if (cell) {
        colEntries.push({ cell: { ...cell, pendingClear: false, sweptCol: false, fallOffset: 0 }, oldR });
      }
    }

    if (isOuterWing) {
      // Landscape -> Portrait: fold outer wing blocks inward & upward onto flanks
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

    // Reserve safe top clearance in target grid so flipping never tops out
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
        // Excess upper stack blocks spill/rise into safe wing columns
        overflowPool.push({
          cell,
          srcCol: oldC,
          srcRow: oldR,
          side,
        });
      }
    });
  }

  // Pass 2: Place displaced upper/wing blocks onto non-spawn side terraces (lowest stack first)
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

    // Pick candidate column with largest remaining room (highest colWriteRow index) respecting ceiling headroom
    let chosenCol = -1;
    let bestWriteRow = -1;
    for (const c of candidateCols) {
      if (c < 0 || c >= newCols || isSpawnCol(c)) continue;
      const minTop = 2;
      if (colWriteRow[c] >= minTop && colWriteRow[c] > bestWriteRow) {
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
      // Board completely saturated everywhere except spawn safety -> crystallize into harmony bonus
      displacedBonusPoints += 40;
    }
  }

  state.grid = newGrid;
  state.cols = newCols;
  state.rows = newRows;
  state.orientation = targetOrientation;
  state.score += displacedBonusPoints;
  state.isGameOver = false;

  // Clamp VS locked wing columns proportionally so at least 6 central lanes remain playable
  const maxEachSide = Math.max(0, Math.floor((newCols - 6) / 2));
  state.lockedColumnsLeft = Math.min(state.lockedColumnsLeft, maxEachSide);
  state.lockedColumnsRight = Math.min(state.lockedColumnsRight, maxEachSide);

  state.squares = detectBoardMarks(state.grid);

  // Remap mid-sweep state cleanly to shifted square coordinates
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

  // Reposition & lift active piece into clean upper headroom, plus pause gravity briefly
  if (state.activePiece) {
    const minPlayCol = state.lockedColumnsLeft;
    const maxPlayCol = newCols - 2 - state.lockedColumnsRight;
    const nextX = Math.max(
      minPlayCol,
      Math.min(maxPlayCol, state.activePiece.x + centerShift)
    );
    let highestInPath = newRows;
    for (let r = 0; r < newRows; r++) {
      if (state.grid[r][nextX] !== null || state.grid[r][nextX + 1] !== null) {
        highestInPath = r;
        break;
      }
    }
    const safeY = Math.max(-2, Math.min(0, highestInPath - 4));
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

  state.nextQueue = state.nextQueue.map((p) => ({
    ...p,
    x: newSpawnX,
    y: -2,
  }));

  return { transformed: true, displacedBonusPoints };
}

/**
 * Rotates the entire board 90 degrees (swapping cols and rows, e.g. 16x10 <-> 10x16
 * or 10x14 <-> 14x10) and settles all bricks down to the new bottom under gravity.
 */
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
      if (!cell) continue;
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

  // Drop all unsupported bricks down to the new bottom; settleBoard records exact fallOffset per cell
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
  state.isGameOver = false;

  const maxEachSide = Math.max(0, Math.floor((newCols - 6) / 2));
  state.lockedColumnsLeft = Math.min(state.lockedColumnsLeft, maxEachSide);
  state.lockedColumnsRight = Math.min(state.lockedColumnsRight, maxEachSide);

  state.squares = detectBoardMarks(state.grid);
  state.sweepState = createSweepState();

  const newSpawnX = getSpawnColForWidth(newCols);
  if (state.activePiece) {
    const rotatedPiece =
      direction === 'cw'
        ? rotatePieceCellsCW(state.activePiece)
        : rotatePieceCellsCCW(state.activePiece);
    const minPlayCol = state.lockedColumnsLeft;
    const maxPlayCol = Math.max(minPlayCol, newCols - 2 - state.lockedColumnsRight);
    const safeX = Math.max(minPlayCol, Math.min(maxPlayCol, newSpawnX));
    state.activePiece = {
      ...rotatedPiece,
      x: safeX,
      y: -2,
    };
    state.spawnTimer = 0;
    state.gravityAccum = 0;
    state.lockTimer = 0;
    state.lockResetCount = 0;
    state.orientationGraceTimer = animateBricks ? 1.15 : 0;
  }

  state.nextQueue = state.nextQueue.map((p) => ({
    ...p,
    x: newSpawnX,
    y: -2,
  }));

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

/**
 * Classic Lumines + Journey progression:
 * - Every skin has a hidden `squaresPerLevel` threshold (e.g., 16-22 squares).
 * - Reaching the threshold increments Level by 1 and DISCARDS any excess squares cleared in that sweep
 *   (no overflow carry-over into the next level).
 * - Normal skins transition every 4-5 levels (`levelsPerSkin`), totaling ~64-90 squares.
 * - A final timed stage (`finalStageTimerSec`) ignores square count for transitioning and instead
 *   advances/finishes via `advanceTimedStageProgression` on a flat timer.
 */
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
      // Discard any excess squares above the threshold
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

