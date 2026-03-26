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
    max_increase_tss?: number;
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
      !Number.isFinite(week.planned_weekly_tss) ||
      week.planned_weekly_tss < 0 ||
      week.planned_session_count < 0,
  );
  checks.push(
    invalidWeek
      ? {
          id: "load_safety",
          status: "fail",
          message: `Week ${invalidWeek.week_start_date} has invalid planned load values.`,
          details: {
            week_start_date: invalidWeek.week_start_date,
            planned_weekly_tss: invalidWeek.planned_weekly_tss,
            planned_session_count: invalidWeek.planned_session_count,
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
  const maxIncreaseTss = rampExpectation.max_increase_tss ?? 30;
  const rampViolation = input.weeklyLoads.slice(1).find((week, index) => {
    const previous = input.weeklyLoads[index];
    if (!previous) {
      return false;
    }
    const increaseTss = week.planned_weekly_tss - previous.planned_weekly_tss;
    const increasePct =
      previous.planned_weekly_tss <= 0
        ? week.planned_weekly_tss > maxIncreaseTss
          ? Infinity
          : 0
        : increaseTss / previous.planned_weekly_tss;

    return increaseTss > maxIncreaseTss && increasePct > maxIncreasePct;
  });
  checks.push(
    rampViolation
      ? {
          id: "ramp_rate",
          status: "fail",
          message: `Ramp rate exceeds limits at ${rampViolation.week_start_date}.`,
          details: {
            max_increase_pct: maxIncreasePct,
            max_increase_tss: maxIncreaseTss,
          },
        }
      : {
          id: "ramp_rate",
          status: "pass",
          message: "Weekly load progression stays inside the configured ramp limits.",
          details: {
            max_increase_pct: maxIncreasePct,
            max_increase_tss: maxIncreaseTss,
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
    } else {
      const requiredTss = buildWeek.planned_weekly_tss * (1 - minimumDropPct);
      const passed = taperWeek.planned_weekly_tss <= requiredTss;
      checks.push({
        id: "taper",
        status: passed ? "pass" : "fail",
        message: passed
          ? "Taper week load drops relative to the reference build week."
          : "Taper week load does not drop enough relative to the reference build week.",
        details: {
          build_week_index: taperExpectation.build_week_index,
          taper_week_index: taperExpectation.taper_week_index,
          build_week_tss: round1(buildWeek.planned_weekly_tss),
          taper_week_tss: round1(taperWeek.planned_weekly_tss),
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
    } else {
      const requiredTss = goalWeek.planned_weekly_tss * (1 - minimumDropPct);
      const passed = recoveryWeek.planned_weekly_tss <= requiredTss;
      checks.push({
        id: "recovery",
        status: passed ? "pass" : "fail",
        message: passed
          ? "Recovery week load drops relative to the goal week."
          : "Recovery week load does not drop enough after the goal week.",
        details: {
          goal_week_index: recoveryExpectation.goal_week_index,
          recovery_week_index: recoveryExpectation.recovery_week_index,
          goal_week_tss: round1(goalWeek.planned_weekly_tss),
          recovery_week_tss: round1(recoveryWeek.planned_weekly_tss),
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
