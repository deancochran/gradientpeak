import { addDaysDateOnlyUtc, formatDateOnlyUtc, parseDateOnlyUtc } from "@repo/core";

type TimelineLoadPoint = {
  date: string;
  actual_tss: number;
  scheduled_tss: number;
  ideal_tss: number;
};

type GoalWithTargetDate = {
  target_date: string;
};

type ProjectionMicrocycleLoadContext = {
  week_start_date: string;
  recovery_active: boolean;
  demand_floor_tss: number | null;
};

export type WeeklyLoadComparison = {
  weeks: Array<{
    week_start: string;
    week_end: string;
    actual_load: number | null;
    scheduled_load: number | null;
    recommended_load: number | null;
    safety_cap?: number | null;
    is_recovery_week?: boolean;
    has_goal?: boolean;
  }>;
};

function getWeekStartDateOnly(date: string): string {
  const parsed = parseDateOnlyUtc(date);
  const day = parsed.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return formatDateOnlyUtc(parsed);
}

function roundedLoadOrNull(load: number): number | null {
  return load > 0 ? Math.round(load * 10) / 10 : null;
}

export function buildWeeklyLoadComparison(input: {
  timeline: TimelineLoadPoint[];
  goals: GoalWithTargetDate[];
  microcycles?: ProjectionMicrocycleLoadContext[] | null;
}): WeeklyLoadComparison | null {
  if (input.timeline.length === 0) {
    return null;
  }

  const microcycleByWeek = new Map(
    (input.microcycles ?? []).map((microcycle) => [microcycle.week_start_date, microcycle]),
  );
  const goalWeeks = new Set(input.goals.map((goal) => getWeekStartDateOnly(goal.target_date)));
  const buckets = new Map<
    string,
    { actual: number; scheduled: number; recommended: number; dates: string[] }
  >();

  for (const point of input.timeline) {
    const weekStart = getWeekStartDateOnly(point.date);
    const bucket = buckets.get(weekStart) ?? { actual: 0, scheduled: 0, recommended: 0, dates: [] };
    bucket.actual += point.actual_tss || 0;
    bucket.scheduled += point.scheduled_tss || 0;
    bucket.recommended += point.ideal_tss || 0;
    bucket.dates.push(point.date);
    buckets.set(weekStart, bucket);
  }

  return {
    weeks: [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([weekStart, bucket]) => {
        const microcycle = microcycleByWeek.get(weekStart);
        return {
          week_start: weekStart,
          week_end: addDaysDateOnlyUtc(weekStart, 6),
          actual_load: roundedLoadOrNull(bucket.actual),
          scheduled_load: roundedLoadOrNull(bucket.scheduled),
          recommended_load: roundedLoadOrNull(bucket.recommended),
          safety_cap: microcycle?.demand_floor_tss ?? null,
          is_recovery_week: microcycle?.recovery_active ?? false,
          has_goal: goalWeeks.has(weekStart),
        };
      }),
  };
}
