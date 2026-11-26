import { z } from "zod";
import type { ActivityDisplayModel } from "../contracts/read-projections";
import {
  addDaysDateOnlyUtc,
  formatDateOnlyInTimeZone,
  parseDateOnlyUtc,
} from "../plan/dateOnlyUtc";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { canonicalGoalObjectiveSchema } from "../schemas/goals/profile_goals";
import { formatDurationSeconds } from "../utils/fitness-inputs";
import { isValidIanaTimeZone, scheduledDateTimeToIsoInstant } from "../utils/schedule-date";

export const RECORDED_HISTORY_MAX_PAGES = 20;
export const RECORDED_HISTORY_PAGE_SIZE = 50;

export const recordedHistoryWindowSchema = z.object({
  timezone: z.string(),
  startDate: z.iso.date(),
  today: z.iso.date(),
  currentWeek: z.iso.date(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  weeks: z.array(z.iso.date()).length(12),
});
export type RecordedHistoryWindow = z.infer<typeof recordedHistoryWindowSchema>;

function monday(date: string) {
  const weekday = parseDateOnlyUtc(date).getUTCDay();
  return addDaysDateOnlyUtc(date, -((weekday + 6) % 7));
}

/** Last twelve athlete-local Monday weeks, through the supplied instant (inclusive). */
export function recordedHistoryWindow(
  now: string,
  timezone: string | null | undefined,
): RecordedHistoryWindow | null {
  if (!timezone || !isValidIanaTimeZone(timezone) || !Number.isFinite(Date.parse(now))) return null;
  try {
    const today = formatDateOnlyInTimeZone(new Date(now), timezone);
    const currentWeek = monday(today);
    const startDate = addDaysDateOnlyUtc(currentWeek, -77);
    return recordedHistoryWindowSchema.parse({
      timezone,
      today,
      currentWeek,
      startDate,
      startsAt: scheduledDateTimeToIsoInstant({
        scheduledDate: startDate,
        time: "00:00",
        timeZone: timezone,
      }),
      endsAt: new Date(now).toISOString(),
      weeks: Array.from({ length: 12 }, (_, index) => addDaysDateOnlyUtc(startDate, index * 7)),
    });
  } catch {
    return null;
  }
}

export const recordedGoalActivitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startedAt: z.iso.datetime({ offset: true }),
  category: canonicalActivityCategorySchema,
  distanceMeters: z.number().positive().finite().nullable(),
  elapsedSeconds: z.number().positive().finite().nullable(),
});
export type RecordedGoalActivity = z.infer<typeof recordedGoalActivitySchema>;
type ActivityInput = Pick<
  ActivityDisplayModel,
  "id" | "title" | "time" | "activityComposition" | "metrics"
>;

/** Only exact, available measurements; no active/moving-duration substitution. */
export function normalizeRecordedGoalActivities(
  items: readonly ActivityInput[],
): RecordedGoalActivity[] {
  const result: RecordedGoalActivity[] = [];
  for (const item of items) {
    if (
      item.activityComposition.kind !== "single" ||
      item.activityComposition.categories.length !== 1
    )
      continue;
    const metric = (key: "distance" | "elapsed_duration", unit: string) => {
      const value = item.metrics.find((candidate) => candidate.key === key);
      return value?.status === "available" &&
        value.unit === unit &&
        Number.isFinite(value.value) &&
        value.value > 0
        ? value.value
        : null;
    };
    const parsed = recordedGoalActivitySchema.safeParse({
      id: item.id,
      title: item.title,
      startedAt: item.time.startedAt,
      category: item.activityComposition.categories[0],
      distanceMeters: metric("distance", "meters"),
      elapsedSeconds: metric("elapsed_duration", "seconds"),
    });
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

export const recordedHistoryPointSchema = z.object({
  id: z.string(),
  date: z.iso.date(),
  value: z.number().finite().nonnegative().nullable(),
  activities: z.array(recordedGoalActivitySchema),
  inProgress: z.boolean(),
  lowerBound: z.boolean(),
});
export const recordedHistoryChartSchema = z.object({
  id: z.enum(["event_time", "distance", "elapsed", "sessions"]),
  unit: z.enum(["meters", "seconds", "sessions"]),
  target: z.number().positive().finite().nullable(),
  best: z.number().finite().nonnegative().nullable(),
  gap: z.number().finite().nonnegative().nullable(),
  points: z.array(recordedHistoryPointSchema),
});
export type RecordedHistoryChart = z.infer<typeof recordedHistoryChartSchema>;
export type RecordedHistoryPoint = z.infer<typeof recordedHistoryPointSchema>;
const inputSchema = z.object({
  objective: canonicalGoalObjectiveSchema,
  category: canonicalActivityCategorySchema,
  activities: z.array(recordedGoalActivitySchema).max(1000),
  window: recordedHistoryWindowSchema,
  complete: z.boolean(),
});
export const recordedHistoryVisualsSchema = z.object({
  charts: z.array(recordedHistoryChartSchema),
  complete: z.boolean(),
  targetDistanceMeters: z.number().positive().nullable(),
  targetWeeks: z.number().positive().nullable(),
});
export type RecordedHistoryVisuals = z.infer<typeof recordedHistoryVisualsSchema>;

/** Observations only: no achievement, streak, prediction, scaling, or summed completion verdict. */
export function buildRecordedHistoryVisuals(
  value: z.input<typeof inputSchema>,
): RecordedHistoryVisuals {
  const input = inputSchema.parse(value);
  const seen = new Set<string>();
  const activities = input.activities
    .filter((activity) => {
      if (
        seen.has(activity.id) ||
        activity.category !== input.category ||
        Date.parse(activity.startedAt) < Date.parse(input.window.startsAt) ||
        Date.parse(activity.startedAt) > Date.parse(input.window.endsAt)
      )
        return false;
      seen.add(activity.id);
      return true;
    })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
  const localDate = (activity: RecordedGoalActivity) =>
    formatDateOnlyInTimeZone(new Date(activity.startedAt), input.window.timezone);
  const chart = (
    id: RecordedHistoryChart["id"],
    unit: RecordedHistoryChart["unit"],
    target: number | null,
    rows: RecordedGoalActivity[],
    measure: (activity: RecordedGoalActivity) => number | null,
  ): RecordedHistoryChart => {
    const points = rows.map((activity) => ({
      id: activity.id,
      date: localDate(activity),
      value: measure(activity),
      activities: [activity],
      inProgress: false,
      lowerBound: false,
    }));
    const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
    const best = values.length
      ? id === "event_time"
        ? Math.min(...values)
        : Math.max(...values)
      : null;
    return {
      id,
      unit,
      target,
      best,
      gap:
        target !== null && best !== null
          ? Math.max(0, id === "event_time" ? best - target : target - best)
          : null,
      points,
    };
  };
  const charts: RecordedHistoryChart[] = [];
  const objective = input.objective;
  let targetDistanceMeters: number | null = null;
  let targetWeeks: number | null = null;
  if (objective.type === "event_performance" && objective.distance_m) {
    const distance = objective.distance_m;
    targetDistanceMeters = distance;
    const targetTime =
      objective.target_time_s ??
      (objective.target_speed_mps ? distance / objective.target_speed_mps : null);
    const target =
      targetTime !== null && Number.isFinite(targetTime) && targetTime > 0 ? targetTime : null;
    const comparable = activities.filter(
      (activity) =>
        activity.distanceMeters !== null &&
        Math.abs(activity.distanceMeters - distance) <=
          distance * 0.01 + Number.EPSILON * distance * 8,
    );
    charts.push(
      chart("event_time", "seconds", target, comparable, (activity) => activity.elapsedSeconds),
    );
  } else if (objective.type === "completion") {
    if (objective.distance_m)
      charts.push(
        chart(
          "distance",
          "meters",
          objective.distance_m,
          activities,
          (activity) => activity.distanceMeters,
        ),
      );
    if (objective.duration_s)
      charts.push(
        chart(
          "elapsed",
          "seconds",
          objective.duration_s,
          activities,
          (activity) => activity.elapsedSeconds,
        ),
      );
  } else if (objective.type === "consistency") {
    targetWeeks = objective.target_weeks ?? null;
    const buckets = new Map<string, RecordedGoalActivity[]>();
    for (const activity of activities) {
      const week = monday(localDate(activity));
      const bucket = buckets.get(week) ?? [];
      bucket.push(activity);
      buckets.set(week, bucket);
    }
    charts.push({
      id: "sessions",
      unit: "sessions",
      target: objective.target_sessions_per_week ?? null,
      best: null,
      gap:
        input.complete && objective.target_sessions_per_week !== undefined
          ? Math.max(
              0,
              objective.target_sessions_per_week -
                (buckets.get(input.window.currentWeek)?.length ?? 0),
            )
          : null,
      points: input.window.weeks.map((date) => {
        const rows = buckets.get(date) ?? [];
        return {
          id: date,
          date,
          value: rows.length || input.complete ? rows.length : null,
          activities: rows,
          inProgress: date === input.window.currentWeek,
          lowerBound: !input.complete,
        };
      }),
    });
  }
  return recordedHistoryVisualsSchema.parse({
    charts,
    complete: input.complete,
    targetDistanceMeters,
    targetWeeks,
  });
}

/** Missing cursor, failed page, or cap exhaustion cannot certify complete history. */
export function recordedHistoryPageState(input: {
  pageCount: number;
  hasMore: boolean;
  hasCursor: boolean;
  fetching: boolean;
  failed: boolean;
}) {
  const canContinue =
    input.hasMore && input.hasCursor && input.pageCount < RECORDED_HISTORY_MAX_PAGES;
  return {
    canContinue: canContinue && !input.failed,
    complete: input.pageCount > 0 && !input.hasMore && !input.fetching && !input.failed,
    state: input.failed
      ? input.pageCount
        ? "partial"
        : "error"
      : input.fetching || !input.pageCount || canContinue
        ? "loading"
        : input.hasMore
          ? "partial"
          : "ready",
  } satisfies {
    canContinue: boolean;
    complete: boolean;
    state: "partial" | "error" | "loading" | "ready";
  };
}

export function formatRecordedHistoryValue(
  value: number | null,
  unit: RecordedHistoryChart["unit"],
): string {
  if (value === null) return "Unavailable";
  if (unit === "meters") return `${Number((value / 1000).toFixed(3))} km`;
  if (unit === "seconds") return value === 0 ? "0 sec" : formatDurationSeconds(Math.round(value));
  return `${value} ${value === 1 ? "session" : "sessions"}`;
}

export function recordedHistoryChartTitle(id: RecordedHistoryChart["id"]) {
  return {
    event_time: "Recorded elapsed time",
    distance: "Recorded distance",
    elapsed: "Recorded elapsed duration",
    sessions: "Weekly recorded sessions",
  }[id];
}
