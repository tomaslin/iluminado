import { getPreviousDateKey } from './daily';
import { INITIAL_UNLOCKED_SKIN_IDS, SKINS } from './skins';
import { DailyCompletionRecord, SavedProgress } from './types';

const STORAGE_KEY = 'iluminado_progress_v2';
const LEGACY_STORAGE_KEY = 'monument_lumines_progress_v2';
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
  };
}

export function loadProgress(): SavedProgress {
  const defaults = createDefaultProgress();
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<SavedProgress>;
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
    };
  } catch {
    return defaults;
  }
}

export function saveProgress(progress: SavedProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
