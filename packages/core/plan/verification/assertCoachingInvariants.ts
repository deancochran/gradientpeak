import type { AggregatedWeeklyPlannedLoad } from "./aggregateWeeklyPlannedLoad";

export type CoachingInvariantStatus = "pass" | "fail" | "not_applicable";

export interface CoachingInvariantCheck {
  id: "load_safety" | "ramp_rate" | "cadence" | "taper" | "recovery";
  status: CoachingInvariantStatus;
  message: string;
  details?: Record<string, number | string | boolean | null>;
}

export interface CoachingInvariantExpectations {
  cadence?: {
    target_sessions_per_week: number;
    allowed_deviation?: number;
  };
  ramp?: {
    max_increase_pct?: number;
    max_increase_load?: number;
  };
  taper?: {
    build_week_index: number;
    taper_week_index: number;
    minimum_drop_pct?: number;
  };
  recovery?: {
    goal_week_index: number;
    recovery_week_index: number;
    minimum_drop_pct?: number;
  };
}

export interface CoachingInvariantResult {
  passed: boolean;
  checks: CoachingInvariantCheck[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getWeek(
  weeks: ReadonlyArray<AggregatedWeeklyPlannedLoad>,
  index: number,
): AggregatedWeeklyPlannedLoad | null {
  return weeks[index] ?? null;
}

function loadStatus(week: AggregatedWeeklyPlannedLoad) {
  return (
    week.planned_weekly_load_status ??
    (week.planned_weekly_load === null ? "unavailable" : "complete")
  );
}

function hasCompleteLoad(
  week: AggregatedWeeklyPlannedLoad,
): week is AggregatedWeeklyPlannedLoad & { planned_weekly_load: number } {
  return loadStatus(week) === "complete" && week.planned_weekly_load !== null;
}

/**
 * Evaluates a minimum, reusable set of coaching invariants for weekly load series.
 *
 * The helper returns structured results instead of throwing so higher-level verification
 * tests can opt into strict or exploratory assertions while the surface area evolves.
 *
 * @param input - Weekly load series plus optional cadence, ramp, taper, and recovery expectations
 * @returns Structured invariant checks with pass/fail/not-applicable status
 */
export function assertCoachingInvariants(input: {
  weeklyLoads: ReadonlyArray<AggregatedWeeklyPlannedLoad>;
  expectations?: CoachingInvariantExpectations;
}): CoachingInvariantResult {
  const checks: CoachingInvariantCheck[] = [];

  const invalidWeek = input.weeklyLoads.find(
    (week) =>
      (week.planned_weekly_load !== null &&
        (!Number.isFinite(week.planned_weekly_load) || week.planned_weekly_load < 0)) ||
      week.planned_session_count < 0,
  );
  const incompleteWeek = input.weeklyLoads.find((week) => !hasCompleteLoad(week));
  checks.push(
    invalidWeek
      ? {
          id: "load_safety",
          status: "fail",
          message: `Week ${invalidWeek.week_start_date} has invalid planned load values.`,
          details: {
            week_start_date: invalidWeek.week_start_date,
            planned_weekly_load: invalidWeek.planned_weekly_load,
            planned_session_count: invalidWeek.planned_session_count,
          },
        }
      : incompleteWeek
        ? {
            id: "load_safety",
            status: "not_applicable",
            message: `Week ${incompleteWeek.week_start_date} has incomplete planned Load evidence.`,
            details: {
              week_start_date: incompleteWeek.week_start_date,
              planned_weekly_load: incompleteWeek.planned_weekly_load,
              planned_weekly_load_status: loadStatus(incompleteWeek),
            },
          }
        : {
            id: "load_safety",
            status: "pass",
            message: "All weekly load values are finite and non-negative.",
          },
  );

  const rampExpectation = input.expectations?.ramp ?? {};
  const maxIncreasePct = rampExpectation.max_increase_pct ?? 0.2;
  const maxIncreaseLoad = rampExpectation.max_increase_load ?? 30;
  const hasIncompleteRampEvidence = input.weeklyLoads.some((week) => !hasCompleteLoad(week));
  const rampViolation = hasIncompleteRampEvidence
    ? undefined
    : input.weeklyLoads.slice(1).find((week, index) => {
        const previous = input.weeklyLoads[index];
        if (!previous || !hasCompleteLoad(previous) || !hasCompleteLoad(week)) {
          return false;
        }
        const increaseLoad = week.planned_weekly_load - previous.planned_weekly_load;
        const increasePct =
          previous.planned_weekly_load <= 0
            ? week.planned_weekly_load > maxIncreaseLoad
              ? Infinity
              : 0
            : increaseLoad / previous.planned_weekly_load;

        return increaseLoad > maxIncreaseLoad && increasePct > maxIncreasePct;
      });
  checks.push(
    hasIncompleteRampEvidence
      ? {
          id: "ramp_rate",
          status: "not_applicable",
          message: "Ramp comparison requires complete weekly Load evidence.",
          details: {
            max_increase_pct: maxIncreasePct,
            max_increase_load: maxIncreaseLoad,
          },
        }
      : rampViolation
        ? {
            id: "ramp_rate",
            status: "fail",
            message: `Ramp rate exceeds limits at ${rampViolation.week_start_date}.`,
            details: {
              max_increase_pct: maxIncreasePct,
              max_increase_load: maxIncreaseLoad,
            },
          }
        : {
            id: "ramp_rate",
            status: "pass",
            message: "Weekly load progression stays inside the configured ramp limits.",
            details: {
              max_increase_pct: maxIncreasePct,
              max_increase_load: maxIncreaseLoad,
            },
          },
  );

  const cadenceExpectation = input.expectations?.cadence;
  if (!cadenceExpectation) {
    checks.push({
      id: "cadence",
      status: "not_applicable",
      message: "No cadence expectation was provided.",
    });
  } else {
    const allowedDeviation = cadenceExpectation.allowed_deviation ?? 1;
    const cadenceViolation = input.weeklyLoads.find(
      (week) =>
        Math.abs(week.planned_session_count - cadenceExpectation.target_sessions_per_week) >
        allowedDeviation,
    );
    checks.push(
      cadenceViolation
        ? {
            id: "cadence",
            status: "fail",
            message: `Session cadence drifts outside tolerance in ${cadenceViolation.week_start_date}.`,
            details: {
              target_sessions_per_week: cadenceExpectation.target_sessions_per_week,
              allowed_deviation: allowedDeviation,
              actual_sessions: cadenceViolation.planned_session_count,
            },
          }
        : {
            id: "cadence",
            status: "pass",
            message: "Weekly session cadence stays inside the configured band.",
            details: {
              target_sessions_per_week: cadenceExpectation.target_sessions_per_week,
              allowed_deviation: allowedDeviation,
            },
          },
    );
  }

  const taperExpectation = input.expectations?.taper;
  if (!taperExpectation) {
    checks.push({
      id: "taper",
      status: "not_applicable",
      message: "No taper expectation was provided.",
    });
  } else {
    const buildWeek = getWeek(input.weeklyLoads, taperExpectation.build_week_index);
    const taperWeek = getWeek(input.weeklyLoads, taperExpectation.taper_week_index);
    const minimumDropPct = taperExpectation.minimum_drop_pct ?? 0.08;
    if (!buildWeek || !taperWeek) {
      checks.push({
        id: "taper",
        status: "not_applicable",
        message: "Taper indices fall outside the available weekly load series.",
      });
    } else if (!hasCompleteLoad(buildWeek) || !hasCompleteLoad(taperWeek)) {
      checks.push({
        id: "taper",
        status: "not_applicable",
        message: "Taper comparison requires complete weekly Load evidence.",
      });
    } else {
      const requiredLoad = buildWeek.planned_weekly_load * (1 - minimumDropPct);
      const passed = taperWeek.planned_weekly_load <= requiredLoad;
      checks.push({
        id: "taper",
        status: passed ? "pass" : "fail",
        message: passed
          ? "Taper week load drops relative to the reference build week."
          : "Taper week load does not drop enough relative to the reference build week.",
        details: {
          build_week_index: taperExpectation.build_week_index,
          taper_week_index: taperExpectation.taper_week_index,
          build_week_load: round1(buildWeek.planned_weekly_load),
          taper_week_load: round1(taperWeek.planned_weekly_load),
          minimum_drop_pct: minimumDropPct,
        },
      });
    }
  }

  const recoveryExpectation = input.expectations?.recovery;
  if (!recoveryExpectation) {
    checks.push({
      id: "recovery",
      status: "not_applicable",
      message: "No recovery expectation was provided.",
    });
  } else {
    const goalWeek = getWeek(input.weeklyLoads, recoveryExpectation.goal_week_index);
    const recoveryWeek = getWeek(input.weeklyLoads, recoveryExpectation.recovery_week_index);
    const minimumDropPct = recoveryExpectation.minimum_drop_pct ?? 0.1;
    if (!goalWeek || !recoveryWeek) {
      checks.push({
        id: "recovery",
        status: "not_applicable",
        message: "Recovery indices fall outside the available weekly load series.",
      });
    } else if (!hasCompleteLoad(goalWeek) || !hasCompleteLoad(recoveryWeek)) {
      checks.push({
        id: "recovery",
        status: "not_applicable",
        message: "Recovery comparison requires complete weekly Load evidence.",
      });
    } else {
      const requiredLoad = goalWeek.planned_weekly_load * (1 - minimumDropPct);
      const passed = recoveryWeek.planned_weekly_load <= requiredLoad;
      checks.push({
        id: "recovery",
        status: passed ? "pass" : "fail",
        message: passed
          ? "Recovery week load drops relative to the goal week."
          : "Recovery week load does not drop enough after the goal week.",
        details: {
          goal_week_index: recoveryExpectation.goal_week_index,
          recovery_week_index: recoveryExpectation.recovery_week_index,
          goal_week_load: round1(goalWeek.planned_weekly_load),
          recovery_week_load: round1(recoveryWeek.planned_weekly_load),
          minimum_drop_pct: minimumDropPct,
        },
      });
    }
  }

  return {
    passed: checks.every((check) => check.status !== "fail"),
    checks,
  };
}
