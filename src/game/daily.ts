import {
  BOARD_COLS,
  BOARD_ROWS,
  createEmptyGrid,
  detectBoardMarks,
  settleBoard,
} from './engine';
import { SKINS } from './skins';
import {
  Cell,
  CellColor,
  DailyChallengeSpec,
  MissionLevel,
} from './types';

export function getDailyDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - 1);
  return getDailyDateKey(dt);
}

export function getMsUntilNextDaily(date: Date = new Date()): number {
  const nextMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, nextMidnight.getTime() - date.getTime());
}

export function formatCountdownHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seedKey: string): () => number {
  let state = hashSeed(seedKey) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DailyTemplate {
  type: MissionLevel['type'];
  titles: string[];
  makeDesc: (target: number, timeLimit: number) => string;
  targets: number[];
  timeLimits: number[];
}

const DAILY_TEMPLATES: DailyTemplate[] = [
  {
    type: 'sweep_squares',
    titles: ['Horizon Cascade', 'Solar Resonance', 'Twin-Wave Accord'],
    makeDesc: (target) =>
      `Clear at least ${target} squares in a single timeline sweep.`,
    targets: [4, 5],
    timeLimits: [75, 90],
  },
  {
    type: 'total_squares',
    titles: ['Terrace Harvest', 'Sunken Mosaic', 'Courtyard Cadence'],
    makeDesc: (target, timeLimit) =>
      `Clear ${target} total squares within ${timeLimit} seconds.`,
    targets: [12, 14, 16],
    timeLimits: [90, 105],
  },
  {
    type: 'combo_level',
    titles: ['Harmonic Surge', 'Double Tempo Lock', 'Echoing Barline'],
    makeDesc: (target) =>
      `Build a ${target}× consecutive sweep combo (${Math.min(16, target * 4)}× multiplier).`,
    targets: [2],
    timeLimits: [95, 110],
  },
  {
    type: 'chain_cells',
    titles: ['Chain Catalyst', 'Prismatic Link', 'Azure Conduit'],
    makeDesc: (target) =>
      `Link and clear ${target} or more blocks with a Chain Block.`,
    targets: [8, 10],
    timeLimits: [85, 100],
  },
  {
    type: 'all_clear',
    titles: ['Blank Courtyard', 'Mirror Basin', 'Still Water Wipe'],
    makeDesc: () => 'Clear every block from today’s generated courtyard.',
    targets: [1],
    timeLimits: [75, 90],
  },
  {
    type: 'single_color',
    titles: ['Monochrome Horizon', 'Pure Palette', 'Quiet Equilibrium'],
    makeDesc: () => 'Leave only one block color remaining after a sweep.',
    targets: [1],
    timeLimits: [85, 95],
  },
];

function makeDailyCell(id: number, color: CellColor, isChain = false): Cell {
  return {
    id,
    color,
    isChain,
    chainMarked: false,
    inSquare: false,
    pendingClear: false,
    sweptCol: false,
    fallOffset: 0,
    landFlash: 0,
  };
}

export function buildDailyStartingGrid(
  dateKey: string,
  missionType: MissionLevel['type']
): (Cell | null)[][] {
  const rng = createSeededRng(`iluminado-grid-${dateKey}-${missionType}`);
  const grid = createEmptyGrid();
  let nextId = 70000;

  const silhouetteProfile = Math.floor(rng() * 4);
  const dominantColor: CellColor = rng() < 0.5 ? 0 : 1;
  const secondaryColor: CellColor = dominantColor === 0 ? 1 : 0;

  for (let c = 0; c < BOARD_COLS; c++) {
    const isCenterSpawn = c === 7 || c === 8;
    let colHeight = 0;

    if (missionType === 'all_clear') {
      const distCenter = Math.abs(c - 7.5);
      if (distCenter <= 5.5) {
        colHeight = Math.floor(rng() * 3) + 1;
      }
    } else if (missionType === 'single_color') {
      colHeight = isCenterSpawn
        ? Math.floor(rng() * 2)
        : Math.floor(rng() * 3) + (c >= 2 && c <= 13 ? 1 : 0);
    } else {
      if (silhouetteProfile === 0) {
        colHeight = isCenterSpawn
          ? 1
          : c < 5 || c > 10
          ? 2 + Math.floor(rng() * 3)
          : 1 + Math.floor(rng() * 2);
      } else if (silhouetteProfile === 1) {
        const edgeFactor = Math.floor(Math.abs(c - 7.5) / 2);
        colHeight = Math.min(4, (isCenterSpawn ? 0 : 1) + edgeFactor + (rng() < 0.4 ? 1 : 0));
      } else if (silhouetteProfile === 2) {
        const wave = Math.round(1.6 + Math.sin(c * 0.65 + rng() * 0.4) * 1.6);
        colHeight = Math.max(0, Math.min(4, isCenterSpawn ? Math.min(1, wave) : wave));
      } else {
        colHeight = isCenterSpawn
          ? Math.floor(rng() * 2)
          : rng() < 0.78
          ? 1 + Math.floor(rng() * 3)
          : 0;
      }
    }

    colHeight = Math.min(4, Math.max(0, colHeight));
    for (let h = 0; h < colHeight; h++) {
      const r = BOARD_ROWS - 1 - h;
      let color: CellColor;
      if (missionType === 'single_color') {
        color = rng() < 0.72 ? dominantColor : secondaryColor;
      } else {
        const biasAlt = (r + c) % 2 === 0 ? dominantColor : secondaryColor;
        color = rng() < 0.62 ? biasAlt : rng() < 0.5 ? 0 : 1;
      }
      grid[r][c] = makeDailyCell(nextId++, color, false);
    }
  }

  if (missionType === 'chain_cells') {
    const baseCol = 3 + Math.floor(rng() * 4);
    for (let dc = 0; dc < 5; dc++) {
      const c = baseCol + dc;
      grid[BOARD_ROWS - 1][c] = makeDailyCell(nextId++, dominantColor, false);
      if (dc % 2 === 0) {
        grid[BOARD_ROWS - 2][c] = makeDailyCell(nextId++, dominantColor, false);
      }
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    const squares = detectBoardMarks(grid);
    if (squares.length === 0) break;
    for (const sq of squares) {
      const targetCell = grid[sq.y][sq.x + 1];
      if (targetCell) {
        targetCell.color = targetCell.color === 0 ? 1 : 0;
      }
    }
  }

  settleBoard(grid);
  detectBoardMarks(grid);
  return grid;
}

export function generateDailyChallenge(
  dateKey: string = getDailyDateKey()
): DailyChallengeSpec {
  const rng = createSeededRng(`iluminado-daily-${dateKey}`);
  const template = DAILY_TEMPLATES[Math.floor(rng() * DAILY_TEMPLATES.length)];
  const title = template.titles[Math.floor(rng() * template.titles.length)];
  const targetValue =
    template.targets[Math.floor(rng() * template.targets.length)];
  const timeLimit =
    template.timeLimits[Math.floor(rng() * template.timeLimits.length)];
  const skinIndex = Math.floor(rng() * SKINS.length);

  const mission: MissionLevel = {
    id: `daily-${dateKey}`,
    title,
    description: template.makeDesc(targetValue, timeLimit),
    timeLimit,
    type: template.type,
    targetValue,
  };

  const startingGrid = buildDailyStartingGrid(dateKey, mission.type);
  const previewRows = startingGrid.map((row) =>
    row.map((cell) => (cell ? cell.color : null))
  );

  return {
    dateKey,
    mission,
    skinIndex,
    seedKey: `iluminado-pieces-${dateKey}`,
    startingGrid,
    previewRows,
  };
}
