import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BOARD_COLS,
  BOARD_ROWS,
  LOCK_DELAY_SEC,
  PORTRAIT_COLS,
  PORTRAIT_ROWS,
  StageProgressionState,
  advanceSweepStageProgression,
  advanceTimedStageProgression,
  calculateSweepScore,
  computeEncoreState,
  computeStageProgressMetrics,
  computeTimeAttackPaceDelta,
  createInitialBoardState,
  createPieceFromPattern,
  detectBoardMarks,
  finalizeSweep,
  flushPendingGarbage,
  generateRandomPiece,
  getDiagonalSlantSpan,
  getPieceLandingColumns,
  getSweepColumnForRow,
  hardDropPiece,
  isActivePieceGrounded,
  lockActivePiece,
  movePieceHorizontal,
  resolveBattleGarbageSwap,
  rotateActivePiece,
  rotateBoard90,
  settleBoard,
  softDropStep,
  steerPiece,
  stepPassiveGravity,
  stepTimelineColumn,
  transformBoardForOrientation,
} from './engine';
import { computeCpuBestMove, checkPuzzlePatternMatch, PUZZLE_LEVELS } from './modes';
import {
  IluminadoAudioEngine,
  computeStemLevels,
  getTrackTrimGain,
} from './audio';
import {
  buildDailyStartingGrid,
  createSeededRng,
  formatCountdownHMS,
  generateDailyChallenge,
  getDailyDateKey,
  getPreviousDateKey,
} from './daily';
import {
  INITIAL_UNLOCKED_SKIN_IDS,
  SKINS,
  advanceShuffledSkinDeck,
  createShuffledSkinDeck,
  getBlockStyle,
  getHexLuminance,
  isPureBlackOrWhite,
  pickRandomSkinIndex,
} from './skins';
import {
  NEW_V5_SHIFTS,
  NEW_V6_SHIFTS,
  applyDailyResultToProgress,
  applyTimeAttackSplitsToProgress,
  getEffectiveDailyStreak,
  isDailyCompletedForDate,
  loadProgress,
  saveProgress,
} from './storage';
import {
  ALL_SHIFT_TYPES,
  OBSTACLE_SHIFT_SET,
  TILE_TYPE_SHIFT_SET,
  advanceShiftStageTurn,
  applyBoardShift,
  pickNextShift,
  stepConveyorFloor,
  stepPatrollingBumper,
} from './shifts';
import { Cell, CellColor, SavedProgress, ShiftType } from './types';

function makeCell(color: CellColor, isChain = false): Cell {
  return {
    id: Math.floor(Math.random() * 1e6),
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

test('board dimensions are 16 columns by 10 rows', () => {
  const state = createInitialBoardState(0);
  assert.equal(BOARD_COLS, 16);
  assert.equal(BOARD_ROWS, 10);
  assert.equal(state.grid.length, 10);
  assert.equal(state.grid[0].length, 16);
});

test('2x2 piece rotation rearranges cells clockwise and counter-clockwise', () => {
  const state = createInitialBoardState(0);
  state.activePiece = createPieceFromPattern([0, 1, 1, 1]);
  // [0, 1]
  // [1, 1]
  assert.equal(rotateActivePiece(state, 'cw'), true);
  // CW:
  // [1, 0]
  // [1, 1]
  assert.equal(state.activePiece.cells[0][0]?.color, 1);
  assert.equal(state.activePiece.cells[0][1]?.color, 0);
  assert.equal(state.activePiece.cells[1][0]?.color, 1);
  assert.equal(state.activePiece.cells[1][1]?.color, 1);

  assert.equal(rotateActivePiece(state, 'ccw'), true);
  assert.equal(state.activePiece.cells[0][0]?.color, 0);
  assert.equal(state.activePiece.cells[0][1]?.color, 1);
});

test('movement respects left and right board bounds', () => {
  const state = createInitialBoardState(0);
  state.activePiece = createPieceFromPattern([0, 0, 1, 1]);
  state.activePiece.x = 0;
  assert.equal(movePieceHorizontal(state, -1), false);
  state.activePiece.x = 14;
  assert.equal(movePieceHorizontal(state, 1), false);
  assert.equal(movePieceHorizontal(state, -1), true);
  assert.equal(state.activePiece.x, 13);
});

test('independent cell settling drops unsupported cells onto lower rows', () => {
  const state = createInitialBoardState(0);
  // Put a pillar at col 5, row 9
  state.grid[9][5] = makeCell(1);
  // Place active piece above col 5..6 at row 7
  state.activePiece = createPieceFromPattern([0, 0, 0, 0]);
  state.activePiece.x = 5;
  state.activePiece.y = 7;

  lockActivePiece(state, 0);
  // Col 5 had row 9 occupied -> cells settle to rows 7 and 8
  assert.ok(state.grid[7][5]);
  assert.ok(state.grid[8][5]);
  assert.equal(state.grid[9][5]?.color, 1);
  // Col 6 was empty -> cells settle all the way to rows 8 and 9!
  assert.equal(state.grid[7][6], null);
  assert.ok(state.grid[8][6]);
  assert.ok(state.grid[9][6]);
});

test('overlapping 2x2 squares are counted independently (3x5 block = 8 squares)', () => {
  const state = createInitialBoardState(0);
  // 3 cols (2..4) x 5 rows (5..9) = 2 * 4 = 8 overlapping 2x2 squares
  for (let r = 5; r < 10; r++) {
    for (let c = 2; c <= 4; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  const squares = detectBoardMarks(state.grid);
  assert.equal(squares.length, 8);
});

test('timeline sweep preserves overlapping squares until rightmost column and counts all of them', () => {
  const state = createInitialBoardState(0);
  // 3x2 block at cols 2,3,4 rows 8,9 -> 2 overlapping 2x2 squares
  for (let r = 8; r <= 9; r++) {
    for (let c = 2; c <= 4; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  let hadClears = false;
  for (let col = 0; col < BOARD_COLS; col++) {
    const res = stepTimelineColumn(state, col);
    if (col === 3) {
      // Must NOT erase cols 2..3 prematurely before col 4 is swept!
      assert.equal(res.cellsRemovedNow, 0);
      assert.ok(state.grid[8][4] !== null);
    }
    if (col === 4) {
      assert.equal(res.cellsRemovedNow, 6);
      hadClears = true;
    }
  }
  const event = finalizeSweep(state, hadClears);
  assert.ok(event);
  assert.equal(event.squaresCleared, 2);
  // 2 squares * 40 = 80, plus All-Deleted Bonus (10000) because board is now empty!
  assert.equal(event.allDeletedBonus, true);
  assert.equal(event.pointsAwarded, 80 + 10000);
});

test('scoring formula applies 4x-16x consecutive combo multipliers and resets on < 4 squares', () => {
  assert.equal(calculateSweepScore(1, 3), 40);
  assert.equal(calculateSweepScore(3, 4), 120);
  assert.equal(calculateSweepScore(4, 1), 160 * 4);
  assert.equal(calculateSweepScore(5, 2), 200 * 8);
  assert.equal(calculateSweepScore(5, 3), 200 * 12);
  assert.equal(calculateSweepScore(5, 4), 200 * 16);
  assert.equal(calculateSweepScore(5, 9), 200 * 16); // capped at 16x

  // Full sweep progression test
  const state = createInitialBoardState(0);
  // Place 4 non-overlapping squares + 1 extra block so board doesn't trigger all-deleted
  state.grid[9][0] = makeCell(1);
  // 5-wide x 2-tall of color 0 at cols 2..6 rows 8..9 -> 4 overlapping squares
  for (let r = 8; r <= 9; r++) {
    for (let c = 2; c <= 6; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  let hadClears = false;
  for (let col = 0; col < BOARD_COLS; col++) {
    const r = stepTimelineColumn(state, col);
    if (r.cellsRemovedNow > 0) hadClears = true;
  }
  const ev1 = finalizeSweep(state, hadClears);
  assert.equal(ev1?.squaresCleared, 4);
  assert.equal(state.comboLevel, 1);
  // Single color bonus also triggers because only color 1 remains!
  assert.equal(ev1?.singleColorBonus, true);
  assert.equal(ev1?.pointsAwarded, 160 * 4 + 1000);

  // Sweep with 0 squares breaks combo
  const ev2 = finalizeSweep(state, false);
  assert.equal(ev2, null);
  assert.equal(state.comboLevel, 0);
});

test('Chain Block marks 4-directional connected same-color blocks and excludes them from 2x2 square scoring', () => {
  const state = createInitialBoardState(0);
  // Create a 2x2 of color 0 with one Chain Block at (8,2) plus an L-tail at (8,4), (7,4)
  state.grid[8][2] = makeCell(0, true);
  state.grid[8][3] = makeCell(0);
  state.grid[9][2] = makeCell(0);
  state.grid[9][3] = makeCell(0);
  state.grid[8][4] = makeCell(0);
  state.grid[7][4] = makeCell(0);
  // Diagonal color 0 at (6,5) should NOT be connected
  state.grid[6][5] = makeCell(0);

  const squares = detectBoardMarks(state.grid);
  assert.equal(squares.length, 0); // Chain-marked cells excluded from 2x2 square count
  assert.equal(state.grid[7][4]?.chainMarked, true);
  assert.equal(state.grid[6][5]?.chainMarked, false);
});

test('soft drop awards 1 point per row descended inside the board', () => {
  const state = createInitialBoardState(0);
  state.activePiece = createPieceFromPattern([0, 1, 0, 1]);
  state.activePiece.y = 0;
  softDropStep(state, 0);
  softDropStep(state, 0);
  assert.equal(state.score, 2);
});

test('staging row above top line allows moving horizontally off obstructed spawn and only loses if piece still cannot descend', () => {
  const state = createInitialBoardState(0);
  // Fill spawn columns 7..8 completely so row 0 is obstructed directly below spawn
  for (let r = 0; r < BOARD_ROWS; r++) {
    state.grid[r][7] = makeCell(r % 2 === 0 ? 0 : 1);
    state.grid[r][8] = makeCell(r % 2 === 0 ? 1 : 0);
  }
  state.activePiece = createPieceFromPattern([0, 0, 1, 1]);
  state.activePiece.x = 2;
  state.activePiece.y = 8;

  // Locking at col 2 succeeded -> next piece spawns at y = -2 above obstructed spawn (cols 7..8)
  // without causing instant Game Over.
  lockActivePiece(state, 0);
  assert.equal(state.isGameOver, false);
  assert.ok(state.activePiece);
  assert.equal(state.activePiece.x, 7);
  assert.equal(state.activePiece.y, -2);

  // Player can move Left off the full column into open column 5 and Slam cleanly
  assert.equal(movePieceHorizontal(state, -1), true);
  assert.equal(movePieceHorizontal(state, -1), true);
  assert.equal(state.activePiece.x, 5);
  const dropRes = hardDropPiece(state, 0);
  assert.equal(dropRes.landed, true);
  assert.equal(state.isGameOver, false);

  // If the piece stays above the obstructed column and lock expires (cannot descend), it triggers Game Over
  assert.ok(state.activePiece);
  assert.equal(state.activePiece.x, 7);
  stepPassiveGravity(state, 1.0, 2.0, 0.2, 0); // clears spawnDelay + enters lock delay
  stepPassiveGravity(state, 0.6, 2.0, 0.2, 0); // expires LOCK_DELAY_SEC without descending
  assert.equal(state.isGameOver, true);
  assert.equal(state.activePiece, null);
});

test('puzzle pattern detection recognizes framed archway silhouette', () => {
  const state = createInitialBoardState(0);
  const arch = PUZZLE_LEVELS[0];
  // Build 3x3 arch at cols 5..7, rows 7..9
  // ###
  // #.#
  // #.#
  state.grid[7][5] = makeCell(0);
  state.grid[7][6] = makeCell(0);
  state.grid[7][7] = makeCell(0);
  state.grid[8][5] = makeCell(0);
  state.grid[8][6] = makeCell(1);
  state.grid[8][7] = makeCell(0);
  state.grid[9][5] = makeCell(0);
  state.grid[9][6] = makeCell(1);
  state.grid[9][7] = makeCell(0);
  settleBoard(state.grid);

  assert.equal(checkPuzzlePatternMatch(state.grid, arch), true);
});

test('computeStemLevels dynamically scales percussion, bass, lead, and vocal stems with board state', () => {
  const skin = SKINS[3]; // Dark Zouk
  const nullStems = computeStemLevels(null, skin);
  assert.ok(nullStems.percussion > 0.7);
  assert.ok(nullStems.vocal < 0.2);

  const emptyState = createInitialBoardState(0);
  const baseStems = computeStemLevels(emptyState, skin);
  assert.equal(baseStems.percussion, 0.75);
  assert.equal(baseStems.bass, 0.36);
  assert.equal(baseStems.lead, 0.14);
  assert.equal(baseStems.vocal, 0.06);

  // Add formed 2x2 squares + occupied cells + combo + stage progress
  for (let r = 6; r < 10; r++) {
    for (let c = 0; c < 6; c++) {
      emptyState.grid[r][c] = makeCell(0);
    }
  }
  emptyState.squares = detectBoardMarks(emptyState.grid);
  emptyState.comboLevel = 2;
  emptyState.sweepState.squaresThisSweep = 3;
  emptyState.stageSquaresCleared = skin.squaresToAdvance;

  const peakStems = computeStemLevels(emptyState, skin);
  assert.ok(peakStems.percussion > baseStems.percussion);
  assert.ok(peakStems.bass > baseStems.bass);
  assert.ok(peakStems.lead > 0.9);
  assert.ok(peakStems.vocal > 0.85);
});

test('all 40 worlds define valid music configs covering all requested genres', () => {
  assert.equal(SKINS.length, 40);
  const styleSet = new Set(SKINS.map((s) => s.music.styleId));
  const requiredStyles = [
    'dark_zouk',
    'kizomba',
    'salsa',
    'bachata',
    'reggaeton',
    'trap',
    'country',
    'swing',
    'ambient',
    'jazz_fusion',
    'funk_fusion',
    'heavy_metal',
    'alt_rock',
    'afrobeat_jazz',
    'neo_soul',
    'cumbia_dub',
    'flamenco_house',
    'city_pop',
    'ethio_jazz',
    'dub_techno',
    'tango_nuevo',
    'uk_garage',
    'post_rock',
    'shamisen_chill',
    'cubist_chamber',
    'industrial_synth',
    'miami_boogie',
    'andean_cumbia',
    'cat_step_jazz',
    'cathedral_organ',
    'constructivist_march',
    'botanical_waltz',
    'memphis_electro',
  ] as const;

  for (const style of requiredStyles) {
    assert.ok(styleSet.has(style), `Missing requested music style: ${style}`);
  }

  for (const sk of SKINS) {
    assert.ok(sk.bpm >= 70 && sk.bpm <= 185, `BPM out of range for ${sk.id}`);
    assert.ok(sk.music.genreLabel.trim().length > 0);
    assert.ok(sk.music.scale.length >= 5);
    assert.ok(sk.music.chords.length >= 4);
    assert.equal(sk.music.bassPattern.length, 16);
    assert.equal(sk.music.arpPattern.length, 16);
    assert.ok(sk.music.swingRatio >= 0 && sk.music.swingRatio <= 0.4);
    assert.ok(sk.music.distortion >= 0 && sk.music.distortion <= 1);
    assert.ok(sk.music.subBassGain >= 0 && sk.music.subBassGain <= 1);
  }
});

test('Passive drop enters lock delay before locking and resumes falling when slid off a ledge', () => {
  const state = createInitialBoardState(0);
  // Build a 2-row ledge at cols 4..5 rows 8..9; cols 6..7 remain empty
  state.grid[8][4] = makeCell(1);
  state.grid[9][4] = makeCell(1);
  state.grid[8][5] = makeCell(1);
  state.grid[9][5] = makeCell(1);

  state.activePiece = createPieceFromPattern([0, 0, 0, 0]);
  state.activePiece.x = 4;
  state.activePiece.y = 6; // Resting directly on top of rows 8..9
  state.spawnTimer = 1; // Past spawn delay

  assert.equal(isActivePieceGrounded(state), true);

  // Passive gravity for 0.2s (< LOCK_DELAY_SEC) should NOT lock yet
  const firstTick = stepPassiveGravity(state, 0.2, 1.5, 0.3, 0);
  assert.equal(firstTick.landed, false);
  assert.ok(state.activePiece !== null);
  assert.ok(state.lockTimer > 0 && state.lockTimer < LOCK_DELAY_SEC);

  // Slide piece right off the ledge (to cols 5..6): col 6 is open, wait — col 5 still supports!
  // Slide one more to cols 6..7: completely over open floor -> no longer grounded and lockTimer resets!
  assert.equal(movePieceHorizontal(state, 1), true);
  assert.equal(isActivePieceGrounded(state), true);
  assert.equal(state.lockTimer, 0); // Lock delay reset by move

  assert.equal(movePieceHorizontal(state, 1), true);
  assert.equal(isActivePieceGrounded(state), false);
  assert.equal(state.lockTimer, 0);

  // Now passive gravity resumes dropping down into rows 7..8!
  stepPassiveGravity(state, 1.0, 2.0, 0.3, 0);
  assert.equal(state.activePiece?.y, 8);
  assert.equal(isActivePieceGrounded(state), true);

  // Waiting past LOCK_DELAY_SEC locks the piece
  const lockTick = stepPassiveGravity(state, LOCK_DELAY_SEC + 0.05, 2.0, 0.3, 0);
  assert.equal(lockTick.landed, true);
  assert.ok(state.grid[9][6] !== null);
  assert.ok(state.grid[9][7] !== null);
});

test('getPieceLandingColumns predicts per-column split landing heights and hardDropPiece splits cleanly', () => {
  const state = createInitialBoardState(0);
  // Column 3 occupied up to row 4 (rows 4..9 full); Column 4 completely empty
  for (let r = 4; r < BOARD_ROWS; r++) {
    state.grid[r][3] = makeCell(1);
  }
  state.activePiece = createPieceFromPattern([0, 0, 0, 0]);
  state.activePiece.x = 3;
  state.activePiece.y = -2;

  const landing = getPieceLandingColumns(state, state.activePiece);
  assert.equal(landing.leftBottomRow, 3);
  assert.equal(landing.rightBottomRow, 9);
  assert.equal(landing.isSplit, true);
  assert.equal(landing.rigidDy, 4); // Rigid piece stops at y = 2 (rows 2..3)

  const res = hardDropPiece(state, 0);
  assert.equal(res.landed, true);
  assert.equal(res.rowsDropped, 4);
  // Left half sits at rows 2..3, right half splits and falls to rows 8..9!
  assert.equal(state.grid[2][3]?.color, 0);
  assert.equal(state.grid[3][3]?.color, 0);
  assert.equal(state.grid[2][4], null);
  assert.equal(state.grid[8][4]?.color, 0);
  assert.equal(state.grid[9][4]?.color, 0);
  assert.ok((state.grid[9][4]?.fallOffset ?? 0) >= 5);
});

test('All 40 soundtrack worlds (1-40) configure root-relative MP3 paths in music/ with no public/music folder and .nojekyll present', () => {
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'public/music')), false);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), '.nojekyll')), true);
  assert.equal(
    fs.existsSync(path.resolve(process.cwd(), 'music/wolrd30.mp3')),
    false,
    'Typo music/wolrd30.mp3 should remain renamed to music/world30.mp3'
  );
  for (let i = 0; i < 40; i++) {
    const expectedUrl = `music/world${i + 1}.mp3`;
    assert.equal(SKINS[i].music.audioTrackUrl, expectedUrl);
    const filePath = path.resolve(process.cwd(), expectedUrl);
    assert.equal(fs.existsSync(filePath), true, `Missing MP3 asset at ${filePath}`);
    assert.ok(fs.statSync(filePath).size > 0, `Empty MP3 asset at ${filePath}`);
  }
});

test('stepPassiveGravity begins descending into row -1 immediately once spawnDelay completes', () => {
  const state = createInitialBoardState(0);
  state.activePiece = createPieceFromPattern([0, 1, 0, 1]);
  assert.equal(state.activePiece.y, -2);

  // Before spawnDelay expires, piece hovers at y = -2
  const hover = stepPassiveGravity(state, 0.25, 1.15, 0.42, 0);
  assert.equal(hover.moved, false);
  assert.equal(state.activePiece.y, -2);

  // Crossing spawnDelay triggers immediate descent to y = -1 without extra dead delay
  const enter = stepPassiveGravity(state, 0.2, 1.15, 0.42, 0);
  assert.equal(enter.moved, true);
  assert.equal(state.activePiece.y, -1);
});

test('finalizeSweep preserves total cellsRemoved cleared mid-sweep and retains peak maxCombo after combo resets', () => {
  const state = createInitialBoardState(0);
  // Build 4 squares across cols 2..6 (5-wide x 2-tall) plus 1 anchor block at col 0
  state.grid[9][0] = makeCell(1);
  for (let r = 8; r <= 9; r++) {
    for (let c = 2; c <= 6; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  let hadClears = false;
  for (let col = 0; col < BOARD_COLS; col++) {
    const r = stepTimelineColumn(state, col);
    if (r.cellsRemovedNow > 0) hadClears = true;
  }
  const ev1 = finalizeSweep(state, hadClears);
  assert.ok(ev1);
  assert.equal(ev1.squaresCleared, 4);
  assert.equal(ev1.cellsRemoved, 10);
  assert.equal(state.comboLevel, 1);
  assert.equal(state.maxCombo, 1);

  // Subsequent empty sweep breaks comboLevel back to 0, but maxCombo stays 1
  finalizeSweep(state, false);
  assert.equal(state.comboLevel, 0);
  assert.equal(state.maxCombo, 1);
});

test('generateDailyChallenge is deterministic per YYYY-MM-DD and varies across dates', () => {
  const dayA1 = generateDailyChallenge('2026-11-16');
  const dayA2 = generateDailyChallenge('2026-11-16');
  const dayB = generateDailyChallenge('2026-11-17');

  assert.equal(dayA1.dateKey, '2026-11-16');
  assert.equal(dayA1.skinIndex, dayA2.skinIndex);
  assert.deepEqual(dayA1.mission, dayA2.mission);
  assert.deepEqual(dayA1.previewRows, dayA2.previewRows);

  // Seeded piece sequence matches identically for the same date
  const b1 = createInitialBoardState(0.05, createSeededRng(dayA1.seedKey));
  const b2 = createInitialBoardState(0.05, createSeededRng(dayA2.seedKey));
  assert.deepEqual(b1.activePiece, b2.activePiece);
  assert.deepEqual(b1.nextQueue, b2.nextQueue);

  // Adjacent calendar date generates a distinct layout/challenge
  const sameLayout =
    JSON.stringify(dayA1.previewRows) === JSON.stringify(dayB.previewRows) &&
    dayA1.skinIndex === dayB.skinIndex &&
    dayA1.mission.title === dayB.mission.title;
  assert.equal(sameLayout, false);
});

test('Daily generated starting layouts contain zero accidental 2x2 squares, are settled, and leave spawn clear', () => {
  const missionTypes = [
    'sweep_squares',
    'total_squares',
    'combo_level',
    'chain_cells',
    'all_clear',
    'single_color',
  ] as const;

  for (const [idx, mType] of missionTypes.entries()) {
    const grid = buildDailyStartingGrid(`2026-11-${10 + idx}`, mType);
    assert.equal(grid.length, BOARD_ROWS);
    assert.equal(grid[0].length, BOARD_COLS);

    // No accidental 2x2 squares at start
    assert.equal(detectBoardMarks(grid).length, 0);

    // Center spawn columns rows 0..3 remain completely open
    for (let r = 0; r <= 3; r++) {
      assert.equal(grid[r][7], null);
      assert.equal(grid[r][8], null);
    }

    // No floating cells above empty spaces
    for (let c = 0; c < BOARD_COLS; c++) {
      let seenBlock = false;
      for (let r = 0; r < BOARD_ROWS; r++) {
        if (grid[r][c] !== null) {
          seenBlock = true;
        } else {
          assert.equal(seenBlock, false, `Floating gap in col ${c} row ${r}`);
        }
      }
    }
  }
});

test('Daily completion enforces once-per-24h completion, tracks consecutive streaks, and handles resets', () => {
  const baseProgress: SavedProgress = {
    highScores: {},
    unlockedSkins: [SKINS[0].id],
    skinEditPlaylist: [SKINS[0].id],
    muted: false,
    hapticsEnabled: true,
    dailyHistory: {},
    dailyStreak: 0,
    lastDailyCompletedDate: null,
    enabledShifts: [...ALL_SHIFT_TYPES],
  };

  assert.equal(getDailyDateKey(new Date(2026, 10, 16, 10, 5)), '2026-11-16');
  assert.equal(getPreviousDateKey('2026-11-16'), '2026-11-15');
  assert.equal(formatCountdownHMS(3661 * 1000), '01:01:01');
  assert.equal(isDailyCompletedForDate(baseProgress, '2026-11-15'), false);

  // Failed attempt records attempt count & high score but keeps daily incomplete
  const afterFail = applyDailyResultToProgress(baseProgress, {
    dateKey: '2026-11-15',
    missionTitle: 'Horizon Cascade',
    score: 1200,
    timeElapsedSec: 45,
    completed: false,
    unlockSkinId: SKINS[4].id,
  });
  assert.equal(isDailyCompletedForDate(afterFail, '2026-11-15'), false);
  assert.equal(afterFail.dailyStreak, 0);
  assert.equal(afterFail.dailyHistory['2026-11-15'].attempts, 1);
  assert.equal(afterFail.unlockedSkins.includes(SKINS[4].id), false);

  // Completing yesterday sets streak = 1 and unlocks world skin
  const afterDay1 = applyDailyResultToProgress(afterFail, {
    dateKey: '2026-11-15',
    missionTitle: 'Horizon Cascade',
    score: 4800,
    timeElapsedSec: 38,
    completed: true,
    unlockSkinId: SKINS[4].id,
  });
  assert.equal(isDailyCompletedForDate(afterDay1, '2026-11-15'), true);
  assert.equal(afterDay1.dailyStreak, 1);
  assert.equal(afterDay1.unlockedSkins.includes(SKINS[4].id), true);
  assert.equal(getEffectiveDailyStreak(afterDay1, '2026-11-16'), 1);

  // Completing today increments consecutive streak to 2
  const afterDay2 = applyDailyResultToProgress(afterDay1, {
    dateKey: '2026-11-16',
    missionTitle: 'Blank Courtyard',
    score: 6400,
    timeElapsedSec: 29,
    completed: true,
    unlockSkinId: SKINS[5].id,
  });
  assert.equal(isDailyCompletedForDate(afterDay2, '2026-11-16'), true);
  assert.equal(afterDay2.dailyStreak, 2);
  assert.equal(getEffectiveDailyStreak(afterDay2, '2026-11-16'), 2);

  // Re-recording completion for the same date does NOT inflate streak
  const dupDay2 = applyDailyResultToProgress(afterDay2, {
    dateKey: '2026-11-16',
    missionTitle: 'Blank Courtyard',
    score: 9999,
    timeElapsedSec: 15,
    completed: true,
  });
  assert.equal(dupDay2.dailyStreak, 2);

  // Skipping a day resets effective streak on 2026-11-18 and restarts at 1 if cleared then
  assert.equal(getEffectiveDailyStreak(afterDay2, '2026-11-18'), 0);
  const afterGap = applyDailyResultToProgress(afterDay2, {
    dateKey: '2026-11-18',
    missionTitle: 'Pure Palette',
    score: 3000,
    timeElapsedSec: 40,
    completed: true,
  });
  assert.equal(afterGap.dailyStreak, 1);
});

test('INITIAL_UNLOCKED_SKIN_IDS unlocks all 40 worlds including all 40 studio MP3 worlds', () => {
  assert.equal(INITIAL_UNLOCKED_SKIN_IDS.length, 40);
  for (let i = 0; i < 40; i++) {
    assert.equal(
      INITIAL_UNLOCKED_SKIN_IDS.includes(SKINS[i].id),
      true,
      `Expected World ${i + 1} (${SKINS[i].id}) to be unlocked initially`
    );
  }
});

test('getTrackTrimGain normalizes loudness across all 40 MP3 tracks and getSpectrumSnapshot is safe in Node', () => {
  for (let i = 0; i < 40; i++) {
    const url = SKINS[i].music.audioTrackUrl;
    const gain = getTrackTrimGain(url);
    assert.ok(gain >= 0.5 && gain <= 3.0, `Unexpected trim gain ${gain} for ${url}`);
  }
  // Quiet world3 track receives strong positive trim vs hot world9 / world14 tracks
  assert.ok(getTrackTrimGain('music/world3.mp3') > 2.0);
  assert.ok(getTrackTrimGain('/music/world3.mp3') > 2.0);
  assert.ok(getTrackTrimGain('music/world8.mp3') < 1.0);
  assert.ok(getTrackTrimGain('music/world9.mp3') < 1.0);
  assert.ok(getTrackTrimGain('music/world14.mp3') < 0.8);
  assert.equal(getTrackTrimGain(undefined), 1);

  const engine = new IluminadoAudioEngine();
  const snap = engine.getSpectrumSnapshot();
  assert.equal(snap.hasLiveAudio, false);
  assert.equal(snap.subBass, 0);
  assert.equal(snap.mid, 0);
  assert.equal(snap.high, 0);
  assert.equal(snap.bands.length, 10);
});

test('Portrait 10x14 mode initializes centered spawn and clears 2x2 squares across 10 columns', () => {
  const state = createInitialBoardState(0, Math.random, 'portrait');
  assert.equal(state.orientation, 'portrait');
  assert.equal(state.cols, PORTRAIT_COLS);
  assert.equal(state.rows, PORTRAIT_ROWS);
  assert.equal(state.grid.length, 14);
  assert.equal(state.grid[0].length, 10);
  assert.equal(state.activePiece?.x, 4);

  // Build 2x2 square at cols 2..3 rows 12..13 + 1 anchor so board stays non-empty
  state.grid[13][0] = makeCell(1);
  state.grid[12][2] = makeCell(0);
  state.grid[12][3] = makeCell(0);
  state.grid[13][2] = makeCell(0);
  state.grid[13][3] = makeCell(0);

  let hadClears = false;
  for (let col = 0; col < PORTRAIT_COLS; col++) {
    const res = stepTimelineColumn(state, col);
    if (res.cellsRemovedNow > 0) hadClears = true;
  }
  const ev = finalizeSweep(state, hadClears);
  assert.ok(ev);
  assert.equal(ev.squaresCleared, 1);
  assert.equal(ev.cellsRemoved, 4);
  assert.equal(state.grid[12][2], null);
  assert.equal(state.grid[13][3], null);
});

test('transformBoardForOrientation preserves central bricks and prevents instant loss across Portrait <-> Landscape flips', () => {
  // 1. Start in Portrait 10x14 with a towering 12-row center stack and formed central 2x2 square
  const state = createInitialBoardState(0, Math.random, 'portrait');
  for (let r = 2; r < PORTRAIT_ROWS; r++) {
    state.grid[r][4] = makeCell(r % 2 === 0 ? 0 : 1);
    state.grid[r][5] = makeCell(r % 2 === 0 ? 1 : 0);
  }
  // Place an intact central 2x2 square at bottom center (cols 2..3, rows 12..13)
  state.grid[12][2] = makeCell(0);
  state.grid[12][3] = makeCell(0);
  state.grid[13][2] = makeCell(0);
  state.grid[13][3] = makeCell(0);
  state.squares = detectBoardMarks(state.grid);
  assert.equal(state.squares.length >= 1, true);

  if (state.activePiece) {
    state.activePiece.x = 4;
    state.activePiece.y = 1;
  }

  const totalCellsBefore = state.grid.flat().filter(Boolean).length;

  // Flip Portrait (10x14) -> Landscape (16x10): tall stack MUST NOT trigger instant loss!
  const toLand = transformBoardForOrientation(state, 'landscape', true);
  assert.equal(toLand.transformed, true);
  assert.equal(state.orientation, 'landscape');
  assert.equal(state.cols, 16);
  assert.equal(state.rows, 10);
  assert.equal(state.isGameOver, false);
  assert.ok(state.orientationGraceTimer > 0.8);

  // Spawn center columns (7..8) top rows 0..3 must be completely open so player has room!
  for (let r = 0; r <= 3; r++) {
    assert.equal(state.grid[r][7], null);
    assert.equal(state.grid[r][8], null);
  }

  // Central formed 2x2 square moved cleanly into landscape cols 5..6 rows 8..9!
  assert.equal(state.grid[8][5]?.color, 0);
  assert.equal(state.grid[8][6]?.color, 0);
  assert.equal(state.grid[9][5]?.color, 0);
  assert.equal(state.grid[9][6]?.color, 0);
  assert.ok((state.grid[9][5]?.animOffsetY ?? 0) > 1);

  // Overflowing upper cells peeled outward onto left/right wing columns!
  const wingCells = [0, 1, 2, 13, 14, 15].reduce((sum, c) => {
    let cnt = 0;
    for (let r = 0; r < 10; r++) if (state.grid[r][c]) cnt++;
    return sum + cnt;
  }, 0);
  assert.ok(wingCells > 0);
  const totalCellsAfterLand = state.grid.flat().filter(Boolean).length;
  assert.equal(totalCellsAfterLand, totalCellsBefore);

  // Active piece was lifted up cleanly and passive gravity pauses during grace window
  assert.ok((state.activePiece?.y ?? 99) <= 0);
  const prevY = state.activePiece!.y;
  const graceTick = stepPassiveGravity(state, 0.4, 3.0, 0.1, 0);
  assert.equal(graceTick.moved, false);
  assert.equal(graceTick.landed, false);
  assert.equal(state.activePiece?.y, prevY);

  // 2. Flip back Landscape (16x10) -> Portrait (10x14): wing bricks fold up & inward cleanly
  const toPort = transformBoardForOrientation(state, 'portrait', true);
  assert.equal(toPort.transformed, true);
  assert.equal(state.orientation, 'portrait');
  assert.equal(state.cols, 10);
  assert.equal(state.rows, 14);
  assert.equal(state.isGameOver, false);
  for (let r = 0; r <= 3; r++) {
    assert.equal(state.grid[r][4], null);
    assert.equal(state.grid[r][5], null);
  }
  assert.equal(state.grid[12][2]?.color, 0);
  assert.equal(state.grid[12][3]?.color, 0);
  assert.equal(state.grid[13][2]?.color, 0);
  assert.equal(state.grid[13][3]?.color, 0);
});

test('Classic skin progression levels up per skin threshold, discards massive sweep overflow, and transitions every 3 levels', () => {
  for (const sk of SKINS) {
    assert.ok(sk.squaresPerLevel >= 16 && sk.squaresPerLevel <= 22, `${sk.id} squaresPerLevel out of 16..22`);
    assert.equal(sk.levelsPerSkin, 3, `${sk.id} levelsPerSkin must be 3`);
    assert.equal(sk.squaresToAdvance, sk.squaresPerLevel * 3, `${sk.id} squaresToAdvance must equal squaresPerLevel * 3`);
    assert.ok(sk.squaresToAdvance >= 48 && sk.squaresToAdvance <= 66, `${sk.id} quota out of range`);
  }

  const skin = SKINS[0]; // 16 squares/level, 3 levels/skin
  const prog: StageProgressionState = {
    level: 1,
    levelSquaresCleared: 10,
    skinLevelsCleared: 0,
    stageTimeSec: 0,
  };

  // Massive sweep clears 32 squares (cumulative 42 >= 16): must increase level by ONLY 1 and discard all excess!
  const step1 = advanceSweepStageProgression(prog, 32, skin, true);
  assert.equal(step1.leveledUp, true);
  assert.equal(step1.shouldTransitionSkin, false);
  assert.equal(prog.level, 2);
  assert.equal(prog.levelSquaresCleared, 0);
  assert.equal(prog.skinLevelsCleared, 1);

  // Subsequent sweeps advance level 2 -> 3 -> 4, transitioning skin cleanly on the 3rd level-up!
  assert.equal(advanceSweepStageProgression(prog, 16, skin, true).shouldTransitionSkin, false);
  assert.equal(prog.level, 3);
  const step3 = advanceSweepStageProgression(prog, 16, skin, true);
  assert.equal(step3.leveledUp, true);
  assert.equal(step3.shouldTransitionSkin, true);
  assert.equal(prog.level, 4);
  assert.equal(prog.skinLevelsCleared, 3);
});

test('Final stage transitions based on a flat timer instead of square count', () => {
  const finalSkin = SKINS[SKINS.length - 1];
  assert.equal(finalSkin.finalStageTimerSec, 60);

  const prog: StageProgressionState = {
    level: 50,
    levelSquaresCleared: 0,
    skinLevelsCleared: 0,
    stageTimeSec: 0,
  };

  // Even clearing enough squares for 4+ level-ups does NOT transition final timed stage early
  for (let i = 0; i < 6; i++) {
    const res = advanceSweepStageProgression(prog, finalSkin.squaresPerLevel, finalSkin, true);
    assert.equal(res.leveledUp, true);
    assert.equal(res.shouldTransitionSkin, false);
  }

  // Flat timer advances smoothly and triggers transition only once >= 60s elapsed
  assert.equal(advanceTimedStageProgression(prog, 45, finalSkin, true), false);
  assert.deepEqual(computeStageProgressMetrics(prog, finalSkin), { stageSquares: 45, stageGoal: 60 });
  assert.equal(advanceTimedStageProgression(prog, 15, finalSkin, true), true);
  assert.deepEqual(computeStageProgressMetrics(prog, finalSkin), { stageSquares: 60, stageGoal: 60 });
});

test('rotateBoard90 swaps landscape <-> portrait dimensions, drops all bricks to the new bottom, and preserves cell count', () => {
  const state = createInitialBoardState(0, Math.random, 'landscape');
  assert.equal(state.cols, 16);
  assert.equal(state.rows, 10);

  // Place a 4-tall tower in column 0 (rows 6..9) and a 2-high block at col 14 (rows 8..9)
  // Color pattern chosen so after 90° CW rotation + gravity drop, bricks fall cleanly to the new bottom (row 15)
  state.grid[6][0] = makeCell(0);
  state.grid[7][0] = makeCell(0);
  state.grid[8][0] = makeCell(1);
  state.grid[9][0] = makeCell(1);
  state.grid[8][14] = makeCell(0);
  state.grid[9][14] = makeCell(1);

  const cellsBefore = state.grid.flat().filter(Boolean).length;
  assert.equal(cellsBefore, 6);

  // Rotate 90° CW: 16x10 landscape -> 10x16 portrait
  // Old col 0 (rows 6..9) rotates to row 0 (cols 0..3) at the TOP of the new 10x16 board,
  // then settles all the way down to row 15 (the new bottom)!
  const cwRes = rotateBoard90(state, 'cw', true);
  assert.equal(cwRes.rotated, true);
  assert.equal(state.cols, 10);
  assert.equal(state.rows, 16);
  assert.equal(state.orientation, 'portrait');
  assert.equal(state.grid.length, 16);
  assert.equal(state.grid[0].length, 10);
  assert.equal(state.grid.flat().filter(Boolean).length, cellsBefore);
  assert.ok(state.orientationGraceTimer > 0.8);
  assert.equal(state.activePiece?.y, -2);
  assert.equal(state.activePiece?.x, 4);

  // Old col 14 cells rotate to row 14 (below old col 0 cells at row 0), so they settle to row 15 in cols 0..1,
  // while old col 0 cells stack on top of them at row 14 (cols 0..1) or drop all the way to row 15 (cols 2..3)!
  assert.equal(state.grid[15][0]?.color, 1); // from (9, 14) -> (14, 0) -> falls 1 to (15, 0)
  assert.equal(state.grid[15][1]?.color, 0); // from (8, 14) -> (14, 1) -> falls 1 to (15, 1)
  assert.equal(state.grid[15][2]?.color, 0); // from (7, 0) -> (0, 2) -> falls 15 to (15, 2)
  assert.equal(state.grid[15][3]?.color, 0); // from (6, 0) -> (0, 3) -> falls 15 to (15, 3)
  assert.equal(state.grid[15][1]?.fallOffset, 1);
  assert.equal(state.grid[15][2]?.fallOffset, 15);
  assert.equal(state.grid[14][0]?.color, 1); // from (9, 0) -> (0, 0) -> falls 14 to (14, 0)
  assert.equal(state.grid[14][1]?.color, 1); // from (8, 0) -> (0, 1) -> falls 14 to (14, 1)
  assert.equal(state.grid[14][1]?.fallOffset, 14);

  // Verify no floating cells exist anywhere in the rotated board
  for (let c = 0; c < state.cols; c++) {
    let seen = false;
    for (let r = 0; r < state.rows; r++) {
      if (state.grid[r][c] !== null) seen = true;
      else assert.equal(seen, false, `Floating gap in rotated col ${c} row ${r}`);
    }
  }

  // Rotate 90° CCW back: 10x16 portrait -> 16x10 landscape, bricks fall to new bottom (row 9)
  const ccwRes = rotateBoard90(state, 'ccw', true);
  assert.equal(ccwRes.rotated, true);
  assert.equal(state.cols, 16);
  assert.equal(state.rows, 10);
  assert.equal(state.orientation, 'landscape');
  assert.equal(state.grid.flat().filter(Boolean).length, cellsBefore);
  for (let c = 0; c < state.cols; c++) {
    let seen = false;
    for (let r = 0; r < state.rows; r++) {
      if (state.grid[r][c] !== null) seen = true;
      else assert.equal(seen, false, `Floating gap after CCW col ${c} row ${r}`);
    }
  }
});

test('All 40 skins avoid pure black/white, preserve readable sky luminance, and configure valid stroke/fill variants & crisp block contrast', () => {
  const rgbDist = (h1: string, h2: string): number => {
    const p = (h: string) => {
      const c = h.replace('#', '');
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = p(h1);
    const [r2, g2, b2] = p(h2);
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  };

  for (const sk of SKINS) {
    const pal = sk.palette;
    const hexColors = [
      pal.skyTop,
      pal.skyMid,
      pal.skyBottom,
      pal.horizonMist,
      pal.architectureLight,
      pal.architectureMid,
      pal.architectureShadow,
      pal.waterSurface,
      pal.boardFrame,
      pal.timelineBeam,
      pal.hudInk,
      pal.hudMuted,
      pal.hudAccent,
      pal.squareHighlight,
      pal.blockA.fill,
      pal.blockA.fillGradientEnd,
      pal.blockA.shade,
      pal.blockA.highlight,
      pal.blockA.border,
      pal.blockA.emblemColor,
      pal.blockB.fill,
      pal.blockB.fillGradientEnd,
      pal.blockB.shade,
      pal.blockB.highlight,
      pal.blockB.border,
      pal.blockB.emblemColor,
    ];
    for (const hex of hexColors) {
      assert.equal(
        isPureBlackOrWhite(hex),
        false,
        `Skin ${sk.id} contains pure black or pure white color: ${hex}`
      );
    }
    const skyLum = getHexLuminance(pal.skyMid);
    assert.ok(
      skyLum >= 0.22,
      `Skin ${sk.id} skyMid (${pal.skyMid}) too dark: luminance ${skyLum.toFixed(3)}`
    );
    assert.ok(pal.blockA.fillVariant);
    assert.ok(pal.blockA.strokeVariant);
    assert.ok(pal.blockB.fillVariant);
    assert.ok(pal.blockB.strokeVariant);

    // Ensure strong visual separation between blockA, blockB, blockC, and boardSurface
    assert.ok(
      rgbDist(pal.blockA.fill, pal.blockB.fill) >= 85,
      `Skin ${sk.id} blockA/blockB too close (${pal.blockA.fill} vs ${pal.blockB.fill})`
    );
    assert.ok(
      rgbDist(pal.blockA.fill, pal.blockC.fill) >= 75,
      `Skin ${sk.id} blockA/blockC too close (${pal.blockA.fill} vs ${pal.blockC.fill})`
    );
    assert.ok(
      rgbDist(pal.blockB.fill, pal.blockC.fill) >= 75,
      `Skin ${sk.id} blockB/blockC too close (${pal.blockB.fill} vs ${pal.blockC.fill})`
    );
  }

  // Monochrome World 11 (limbo-mist) maintains crisp luminance contrast between board, blockA, and blockB
  const limbo = SKINS.find((s) => s.id === 'limbo-mist')!;
  const m = limbo.palette.boardSurface.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)!;
  const boardLum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
  const aLum = getHexLuminance(limbo.palette.blockA.fill);
  const bLum = getHexLuminance(limbo.palette.blockB.fill);
  assert.ok(aLum - boardLum >= 0.25, `Expected limbo-mist blockA (${aLum.toFixed(2)}) clearly brighter than board (${boardLum.toFixed(2)})`);
  assert.ok(boardLum - bLum >= 0.35, `Expected limbo-mist blockB (${bLum.toFixed(2)}) clearly darker than board (${boardLum.toFixed(2)})`);
});

test('pickRandomSkinIndex and shuffled skin deck avoid back-to-back repeats and cover all 40 worlds', () => {
  for (let i = 0; i < 40; i++) {
    const picked = pickRandomSkinIndex(undefined, i);
    assert.notEqual(picked, i);
    assert.ok(picked >= 0 && picked < SKINS.length);
  }

  const deck = createShuffledSkinDeck(SKINS.length, 0);
  assert.equal(deck.length, 40);
  assert.notEqual(deck[0], 0);
  assert.equal(new Set(deck).size, 40);

  // Advancing through basic visits all 40 stages then marks completed
  let curDeck = deck;
  let pos = 0;
  for (let step = 1; step < 40; step++) {
    const adv = advanceShuffledSkinDeck(curDeck, pos, false);
    assert.equal(adv.completed, false);
    curDeck = adv.nextDeck;
    pos = adv.nextPos;
  }
  const finishBasic = advanceShuffledSkinDeck(curDeck, pos, false);
  assert.equal(finishBasic.completed, true);

  // Advancing endlessly reshuffles cleanly without immediate repeat of the previous stage
  const lastBeforeWrap = curDeck[pos];
  const wrapEndless = advanceShuffledSkinDeck(curDeck, pos, true);
  assert.equal(wrapEndless.completed, false);
  assert.equal(wrapEndless.nextPos, 0);
  assert.notEqual(wrapEndless.nextIdx, lastBeforeWrap);
});

test('rotateActivePiece applies 1-column horizontal and upward ledge kicks when obstructed', () => {
  const state = createInitialBoardState(0);
  state.activePiece = createPieceFromPattern([0, 1, 0, 0]);
  state.lockedColumnsLeft = 1;
  state.activePiece.x = 0; // overlaps locked left column -> kicks +1 right
  state.activePiece.y = 4;
  assert.equal(rotateActivePiece(state, 'cw'), true);
  assert.equal(state.activePiece.x, 1);

  // If horizontal kicks are also blocked at row 7, kicks up 1 row to y = 5
  state.lockedColumnsLeft = 0;
  state.activePiece.x = 5;
  state.activePiece.y = 6;
  state.grid[7][4] = makeCell(1);
  state.grid[7][5] = makeCell(1);
  state.grid[7][7] = makeCell(1);
  assert.equal(rotateActivePiece(state, 'cw'), true);
  assert.equal(state.activePiece.y, 5);
});

test('Zen Flow trims top overflow rows instead of triggering Game Over', () => {
  const state = createInitialBoardState(0);
  state.score = 1200;
  // Fill spawn columns 7..8 completely to row 0
  for (let r = 0; r < BOARD_ROWS; r++) {
    state.grid[r][7] = makeCell(r % 2 === 0 ? 0 : 1);
    state.grid[r][8] = makeCell(r % 2 === 0 ? 1 : 0);
  }
  state.activePiece = createPieceFromPattern([0, 1, 1, 0]);
  state.activePiece.x = 7;
  state.activePiece.y = -2;

  const res = lockActivePiece(state, 0, Math.random, { zenNoLoss: true });
  assert.equal(res.landed, true);
  assert.equal(res.zenTrimmed, true);
  assert.equal(state.isGameOver, false);
  assert.ok(state.activePiece !== null);
  assert.equal(state.score, 1200);
  // Spawn columns now have top headroom (rows 0..2 cleared)
  assert.equal(state.grid[0][7], null);
  assert.equal(state.grid[1][7], null);
  assert.equal(state.grid[2][7], null);
});

test('VS battle counter-play cancels incoming garbage before queueing pressure and flushes on sweep', () => {
  const p1 = createInitialBoardState(0);
  const p2 = createInitialBoardState(0);
  p1.pendingGarbage = 5;

  // P1 sends 4 squares while holding 5 incoming -> cancels 4, leaves 1 on P1, sends 0 to P2
  const swap1 = resolveBattleGarbageSwap(p1, p2, 4);
  assert.deepEqual(swap1, { countered: 4, netSent: 0 });
  assert.equal(p1.pendingGarbage, 1);
  assert.equal(p2.pendingGarbage, 0);

  // P1 sends 6 more -> cancels remaining 1 on P1 and queues 5 onto P2
  const swap2 = resolveBattleGarbageSwap(p1, p2, 6);
  assert.deepEqual(swap2, { countered: 1, netSent: 5 });
  assert.equal(p1.pendingGarbage, 0);
  assert.equal(p2.pendingGarbage, 5);

  // Flushing P2 deposits 5 garbage cells onto P2 and clears P2 pendingGarbage
  const flushed = flushPendingGarbage(p2, () => 0.35);
  assert.equal(flushed, 5);
  assert.equal(p2.pendingGarbage, 0);
  assert.equal(p2.grid.flat().filter(Boolean).length, 5);
});

test('finalizeSweep tracks biggestSweep, chainClearsTotal, singleColorCount, and allClearCount', () => {
  const state = createInitialBoardState(0);
  // Create 2 squares at bottom rows 8..9 cols 2..4 -> clearing empties board (allDeletedBonus)
  for (let r = 8; r <= 9; r++) {
    for (let c = 2; c <= 4; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  let hadClears = false;
  for (let col = 0; col < BOARD_COLS; col++) {
    if (stepTimelineColumn(state, col).cellsRemovedNow > 0) hadClears = true;
  }
  finalizeSweep(state, hadClears);
  assert.equal(state.biggestSweep, 2);
  assert.equal(state.allClearCount, 1);
  assert.equal(state.singleColorCount, 0);

  // Now create 4 squares + 1 anchor of color 1 -> singleColorBonus + biggestSweep=4
  state.grid[9][0] = makeCell(1);
  for (let r = 8; r <= 9; r++) {
    for (let c = 2; c <= 6; c++) {
      state.grid[r][c] = makeCell(0);
    }
  }
  hadClears = false;
  for (let col = 0; col < BOARD_COLS; col++) {
    if (stepTimelineColumn(state, col).cellsRemovedNow > 0) hadClears = true;
  }
  finalizeSweep(state, hadClears);
  assert.equal(state.biggestSweep, 4);
  assert.equal(state.singleColorCount, 1);
});

test('computeEncoreState activates BPM escalation and aurora intensity only on final stage', () => {
  assert.deepEqual(computeEncoreState(false, 5), { encoreBonusBpm: 0, encoreIntensity: 0 });
  assert.deepEqual(computeEncoreState(true, 0), { encoreBonusBpm: 0, encoreIntensity: 0 });
  assert.deepEqual(computeEncoreState(true, 2), { encoreBonusBpm: 8, encoreIntensity: 0.5 });
  assert.deepEqual(computeEncoreState(true, 8), { encoreBonusBpm: 20, encoreIntensity: 1 });
});

test('Time Attack PB splits persist on new bests and compute live interpolated pace deltas', () => {
  const baseProgress: SavedProgress = {
    highScores: {},
    unlockedSkins: [SKINS[0].id],
    skinEditPlaylist: [SKINS[0].id],
    muted: false,
    hapticsEnabled: true,
    dailyHistory: {},
    dailyStreak: 0,
    lastDailyCompletedDate: null,
    timeAttackSplits: {},
    enabledShifts: [...ALL_SHIFT_TYPES],
  };

  const afterFirst = applyTimeAttackSplitsToProgress(baseProgress, 60, 2400, [
    200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400,
  ]);
  assert.equal(afterFirst.highScores.time_attack_60, 2400);
  assert.equal(afterFirst.timeAttackSplits?.['60']?.length, 12);

  // Lower score does NOT overwrite saved PB splits
  const afterLower = applyTimeAttackSplitsToProgress(afterFirst, 60, 1200, [
    100, 200, 300,
  ]);
  assert.equal(afterLower.highScores.time_attack_60, 2400);
  assert.equal(afterLower.timeAttackSplits?.['60']?.[1], 400);

  // At 7.5s, expected PB between 5s (200) and 10s (400) is 300
  const paceAhead = computeTimeAttackPaceDelta(
    afterFirst.timeAttackSplits?.['60'],
    2400,
    7.5,
    60,
    450
  );
  assert.equal(paceAhead.delta, 150);
  assert.ok((paceAhead.pbFraction ?? 0) > 0.1 && (paceAhead.pbFraction ?? 0) < 0.2);

  const paceBehind = computeTimeAttackPaceDelta(
    afterFirst.timeAttackSplits?.['60'],
    2400,
    10,
    60,
    250
  );
  assert.equal(paceBehind.delta, -150);
});

test('IluminadoAudioEngine preloadTrack, setPlaybackTempoScale, consumeTimelineBeatDelta, and melodic triggers work safely in Node', () => {
  const audio = new IluminadoAudioEngine();
  audio.preloadTrack('music/world1.mp3');
  audio.setPlaybackTempoScale(1.15);
  const delta = audio.consumeTimelineBeatDelta(0.02, 120);
  assert.ok(Math.abs(delta - 0.04) < 1e-6);
  assert.doesNotThrow(() => {
    audio.playSweepColumnNote(SKINS[0], 0, 4);
    audio.playSweepColumnNote(SKINS[0], 6, 2);
    audio.playShiftChord(SKINS[0]);
  });
});

test('board_resize shift never changes board dimensions by more than 2 blocks from base or per step', () => {
  const state = createInitialBoardState(0);
  for (let c = 4; c < 12; c++) {
    state.grid[9][c] = makeCell((c % 2) as CellColor);
    state.grid[8][c] = makeCell(((c + 1) % 2) as CellColor);
  }
  const rng = createSeededRng('resize-bounds-test');
  for (let i = 0; i < 25; i++) {
    const prevCols = state.cols;
    const prevRows = state.rows;
    applyBoardShift(state, 'board_resize', { animateBricks: false, rng });
    assert.ok(Math.abs(state.cols - state.baseCols) <= 2);
    assert.ok(Math.abs(state.rows - state.baseRows) <= 2);
    assert.ok(Math.abs(state.cols - prevCols) <= 2);
    assert.ok(Math.abs(state.rows - prevRows) <= 2);
    assert.equal(state.activeShift, 'board_resize');
    assert.equal(state.isGameOver, false);
  }
});

test('Single-transformation rule: applying a new shift cleans up prior obstacles and incompatible sizes', () => {
  const state = createInitialBoardState(0);
  applyBoardShift(state, 'patrolling_bumper', { animateBricks: false });
  assert.ok(state.patrollingBumper !== null);
  assert.ok(
    state.grid.flat().filter((c) => c?.isObstacle).length === 4,
    'patrolling_bumper should create 4 bumper obstacle cells'
  );

  // Switch to inside_out_swap -> prior patrolling bumper must disappear cleanly
  applyBoardShift(state, 'inside_out_swap', { animateBricks: false });
  assert.equal(state.activeShift, 'inside_out_swap');
  assert.equal(state.patrollingBumper, null);
  assert.equal(state.grid.flat().filter((c) => c?.isObstacle).length, 0);

  // Switch to twin_elevators -> rows expand by +1, then switching to floating_shelf restores base height
  applyBoardShift(state, 'twin_elevators', { animateBricks: false });
  assert.equal(state.rows, state.baseRows + 1);
  assert.equal(state.cols, state.baseCols);

  applyBoardShift(state, 'floating_shelf', { animateBricks: false });
  assert.equal(state.rows, state.baseRows);
  assert.equal(state.cols, state.baseCols);
  assert.equal(state.activeShift, 'floating_shelf');
  const obstacles = state.grid.flat().filter((c) => c?.isObstacle);
  assert.equal(obstacles.length, 6);
});

test('floating_shelf catches pieces dropped from above while allowing pieces below to reach the floor', () => {
  const state = createInitialBoardState(0);
  applyBoardShift(state, 'floating_shelf', { animateBricks: false });

  // Find shelf row & col
  let shelfRow = -1;
  let shelfCol = -1;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c]?.obstacleStyle === 'girder') {
        shelfRow = r;
        shelfCol = c;
        break;
      }
    }
    if (shelfRow >= 0) break;
  }
  assert.ok(shelfRow >= 4 && shelfCol >= 0);

  // Drop piece from above shelf -> should land on shelfRow - 1 (leaving open air below shelf)
  state.activePiece = createPieceFromPattern([0, 0, 1, 1], -1, shelfCol);
  state.activePiece.y = -2;
  const aboveLanding = getPieceLandingColumns(state, state.activePiece);
  assert.equal(aboveLanding.leftBottomRow, shelfRow - 1);
  hardDropPiece(state, 0);
  assert.ok(state.grid[shelfRow - 1][shelfCol] !== null && !state.grid[shelfRow - 1][shelfCol]!.isObstacle);
  assert.equal(state.grid[state.rows - 1][shelfCol], null);

  // Place piece starting UNDERNEATH shelf -> should land on floor at rows - 1
  state.activePiece = createPieceFromPattern([1, 1, 0, 0], -1, shelfCol + 2);
  state.activePiece.y = shelfRow + 1;
  const belowLanding = getPieceLandingColumns(state, state.activePiece);
  assert.equal(belowLanding.leftBottomRow, state.rows - 1);
  hardDropPiece(state, 0);
  assert.ok(state.grid[state.rows - 1][shelfCol + 2] !== null);
});

test('patrolling_bumper moves horizontally on beat and drops blocks resting on the vacated column', () => {
  const state = createInitialBoardState(0);
  applyBoardShift(state, 'patrolling_bumper', { animateBricks: false });
  const b = state.patrollingBumper!;
  assert.ok(b);
  const startX = b.x;
  const topY = b.y - 1;

  // Put a block directly resting on the leftmost bumper column
  state.grid[topY][startX] = makeCell(0);
  assert.equal(state.grid[state.rows - 1][startX], null);

  // Step bumper 1 column right (dir = 1): startX becomes vacated and block falls to bottom floor!
  const moved = stepPatrollingBumper(state);
  assert.equal(moved, true);
  assert.equal(state.patrollingBumper!.x, startX + 1);
  assert.equal(state.grid[topY][startX], null);
  assert.ok(state.grid[state.rows - 1][startX] !== null && !state.grid[state.rows - 1][startX]!.isObstacle);
});

test('Neutral obstacles never form 2x2 squares or block allDeletedBonus / singleColorBonus', () => {
  const state = createInitialBoardState(0);
  applyBoardShift(state, 'split_canyon', { animateBricks: false });

  // Place a 2x2 square of color 0 on left tower (leaving no other player blocks)
  state.grid[8][2] = makeCell(0);
  state.grid[8][3] = makeCell(0);
  state.grid[9][2] = makeCell(0);
  state.grid[9][3] = makeCell(0);
  const squares = detectBoardMarks(state.grid);
  assert.equal(squares.length, 1);

  let hadClears = false;
  for (let col = 0; col < state.cols; col++) {
    if (stepTimelineColumn(state, col).cellsRemovedNow > 0) hadClears = true;
  }
  const ev = finalizeSweep(state, hadClears);
  assert.ok(ev !== null);
  assert.equal(ev!.squaresCleared, 1);
  assert.equal(ev!.allDeletedBonus, true);
  assert.ok(
    state.grid.flat().filter((c) => c?.isObstacle).length > 0,
    'canyon stone pillars remain intact after all-clear sweep'
  );
});

test('line_color_shift converts an entire line to a single uniform color', () => {
  const state = createInitialBoardState(0);
  // Fill row 9 with alternating colors
  for (let c = 0; c < state.cols; c++) {
    state.grid[9][c] = makeCell((c % 2) as CellColor);
  }
  applyBoardShift(state, 'line_color_shift', {
    animateBricks: false,
    rng: createSeededRng('line-color-1'),
  });
  const rowColors = new Set<CellColor>();
  for (let c = 0; c < state.cols; c++) {
    const cell = state.grid[9][c];
    if (cell) rowColors.add(cell.color);
  }
  assert.equal(rowColors.size, 1);
  assert.equal(state.shiftEffect?.type, 'line_color_shift');
});

test('Dramatic swaps (inside_out_swap, horizon_shear, zipper_merge) preserve exact block counts & colors', () => {
  for (const swapType of ['inside_out_swap', 'horizon_shear', 'zipper_merge'] as const) {
    const state = createInitialBoardState(0);
    let initial0 = 0;
    let initial1 = 0;
    for (let r = 6; r < 10; r++) {
      for (let c = 2; c < 14; c++) {
        const color = ((r + c) % 2) as CellColor;
        state.grid[r][c] = makeCell(color);
        if (color === 0) initial0++;
        else initial1++;
      }
    }
    applyBoardShift(state, swapType, { animateBricks: false });
    let after0 = 0;
    let after1 = 0;
    for (const cell of state.grid.flat()) {
      if (cell && !cell.isObstacle) {
        if (cell.color === 0) after0++;
        else after1++;
      }
    }
    assert.equal(after0, initial0, `${swapType} must preserve color 0 count`);
    assert.equal(after1, initial1, `${swapType} must preserve color 1 count`);
  }
});

test('All 43 shift types execute cleanly without crashing or causing premature game over', () => {
  const rng = createSeededRng('all-shifts-smoke');
  assert.equal(ALL_SHIFT_TYPES.length, 43);
  for (const shiftType of ALL_SHIFT_TYPES) {
    const state = createInitialBoardState(0);
    for (let c = 3; c < state.cols - 3; c++) {
      state.grid[state.rows - 1][c] = makeCell((c % 2) as CellColor);
      state.grid[state.rows - 2][c] = makeCell(((c + 1) % 2) as CellColor);
    }
    const res = applyBoardShift(state, shiftType, { animateBricks: false, rng });
    assert.equal(res.applied, true);
    assert.equal(state.activeShift, shiftType);
    assert.equal(state.isGameOver, false);
  }
});

test('All 40 skins define harmonious non-pure-black/white blockC styles for 3-color mode', () => {
  assert.equal(SKINS.length, 40);
  for (const skin of SKINS) {
    const blockC = getBlockStyle(skin.palette, 2);
    assert.ok(blockC, `${skin.id} must define blockC`);
    for (const hex of [
      blockC.fill,
      blockC.fillGradientEnd,
      blockC.shade,
      blockC.highlight,
      blockC.border,
      blockC.emblemColor,
    ]) {
      assert.equal(isPureBlackOrWhite(hex), false, `${skin.id} blockC hex ${hex} must not be pure #000/#fff`);
    }
    assert.notEqual(
      blockC.fill.toLowerCase(),
      skin.palette.blockA.fill.toLowerCase(),
      `${skin.id} blockC fill must differ from blockA`
    );
    assert.notEqual(
      blockC.fill.toLowerCase(),
      skin.palette.blockB.fill.toLowerCase(),
      `${skin.id} blockC fill must differ from blockB`
    );
  }
});

test('Small edge obstacle shifts stay compact (<=4x4), preserve playability, and are non-cumulative', () => {
  const rng = createSeededRng('edge-obstacles-test');
  for (const shift of ['corner_edge_block', 'bottom_edge_block', 'side_edge_ledge'] as const) {
    const state = createInitialBoardState(0);
    const res = applyBoardShift(state, shift, { animateBricks: false, rng });
    assert.equal(res.applied, true);
    assert.equal(state.isGameOver, false);

    const obstacles = state.grid.flat().filter((c) => c?.isObstacle);
    assert.ok(obstacles.length > 0 && obstacles.length <= 16, `${shift} obstacle footprint must be <= 4x4 (${obstacles.length})`);

    // Top 4 rows in center spawn columns stay clear so new pieces never auto-lose
    for (let r = 0; r < 4; r++) {
      assert.equal(state.grid[r][7], null, `${shift} must keep spawn col 7 row ${r} clear`);
      assert.equal(state.grid[r][8], null, `${shift} must keep spawn col 8 row ${r} clear`);
    }
  }

  // Applying bottom_edge_block after corner_edge_block must strip prior corner obstacles (not cumulative)
  const seqState = createInitialBoardState(0);
  applyBoardShift(seqState, 'corner_edge_block', { animateBricks: false, rng: () => 0.1 });
  const firstCount = seqState.grid.flat().filter((c) => c?.isObstacle).length;
  assert.equal(firstCount, 16);
  applyBoardShift(seqState, 'bottom_edge_block', { animateBricks: false, rng: () => 0.9 });
  const secondCount = seqState.grid.flat().filter((c) => c?.isObstacle).length;
  assert.equal(secondCount, 12, 'obstacles must not accumulate across turns');
});

test('Brick shape shifts (2x1, 1x3, 3x2, tetromino) spawn, rotate, compute CPU moves, and lock cleanly', () => {
  const rng = createSeededRng('brick-shapes-test');

  // 2x1 domino
  const dominoState = createInitialBoardState(0, rng);
  applyBoardShift(dominoState, 'brick_2x1', { animateBricks: false, rng });
  assert.equal(dominoState.pieceShapeMode, 'domino_2x1');
  assert.equal(dominoState.activePiece?.cells.length, 1);
  assert.equal(dominoState.activePiece?.cells[0].length, 2);
  assert.equal(rotateActivePiece(dominoState, 'cw'), true);
  assert.equal(dominoState.activePiece?.cells.length, 2);
  assert.equal(dominoState.activePiece?.cells[0].length, 1);
  hardDropPiece(dominoState, 0, rng);
  assert.equal(dominoState.isGameOver, false);

  // 1x3 trio
  const trioState = createInitialBoardState(0, rng);
  applyBoardShift(trioState, 'brick_3x1', { animateBricks: false, rng });
  assert.equal(trioState.pieceShapeMode, 'trio_3x1');
  assert.equal(trioState.activePiece?.cells.length, 1);
  assert.equal(trioState.activePiece?.cells[0].length, 3);
  assert.equal(rotateActivePiece(trioState, 'cw'), true);
  assert.equal(trioState.activePiece?.cells.length, 3);
  assert.equal(trioState.activePiece?.cells[0].length, 1);
  const trioPlan = computeCpuBestMove(trioState);
  assert.ok(trioPlan.targetX >= 0 && trioPlan.targetX < trioState.cols);
  hardDropPiece(trioState, 0, rng);
  assert.equal(trioState.grid.flat().filter((c) => c && !c.isObstacle).length, 3);
  assert.equal(trioState.isGameOver, false);

  // 3x2 slab
  const slabState = createInitialBoardState(0, rng);
  applyBoardShift(slabState, 'brick_3x2', { animateBricks: false, rng });
  assert.equal(slabState.pieceShapeMode, 'rect_3x2');
  assert.equal(slabState.activePiece?.cells.length, 2);
  assert.equal(slabState.activePiece?.cells[0].length, 3);
  assert.equal(rotateActivePiece(slabState, 'cw'), true);
  assert.equal(slabState.activePiece?.cells.length, 3);
  assert.equal(slabState.activePiece?.cells[0].length, 2);
  const cpuPlan = computeCpuBestMove(slabState);
  assert.ok(cpuPlan.targetX >= 0 && cpuPlan.targetX < slabState.cols);
  hardDropPiece(slabState, 0, rng);
  assert.equal(slabState.isGameOver, false);

  // Tetrominoes (T, I, J, L, etc.)
  const tetState = createInitialBoardState(0, rng);
  applyBoardShift(tetState, 'brick_tetromino', { animateBricks: false, rng });
  assert.equal(tetState.pieceShapeMode, 'tetromino');
  assert.ok(tetState.activePiece !== null);
  const nonNullCount = tetState.activePiece!.cells.flat().filter(Boolean).length;
  assert.equal(nonNullCount, 4, 'every tetromino must contain exactly 4 blocks');
  rotateActivePiece(tetState, 'cw');
  const landing = getPieceLandingColumns(tetState, tetState.activePiece!);
  assert.equal(landing.colBottomRows.length, tetState.activePiece!.cells[0].length);
  const tetPlan = computeCpuBestMove(tetState);
  assert.ok(tetPlan.targetX >= 0);
  hardDropPiece(tetState, 0, rng);
  assert.equal(tetState.grid.flat().filter((c) => c && !c.isObstacle).length, 4);
  assert.equal(tetState.isGameOver, false);

  // Switching away reverts pieceShapeMode back to standard 2x2
  applyBoardShift(tetState, 'inside_out_swap', { animateBricks: false, rng });
  assert.equal(tetState.pieceShapeMode, 'standard_2x2');
  assert.equal(tetState.activePiece?.cells.length, 2);
  assert.equal(tetState.activePiece?.cells[0].length, 2);
});

test('brick_blocked spawns obsidian blocked 2x2 bricks that drop with gravity, shatter beside clears, and strip cleanly on next shift', () => {
  const rng = createSeededRng('blocked-brick-test');
  const state = createInitialBoardState(0, rng);
  applyBoardShift(state, 'brick_blocked', { animateBricks: false, rng });
  assert.equal(state.pieceShapeMode, 'blocked_2x2');

  // Staging piece guarantees at most 1 blocked cell and never isChain on blocked slot
  const activeCells = state.activePiece!.cells.flat().filter((c) => c !== null);
  const blockedInActive = activeCells.filter((c) => c!.isBlocked);
  assert.equal(blockedInActive.length, 1);
  assert.equal(blockedInActive[0]!.isChain, false);

  // Sample 20 generated blocked_2x2 pieces: none should have >1 blocked slot, some have 0, some have 1
  let zeroCount = 0;
  let oneCount = 0;
  for (let i = 0; i < 20; i++) {
    const p = generateRandomPiece(0.1, rng, 7, { shapeMode: 'blocked_2x2' });
    const bc = p.cells.flat().filter((c) => c?.isBlocked).length;
    assert.ok(bc === 0 || bc === 1);
    if (bc === 0) zeroCount++;
    else oneCount++;
  }
  assert.ok(oneCount > 0 && zeroCount > 0, 'blocked_2x2 should only occasionally include a blocked block');

  // Hard dropping blocked activePiece deposits 1 gravity-falling blocked obstacle cell
  hardDropPiece(state, 0, rng);
  const blockedOnGrid = state.grid
    .flat()
    .filter((c) => c?.isObstacle && c.obstacleStyle === 'blocked');
  assert.equal(blockedOnGrid.length, 1);
  assert.equal(blockedOnGrid[0]!.obstacleFixed, false);

  // Place a blocked tile resting atop a 2x2 clearable square -> clearing square shatters adjacent blocked tile
  const shatterState = createInitialBoardState(0, rng);
  shatterState.grid[8][4] = makeCell(0);
  shatterState.grid[8][5] = makeCell(0);
  shatterState.grid[9][4] = makeCell(0);
  shatterState.grid[9][5] = makeCell(0);
  shatterState.grid[7][4] = {
    id: 9991,
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
  };
  let hadClears = false;
  for (let col = 0; col < shatterState.cols; col++) {
    if (stepTimelineColumn(shatterState, col).cellsRemovedNow > 0) hadClears = true;
  }
  finalizeSweep(shatterState, hadClears);
  assert.equal(
    shatterState.grid.flat().filter((c) => c?.obstacleStyle === 'blocked').length,
    0,
    'adjacent blocked tile must shatter when touching 2x2 square clears'
  );

  // Shifting away from brick_blocked cleans remaining blocked cells and reverts to standard 2x2
  applyBoardShift(state, 'line_color_shift', { animateBricks: false, rng });
  assert.equal(state.pieceShapeMode, 'standard_2x2');
  assert.equal(
    state.grid.flat().filter((c) => c?.isObstacle).length,
    0
  );
});

test('three_color_mode introduces 3rd color on board & pieces, forms 2x2 squares of color 2, and reverts cleanly', () => {
  const rng = createSeededRng('three-color-test');
  const state = createInitialBoardState(0, rng);
  for (let c = 2; c < 14; c++) {
    state.grid[8][c] = makeCell((c % 2) as CellColor);
    state.grid[9][c] = makeCell(((c + 1) % 2) as CellColor);
  }

  applyBoardShift(state, 'three_color_mode', { animateBricks: false, rng });
  assert.equal(state.colorCount, 3);
  const color2Cells = state.grid.flat().filter((c) => c && !c.isObstacle && c.color === 2);
  assert.ok(color2Cells.length > 0, '3-color mode should convert some board blocks to color 2');

  // Verify 2x2 square of color 2 clears via timeline sweep
  state.grid[8][0] = makeCell(2);
  state.grid[8][1] = makeCell(2);
  state.grid[9][0] = makeCell(2);
  state.grid[9][1] = makeCell(2);
  const marks = detectBoardMarks(state.grid);
  assert.ok(marks.some((sq) => sq.color === 2 && sq.x === 0 && sq.y === 8));

  // Switching away must revert colorCount to 2 and eliminate orphaned color-2 cells
  applyBoardShift(state, 'line_color_shift', { animateBricks: false, rng });
  assert.equal(state.colorCount, 2);
  assert.equal(
    state.grid.flat().filter((c) => c && c.color === 2).length,
    0,
    'reverting from three_color_mode must leave zero orphaned color-2 blocks'
  );
});

test('rotate_90 dimension state persists across subsequent non-resize shifts', () => {
  const rng = createSeededRng('rotate-persist-test');
  const state = createInitialBoardState(0, rng);
  assert.equal(state.cols, 16);
  assert.equal(state.rows, 10);

  applyBoardShift(state, 'rotate_90', { animateBricks: false, level: 2, rng });
  assert.equal(state.cols, 10);
  assert.equal(state.rows, 16);

  // Subsequent obstacle / brick shift keeps rotated 10x16 dimensions!
  applyBoardShift(state, 'corner_edge_block', { animateBricks: false, rng });
  assert.equal(state.cols, 10);
  assert.equal(state.rows, 16);

  applyBoardShift(state, 'brick_2x1', { animateBricks: false, rng });
  assert.equal(state.cols, 10);
  assert.equal(state.rows, 16);
});

test('Shift scheduler enforces 3-level windows, frequent ~2-turn rotations, and ~3-level tile-type shifts while keeping 2x2 dominant', () => {
  const rng = createSeededRng('scheduler-cadence-test');
  const state = createInitialBoardState(0, rng);
  for (let c = 3; c < 13; c++) {
    state.grid[9][c] = makeCell((c % 2) as CellColor);
  }

  const history: ShiftType[] = [];
  const rotIndices: number[] = [];
  const tileIndices: number[] = [];
  const oneTimeSeen = new Set<ShiftType>();
  const oneTimeCandidates = new Set<ShiftType>([
    'corner_edge_block',
    'bottom_edge_block',
    'side_edge_ledge',
    'split_canyon',
    'octagon_cutoffs',
  ]);
  const obstacleSet = OBSTACLE_SHIFT_SET;
  const tileSet = TILE_TYPE_SHIFT_SET;

  for (let turn = 0; turn < 18; turn++) {
    if (turn > 0 && turn % 3 === 0) {
      advanceShiftStageTurn(state);
    }
    const picked = pickNextShift(ALL_SHIFT_TYPES, state.activeShift, rng, state);
    assert.ok(picked !== null);
    history.push(picked!);
    if (picked === 'rotate_90') {
      rotIndices.push(turn);
    }
    if (tileSet.has(picked!)) {
      tileIndices.push(turn);
    }
    if (oneTimeCandidates.has(picked!)) {
      assert.equal(
        oneTimeSeen.has(picked!),
        false,
        `One-time shift ${picked} should not repeat while alternatives remain`
      );
      oneTimeSeen.add(picked!);
    }
    applyBoardShift(state, picked!, { animateBricks: false, level: turn + 2, rng });
    assert.equal(state.isGameOver, false);
  }

  // Rotation happens frequently (every 2-3 turns, mostly 2 turns)
  assert.ok(rotIndices.length >= 6, `rotate_90 should recur frequently (got ${rotIndices.length})`);
  for (let i = 1; i < rotIndices.length; i++) {
    const gap = rotIndices[i] - rotIndices[i - 1];
    assert.ok(gap >= 2 && gap <= 3, `rotation gap ${gap} should be 2 or 3 turns`);
  }

  // Most turns remain standard 2x2 (~2/3), with special tile shifts occurring roughly every ~3 levels and never back-to-back
  assert.ok(
    tileIndices.length >= 4 && tileIndices.length <= 6,
    `Expected ~5 special tile shifts across 18 turns, got ${tileIndices.length}`
  );
  for (let i = 1; i < tileIndices.length; i++) {
    const gap = tileIndices[i] - tileIndices[i - 1];
    assert.ok(gap >= 3 && gap <= 5, `tile shift gap ${gap} should space ~3-4 turns`);
  }

  // Per 3-turn stage window: <= 1 obstacle shift & <= 1 tile-type/color shift
  for (let w = 0; w < 6; w++) {
    const slice = history.slice(w * 3, w * 3 + 3);
    const obsCount = slice.filter((s) => obstacleSet.has(s)).length;
    const tileCount = slice.filter((s) => tileSet.has(s)).length;
    assert.ok(obsCount <= 1, `Turn window ${w} had ${obsCount} obstacle shifts (max 1)`);
    assert.ok(tileCount <= 1, `Turn window ${w} had ${tileCount} tile/color shifts (max 1)`);
  }
});

test('pickNextShift avoids back-to-back repeat when multiple shifts enabled and respects empty list', () => {
  assert.equal(pickNextShift([], null), null);
  assert.equal(pickNextShift(['split_canyon'], 'split_canyon'), 'split_canyon');
  for (let i = 0; i < 10; i++) {
    const picked = pickNextShift(['rotate_90', 'split_canyon'], 'rotate_90');
    assert.equal(picked, 'split_canyon');
  }
});

test('storage.ts persists and sanitizes enabledShifts including explicit empty array and v1/v2 -> v3 upgrade', () => {
  const store = new Map<string, string>();
  const origStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  try {
    const initial = loadProgress();
    assert.equal(initial.enabledShifts.length, ALL_SHIFT_TYPES.length);

    saveProgress({
      ...initial,
      enabledShifts: ['split_canyon', 'floating_shelf'],
    });
    const loaded = loadProgress();
    assert.deepEqual(loaded.enabledShifts, ['split_canyon', 'floating_shelf']);

    // Explicitly disabling all shifts must stay empty across reload
    saveProgress({ ...loaded, enabledShifts: [] });
    const loadedEmpty = loadProgress();
    assert.deepEqual(loadedEmpty.enabledShifts, []);

    // Legacy v1 save merges both v2 & v3 shifts seamlessly
    store.set(
      'iluminado_progress_v2',
      JSON.stringify({ enabledShifts: ['rotate_90', 'split_canyon'] })
    );
    const migratedV1 = loadProgress();
    assert.ok(migratedV1.enabledShifts.includes('corner_edge_block'));
    assert.ok(migratedV1.enabledShifts.includes('three_color_mode'));
    assert.ok(migratedV1.enabledShifts.includes('brick_3x1'));
    assert.ok(migratedV1.enabledShifts.includes('brick_blocked'));

    // v2 save merges v3/v5 shifts without overriding user's v2 choices
    store.set(
      'iluminado_progress_v2',
      JSON.stringify({ enabledShifts: ['rotate_90', 'brick_2x1'], shiftCatalogVersion: 2 })
    );
    const migratedV2 = loadProgress();
    assert.equal(migratedV2.enabledShifts.includes('corner_edge_block'), false);
    assert.ok(migratedV2.enabledShifts.includes('brick_3x1'));
    assert.ok(migratedV2.enabledShifts.includes('brick_blocked'));
    for (const s of NEW_V5_SHIFTS) {
      assert.ok(migratedV2.enabledShifts.includes(s), `v2->v5 migration should enable ${s}`);
    }

    // v4 save merges NEW_V5_SHIFTS & NEW_V6_SHIFTS without adding missing older shifts
    store.set(
      'iluminado_progress_v2',
      JSON.stringify({ enabledShifts: ['rotate_90'], shiftCatalogVersion: 4 })
    );
    const migratedV4 = loadProgress();
    assert.equal(migratedV4.enabledShifts.includes('split_canyon'), false);
    for (const s of [...NEW_V5_SHIFTS, ...NEW_V6_SHIFTS]) {
      assert.ok(migratedV4.enabledShifts.includes(s), `v4->v6 migration should enable ${s}`);
    }

    // v5 save merges only NEW_V6_SHIFTS without overriding v5 choices
    store.set(
      'iluminado_progress_v2',
      JSON.stringify({ enabledShifts: ['rotate_90', 'twin_sweep'], shiftCatalogVersion: 5 })
    );
    const migratedV5 = loadProgress();
    assert.equal(migratedV5.enabledShifts.includes('mirror_flip'), false);
    for (const s of NEW_V6_SHIFTS) {
      assert.ok(migratedV5.enabledShifts.includes(s), `v5->v6 migration should enable ${s}`);
    }

    assert.equal(getPreviousDateKey('2026-11-16'), '2026-11-15');
  } finally {
    if (origStorage) {
      (globalThis as unknown as { localStorage: Storage }).localStorage = origStorage;
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  }
});

test('Core new shifts: cyclotron_flow orbits gravity CW per piece, portal_wrap teleports edges, and reverse_sweep sweeps RTL', () => {
  const rng = createSeededRng('core-new-shifts');

  // 1. cyclotron_flow
  const cyclo = createInitialBoardState(0, rng);
  applyBoardShift(cyclo, 'cyclotron_flow', { animateBricks: false, rng });
  assert.equal(cyclo.gravityDirection, 'right');
  // Steer vertical along Y when gravity is horizontal
  const startY = cyclo.activePiece!.y;
  assert.equal(steerPiece(cyclo, -1), true);
  assert.equal(cyclo.activePiece!.y, startY - 1);
  // Locking orbits gravity right -> up -> left -> down
  hardDropPiece(cyclo, 0, rng);
  assert.equal(cyclo.gravityDirection, 'up');
  hardDropPiece(cyclo, 0, rng);
  assert.equal(cyclo.gravityDirection, 'left');
  hardDropPiece(cyclo, 0, rng);
  assert.equal(cyclo.gravityDirection, 'down');

  // 2. portal_wrap
  const portal = createInitialBoardState(0, rng);
  applyBoardShift(portal, 'portal_wrap', { animateBricks: false, rng });
  portal.activePiece!.x = 0;
  assert.equal(steerPiece(portal, -1), true);
  assert.equal(portal.activePiece!.x, portal.cols - 2);
  assert.equal(steerPiece(portal, 1), true);
  assert.equal(portal.activePiece!.x, 0);

  // 3. reverse_sweep clears squares when swept right-to-left
  const rtl = createInitialBoardState(0, rng);
  applyBoardShift(rtl, 'reverse_sweep', { animateBricks: false, rng });
  rtl.grid[8][4] = makeCell(0);
  rtl.grid[8][5] = makeCell(0);
  rtl.grid[9][4] = makeCell(0);
  rtl.grid[9][5] = makeCell(0);
  let totalRemoved = 0;
  for (let col = rtl.cols - 1; col >= 0; col--) {
    totalRemoved += stepTimelineColumn(rtl, col, 'rtl').cellsRemovedNow;
  }
  const rtlEv = finalizeSweep(rtl, totalRemoved > 0);
  assert.equal(rtlEv?.squaresCleared, 1);
  assert.equal(totalRemoved, 4);
});

test('New silhouette, obstacle, brick, and swap shifts preserve playability and apply signature mechanics', () => {
  const rng = createSeededRng('new-shifts-suite');

  // Silhouette shifts leave top spawn headroom clear and place fixed obstacles
  for (const sil of ['staircase_terraces', 'center_spire', 'dome_pedestal'] as const) {
    const s = createInitialBoardState(0, rng);
    applyBoardShift(s, sil, { animateBricks: false, rng });
    const obsCount = s.grid.flat().filter((c) => c?.isObstacle).length;
    assert.ok(obsCount > 0, `${sil} must place stone silhouette blocks`);
    assert.equal(s.grid[0][7], null);
    assert.equal(s.grid[0][8], null);
  }

  // spring_bounce bounces an active piece mid-air off spring pads once per piece
  const springState = createInitialBoardState(0, rng);
  applyBoardShift(springState, 'spring_bounce', { animateBricks: false, rng });
  const padX = springState.grid[springState.rows - 1].findIndex(
    (c) => c?.isObstacle && c.obstacleStyle === 'spring'
  );
  assert.ok(padX >= 0, 'spring_bounce must place spring pads');
  springState.activePiece = createPieceFromPattern([0, 0, 1, 1], -1, Math.max(0, padX - 1));
  springState.activePiece.y = 0;
  const springDrop = hardDropPiece(springState, 0, rng);
  assert.equal(springDrop.landed, false, 'first contact with spring pad should bounce piece mid-air');
  assert.ok((springDrop.bouncePositions?.length ?? 0) > 0);
  assert.equal(springState.activePiece?.springBounced, true);

  // conveyor_floor shifts bottom-row player cells laterally and drops upper blocks into vacated slots
  const conv = createInitialBoardState(0, rng);
  applyBoardShift(conv, 'conveyor_floor', { animateBricks: false, rng });
  assert.ok(conv.conveyorDir === 1 || conv.conveyorDir === -1);
  conv.conveyorDir = 1;
  conv.grid[conv.rows - 1][4] = makeCell(0);
  conv.grid[conv.rows - 2][4] = makeCell(1);
  assert.equal(stepConveyorFloor(conv), true);
  assert.equal(conv.grid[conv.rows - 1][5]?.color, 0);
  assert.equal(conv.grid[conv.rows - 1][4]?.color, 1);

  // crumble_blocks crack on piece drop impact (HP 2 -> 1 -> shatter)
  const crumble = createInitialBoardState(0, rng);
  applyBoardShift(crumble, 'crumble_blocks', { animateBricks: false, rng });
  let cRow = -1;
  let cCol = -1;
  for (let r = 0; r < crumble.rows && cRow < 0; r++) {
    for (let c = 0; c < crumble.cols; c++) {
      if (crumble.grid[r][c]?.obstacleStyle === 'crumble') {
        cRow = r;
        cCol = c;
        break;
      }
    }
  }
  assert.ok(cRow >= 2 && cCol >= 0, 'crumble_blocks must place crumble ledges');
  assert.equal(crumble.grid[cRow][cCol]?.crumbleHp, 2);
  crumble.activePiece = createPieceFromPattern([0, 0, 1, 1], -1, Math.min(crumble.cols - 2, cCol));
  crumble.activePiece.y = 0;
  hardDropPiece(crumble, 0, rng);
  assert.equal(crumble.grid[cRow][cCol]?.crumbleHp, 1, 'landing above crumble block cracks it to HP 1');

  // brick_l_trio spawns 3-block L-triominoes
  const lTrio = createInitialBoardState(0, rng);
  applyBoardShift(lTrio, 'brick_l_trio', { animateBricks: false, rng });
  assert.equal(lTrio.pieceShapeMode, 'l_trio_2x2');
  assert.equal(lTrio.activePiece!.cells.flat().filter(Boolean).length, 3);

  // chameleon_rotate cycles piece colors on rotation
  const cham = createInitialBoardState(0, rng);
  applyBoardShift(cham, 'chameleon_rotate', { animateBricks: false, rng });
  const beforeColor = cham.activePiece!.cells[0][0]!.color;
  assert.equal(rotateActivePiece(cham, 'cw'), true);
  const rotatedBack = cham.activePiece!.cells[0][1]!.color; // top-left moved to top-right on CW
  assert.equal(rotatedBack, ((beforeColor + 1) % cham.colorCount) as CellColor);

  // prism_wild_bricks spawns isWild tiles that complete 2x2 squares with any color and preserve single-color bonus
  const prism = createInitialBoardState(0, rng);
  applyBoardShift(prism, 'prism_wild_bricks', { animateBricks: false, rng });
  assert.equal(prism.pieceShapeMode, 'prism_wild_2x2');
  const hasWildInActive = prism.activePiece!.cells.flat().some((c) => c?.isWild);
  assert.equal(hasWildInActive, true);
  prism.grid[8][2] = makeCell(0);
  prism.grid[8][3] = makeCell(0);
  prism.grid[9][2] = makeCell(0);
  prism.grid[9][3] = { ...makeCell(1), isWild: true };
  prism.grid[9][10] = makeCell(0);
  const prismMarks = detectBoardMarks(prism.grid);
  assert.ok(prismMarks.some((sq) => sq.x === 2 && sq.y === 8), 'wild corner must complete 2x2 square');
  for (let col = 0; col < prism.cols; col++) {
    stepTimelineColumn(prism, col);
  }
  const prismEv = finalizeSweep(prism, true);
  assert.equal(prismEv?.squaresCleared, 1);

  // mirror_flip & vortex_swirl preserve exact color counts
  for (const swapShift of ['mirror_flip', 'vortex_swirl'] as const) {
    const sw = createInitialBoardState(0, rng);
    let count0 = 0;
    let count1 = 0;
    for (let r = 6; r < sw.rows; r++) {
      for (let c = 1; c < sw.cols - 1; c++) {
        const col = ((r * 3 + c) % 2) as CellColor;
        sw.grid[r][c] = makeCell(col);
        if (col === 0) count0++;
        else count1++;
      }
    }
    applyBoardShift(sw, swapShift, { animateBricks: false, rng });
    let after0 = 0;
    let after1 = 0;
    for (const cell of sw.grid.flat()) {
      if (cell && !cell.isObstacle) {
        if (cell.color === 0) after0++;
        else after1++;
      }
    }
    assert.equal(after0, count0, `${swapShift} preserves color 0 count`);
    assert.equal(after1, count1, `${swapShift} preserves color 1 count`);
  }
});

test('split_half_sweep clears top and bottom screen halves at staggered opposite times without splitting straddling squares', () => {
  const rng = createSeededRng('split-half-sweep-test');
  const state = createInitialBoardState(0, rng);
  applyBoardShift(state, 'split_half_sweep', { animateBricks: false, rng });

  // Place a 2x2 square in upper half (rows 0..1, cols 2..3) and another in lower half (rows 8..9, cols 2..3)
  // Fill supporting columns below upper square with alternating non-matching blocks so it sits stably at rows 0..1
  for (let r = 2; r < 8; r++) {
    state.grid[r][2] = makeCell(((r + 1) % 2) as CellColor);
    state.grid[r][3] = makeCell((r % 2) as CellColor);
  }
  state.grid[0][2] = makeCell(0);
  state.grid[0][3] = makeCell(0);
  state.grid[1][2] = makeCell(0);
  state.grid[1][3] = makeCell(0);

  state.grid[8][2] = makeCell(1);
  state.grid[8][3] = makeCell(1);
  state.grid[9][2] = makeCell(1);
  state.grid[9][3] = makeCell(1);

  assert.equal(detectBoardMarks(state.grid).length, 2);

  // At col = 3, upper half beam reaches trailing edge (col 3), while bottom half is at col 11 -> ONLY top square clears!
  let topRemoved = 0;
  for (let c = 0; c <= 3; c++) {
    topRemoved += stepTimelineColumn(state, c).cellsRemovedNow;
  }
  assert.equal(topRemoved, 4, 'top square must clear 4 cells at col 3');
  assert.equal(state.sweepState.squaresThisSweep, 1);
  assert.equal(state.grid[0][2], null, 'top square must clear at col 3');
  assert.equal(state.grid[1][3], null, 'top square must clear at col 3');
  assert.equal(state.grid[8][2]?.color, 1, 'bottom square must still be intact at col 3');
  assert.equal(state.grid[8][2]?.fallOffset, 0);

  // Continue sweeping through col = 11 ((11 + 8) % 16 === 3): bottom square now clears cleanly and spacer drops 2 rows!
  let botRemoved = 0;
  for (let c = 4; c <= 11; c++) {
    botRemoved += stepTimelineColumn(state, c).cellsRemovedNow;
  }
  assert.equal(botRemoved, 4, 'bottom square clears 4 cells at tick 11');
  assert.equal(state.sweepState.squaresThisSweep, 2);
  assert.equal(state.grid[2][2], null, 'spacer blocks above bottom square dropped cleanly by 2 rows');
  assert.equal(state.grid[8][2]?.fallOffset, 2);

  for (let c = 12; c < state.cols; c++) {
    stepTimelineColumn(state, c);
  }
  const ev = finalizeSweep(state, true);
  assert.equal(ev?.squaresCleared, 2);

  // Also verify a square straddling the midline (rows 4..5) clears intact as a single unit
  const straddle = createInitialBoardState(0, rng);
  applyBoardShift(straddle, 'split_half_sweep', { animateBricks: false, rng });
  for (let r = 6; r < 10; r++) {
    straddle.grid[r][4] = makeCell(((r + 1) % 2) as CellColor);
    straddle.grid[r][5] = makeCell((r % 2) as CellColor);
  }
  straddle.grid[4][4] = makeCell(0);
  straddle.grid[4][5] = makeCell(0);
  straddle.grid[5][4] = makeCell(0);
  straddle.grid[5][5] = makeCell(0);
  for (let c = 0; c <= 5; c++) {
    stepTimelineColumn(straddle, c);
  }
  assert.equal(straddle.grid[4][4], null);
  assert.equal(straddle.grid[5][5], null);
  const straddleEv = finalizeSweep(straddle, true);
  assert.equal(straddleEv?.squaresCleared, 1);
});

test('diagonal_slant_sweep clears upper rows ahead of lower rows and bridges overlapping clusters cleanly', () => {
  const rng = createSeededRng('diagonal-slant-test');
  const state = createInitialBoardState(0, rng);
  applyBoardShift(state, 'diagonal_slant_sweep', { animateBricks: false, rng });

  const span = getDiagonalSlantSpan(state.cols);
  assert.equal(span, 6);
  assert.equal(getSweepColumnForRow(state, 0, 5), 5);
  assert.equal(getSweepColumnForRow(state, state.rows - 1, 5), (5 - 6 + 16) % 16);

  // Upper square at cols 4..5 (rows 0..1) and bottom square at cols 4..5 (rows 8..9) separated vertically
  for (let r = 2; r < 8; r++) {
    state.grid[r][4] = makeCell(((r + 1) % 2) as CellColor);
    state.grid[r][5] = makeCell((r % 2) as CellColor);
  }
  state.grid[0][4] = makeCell(0);
  state.grid[0][5] = makeCell(0);
  state.grid[1][4] = makeCell(0);
  state.grid[1][5] = makeCell(0);

  state.grid[8][4] = makeCell(1);
  state.grid[8][5] = makeCell(1);
  state.grid[9][4] = makeCell(1);
  state.grid[9][5] = makeCell(1);

  // Row 1 lags by 1 col -> triggers trailing edge 5 at tick col = 6, while row 9 lags by 6 -> triggers at tick col = 11
  let upperRemoved = 0;
  for (let c = 0; c <= 6; c++) {
    upperRemoved += stepTimelineColumn(state, c).cellsRemovedNow;
  }
  assert.equal(upperRemoved, 4, 'upper square clears earlier along diagonal line');
  assert.equal(state.sweepState.squaresThisSweep, 1);
  assert.equal(state.grid[0][4], null);
  assert.equal(state.grid[1][5], null);
  assert.equal(state.grid[8][4]?.color, 1, 'lower square awaits diagonal trailing edge');
  assert.equal(state.grid[8][4]?.fallOffset, 0);

  let lowerRemoved = 0;
  for (let c = 7; c <= 11; c++) {
    lowerRemoved += stepTimelineColumn(state, c).cellsRemovedNow;
  }
  assert.equal(lowerRemoved, 4, 'lower square clears when diagonal bottom reaches col 5');
  assert.equal(state.sweepState.squaresThisSweep, 2);
  assert.equal(state.grid[2][4], null, 'spacer dropped by 2 rows after bottom square cleared');
  assert.equal(state.grid[8][4]?.fallOffset, 2);

  for (let c = 12; c < state.cols; c++) {
    stepTimelineColumn(state, c);
  }
  const ev = finalizeSweep(state, true);
  assert.equal(ev?.squaresCleared, 2);

  // Overlapping vertical 4-tall stack (rows 5..8, cols 4..5) must bridge and award all 3 squares without stranding!
  const mono = createInitialBoardState(0, rng);
  applyBoardShift(mono, 'diagonal_slant_sweep', { animateBricks: false, rng });
  for (let r = 5; r <= 8; r++) {
    mono.grid[r][4] = makeCell(0);
    mono.grid[r][5] = makeCell(0);
  }
  mono.grid[9][4] = makeCell(1);
  mono.grid[9][5] = makeCell(1);
  for (let c = 0; c < mono.cols; c++) {
    stepTimelineColumn(mono, c);
  }
  const monoEv = finalizeSweep(mono, true);
  assert.equal(monoEv?.squaresCleared, 3, 'all 3 vertically overlapping squares must clear cleanly');
});

test('partial overflow (1x2 or 1x1 of a 2x2 entering the board) discards upper cells and continues without Game Over', () => {
  // Case 1: 1x2 bottom row enters row 0 while top 1x2 is above the top line
  const state1x2 = createInitialBoardState(0);
  for (let r = 1; r < BOARD_ROWS; r++) {
    state1x2.grid[r][7] = makeCell((r % 2) as CellColor);
    state1x2.grid[r][8] = makeCell(((r + 1) % 2) as CellColor);
  }
  state1x2.activePiece = createPieceFromPattern([0, 1, 1, 0]);
  state1x2.activePiece.x = 7;
  state1x2.activePiece.y = -2;

  const res1x2 = lockActivePiece(state1x2, 0);
  assert.equal(res1x2.landed, true);
  assert.equal(state1x2.isGameOver, false, '1x2 entering row 0 must not cause Game Over');
  assert.ok(state1x2.activePiece !== null, 'next piece should spawn after partial 1x2 entry');
  assert.equal(state1x2.grid[0][7]?.color, 1, 'bottom-left cell of 2x2 placed at row 0');
  assert.equal(state1x2.grid[0][8]?.color, 0, 'bottom-right cell of 2x2 placed at row 0');

  // Case 2: Only 1x1 enters row 0 (col 7 has row 0 open, col 8 is completely full to row 0)
  const state1x1 = createInitialBoardState(0);
  for (let r = 1; r < BOARD_ROWS; r++) {
    state1x1.grid[r][7] = makeCell((r % 2) as CellColor);
  }
  for (let r = 0; r < BOARD_ROWS; r++) {
    state1x1.grid[r][8] = makeCell(((r + 1) % 2) as CellColor);
  }
  state1x1.activePiece = createPieceFromPattern([0, 1, 1, 0]);
  state1x1.activePiece.x = 7;
  state1x1.activePiece.y = -2;

  const res1x1 = lockActivePiece(state1x1, 0);
  assert.equal(res1x1.landed, true);
  assert.equal(state1x1.isGameOver, false, '1x1 entering row 0 must not cause Game Over');
  assert.ok(state1x1.activePiece !== null, 'next piece should spawn after partial 1x1 entry');
  assert.equal(state1x1.grid[0][7]?.color, 1, 'bottom-left cell enters row 0 while rest is discarded');

  // Case 3: Next piece at cols 7..8 now has 0 open cells in either column -> triggers Game Over
  const resZero = lockActivePiece(state1x1, 0);
  assert.equal(resZero.landed, true);
  assert.equal(state1x1.isGameOver, true, '0 cells entering board must trigger Game Over');
  assert.equal(state1x1.activePiece, null);
});

test('zero-cell entry triggers Game Over and partial entry survives under up/left/right gravity too', () => {
  // Upward gravity: row 9 is entry edge; fill rows 0..8 in cols 7..8 so only 1x2 fits at row 9
  const upState = createInitialBoardState(0);
  upState.gravityDirection = 'up';
  for (let r = 0; r < BOARD_ROWS - 1; r++) {
    upState.grid[r][7] = makeCell((r % 2) as CellColor);
    upState.grid[r][8] = makeCell(((r + 1) % 2) as CellColor);
  }
  upState.activePiece = createPieceFromPattern([0, 1, 1, 0]);
  upState.activePiece.x = 7;
  upState.activePiece.y = BOARD_ROWS;

  lockActivePiece(upState, 0);
  assert.equal(upState.isGameOver, false);
  assert.equal(upState.grid[BOARD_ROWS - 1][7]?.color, 0);
  assert.equal(upState.grid[BOARD_ROWS - 1][8]?.color, 1);

  // Now row 9 is also occupied -> 0 cells can enter -> Game Over
  lockActivePiece(upState, 0);
  assert.equal(upState.isGameOver, true);

  // Rightward gravity: col 0 is entry edge; fill cols 1..15 in rows 4..5 so 1x2 fits at col 0
  const rightState = createInitialBoardState(0);
  rightState.gravityDirection = 'right';
  for (let c = 1; c < BOARD_COLS; c++) {
    rightState.grid[4][c] = makeCell((c % 2) as CellColor);
    rightState.grid[5][c] = makeCell(((c + 1) % 2) as CellColor);
  }
  rightState.activePiece = createPieceFromPattern([0, 1, 1, 0]);
  rightState.activePiece.x = -2;
  rightState.activePiece.y = 4;

  lockActivePiece(rightState, 0);
  assert.equal(rightState.isGameOver, false);
  assert.equal(rightState.grid[4][0]?.color, 1);
  assert.equal(rightState.grid[5][0]?.color, 0);

  lockActivePiece(rightState, 0);
  assert.equal(rightState.isGameOver, true);
});
test('partial 1x1 overflow entry forms a 2x2 square at row 0 and continues until 0 cells enter', () => {
  const state1x1 = createInitialBoardState(0);
  for (let r = 1; r < BOARD_ROWS; r++) {
    state1x1.grid[r][6] = makeCell((r % 2 === 1 ? 0 : 1) as CellColor);
    state1x1.grid[r][7] = makeCell(r === 1 ? 0 : ((r % 2) as CellColor));
    state1x1.grid[r][8] = makeCell(((r + 1) % 2) as CellColor);
  }
  state1x1.grid[0][8] = makeCell(1);
  state1x1.grid[0][6] = makeCell(0);
  state1x1.grid[1][6] = makeCell(0);
  state1x1.activePiece = createPieceFromPattern([1, 1, 0, 1]);
  state1x1.activePiece.x = 7;
  state1x1.activePiece.y = -2;

  const res1x1 = hardDropPiece(state1x1, 0);
  assert.equal(res1x1.landed, true);
  assert.equal(state1x1.isGameOver, false, '1x1 partial entry must not trigger Game Over');
  assert.ok(state1x1.activePiece !== null, 'next piece must spawn after 1x1 partial entry');
  assert.equal(state1x1.grid[0][7]?.color, 0, 'the 1x1 cell that entered row 0 must remain on the board');
  assert.equal(state1x1.grid[0][8]?.color, 1, 'full column 8 remains intact');
  assert.equal(res1x1.squaresFormed, 1, '1x1 entering row 0 still detects formed 2x2 square');

  // Now both spawn columns 7 and 8 are completely full -> 0 cells enter -> Game Over
  const resZero = hardDropPiece(state1x1, 0);
  assert.equal(resZero.landed, true);
  assert.equal(state1x1.isGameOver, true, '0 cells entering the board must trigger Game Over');
  assert.equal(state1x1.activePiece, null);
});
