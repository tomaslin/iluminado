import {
  BOARD_COLS,
  canPlacePiece,
  createEmptyGrid,
  detectBoardMarks,
  getActiveWellRegion,
  getSpawnColForWidth,
  rotatePieceCellsCW,
  settleBoard,
} from './engine';
import {
  BoardState,
  Cell,
  CellColor,
  MissionLevel,
  Piece,
  PuzzleLevel,
} from './types';

export const PUZZLE_LEVELS: PuzzleLevel[] = [
  {
    id: 'archway',
    title: 'Pastel Archway',
    hint: 'Build a 3×3 arch with an open doorway on the bottom.',
    targetColor: 0,
    timeLimit: 120,
    pattern: [
      '###',
      '#.#',
      '#.#',
    ],
  },
  {
    id: 'obelisk',
    title: 'Sunlit Obelisk',
    hint: 'Form a stepped spire: 1 cell peak atop a 3×2 plinth.',
    targetColor: 0,
    timeLimit: 150,
    pattern: [
      '.#.',
      '###',
      '###',
    ],
  },
  {
    id: 'hourglass',
    title: 'Sand Hourglass',
    hint: 'Pinch a 3×3 hourglass: wide top and base, single-cell waist.',
    targetColor: 1,
    timeLimit: 150,
    pattern: [
      '###',
      '.#.',
      '###',
    ],
  },
  {
    id: 'crown',
    title: 'Monument Crown',
    hint: 'Carve three battlements along a solid base.',
    targetColor: 0,
    timeLimit: 180,
    pattern: [
      '#.#.#',
      '#####',
    ],
  },
  {
    id: 'staircase',
    title: 'Ascending Steps',
    hint: 'Stack three diagonal terrace steps rising to the right.',
    targetColor: 1,
    timeLimit: 150,
    pattern: [
      '..#',
      '.##',
      '###',
    ],
  },
  {
    id: 'cross',
    title: 'Compass Sanctuary',
    hint: 'Construct a symmetrical 3×3 cross in the courtyard.',
    targetColor: 0,
    timeLimit: 180,
    pattern: [
      '.#.',
      '###',
      '.#.',
    ],
  },
];

export const MISSION_LEVELS: MissionLevel[] = [
  {
    id: 'sweep-4',
    title: 'Fourfold Resonance',
    description: 'Clear at least 4 squares in a single timeline sweep.',
    timeLimit: 60,
    type: 'sweep_squares',
    targetValue: 4,
    presetGrid: 'sparse',
  },
  {
    id: 'combo-2',
    title: 'Double Harmonic',
    description: 'Achieve a 2× consecutive sweep combo (8× multiplier).',
    timeLimit: 90,
    type: 'combo_level',
    targetValue: 2,
    presetGrid: 'sparse',
  },
  {
    id: 'chain-10',
    title: 'Chain Sanctuary',
    description: 'Clear 8 or more connected blocks using a Chain Block.',
    timeLimit: 75,
    type: 'chain_cells',
    targetValue: 8,
    presetGrid: 'chain_ready',
  },
  {
    id: 'all-clear',
    title: 'Clean Slate',
    description: 'Clear every block from the preset courtyard.',
    timeLimit: 60,
    type: 'all_clear',
    targetValue: 1,
    presetGrid: 'tower',
  },
  {
    id: 'single-color',
    title: 'Monochrome Calm',
    description: 'Leave only one color remaining after a clear.',
    timeLimit: 75,
    type: 'single_color',
    targetValue: 1,
    presetGrid: 'almost_single',
  },
  {
    id: 'total-16',
    title: 'Grand Sweep',
    description: 'Clear 16 total squares within 90 seconds.',
    timeLimit: 90,
    type: 'total_squares',
    targetValue: 16,
  },
];

export function checkPuzzlePatternMatch(
  grid: (Cell | null)[][],
  puzzle: PuzzleLevel
): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? BOARD_COLS;
  const pRows = puzzle.pattern.length;
  const pCols = puzzle.pattern[0]?.length ?? 0;
  if (pRows === 0 || pCols === 0) return false;

  for (let startR = 0; startR <= rows - pRows; startR++) {
    for (let startC = 0; startC <= cols - pCols; startC++) {
      let matches = true;
      for (let pr = 0; pr < pRows && matches; pr++) {
        for (let pc = 0; pc < pCols; pc++) {
          const ch = puzzle.pattern[pr][pc];
          const cell = grid[startR + pr][startC + pc];
          if (ch === '#') {
            if (!cell || cell.isObstacle || cell.color !== puzzle.targetColor) {
              matches = false;
              break;
            }
          } else {
            if (cell && !cell.isObstacle && cell.color === puzzle.targetColor) {
              matches = false;
              break;
            }
          }
        }
      }
      if (matches) {
        let distinct = true;
        for (let pr = 0; pr < pRows && distinct; pr++) {
          const leftCell = startC > 0 ? grid[startR + pr][startC - 1] : null;
          const rightCell =
            startC + pCols < cols ? grid[startR + pr][startC + pCols] : null;
          if (
            puzzle.pattern[pr][0] === '#' &&
            leftCell &&
            !leftCell.isObstacle &&
            leftCell.color === puzzle.targetColor
          ) {
            distinct = false;
          }
          if (
            puzzle.pattern[pr][pCols - 1] === '#' &&
            rightCell &&
            !rightCell.isObstacle &&
            rightCell.color === puzzle.targetColor
          ) {
            distinct = false;
          }
        }
        for (let pc = 0; pc < pCols && distinct; pc++) {
          const topCell = startR > 0 ? grid[startR - 1][startC + pc] : null;
          const botCell =
            startR + pRows < rows ? grid[startR + pRows][startC + pc] : null;
          if (
            puzzle.pattern[0][pc] === '#' &&
            topCell &&
            !topCell.isObstacle &&
            topCell.color === puzzle.targetColor
          ) {
            distinct = false;
          }
          if (
            puzzle.pattern[pRows - 1][pc] === '#' &&
            botCell &&
            !botCell.isObstacle &&
            botCell.color === puzzle.targetColor
          ) {
            distinct = false;
          }
        }
        if (distinct) return true;
      }
    }
  }
  return false;
}

export function buildMissionPresetGrid(
  preset?: MissionLevel['presetGrid'],
  cols: number = BOARD_COLS,
  rows: number = 10
): (Cell | null)[][] {
  const grid = createEmptyGrid(cols, rows);
  const offset = Math.floor((cols - 16) / 2);
  const cx = (origC: number) => Math.max(0, Math.min(cols - 1, origC + offset));
  let idCounter = 90000;
  const makeCell = (color: CellColor, isChain = false): Cell => ({
    id: idCounter++,
    color,
    isChain,
    chainMarked: false,
    inSquare: false,
    pendingClear: false,
    sweptCol: false,
    fallOffset: 0,
    landFlash: 0,
  });

  if (preset === 'sparse') {
    for (let c = 4; c <= 9; c++) {
      grid[rows - 1][cx(c)] = makeCell(0);
    }
    grid[rows - 2][cx(5)] = makeCell(0);
    grid[rows - 2][cx(6)] = makeCell(0);
    grid[rows - 2][cx(7)] = makeCell(1);
    grid[rows - 2][cx(8)] = makeCell(0);
  } else if (preset === 'chain_ready') {
    for (let c = 3; c <= 11; c++) {
      grid[rows - 1][cx(c)] = makeCell(0);
    }
    grid[rows - 2][cx(4)] = makeCell(0);
    grid[rows - 2][cx(5)] = makeCell(1);
    grid[rows - 2][cx(6)] = makeCell(0);
    grid[rows - 2][cx(9)] = makeCell(0);
  } else if (preset === 'tower') {
    for (let c = 6; c <= 9; c++) {
      grid[rows - 1][cx(c)] = makeCell(0);
      grid[rows - 2][cx(c)] = makeCell(1);
    }
    grid[rows - 3][cx(6)] = makeCell(1);
    grid[rows - 3][cx(7)] = makeCell(1);
  } else if (preset === 'almost_single') {
    for (let c = 5; c <= 10; c++) {
      grid[rows - 1][cx(c)] = makeCell(0);
    }
    grid[rows - 2][cx(7)] = makeCell(1);
    grid[rows - 2][cx(8)] = makeCell(1);
    grid[rows - 3][cx(7)] = makeCell(1);
  }

  settleBoard(grid);
  detectBoardMarks(grid);
  return grid;
}

export interface CpuTargetPlan {
  targetX: number;
  targetY?: number;
  targetRotations: number;
}

function toSimCell(pCell: NonNullable<Piece['cells'][number][number]>): Cell {
  return pCell.isBlocked
    ? {
        id: 0,
        color: 0,
        isChain: false,
        isObstacle: true,
        obstacleFixed: false,
        obstacleStyle: 'blocked',
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset: 0,
        landFlash: 0,
      }
    : {
        id: 0,
        color: pCell.color,
        isChain: pCell.isChain,
        ...(pCell.isWild ? { isWild: true } : {}),
        chainMarked: false,
        inSquare: false,
        pendingClear: false,
        sweptCol: false,
        fallOffset: 0,
        landFlash: 0,
      };
}

export function computeCpuBestMove(state: BoardState): CpuTargetPlan {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const region = getActiveWellRegion(state);
  const dir = region?.gravity ?? state.gravityDirection ?? 'down';
  const minRowBound = region ? region.minRow : 0;
  const maxRowBound = region ? region.maxRow : rows - 1;
  const minColBound = region
    ? Math.max(state.lockedColumnsLeft, region.minCol)
    : state.lockedColumnsLeft;
  const maxColBound = region
    ? Math.min(cols - 1 - state.lockedColumnsRight, region.maxCol)
    : cols - 1 - state.lockedColumnsRight;
  const centerX = region
    ? Math.floor((region.minCol + region.maxCol) / 2)
    : getSpawnColForWidth(cols);
  const centerY = region
    ? Math.floor((region.minRow + region.maxRow) / 2)
    : Math.max(0, Math.floor((rows - 2) / 2));
  const splitSeamRow =
    state.activeShift === 'clamshell' && state.wellRegions?.length
      ? state.wellRegions[0].maxRow
      : undefined;
  const piece = state.activePiece;
  if (!piece) return { targetX: centerX, targetY: centerY, targetRotations: 0 };

  let bestScore = -Infinity;
  let bestPlan: CpuTargetPlan = {
    targetX: piece.x,
    targetY: piece.y,
    targetRotations: 0,
  };

  const simGrid: (Cell | null)[][] = state.grid.map((row) =>
    row.map((c) => (c ? { ...c } : null))
  );
  const undoRows: number[] = [];
  const undoCols: number[] = [];
  const undoCells: (Cell | null)[] = [];

  const placeSimCell = (r: number, c: number, cell: Cell) => {
    undoRows.push(r);
    undoCols.push(c);
    undoCells.push(simGrid[r][c]);
    simGrid[r][c] = cell;
  };

  const restoreSimGrid = () => {
    for (let i = undoRows.length - 1; i >= 0; i--) {
      simGrid[undoRows[i]][undoCols[i]] = undoCells[i];
    }
    undoRows.length = 0;
    undoCols.length = 0;
    undoCells.length = 0;
  };

  const scoreCandidate = (
    placedCount: number,
    overflowed: boolean,
    centerDist: number
  ): number => {
    const squares = detectBoardMarks(
      simGrid,
      splitSeamRow !== undefined ? { splitSeamRow } : undefined
    );
    let maxDepth = 0;
    let chainCount = 0;
    let sameAdj = 0;
    for (let r = minRowBound; r <= maxRowBound; r++) {
      for (let c = minColBound; c <= maxColBound; c++) {
        const cell = simGrid[r][c];
        if (!cell || cell.isObstacle) continue;
        const depth =
          dir === 'down'
            ? maxRowBound - r + 1
            : dir === 'up'
            ? r - minRowBound + 1
            : dir === 'right'
            ? maxColBound - c + 1
            : c - minColBound + 1;
        if (depth > maxDepth) maxDepth = depth;
        if (cell.chainMarked) chainCount++;
        const right = c + 1 <= maxColBound ? simGrid[r][c + 1] : null;
        if (right && !right.isObstacle && right.color === cell.color) sameAdj++;
        const down = r + 1 <= maxRowBound ? simGrid[r + 1][c] : null;
        if (down && !down.isObstacle && down.color === cell.color) sameAdj++;
      }
    }

    return (
      (placedCount === 0 ? -10000 : overflowed ? -80 : 0) +
      squares.length * 140 +
      chainCount * 35 +
      sameAdj * 4 -
      maxDepth * 12 -
      centerDist * 0.5
    );
  };

  let testPiece: Piece = {
    ...piece,
    cells: piece.cells.map((row) =>
      row.map((cell) => (cell ? { ...cell } : null))
    ),
  };

  for (let rot = 0; rot < 4; rot++) {
    const pieceRows = testPiece.cells.length;
    const pieceCols = testPiece.cells[0]?.length ?? 2;

    if (dir === 'down' || dir === 'up') {
      const maxStartCol = Math.max(minColBound, maxColBound - pieceCols + 1);
      for (let col = minColBound; col <= maxStartCol; col++) {
        const candidate: Piece = { ...testPiece, x: col, y: piece.y };
        if (!canPlacePiece(state, candidate, 0, 0)) continue;

        let overflowed = false;
        let placedCount = 0;

        for (let px = 0; px < pieceCols; px++) {
          const gx = col + px;
          if (gx < minColBound || gx > maxColBound || gx < 0 || gx >= cols) continue;

          if (dir === 'down') {
            let lowestPy = -1;
            for (let py = pieceRows - 1; py >= 0; py--) {
              if (candidate.cells[py]?.[px] !== null) {
                lowestPy = py;
                break;
              }
            }
            if (lowestPy < 0) continue;
            const startScan = Math.max(minRowBound, candidate.y + lowestPy);
            let stopRow = maxRowBound + 1;
            for (let scan = startScan; scan <= maxRowBound; scan++) {
              if (simGrid[scan][gx] !== null) {
                stopRow = scan;
                break;
              }
            }
            let writeRow = stopRow - 1;
            for (let py = pieceRows - 1; py >= 0; py--) {
              const pCell = candidate.cells[py]?.[px];
              if (!pCell) continue;
              if (writeRow < minRowBound) {
                overflowed = true;
                continue;
              }
              placeSimCell(writeRow, gx, toSimCell(pCell));
              placedCount++;
              writeRow--;
            }
          } else {
            let highestPy = -1;
            for (let py = 0; py < pieceRows; py++) {
              if (candidate.cells[py]?.[px] !== null) {
                highestPy = py;
                break;
              }
            }
            if (highestPy < 0) continue;
            const startScan = Math.min(maxRowBound, candidate.y + highestPy);
            let stopRow = minRowBound - 1;
            for (let scan = startScan; scan >= minRowBound; scan--) {
              if (simGrid[scan][gx] !== null) {
                stopRow = scan;
                break;
              }
            }
            let writeRow = stopRow + 1;
            for (let py = 0; py < pieceRows; py++) {
              const pCell = candidate.cells[py]?.[px];
              if (!pCell) continue;
              if (writeRow > maxRowBound) {
                overflowed = true;
                continue;
              }
              placeSimCell(writeRow, gx, toSimCell(pCell));
              placedCount++;
              writeRow++;
            }
          }
        }

        const heuristic = scoreCandidate(placedCount, overflowed, Math.abs(col - centerX));
        restoreSimGrid();

        if (heuristic > bestScore) {
          bestScore = heuristic;
          bestPlan = { targetX: col, targetRotations: rot };
        }
      }
    } else {
      const maxStartRow = Math.max(minRowBound, maxRowBound - pieceRows + 1);
      for (let row = minRowBound; row <= maxStartRow; row++) {
        const candidate: Piece = { ...testPiece, x: piece.x, y: row };
        if (!canPlacePiece(state, candidate, 0, 0)) continue;

        let overflowed = false;
        let placedCount = 0;

        for (let py = 0; py < pieceRows; py++) {
          const gy = row + py;
          if (gy < minRowBound || gy > maxRowBound || gy < 0 || gy >= rows) continue;

          if (dir === 'right') {
            let rightPx = -1;
            for (let px = pieceCols - 1; px >= 0; px--) {
              if (candidate.cells[py]?.[px] !== null) {
                rightPx = px;
                break;
              }
            }
            if (rightPx < 0) continue;
            const startScan = Math.max(minColBound, candidate.x + rightPx);
            let stopCol = maxColBound + 1;
            for (let scan = startScan; scan <= maxColBound; scan++) {
              if (simGrid[gy][scan] !== null) {
                stopCol = scan;
                break;
              }
            }
            let writeCol = stopCol - 1;
            for (let px = pieceCols - 1; px >= 0; px--) {
              const pCell = candidate.cells[py]?.[px];
              if (!pCell) continue;
              if (writeCol < minColBound) {
                overflowed = true;
                continue;
              }
              placeSimCell(gy, writeCol, toSimCell(pCell));
              placedCount++;
              writeCol--;
            }
          } else {
            let leftPx = -1;
            for (let px = 0; px < pieceCols; px++) {
              if (candidate.cells[py]?.[px] !== null) {
                leftPx = px;
                break;
              }
            }
            if (leftPx < 0) continue;
            const startScan = Math.min(maxColBound, candidate.x + leftPx);
            let stopCol = minColBound - 1;
            for (let scan = startScan; scan >= minColBound; scan--) {
              if (simGrid[gy][scan] !== null) {
                stopCol = scan;
                break;
              }
            }
            let writeCol = stopCol + 1;
            for (let px = 0; px < pieceCols; px++) {
              const pCell = candidate.cells[py]?.[px];
              if (!pCell) continue;
              if (writeCol > maxColBound) {
                overflowed = true;
                continue;
              }
              placeSimCell(gy, writeCol, toSimCell(pCell));
              placedCount++;
              writeCol++;
            }
          }
        }

        const heuristic = scoreCandidate(placedCount, overflowed, Math.abs(row - centerY));
        restoreSimGrid();

        if (heuristic > bestScore) {
          bestScore = heuristic;
          bestPlan = { targetX: piece.x, targetY: row, targetRotations: rot };
        }
      }
    }

    testPiece = rotatePieceCellsCW(testPiece);
    if (state.activeShift === 'chameleon_rotate') {
      testPiece = {
        ...testPiece,
        cells: testPiece.cells.map((row) =>
          row.map((c) =>
            c && !c.isBlocked
              ? { ...c, color: ((c.color + 1) % state.colorCount) as CellColor }
              : c
          )
        ),
      };
    }
  }

  return bestPlan;
}
