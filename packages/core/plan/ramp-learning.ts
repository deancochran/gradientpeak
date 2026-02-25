export type RampRateLearningConfidence = "low" | "medium" | "high";

export interface RampLearningActivityInput {
  occurred_at?: string;
  start_time?: string;
  date?: string;
  tss?: number | null;
}

export interface LearnedRampRateResult {
  maxSafeRampRate: number;
  confidence: RampRateLearningConfidence;
}

const DEFAULT_RAMP_CAP = 40;
const MIN_RAMP_CAP = 30;
const MAX_RAMP_CAP = 70;
const MIN_WEEKS_FOR_LEARNING = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseActivityDate(activity: RampLearningActivityInput): Date | null {
  const candidate =
    activity.occurred_at ?? activity.start_time ?? activity.date;
  if (!candidate) return null;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getIsoWeekStart(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay();
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + deltaToMonday);
  return utc.toISOString().split("T")[0] ?? "";
}

function percentileNearestRank(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = clamp(rank - 1, 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

/**
 * Learn a personalized weekly ramp cap from historical activity TSS.
 *
 * - Groups activities by ISO week (Monday start)
 * - Computes positive week-over-week TSS ramps
 * - Uses p75 of positive ramps and clamps to [30, 70]
 * - Falls back to 40 with low confidence for sparse data
 */
export function learnIndividualRampRate(
  activities: RampLearningActivityInput[],
): LearnedRampRateResult {
  const weeklyTss = new Map<string, number>();

  for (const activity of activities) {
    const date = parseActivityDate(activity);
    if (!date) continue;

    const weekKey = getIsoWeekStart(date);
    const tss = Math.max(0, activity.tss ?? 0);
    weeklyTss.set(weekKey, (weeklyTss.get(weekKey) ?? 0) + tss);
  }

  const orderedWeeks = [...weeklyTss.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  if (orderedWeeks.length < MIN_WEEKS_FOR_LEARNING) {
    return { maxSafeRampRate: DEFAULT_RAMP_CAP, confidence: "low" };
  }

  const ramps: number[] = [];
  for (let i = 1; i < orderedWeeks.length; i += 1) {
    const previous = orderedWeeks[i - 1]?.[1] ?? 0;
    const current = orderedWeeks[i]?.[1] ?? 0;
    const delta = current - previous;
    if (delta > 0) ramps.push(delta);
  }

  if (ramps.length === 0) {
    return { maxSafeRampRate: DEFAULT_RAMP_CAP, confidence: "low" };
  }

  const learnedRamp = clamp(
    Math.round(percentileNearestRank(ramps, 75)),
    MIN_RAMP_CAP,
    MAX_RAMP_CAP,
  );

  const confidence: RampRateLearningConfidence =
    ramps.length < 15 ? "low" : ramps.length <= 30 ? "medium" : "high";

  return {
    maxSafeRampRate: learnedRamp,
    confidence,
  };
}
