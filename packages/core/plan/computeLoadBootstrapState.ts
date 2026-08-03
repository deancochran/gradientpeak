import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "../load/replay";
import { resolveNoHistoryStartingPrior } from "./calibration-constants";
import { addDaysDateOnlyUtc, formatDateOnlyUtc } from "./dateOnlyUtc";

const DEFAULT_BOOTSTRAP_WINDOW_DAYS = 90;
const DEFAULT_STALE_AFTER_DAYS = 10;

export interface LoadBootstrapActivitySignal {
  occurred_at: string;
  load?: number | null;
  duration_seconds?: number | null;
}

export interface LoadBootstrapConfidenceMetadata {
  confidence: number;
  history_state: "none" | "sparse" | "rich";
  window_days: number;
  active_days: number;
  zero_fill_days: number;
  days_since_last_activity: number | null;
  rationale_codes: string[];
}

export interface LoadBootstrapState {
  starting_longTermLoad: number;
  starting_recentLoad: number;
  starting_loadBalance: number;
  confidence: LoadBootstrapConfidenceMetadata;
}

export interface ComputeLoadBootstrapStateInput {
  activities?: LoadBootstrapActivitySignal[];
  as_of?: string;
  window_days?: number;
  stale_after_days?: number;
  profile_age?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function daysBetween(a: Date, b: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / dayMs);
}

function toDailyLoad(activity: LoadBootstrapActivitySignal): number {
  if (typeof activity.load === "number" && Number.isFinite(activity.load)) {
    return Math.max(0, activity.load);
  }

  const durationSeconds = activity.duration_seconds ?? 0;
  return Math.max(0, (durationSeconds / 3600) * 45);
}

function deriveHistoryState(activeDays: number): "none" | "sparse" | "rich" {
  if (activeDays === 0) {
    return "none";
  }

  if (activeDays < 20) {
    return "sparse";
  }

  return "rich";
}

export function computeLoadBootstrapState(
  input: ComputeLoadBootstrapStateInput,
): LoadBootstrapState {
  const safeAsOf = toDate(input.as_of) ?? new Date();
  const asOfDate = formatDateOnlyUtc(safeAsOf);
  const windowDays = Math.max(7, Math.round(input.window_days ?? DEFAULT_BOOTSTRAP_WINDOW_DAYS));
  const staleAfterDays = Math.max(
    0,
    Math.round(input.stale_after_days ?? DEFAULT_STALE_AFTER_DAYS),
  );
  const windowStartDate = addDaysDateOnlyUtc(asOfDate, -(windowDays - 1));

  const dailyLoadByDate = new Map<string, number>();
  let latestActivityDate: Date | null = null;

  for (const activity of input.activities ?? []) {
    const occurredAt = toDate(activity.occurred_at);
    if (!occurredAt) {
      continue;
    }

    const occurredDate = formatDateOnlyUtc(occurredAt);
    if (occurredDate < windowStartDate || occurredDate > asOfDate) {
      continue;
    }

    const currentLoad = dailyLoadByDate.get(occurredDate) ?? 0;
    dailyLoadByDate.set(occurredDate, currentLoad + toDailyLoad(activity));

    if (!latestActivityDate || occurredAt > latestActivityDate) {
      latestActivityDate = occurredAt;
    }
  }

  const normalizedDailyLoad = buildDailyLoadByDateSeries({
    startDate: windowStartDate,
    endDate: asOfDate,
    loadByDate: dailyLoadByDate,
  });

  const activeDays = normalizedDailyLoad.filter((entry) => entry.load > 0).length;
  const zeroFillDays = windowDays - activeDays;
  const historyState = deriveHistoryState(activeDays);

  const daysSinceLastActivity =
    latestActivityDate === null ? null : daysBetween(safeAsOf, latestActivityDate);

  if (activeDays === 0) {
    const prior = resolveNoHistoryStartingPrior({ age: input.profile_age });
    return {
      starting_longTermLoad: prior.starting_longTermLoad,
      starting_recentLoad: prior.starting_longTermLoad,
      starting_loadBalance: 0,
      confidence: {
        confidence: 0,
        history_state: "none",
        window_days: windowDays,
        active_days: 0,
        zero_fill_days: windowDays,
        days_since_last_activity: null,
        rationale_codes: ["no_recent_activity", ...prior.rationale_codes],
      },
    };
  }

  const loadSeries = replayCommonLoadFitnessByDate({
    dailyLoad: normalizedDailyLoad,
    initialLongTermLoad: 0,
    initialRecentLoad: 0,
    userAge: input.profile_age,
  });
  const lastPoint = loadSeries[loadSeries.length - 1];
  const rawLongTermLoad = lastPoint?.longTermLoad ?? 0;
  const rawRecentLoad = lastPoint?.recentLoad ?? 0;

  const staleDays = Math.max(0, (daysSinceLastActivity ?? 0) - staleAfterDays);
  const longTermLoadDecay = staleDays > 0 ? Math.exp(-staleDays / 42) : 1;
  const recentLoadDecay = staleDays > 0 ? Math.exp(-staleDays / 14) : 1;

  const startingLongTermLoad = round1(rawLongTermLoad * longTermLoadDecay);
  const startingRecentLoad = round1(rawRecentLoad * recentLoadDecay);
  const startingLoadBalance = round1(startingLongTermLoad - startingRecentLoad);

  const coverageScore = clamp(activeDays / windowDays, 0, 1);
  const recencyScore =
    daysSinceLastActivity === null ? 0 : clamp(1 - daysSinceLastActivity / 45, 0, 1);
  const confidence = round3(coverageScore * 0.6 + recencyScore * 0.4);

  const rationaleCodes = [
    "daily_zero_fill_bootstrap",
    `history_${historyState}`,
    ...(staleDays > 0 ? ["stale_history_decay_applied"] : []),
  ];

  return {
    starting_longTermLoad: startingLongTermLoad,
    starting_recentLoad: startingRecentLoad,
    starting_loadBalance: startingLoadBalance,
    confidence: {
      confidence,
      history_state: historyState,
      window_days: windowDays,
      active_days: activeDays,
      zero_fill_days: zeroFillDays,
      days_since_last_activity: daysSinceLastActivity,
      rationale_codes: rationaleCodes,
    },
  };
}
