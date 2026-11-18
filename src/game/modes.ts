import {
  BOARD_COLS,
  canPlacePiece,
  createEmptyGrid,
  detectBoardMarks,
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

/**
 * Checks whether the target silhouette pattern exists anywhere on the board,
 * cleanly framed (any '#' matches targetColor, any '.' is either empty or the opposite color).
 */
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
            if (!cell || cell.color !== puzzle.targetColor) {
              matches = false;
              break;
            }
          } else {
            // '.' must NOT be targetColor (either empty or opposite color)
            if (cell && cell.color === puzzle.targetColor) {
              matches = false;
              break;
            }
          }
        }
      }
      if (matches) {
        // Also ensure adjacent border around the pattern doesn't bleed targetColor seamlessly
        // so the silhouette is distinct! Check top/bottom/left/right outer ring.
        let distinct = true;
        for (let pr = 0; pr < pRows && distinct; pr++) {
          const leftCell = startC > 0 ? grid[startR + pr][startC - 1] : null;
          const rightCell =
            startC + pCols < cols ? grid[startR + pr][startC + pCols] : null;
          if (puzzle.pattern[pr][0] === '#' && leftCell?.color === puzzle.targetColor) {
            distinct = false;
          }
          if (
            puzzle.pattern[pr][pCols - 1] === '#' &&
            rightCell?.color === puzzle.targetColor
          ) {
            distinct = false;
          }
        }
        for (let pc = 0; pc < pCols && distinct; pc++) {
          const topCell = startR > 0 ? grid[startR - 1][startC + pc] : null;
          const botCell =
            startR + pRows < rows ? grid[startR + pRows][startC + pc] : null;
          if (puzzle.pattern[0][pc] === '#' && topCell?.color === puzzle.targetColor) {
            distinct = false;
          }
          if (
            puzzle.pattern[pRows - 1][pc] === '#' &&
            botCell?.color === puzzle.targetColor
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
    // 2x4 stack ready to clear cleanly
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
  targetRotations: number; // 0..3 CW rotations
}

/**
 * Computes a smart placement (targetX, targetRotations) for the CPU opponent
 * by simulating drops on a cloned grid and scoring 2x2 squares + color adjacency - height.
 */
export function computeCpuBestMove(state: BoardState): CpuTargetPlan {
  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? state.cols ?? BOARD_COLS;
  const centerX = getSpawnColForWidth(cols);
  const piece = state.activePiece;
  if (!piece) return { targetX: centerX, targetRotations: 0 };

  let bestScore = -Infinity;
  let bestPlan: CpuTargetPlan = { targetX: piece.x, targetRotations: 0 };

  const minCol = state.lockedColumnsLeft;
  const maxCol = cols - 2 - state.lockedColumnsRight;

  let testPiece: Piece = {
    ...piece,
    cells: [
      [{ ...piece.cells[0][0] }, { ...piece.cells[0][1] }],
      [{ ...piece.cells[1][0] }, { ...piece.cells[1][1] }],
    ],
  };

  for (let rot = 0; rot < 4; rot++) {
    for (let col = minCol; col <= maxCol; col++) {
      const candidate: Piece = { ...testPiece, x: col, y: piece.y };
      if (!canPlacePiece(state, candidate, 0, 0)) continue;

      // Simulate placement using Lumines per-column split drop onto a cloned grid
      const simGrid: (Cell | null)[][] = state.grid.map((row) =>
        row.map((c) => (c ? { ...c } : null))
      );
      settleBoard(simGrid);

      let overflowed = false;
      for (let px = 0; px < 2; px++) {
        const gx = col + px;
        let writeRow = rows - 1;
        while (writeRow >= 0 && simGrid[writeRow][gx] !== null) {
          writeRow--;
        }
        for (let py = 1; py >= 0; py--) {
          if (writeRow < 0) {
            overflowed = true;
            continue;
          }
          simGrid[writeRow][gx] = {
            id: 0,
            color: candidate.cells[py][px].color,
            isChain: candidate.cells[py][px].isChain,
            chainMarked: false,
            inSquare: false,
            pendingClear: false,
            sweptCol: false,
            fallOffset: 0,
            landFlash: 0,
          };
          writeRow--;
        }
      }

      const squares = detectBoardMarks(simGrid);

      // Evaluate heuristic
      let maxHeight = 0;
      let chainCount = 0;
      let sameAdj = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = simGrid[r][c];
          if (cell) {
            maxHeight = Math.max(maxHeight, rows - r);
            if (cell.chainMarked) chainCount++;
            if (c + 1 < cols && simGrid[r][c + 1]?.color === cell.color) sameAdj++;
            if (r + 1 < rows && simGrid[r + 1][c]?.color === cell.color) sameAdj++;
          }
        }
      }

      const heuristic =
        (overflowed ? -10000 : 0) +
        squares.length * 140 +
        chainCount * 35 +
        sameAdj * 4 -
        maxHeight * 12 -
        Math.abs(col - centerX) * 0.5;

      if (heuristic > bestScore) {
        bestScore = heuristic;
        bestPlan = { targetX: col, targetRotations: rot };
      }
    }
    testPiece = rotatePieceCellsCW(testPiece);
  }

  return bestPlan;
}
