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

export type LegacyTrainingLoadTimelinePoint = {
  date: string;
  ideal_tss?: number | null;
  scheduled_tss?: number | null;
  actual_tss?: number | null;
  adherence_score?: number | null;
  boundary_state?: "safe" | "caution" | "exceeded";
  boundary_reasons?: string[];
};

export type TrainingLoadTimelinePointWithLegacyAliases = TrainingLoadTimelinePoint & {
  ideal_tss: number;
  scheduled_tss: number;
  actual_tss: number;
};

type TrainingLoadTimelineInputPoint = {
  date: string;
  recommended_load_tss?: number | null;
  scheduled_load_tss?: number | null;
  completed_load_tss?: number | null;
  ideal_tss?: number | null;
  scheduled_tss?: number | null;
  actual_tss?: number | null;
  adherence_score?: number | null;
  boundary_state?: "safe" | "caution" | "exceeded";
  boundary_reasons?: string[];
  source?: TrainingLoadTimelinePoint["source"];
};

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
): TrainingLoadTimelinePointWithLegacyAliases {
  const recommendedLoad = roundLoad(point.recommended_load_tss ?? point.ideal_tss);
  const scheduledLoad = roundLoad(point.scheduled_load_tss ?? point.scheduled_tss);
  const completedLoad = roundLoad(point.completed_load_tss ?? point.actual_tss);

  return {
    date: point.date,
    recommended_load_tss: recommendedLoad,
    scheduled_load_tss: scheduledLoad,
    completed_load_tss: completedLoad,
    adherence_score: roundLoad(point.adherence_score),
    boundary_state: point.boundary_state,
    boundary_reasons: point.boundary_reasons,
    source: point.source,
    ideal_tss: recommendedLoad,
    scheduled_tss: scheduledLoad,
    actual_tss: completedLoad,
  };
}

export function withLegacyTrainingLoadAliases(
  point: TrainingLoadTimelinePoint,
): TrainingLoadTimelinePointWithLegacyAliases {
  return normalizeTrainingLoadTimelinePoint({
    ...point,
    ideal_tss: point.recommended_load_tss,
    scheduled_tss: point.scheduled_load_tss,
    actual_tss: point.completed_load_tss,
  });
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
