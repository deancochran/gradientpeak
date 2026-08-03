import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, parseDateOnlyUtc } from "../dateOnlyUtc";

export interface WeeklyLoadAggregationSession {
  scheduled_date: string;
  event_type: "planned" | "rest_day";
  estimated_load: number | null;
  estimated_load_status?: WeeklyLoadAggregationStatus;
  activity_plan_id?: string | null;
  title?: string;
}

export type WeeklyLoadAggregationStatus = "complete" | "partial" | "unavailable";

export interface AggregatedWeeklyPlannedLoad {
  week_index: number;
  week_start_date: string;
  week_end_date: string;
  planned_weekly_load: number | null;
  planned_weekly_load_status?: WeeklyLoadAggregationStatus;
  planned_session_count: number;
  rest_day_count: number;
  unresolved_session_count: number;
  session_titles: string[];
  session_load: number[];
}

export interface AggregateWeeklyPlannedLoadResult {
  weeks: AggregatedWeeklyPlannedLoad[];
  total_planned_load: number | null;
  total_planned_load_status: WeeklyLoadAggregationStatus;
  total_planned_sessions: number;
}

function getWeekStartDate(dateOnly: string): string {
  const date = parseDateOnlyUtc(dateOnly);
  const dayOfWeek = date.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offsetToMonday);
  return date.toISOString().slice(0, 10);
}

function inferWeeklyRestDayCount(week: {
  week_start_date: string;
  planned_session_dates: Set<string>;
}): number {
  let plannedDayCount = 0;

  for (let index = 0; index < 7; index += 1) {
    const date = addDaysDateOnlyUtc(week.week_start_date, index);
    if (week.planned_session_dates.has(date)) {
      plannedDayCount += 1;
    }
  }

  return 7 - plannedDayCount;
}

function resolveLoadAggregation(input: {
  plannedSessionCount: number;
  knownLoadCount: number;
  knownLoad: number;
  partialLoadCount: number;
  unresolvedSessionCount: number;
}): { load: number | null; status: WeeklyLoadAggregationStatus } {
  if (input.plannedSessionCount === 0) return { load: 0, status: "complete" };
  if (input.knownLoadCount === 0) return { load: null, status: "unavailable" };
  return {
    load: input.knownLoad,
    status:
      input.knownLoadCount === input.plannedSessionCount &&
      input.partialLoadCount === 0 &&
      input.unresolvedSessionCount === 0
        ? "complete"
        : "partial",
  };
}

type MutableAggregatedWeeklyPlannedLoad = Omit<
  AggregatedWeeklyPlannedLoad,
  "planned_weekly_load" | "planned_weekly_load_status"
> & {
  planned_weekly_load: number;
  known_load_count: number;
  partial_load_count: number;
};

function sessionLoadStatus(session: WeeklyLoadAggregationSession): WeeklyLoadAggregationStatus {
  if (session.estimated_load === null) return "unavailable";
  return session.estimated_load_status ?? "complete";
}

/**
 * Aggregates dated planned sessions into stable Monday-based weekly buckets.
 *
 * Empty gap weeks are preserved between the first and last scheduled session so later
 * comparison helpers can reason about week ordering and cumulative load without guessing.
 *
 * @param sessions - Materialized sessions with deterministic per-session Common Load
 * @returns Normalized weekly load series and whole-plan totals
 */
export function aggregateWeeklyPlannedLoad(
  sessions: ReadonlyArray<WeeklyLoadAggregationSession>,
): AggregateWeeklyPlannedLoadResult {
  if (sessions.length === 0) {
    return {
      weeks: [],
      total_planned_load: 0,
      total_planned_load_status: "complete",
      total_planned_sessions: 0,
    };
  }

  const weeksByStartDate = new Map<string, MutableAggregatedWeeklyPlannedLoad>();
  const plannedDatesByWeekStartDate = new Map<string, Set<string>>();
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
      planned_weekly_load: 0,
      planned_session_count: 0,
      rest_day_count: 0,
      unresolved_session_count: 0,
      known_load_count: 0,
      partial_load_count: 0,
      session_titles: [],
      session_load: [],
    };

    if (session.event_type === "planned") {
      existing.planned_session_count += 1;
      const loadStatus = sessionLoadStatus(session);
      if (session.estimated_load !== null && loadStatus !== "unavailable") {
        existing.planned_weekly_load += session.estimated_load;
        existing.known_load_count += 1;
        if (loadStatus === "partial") existing.partial_load_count += 1;
        existing.session_load.push(session.estimated_load);
      }
      const plannedDates = plannedDatesByWeekStartDate.get(weekStartDate) ?? new Set<string>();
      plannedDates.add(session.scheduled_date);
      plannedDatesByWeekStartDate.set(weekStartDate, plannedDates);
      if (session.title) {
        existing.session_titles.push(session.title);
      }
      if (!session.activity_plan_id || loadStatus !== "complete") {
        existing.unresolved_session_count += 1;
      }
    }

    weeksByStartDate.set(weekStartDate, existing);
  }

  const weekCount = diffDateOnlyUtcDays(firstWeekStartDate ?? "", lastWeekStartDate ?? "") / 7 + 1;

  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const weekStartDate = addDaysDateOnlyUtc(firstWeekStartDate ?? "", index * 7);
    const existing = weeksByStartDate.get(weekStartDate);
    const aggregation = resolveLoadAggregation({
      plannedSessionCount: existing ? existing.planned_session_count : 0,
      knownLoadCount: existing ? existing.known_load_count : 0,
      knownLoad: existing ? existing.planned_weekly_load : 0,
      partialLoadCount: existing ? existing.partial_load_count : 0,
      unresolvedSessionCount: existing ? existing.unresolved_session_count : 0,
    });

    return {
      week_index: index,
      week_start_date: weekStartDate,
      week_end_date: addDaysDateOnlyUtc(weekStartDate, 6),
      planned_weekly_load: aggregation.load,
      planned_weekly_load_status: aggregation.status,
      planned_session_count: existing ? existing.planned_session_count : 0,
      rest_day_count: inferWeeklyRestDayCount({
        week_start_date: weekStartDate,
        planned_session_dates: plannedDatesByWeekStartDate.get(weekStartDate) ?? new Set<string>(),
      }),
      unresolved_session_count: existing ? existing.unresolved_session_count : 0,
      session_titles: existing?.session_titles ?? [],
      session_load: existing?.session_load ?? [],
    } satisfies AggregatedWeeklyPlannedLoad;
  });

  const plannedSessions = sessions.filter((session) => session.event_type === "planned");
  const knownLoadSessions = plannedSessions.filter(
    (session) => session.estimated_load !== null && sessionLoadStatus(session) !== "unavailable",
  );
  let knownTotalLoad = 0;
  for (const session of knownLoadSessions) {
    if (session.estimated_load !== null) knownTotalLoad += session.estimated_load;
  }
  const totalAggregation = resolveLoadAggregation({
    plannedSessionCount: plannedSessions.length,
    knownLoadCount: knownLoadSessions.length,
    knownLoad: knownTotalLoad,
    partialLoadCount: plannedSessions.filter((session) => sessionLoadStatus(session) === "partial")
      .length,
    unresolvedSessionCount: plannedSessions.filter(
      (session) => !session.activity_plan_id || sessionLoadStatus(session) !== "complete",
    ).length,
  });

  return {
    weeks,
    total_planned_load: totalAggregation.load,
    total_planned_load_status: totalAggregation.status,
    total_planned_sessions: weeks.reduce((sum, week) => sum + week.planned_session_count, 0),
  };
}
