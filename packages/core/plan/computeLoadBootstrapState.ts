import { calculateTrainingLoadSeries } from "../calculations";
import { addDaysDateOnlyUtc, formatDateOnlyUtc } from "./dateOnlyUtc";

const DEFAULT_BOOTSTRAP_WINDOW_DAYS = 90;
const DEFAULT_STALE_AFTER_DAYS = 10;

export interface LoadBootstrapActivitySignal {
  occurred_at: string;
  tss?: number | null;
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
  starting_ctl: number;
  starting_atl: number;
  starting_tsb: number;
  confidence: LoadBootstrapConfidenceMetadata;
}

export interface ComputeLoadBootstrapStateInput {
  activities?: LoadBootstrapActivitySignal[];
  as_of?: string;
  window_days?: number;
  stale_after_days?: number;
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

function toDailyTss(activity: LoadBootstrapActivitySignal): number {
  if (typeof activity.tss === "number" && Number.isFinite(activity.tss)) {
    return Math.max(0, activity.tss);
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
  const windowDays = Math.max(
    7,
    Math.round(input.window_days ?? DEFAULT_BOOTSTRAP_WINDOW_DAYS),
  );
  const staleAfterDays = Math.max(
    0,
    Math.round(input.stale_after_days ?? DEFAULT_STALE_AFTER_DAYS),
  );
  const windowStartDate = addDaysDateOnlyUtc(asOfDate, -(windowDays - 1));

  const dailyTssByDate = new Map<string, number>();
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

    const currentTss = dailyTssByDate.get(occurredDate) ?? 0;
    dailyTssByDate.set(occurredDate, currentTss + toDailyTss(activity));

    if (!latestActivityDate || occurredAt > latestActivityDate) {
      latestActivityDate = occurredAt;
    }
  }

  const normalizedDailyTss: number[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDaysDateOnlyUtc(windowStartDate, offset);
    normalizedDailyTss.push(dailyTssByDate.get(date) ?? 0);
  }

  const activeDays = normalizedDailyTss.filter((tss) => tss > 0).length;
  const zeroFillDays = windowDays - activeDays;
  const historyState = deriveHistoryState(activeDays);

  const daysSinceLastActivity =
    latestActivityDate === null
      ? null
      : daysBetween(safeAsOf, latestActivityDate);

  if (activeDays === 0) {
    return {
      starting_ctl: 0,
      starting_atl: 0,
      starting_tsb: 0,
      confidence: {
        confidence: 0,
        history_state: "none",
        window_days: windowDays,
        active_days: 0,
        zero_fill_days: windowDays,
        days_since_last_activity: null,
        rationale_codes: ["no_recent_activity"],
      },
    };
  }

  const loadSeries = calculateTrainingLoadSeries(normalizedDailyTss, 0, 0);
  const lastPoint = loadSeries[loadSeries.length - 1];
  const rawCtl = lastPoint?.ctl ?? 0;
  const rawAtl = lastPoint?.atl ?? 0;

  const staleDays = Math.max(0, (daysSinceLastActivity ?? 0) - staleAfterDays);
  const ctlDecay = staleDays > 0 ? Math.exp(-staleDays / 42) : 1;
  const atlDecay = staleDays > 0 ? Math.exp(-staleDays / 14) : 1;

  const startingCtl = round1(rawCtl * ctlDecay);
  const startingAtl = round1(rawAtl * atlDecay);
  const startingTsb = round1(startingCtl - startingAtl);

  const coverageScore = clamp(activeDays / windowDays, 0, 1);
  const recencyScore =
    daysSinceLastActivity === null
      ? 0
      : clamp(1 - daysSinceLastActivity / 45, 0, 1);
  const confidence = round3(coverageScore * 0.6 + recencyScore * 0.4);

  const rationaleCodes = [
    "daily_zero_fill_bootstrap",
    `history_${historyState}`,
    ...(staleDays > 0 ? ["stale_history_decay_applied"] : []),
  ];

  return {
    starting_ctl: startingCtl,
    starting_atl: startingAtl,
    starting_tsb: startingTsb,
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
