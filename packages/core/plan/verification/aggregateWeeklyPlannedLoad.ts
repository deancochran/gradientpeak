import {
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  parseDateOnlyUtc,
} from "../dateOnlyUtc";

export interface WeeklyLoadAggregationSession {
  scheduled_date: string;
  event_type: "planned" | "rest_day";
  estimated_tss: number;
  activity_plan_id?: string | null;
  title?: string;
}

export interface AggregatedWeeklyPlannedLoad {
  week_index: number;
  week_start_date: string;
  week_end_date: string;
  planned_weekly_tss: number;
  planned_session_count: number;
  rest_day_count: number;
  unresolved_session_count: number;
  session_titles: string[];
  session_tss: number[];
}

export interface AggregateWeeklyPlannedLoadResult {
  weeks: AggregatedWeeklyPlannedLoad[];
  total_planned_tss: number;
  total_planned_sessions: number;
}

function getWeekStartDate(dateOnly: string): string {
  const date = parseDateOnlyUtc(dateOnly);
  const dayOfWeek = date.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offsetToMonday);
  return date.toISOString().slice(0, 10);
}

/**
 * Aggregates dated planned sessions into stable Monday-based weekly buckets.
 *
 * Empty gap weeks are preserved between the first and last scheduled session so later
 * comparison helpers can reason about week ordering and cumulative load without guessing.
 *
 * @param sessions - Materialized sessions with deterministic per-session TSS
 * @returns Normalized weekly load series and whole-plan totals
 */
export function aggregateWeeklyPlannedLoad(
  sessions: ReadonlyArray<WeeklyLoadAggregationSession>,
): AggregateWeeklyPlannedLoadResult {
  if (sessions.length === 0) {
    return {
      weeks: [],
      total_planned_tss: 0,
      total_planned_sessions: 0,
    };
  }

  const weeksByStartDate = new Map<string, AggregatedWeeklyPlannedLoad>();
  let firstWeekStartDate: string | null = null;
  let lastWeekStartDate: string | null = null;

  for (const session of sessions) {
    const weekStartDate = getWeekStartDate(session.scheduled_date);
    if (!firstWeekStartDate || weekStartDate < firstWeekStartDate) {
      firstWeekStartDate = weekStartDate;
    }
    if (!lastWeekStartDate || weekStartDate > lastWeekStartDate) {
      lastWeekStartDate = weekStartDate;
    }

    const existing = weeksByStartDate.get(weekStartDate) ?? {
      week_index: 0,
      week_start_date: weekStartDate,
      week_end_date: addDaysDateOnlyUtc(weekStartDate, 6),
      planned_weekly_tss: 0,
      planned_session_count: 0,
      rest_day_count: 0,
      unresolved_session_count: 0,
      session_titles: [],
      session_tss: [],
    };

    if (session.event_type === "rest_day") {
      existing.rest_day_count += 1;
    } else {
      existing.planned_session_count += 1;
      existing.planned_weekly_tss += session.estimated_tss;
      existing.session_tss.push(session.estimated_tss);
      if (session.title) {
        existing.session_titles.push(session.title);
      }
      if (!session.activity_plan_id) {
        existing.unresolved_session_count += 1;
      }
    }

    weeksByStartDate.set(weekStartDate, existing);
  }

  const weekCount =
    diffDateOnlyUtcDays(firstWeekStartDate ?? "", lastWeekStartDate ?? "") / 7 +
    1;

  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const weekStartDate = addDaysDateOnlyUtc(
      firstWeekStartDate ?? "",
      index * 7,
    );
    const existing = weeksByStartDate.get(weekStartDate);

    return {
      week_index: index,
      week_start_date: weekStartDate,
      week_end_date: addDaysDateOnlyUtc(weekStartDate, 6),
      planned_weekly_tss: existing?.planned_weekly_tss ?? 0,
      planned_session_count: existing?.planned_session_count ?? 0,
      rest_day_count: existing?.rest_day_count ?? 0,
      unresolved_session_count: existing?.unresolved_session_count ?? 0,
      session_titles: existing?.session_titles ?? [],
      session_tss: existing?.session_tss ?? [],
    } satisfies AggregatedWeeklyPlannedLoad;
  });

  return {
    weeks,
    total_planned_tss: weeks.reduce(
      (sum, week) => sum + week.planned_weekly_tss,
      0,
    ),
    total_planned_sessions: weeks.reduce(
      (sum, week) => sum + week.planned_session_count,
      0,
    ),
  };
}
