import { z } from "zod";

export type TrainingLoadSource =
  | "goal_projection"
  | "baseline"
  | "fallback"
  | "calendar"
  | "recorded_activity";

export type TrainingLoadTimelinePoint = {
  date: string;
  /** A finite nonnegative value is known; null means the dimension is unavailable. */
  recommended_common_load: number | null;
  scheduled_common_load: number | null;
  completed_common_load: number | null;
  adherence_score?: number | null;
  boundary_state?: "safe" | "caution" | "exceeded";
  boundary_reasons?: string[];
  source?: {
    recommended?: TrainingLoadSource;
    scheduled?: TrainingLoadSource;
    completed?: TrainingLoadSource;
  };
};

export const trainingLoadTimelineInputPointSchema = z
  .object({
    date: z.string(),
    recommended_common_load: z.number().finite().nonnegative().nullable().optional(),
    scheduled_common_load: z.number().finite().nonnegative().nullable().optional(),
    completed_common_load: z.number().finite().nonnegative().nullable().optional(),
    adherence_score: z.number().finite().nullable().optional(),
    boundary_state: z.enum(["safe", "caution", "exceeded"]).optional(),
    boundary_reasons: z.array(z.string()).optional(),
    source: z
      .object({
        recommended: z
          .enum(["goal_projection", "baseline", "fallback", "calendar", "recorded_activity"])
          .optional(),
        scheduled: z
          .enum(["goal_projection", "baseline", "fallback", "calendar", "recorded_activity"])
          .optional(),
        completed: z
          .enum(["goal_projection", "baseline", "fallback", "calendar", "recorded_activity"])
          .optional(),
      })
      .optional(),
  })
  .strict();

export type TrainingLoadTimelineInputPoint = z.input<typeof trainingLoadTimelineInputPointSchema>;

export type TrainingLoadWeek = {
  week_start: string;
  week_end: string;
  recommended_common_load: number | null;
  scheduled_common_load: number | null;
  completed_common_load: number | null;
};

function roundLoad(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function sumAvailableLoads(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  const knownValues = values.filter((value): value is number => value !== null);
  return roundLoad(knownValues.reduce((sum, value) => sum + value, 0));
}

export function addDaysDateKey(dateKey: string, days: number) {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().split("T")[0] ?? dateKey;
}

export function getWeekStartDateKey(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return parsed.toISOString().split("T")[0] ?? dateKey;
}

export function normalizeTrainingLoadTimelinePoint(
  point: TrainingLoadTimelineInputPoint,
): TrainingLoadTimelinePoint {
  const parsed = trainingLoadTimelineInputPointSchema.parse(point);
  const recommendedLoad = roundLoad(parsed.recommended_common_load);
  const scheduledLoad = roundLoad(parsed.scheduled_common_load);
  const completedLoad = roundLoad(parsed.completed_common_load);
  const source = parsed.source
    ? {
        ...(parsed.source.recommended === undefined
          ? {}
          : { recommended: parsed.source.recommended }),
        ...(parsed.source.scheduled === undefined ? {} : { scheduled: parsed.source.scheduled }),
        ...(parsed.source.completed === undefined ? {} : { completed: parsed.source.completed }),
      }
    : undefined;

  return {
    date: parsed.date,
    recommended_common_load: recommendedLoad,
    scheduled_common_load: scheduledLoad,
    completed_common_load: completedLoad,
    adherence_score: roundLoad(parsed.adherence_score),
    ...(parsed.boundary_state === undefined ? {} : { boundary_state: parsed.boundary_state }),
    ...(parsed.boundary_reasons === undefined ? {} : { boundary_reasons: parsed.boundary_reasons }),
    ...(source === undefined ? {} : { source }),
  };
}

export function aggregateTrainingLoadTimelineByWeek(
  timeline: TrainingLoadTimelineInputPoint[],
): TrainingLoadWeek[] {
  const buckets = new Map<
    string,
    {
      recommended: Array<number | null>;
      scheduled: Array<number | null>;
      completed: Array<number | null>;
    }
  >();

  for (const rawPoint of timeline) {
    const point = normalizeTrainingLoadTimelinePoint(rawPoint);
    const weekStart = getWeekStartDateKey(point.date);
    const bucket = buckets.get(weekStart) ?? { recommended: [], scheduled: [], completed: [] };
    bucket.recommended.push(point.recommended_common_load);
    bucket.scheduled.push(point.scheduled_common_load);
    bucket.completed.push(point.completed_common_load);
    buckets.set(weekStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, bucket]) => ({
      week_start: weekStart,
      week_end: addDaysDateKey(weekStart, 6),
      recommended_common_load: sumAvailableLoads(bucket.recommended),
      scheduled_common_load: sumAvailableLoads(bucket.scheduled),
      completed_common_load: sumAvailableLoads(bucket.completed),
    }));
}
