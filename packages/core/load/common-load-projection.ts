import {
  COMMON_LOAD_HISTORY_LONG_TERM_DAYS,
  COMMON_LOAD_HISTORY_RECENT_DAYS,
} from "./common-load-history";

export const COMMON_LOAD_FORECAST_POLICY_VERSION = "common_load_forecast_v1" as const;
export const COMMON_LOAD_FORECAST_BASIS = "planned_forecast" as const;
const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_PROJECTION_DAYS = 366;

export type CommonLoadTrendBaseline = {
  date: string;
  longTermLoad: number;
  recentLoad: number;
};

export type CommonLoadTrendProjectionDay =
  | { date: string; state: "available"; load: number }
  | { date: string; state: "known_zero" }
  | { date: string; state: "unavailable"; reason: "partial" | "unavailable" };

export type CommonLoadTrendProjectionPoint = {
  date: string;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
};

export type CommonLoadTrendProjectionResult =
  | {
      status: "complete";
      basis: typeof COMMON_LOAD_FORECAST_BASIS;
      policyVersion: typeof COMMON_LOAD_FORECAST_POLICY_VERSION;
      points: CommonLoadTrendProjectionPoint[];
    }
  | {
      status: "partial";
      basis: typeof COMMON_LOAD_FORECAST_BASIS;
      policyVersion: typeof COMMON_LOAD_FORECAST_POLICY_VERSION;
      reason: "incomplete_load" | "projection_limit_reached";
      stoppedAt: string;
      points: CommonLoadTrendProjectionPoint[];
    }
  | {
      status: "unavailable";
      basis: typeof COMMON_LOAD_FORECAST_BASIS;
      policyVersion: typeof COMMON_LOAD_FORECAST_POLICY_VERSION;
      reason: "invalid_input" | "nonconsecutive_days";
      stoppedAt?: string;
      points: [];
    };

function isFiniteNonnegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function isCalendarDate(value: string) {
  const match = calendarDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const instant = new Date(Date.UTC(year, month - 1, day));
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

function addCalendarDay(date: string) {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

function baselinePoint(baseline: CommonLoadTrendBaseline): CommonLoadTrendProjectionPoint {
  return {
    date: baseline.date,
    longTermLoad: baseline.longTermLoad,
    recentLoad: baseline.recentLoad,
    loadBalance: baseline.longTermLoad - baseline.recentLoad,
  };
}

/**
 * Extends a validated common-Load baseline through consecutive planned days.
 * Unknown or partial days stop the projection; they are never replayed as zero.
 */
export function projectCommonLoadTrend(input: {
  baseline: CommonLoadTrendBaseline;
  days: readonly CommonLoadTrendProjectionDay[];
}): CommonLoadTrendProjectionResult {
  const resultIdentity = {
    basis: COMMON_LOAD_FORECAST_BASIS,
    policyVersion: COMMON_LOAD_FORECAST_POLICY_VERSION,
  };
  if (
    !isCalendarDate(input.baseline.date) ||
    !isFiniteNonnegative(input.baseline.longTermLoad) ||
    !isFiniteNonnegative(input.baseline.recentLoad)
  ) {
    return { status: "unavailable", ...resultIdentity, reason: "invalid_input", points: [] };
  }
  let expectedDate = addCalendarDay(input.baseline.date);
  let longTermLoad = input.baseline.longTermLoad;
  let recentLoad = input.baseline.recentLoad;
  const points: CommonLoadTrendProjectionPoint[] = [baselinePoint(input.baseline)];
  const longTermAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_LONG_TERM_DAYS);
  const recentAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_RECENT_DAYS);

  for (const [index, day] of input.days.entries()) {
    if (index >= MAX_PROJECTION_DAYS) {
      return {
        status: "partial",
        ...resultIdentity,
        reason: "projection_limit_reached",
        stoppedAt: day.date,
        points,
      };
    }
    if (!isCalendarDate(day.date)) {
      return {
        status: "unavailable",
        ...resultIdentity,
        reason: "invalid_input",
        stoppedAt: day.date,
        points: [],
      };
    }
    if (day.date !== expectedDate) {
      return {
        status: "unavailable",
        ...resultIdentity,
        reason: "nonconsecutive_days",
        stoppedAt: day.date,
        points: [],
      };
    }
    if (day.state === "unavailable") {
      return {
        status: "partial",
        ...resultIdentity,
        reason: "incomplete_load",
        stoppedAt: day.date,
        points,
      };
    }

    const load = day.state === "known_zero" ? 0 : day.load;
    if (!isFiniteNonnegative(load)) {
      return {
        status: "unavailable",
        ...resultIdentity,
        reason: "invalid_input",
        stoppedAt: day.date,
        points: [],
      };
    }
    longTermLoad += longTermAlpha * (load - longTermLoad);
    recentLoad += recentAlpha * (load - recentLoad);
    points.push({
      date: day.date,
      longTermLoad,
      recentLoad,
      loadBalance: longTermLoad - recentLoad,
    });
    expectedDate = addCalendarDay(day.date);
  }

  return { status: "complete", ...resultIdentity, points };
}
