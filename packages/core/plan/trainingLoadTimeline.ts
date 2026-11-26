import { z } from "zod";

export type TrainingLoadSource =
  | "goal_projection"
  | "baseline"
  | "fallback"
  | "calendar"
  | "recorded_activity";

export const trainingLoadValueStatusSchema = z.enum([
  "complete",
  "partial",
  "known_zero",
  "unavailable",
]);
export type TrainingLoadValueStatus = z.infer<typeof trainingLoadValueStatusSchema>;

export type TrainingLoadTimelinePoint = {
  date: string;
  /** Null is unavailable; zero is valid only with an explicit or inferred known-zero status. */
  recommended_common_load: number | null;
  recommended_common_load_status: TrainingLoadValueStatus;
  scheduled_common_load: number | null;
  scheduled_common_load_status: TrainingLoadValueStatus;
  completed_common_load: number | null;
  completed_common_load_status: TrainingLoadValueStatus;
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
    recommended_common_load_status: trainingLoadValueStatusSchema.optional(),
    scheduled_common_load: z.number().finite().nonnegative().nullable().optional(),
    scheduled_common_load_status: trainingLoadValueStatusSchema.optional(),
    completed_common_load: z.number().finite().nonnegative().nullable().optional(),
    completed_common_load_status: trainingLoadValueStatusSchema.optional(),
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
  .strict()
  .superRefine((point, context) => {
    const validate = (
      value: number | null | undefined,
      status: TrainingLoadValueStatus | undefined,
      path: "recommended_common_load" | "scheduled_common_load" | "completed_common_load",
    ) => {
      if (status === undefined) return;
      const valid =
        status === "unavailable" || status === "partial"
          ? value === null || value === undefined
          : status === "known_zero"
            ? value === 0
            : typeof value === "number";
      if (!valid) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: `Load value does not match ${status} status`,
        });
      }
    };
    validate(
      point.recommended_common_load,
      point.recommended_common_load_status,
      "recommended_common_load",
    );
    validate(
      point.scheduled_common_load,
      point.scheduled_common_load_status,
      "scheduled_common_load",
    );
    validate(
      point.completed_common_load,
      point.completed_common_load_status,
      "completed_common_load",
    );
  });

export type TrainingLoadTimelineInputPoint = z.input<typeof trainingLoadTimelineInputPointSchema>;

export type TrainingLoadWeek = {
  week_start: string;
  week_end: string;
  recommended_common_load: number | null;
  recommended_common_load_status: TrainingLoadValueStatus;
  scheduled_common_load: number | null;
  scheduled_common_load_status: TrainingLoadValueStatus;
  completed_common_load: number | null;
  completed_common_load_status: TrainingLoadValueStatus;
};

function roundLoad(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function normalizePlannedLoad(
  value: number | null | undefined,
  status: TrainingLoadValueStatus | undefined,
): { load: number | null; status: TrainingLoadValueStatus } {
  const load = roundLoad(value);
  if (status === "partial") return { load: null, status };
  if (status !== undefined) return { load, status };
  if (load === null) return { load: null, status: "unavailable" };
  return { load, status: load === 0 ? "known_zero" : "complete" };
}

function aggregatePlannedLoads(
  values: readonly { load: number | null; status: TrainingLoadValueStatus }[],
): { load: number | null; status: TrainingLoadValueStatus } {
  if (values.some((value) => value.status === "partial")) {
    return { load: null, status: "partial" };
  }
  const known = values.filter(
    (value): value is { load: number; status: TrainingLoadValueStatus } => value.load !== null,
  );
  if (known.length === 0) return { load: null, status: "unavailable" };
  const load = roundLoad(known.reduce((sum, value) => sum + value.load, 0));
  if (load === null) return { load: null, status: "unavailable" };
  if (known.length !== values.length || values.some((value) => value.status === "unavailable")) {
    return { load: null, status: "partial" };
  }
  if (values.every((value) => value.status === "known_zero")) {
    return { load: 0, status: "known_zero" };
  }
  return { load, status: "complete" };
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
  const recommended = normalizePlannedLoad(
    parsed.recommended_common_load,
    parsed.recommended_common_load_status,
  );
  const scheduled = normalizePlannedLoad(
    parsed.scheduled_common_load,
    parsed.scheduled_common_load_status,
  );
  const completed = normalizePlannedLoad(
    parsed.completed_common_load,
    parsed.completed_common_load_status,
  );
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
    recommended_common_load: recommended.load,
    recommended_common_load_status: recommended.status,
    scheduled_common_load: scheduled.load,
    scheduled_common_load_status: scheduled.status,
    completed_common_load: completed.load,
    completed_common_load_status: completed.status,
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
      recommended: Array<{ load: number | null; status: TrainingLoadValueStatus }>;
      scheduled: Array<{ load: number | null; status: TrainingLoadValueStatus }>;
      completed: Array<{ load: number | null; status: TrainingLoadValueStatus }>;
    }
  >();

  for (const rawPoint of timeline) {
    const point = normalizeTrainingLoadTimelinePoint(rawPoint);
    const weekStart = getWeekStartDateKey(point.date);
    const bucket = buckets.get(weekStart) ?? { recommended: [], scheduled: [], completed: [] };
    bucket.recommended.push({
      load: point.recommended_common_load,
      status: point.recommended_common_load_status,
    });
    bucket.scheduled.push({
      load: point.scheduled_common_load,
      status: point.scheduled_common_load_status,
    });
    bucket.completed.push({
      load: point.completed_common_load,
      status: point.completed_common_load_status,
    });
    buckets.set(weekStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, bucket]) => {
      const recommended = aggregatePlannedLoads(bucket.recommended);
      const scheduled = aggregatePlannedLoads(bucket.scheduled);
      const completed = aggregatePlannedLoads(bucket.completed);
      return {
        week_start: weekStart,
        week_end: addDaysDateKey(weekStart, 6),
        recommended_common_load: recommended.load,
        recommended_common_load_status: recommended.status,
        scheduled_common_load: scheduled.load,
        scheduled_common_load_status: scheduled.status,
        completed_common_load: completed.load,
        completed_common_load_status: completed.status,
      };
    });
}
