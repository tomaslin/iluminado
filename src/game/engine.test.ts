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
  computeStageProgressMetrics,
  createInitialBoardState,
  createPieceFromPattern,
  detectBoardMarks,
  finalizeSweep,
  getPieceLandingColumns,
  hardDropPiece,
  isActivePieceGrounded,
  lockActivePiece,
  movePieceHorizontal,
  rotateActivePiece,
  rotateBoard90,
  settleBoard,
  softDropStep,
  stepPassiveGravity,
  stepTimelineColumn,
  transformBoardForOrientation,
} from './engine';
import { checkPuzzlePatternMatch, PUZZLE_LEVELS } from './modes';
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
  getHexLuminance,
  isPureBlackOrWhite,
  pickRandomSkinIndex,
} from './skins';
import {
  applyDailyResultToProgress,
  getEffectiveDailyStreak,
  isDailyCompletedForDate,
} from './storage';
import { Cell, CellColor, SavedProgress } from './types';

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
  assert.equal(state.activePiece.cells[0][0].color, 1);
  assert.equal(state.activePiece.cells[0][1].color, 0);
  assert.equal(state.activePiece.cells[1][0].color, 1);
  assert.equal(state.activePiece.cells[1][1].color, 1);

  assert.equal(rotateActivePiece(state, 'ccw'), true);
  assert.equal(state.activePiece.cells[0][0].color, 0);
  assert.equal(state.activePiece.cells[0][1].color, 1);
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

test('all 30 worlds define valid music configs covering all requested genres', () => {
  assert.equal(SKINS.length, 30);
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

test('Lumines passive drop enters lock delay before locking and resumes falling when slid off a ledge', () => {
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

test('All 30 soundtrack worlds (1-30) configure root-relative MP3 paths in music/ with no public/music folder and .nojekyll present', () => {
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'public/music')), false);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), '.nojekyll')), true);
  assert.equal(
    fs.existsSync(path.resolve(process.cwd(), 'music/wolrd30.mp3')),
    false,
    'Typo music/wolrd30.mp3 should remain renamed to music/world30.mp3'
  );
  for (let i = 0; i < 30; i++) {
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

test('INITIAL_UNLOCKED_SKIN_IDS unlocks all 30 worlds including all 29 studio MP3 worlds', () => {
  assert.equal(INITIAL_UNLOCKED_SKIN_IDS.length, 30);
  for (let i = 0; i < 30; i++) {
    assert.equal(
      INITIAL_UNLOCKED_SKIN_IDS.includes(SKINS[i].id),
      true,
      `Expected World ${i + 1} (${SKINS[i].id}) to be unlocked initially`
    );
  }
});

test('getTrackTrimGain normalizes loudness across all 30 MP3 tracks and getSpectrumSnapshot is safe in Node', () => {
  for (let i = 0; i < 30; i++) {
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

test('Classic skin progression levels up per skin threshold, discards massive sweep overflow, and transitions every 4-5 levels', () => {
  for (const sk of SKINS) {
    assert.ok(sk.squaresPerLevel >= 16 && sk.squaresPerLevel <= 22, `${sk.id} squaresPerLevel out of 16..22`);
    assert.ok(sk.levelsPerSkin === 4 || sk.levelsPerSkin === 5, `${sk.id} levelsPerSkin must be 4 or 5`);
    assert.ok(sk.squaresToAdvance >= 64 && sk.squaresToAdvance <= 90, `${sk.id} quota out of range`);
  }

  const skin = SKINS[0]; // 16 squares/level, 4 levels/skin
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

  // Subsequent sweeps advance level 2 -> 3 -> 4 -> 5, transitioning skin only on the 4th level-up!
  assert.equal(advanceSweepStageProgression(prog, 16, skin, true).shouldTransitionSkin, false);
  assert.equal(prog.level, 3);
  assert.equal(advanceSweepStageProgression(prog, 16, skin, true).shouldTransitionSkin, false);
  assert.equal(prog.level, 4);
  const step4 = advanceSweepStageProgression(prog, 16, skin, true);
  assert.equal(step4.leveledUp, true);
  assert.equal(step4.shouldTransitionSkin, true);
  assert.equal(prog.level, 5);
  assert.equal(prog.skinLevelsCleared, 4);
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

test('All 30 skins avoid pure black/white, preserve readable sky luminance, and configure valid stroke/fill variants', () => {
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

test('pickRandomSkinIndex and shuffled skin deck avoid back-to-back repeats and cover all 30 worlds', () => {
  for (let i = 0; i < 30; i++) {
    const picked = pickRandomSkinIndex(undefined, i);
    assert.notEqual(picked, i);
    assert.ok(picked >= 0 && picked < SKINS.length);
  }

  const deck = createShuffledSkinDeck(SKINS.length, 0);
  assert.equal(deck.length, 30);
  assert.notEqual(deck[0], 0);
  assert.equal(new Set(deck).size, 30);

  // Advancing through basic visits all 30 stages then marks completed
  let curDeck = deck;
  let pos = 0;
  for (let step = 1; step < 30; step++) {
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




