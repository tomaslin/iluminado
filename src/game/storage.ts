import { getPreviousDateKey } from './daily';
import { ALL_SHIFT_TYPES, VALID_SHIFT_SET } from './shifts';
import { INITIAL_UNLOCKED_SKIN_IDS, SKINS } from './skins';
import { DailyCompletionRecord, SavedProgress, ShiftType } from './types';

const STORAGE_KEY = 'iluminado_progress_v2';
const VALID_SKIN_IDS = new Set(SKINS.map((s) => s.id));

function createDefaultProgress(): SavedProgress {
  return {
    highScores: {},
    unlockedSkins: [...INITIAL_UNLOCKED_SKIN_IDS],
    skinEditPlaylist: SKINS.slice(0, 6).map((s) => s.id),
    muted: false,
    hapticsEnabled: true,
    dailyHistory: {},
    dailyStreak: 0,
    lastDailyCompletedDate: null,
    timeAttackSplits: {},
    enabledShifts: [...ALL_SHIFT_TYPES],
  };
}

export function sanitizeTimeAttackSplits(
  raw: unknown
): Record<string, number[]> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, number[]> = {};
  for (const [key, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const cleaned = arr
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
      .map((v) => Math.round(v));
    if (cleaned.length > 0) {
      result[key] = cleaned;
    }
  }
  return result;
}

const NEW_V2_SHIFTS: ShiftType[] = [
  'corner_edge_block',
  'bottom_edge_block',
  'side_edge_ledge',
  'brick_2x1',
  'brick_3x2',
  'brick_tetromino',
  'three_color_mode',
];

const NEW_V3_SHIFTS: ShiftType[] = [
  'brick_3x1',
  'brick_blocked',
];

const NEW_V4_SHIFTS: ShiftType[] = [
  'flow_direction',
  'brick_peggle',
];

export const NEW_V5_SHIFTS: ShiftType[] = [
  'cyclotron_flow',
  'portal_wrap',
  'reverse_sweep',
  'staircase_terraces',
  'center_spire',
  'dome_pedestal',
  'spring_bounce',
  'conveyor_floor',
  'twin_sweep',
  'crumble_blocks',
  'brick_l_trio',
  'chameleon_rotate',
  'prism_wild_bricks',
  'mirror_flip',
  'vortex_swirl',
];

function migrateEnabledShifts(
  parsed: Partial<SavedProgress> & { shiftCatalogVersion?: number }
): ShiftType[] {
  if (!Array.isArray(parsed.enabledShifts)) {
    return [...ALL_SHIFT_TYPES];
  }
  const filtered = Array.from(
    new Set(
      parsed.enabledShifts.filter((s): s is ShiftType =>
        VALID_SHIFT_SET.has(s as ShiftType)
      )
    )
  );
  const ver = parsed.shiftCatalogVersion ?? 1;
  if (ver >= 5 || filtered.length === 0) {
    return filtered;
  }
  const merged = new Set<ShiftType>(filtered);
  if (ver < 2) {
    for (const s of NEW_V2_SHIFTS) {
      merged.add(s);
    }
  }
  if (ver < 3) {
    for (const s of NEW_V3_SHIFTS) {
      merged.add(s);
    }
  }
  if (ver < 4) {
    for (const s of NEW_V4_SHIFTS) {
      merged.add(s);
    }
  }
  for (const s of NEW_V5_SHIFTS) {
    merged.add(s);
  }
  return Array.from(merged);
}

export function loadProgress(): SavedProgress {
  const defaults = createDefaultProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<SavedProgress> & {
      shiftCatalogVersion?: number;
    };
    const unlockedSet = new Set<string>(INITIAL_UNLOCKED_SKIN_IDS);
    if (Array.isArray(parsed.unlockedSkins)) {
      for (const id of parsed.unlockedSkins) {
        if (VALID_SKIN_IDS.has(id)) unlockedSet.add(id);
      }
    }
    const filteredPlaylist = Array.isArray(parsed.skinEditPlaylist)
      ? parsed.skinEditPlaylist.filter((id) => VALID_SKIN_IDS.has(id))
      : [];

    const dailyHistory: Record<string, DailyCompletionRecord> =
      parsed.dailyHistory && typeof parsed.dailyHistory === 'object'
        ? parsed.dailyHistory
        : {};

    return {
      highScores: parsed.highScores ?? {},
      unlockedSkins: Array.from(unlockedSet),
      skinEditPlaylist:
        filteredPlaylist.length > 0 ? filteredPlaylist : defaults.skinEditPlaylist,
      muted: Boolean(parsed.muted),
      hapticsEnabled: parsed.hapticsEnabled !== false,
      dailyHistory,
      dailyStreak:
        typeof parsed.dailyStreak === 'number' && parsed.dailyStreak >= 0
          ? parsed.dailyStreak
          : 0,
      lastDailyCompletedDate:
        typeof parsed.lastDailyCompletedDate === 'string'
          ? parsed.lastDailyCompletedDate
          : null,
      timeAttackSplits: sanitizeTimeAttackSplits(parsed.timeAttackSplits),
      enabledShifts: migrateEnabledShifts(parsed),
    };
  } catch {
    return defaults;
  }
}

export function saveProgress(progress: SavedProgress): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...progress, shiftCatalogVersion: 5 })
    );
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function isDailyCompletedForDate(
  progress: SavedProgress,
  dateKey: string
): boolean {
  return Boolean(progress.dailyHistory[dateKey]?.completed);
}

export function getEffectiveDailyStreak(
  progress: SavedProgress,
  todayKey: string
): number {
  if (!progress.lastDailyCompletedDate || progress.dailyStreak <= 0) return 0;
  const yesterdayKey = getPreviousDateKey(todayKey);
  if (
    progress.lastDailyCompletedDate === todayKey ||
    progress.lastDailyCompletedDate === yesterdayKey
  ) {
    return progress.dailyStreak;
  }
  return 0;
}

export function applyDailyResultToProgress(
  prev: SavedProgress,
  params: {
    dateKey: string;
    missionTitle: string;
    score: number;
    timeElapsedSec: number;
    completed: boolean;
    unlockSkinId?: string;
  }
): SavedProgress {
  const { dateKey, missionTitle, score, timeElapsedSec, completed, unlockSkinId } =
    params;
  const existing = prev.dailyHistory[dateKey];
  const roundedScore = Math.max(0, Math.round(score));
  const elapsedRounded = Math.max(1, Math.round(timeElapsedSec));

  const nextCompleted = Boolean(existing?.completed || completed);
  const nextClearTime =
    completed && !existing?.completed
      ? elapsedRounded
      : existing?.clearTimeSec ?? (completed ? elapsedRounded : null);

  let nextStreak = prev.dailyStreak;
  let nextLastDate = prev.lastDailyCompletedDate;
  if (completed && !existing?.completed) {
    const yesterdayKey = getPreviousDateKey(dateKey);
    if (prev.lastDailyCompletedDate === dateKey) {
      nextStreak = Math.max(1, prev.dailyStreak);
    } else if (prev.lastDailyCompletedDate === yesterdayKey) {
      nextStreak = prev.dailyStreak + 1;
    } else {
      nextStreak = 1;
    }
    nextLastDate = dateKey;
  }

  const unlockedSet = new Set(prev.unlockedSkins);
  if (completed && unlockSkinId && VALID_SKIN_IDS.has(unlockSkinId)) {
    unlockedSet.add(unlockSkinId);
  }

  const nextRecord: DailyCompletionRecord = {
    dateKey,
    completed: nextCompleted,
    bestScore: Math.max(existing?.bestScore ?? 0, roundedScore),
    clearTimeSec: nextClearTime,
    attempts: (existing?.attempts ?? 0) + 1,
    missionTitle,
  };

  const nextHistory: Record<string, DailyCompletionRecord> = {
    ...prev.dailyHistory,
    [dateKey]: nextRecord,
  };

  return {
    ...prev,
    highScores: {
      ...prev.highScores,
      daily: Math.max(prev.highScores.daily ?? 0, roundedScore),
    },
    unlockedSkins: Array.from(unlockedSet),
    dailyHistory: nextHistory,
    dailyStreak: nextStreak,
    lastDailyCompletedDate: nextLastDate,
  };
}

export function applyTimeAttackSplitsToProgress(
  prev: SavedProgress,
  durationSec: 60 | 180 | 300,
  finalScore: number,
  splits: number[]
): SavedProgress {
  const modeKey = `time_attack_${durationSec}`;
  const prevBest = prev.highScores[modeKey] ?? 0;
  const roundedScore = Math.max(0, Math.round(finalScore));
  const existingSplits = prev.timeAttackSplits?.[String(durationSec)];
  const shouldUpdateSplits =
    splits.length > 0 && (roundedScore >= prevBest || !existingSplits || existingSplits.length === 0);

  return {
    ...prev,
    highScores: {
      ...prev.highScores,
      [modeKey]: Math.max(prevBest, roundedScore),
    },
    timeAttackSplits: shouldUpdateSplits
      ? {
          ...(prev.timeAttackSplits ?? {}),
          [String(durationSec)]: splits.map((v) => Math.max(0, Math.round(v))),
        }
      : prev.timeAttackSplits ?? {},
  };
}
