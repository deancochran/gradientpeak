import { z } from "zod";

export type TrainingLoadSource =
  | "goal_projection"
  | "baseline"
  | "fallback"
  | "calendar"
  | "recorded_activity";

export type TrainingLoadTimelinePoint = {
  date: string;
  recommended_load_tss: number;
  scheduled_load_tss: number;
  tentative_scheduled_load_tss: number;
  completed_load_tss: number;
  adherence_score?: number;
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
    recommended_load_tss: z.number().finite().nullable().optional(),
    scheduled_load_tss: z.number().finite().nullable().optional(),
    tentative_scheduled_load_tss: z.number().finite().nullable().optional(),
    completed_load_tss: z.number().finite().nullable().optional(),
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
  recommended_load_tss: number;
  scheduled_load_tss: number;
  completed_load_tss: number;
};

function roundLoad(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.round(Math.max(0, value ?? 0) * 10) / 10 : 0;
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
  const recommendedLoad = roundLoad(parsed.recommended_load_tss);
  const scheduledLoad = roundLoad(parsed.scheduled_load_tss);
  const tentativeScheduledLoad = roundLoad(parsed.tentative_scheduled_load_tss);
  const completedLoad = roundLoad(parsed.completed_load_tss);
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
    recommended_load_tss: recommendedLoad,
    scheduled_load_tss: scheduledLoad,
    tentative_scheduled_load_tss: tentativeScheduledLoad,
    completed_load_tss: completedLoad,
    adherence_score: roundLoad(parsed.adherence_score),
    ...(parsed.boundary_state === undefined ? {} : { boundary_state: parsed.boundary_state }),
    ...(parsed.boundary_reasons === undefined ? {} : { boundary_reasons: parsed.boundary_reasons }),
    ...(source === undefined ? {} : { source }),
  };
}

export function aggregateTrainingLoadTimelineByWeek(
  timeline: TrainingLoadTimelineInputPoint[],
): TrainingLoadWeek[] {
  const buckets = new Map<string, { recommended: number; scheduled: number; completed: number }>();

  for (const rawPoint of timeline) {
    const point = normalizeTrainingLoadTimelinePoint(rawPoint);
    const weekStart = getWeekStartDateKey(point.date);
    const bucket = buckets.get(weekStart) ?? { recommended: 0, scheduled: 0, completed: 0 };
    bucket.recommended += point.recommended_load_tss;
    bucket.scheduled += point.scheduled_load_tss;
    bucket.completed += point.completed_load_tss;
    buckets.set(weekStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, bucket]) => ({
      week_start: weekStart,
      week_end: addDaysDateKey(weekStart, 6),
      recommended_load_tss: roundLoad(bucket.recommended),
      scheduled_load_tss: roundLoad(bucket.scheduled),
      completed_load_tss: roundLoad(bucket.completed),
    }));
}
