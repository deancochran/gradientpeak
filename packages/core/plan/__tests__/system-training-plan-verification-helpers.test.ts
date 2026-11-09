import { describe, expect, it } from "vitest";

import { aggregateWeeklyPlannedLoad } from "../verification/aggregateWeeklyPlannedLoad";
import { assertCoachingInvariants } from "../verification/assertCoachingInvariants";
import { comparePlanLoadToHeuristic } from "../verification/comparePlanLoadToHeuristic";
import { deriveFixtureBackedSystemPlanContracts } from "../verification/deriveFixtureBackedSystemPlanContracts";
import { SYSTEM_PLAN_MAPPING_FIXTURES } from "../verification/fixtures/system-plan-mappings";

describe("system training plan verification helpers", () => {
  it("makes retirement of production plan mappings explicit", () => {
    expect(SYSTEM_PLAN_MAPPING_FIXTURES).toEqual([]);
    expect(() =>
      deriveFixtureBackedSystemPlanContracts([
        {
          scenario_id: "exact_5k_speed_block",
          enabled: true,
          match_type: "exact",
          expected_weekly_load: 140,
          expected_mode: "target_seeking",
        },
      ]),
    ).toThrow(/Expected exactly one system plan mapping/);
  });

  it("aggregates weekly load into monday-based normalized buckets with gaps", () => {
    const aggregated = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-03-03",
        event_type: "planned",
        estimated_load: 40,
        activity_plan_id: "a",
        title: "Tuesday Run",
      },
      {
        scheduled_date: "2026-03-05",
        event_type: "planned",
        estimated_load: 20,
        activity_plan_id: "b",
        title: "Thursday Run",
      },
      {
        scheduled_date: "2026-03-18",
        event_type: "planned",
        estimated_load: 55,
        activity_plan_id: null,
        title: "Gap Week Session",
      },
    ]);

    expect(aggregated.weeks).toHaveLength(3);
    expect(aggregated.weeks.map((week) => week.week_start_date)).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
    expect(aggregated.weeks.map((week) => week.planned_weekly_load)).toEqual([60, 0, 55]);
    expect(aggregated.weeks.map((week) => week.rest_day_count)).toEqual([5, 7, 6]);
    expect(aggregated.weeks[2]?.unresolved_session_count).toBe(1);
    expect(aggregated.total_planned_load).toBe(115);
  });

  it("infers rest days from dates without planned sessions, not explicit rest rows", () => {
    const aggregated = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-03-02",
        event_type: "planned",
        estimated_load: 40,
        activity_plan_id: "a",
        title: "AM Run",
      },
      {
        scheduled_date: "2026-03-02",
        event_type: "planned",
        estimated_load: 20,
        activity_plan_id: "b",
        title: "PM Strength",
      },
      {
        scheduled_date: "2026-03-03",
        event_type: "rest_day",
        estimated_load: 0,
        activity_plan_id: null,
        title: "Legacy Rest",
      },
    ]);

    expect(aggregated.weeks).toHaveLength(1);
    expect(aggregated.weeks[0]).toMatchObject({
      planned_session_count: 2,
      rest_day_count: 6,
      planned_weekly_load: 60,
    });
  });

  it("compares plan load to heuristic targets with weekly and block metrics", () => {
    const comparison = comparePlanLoadToHeuristic({
      planWeeks: [
        {
          week_index: 0,
          week_start_date: "2026-03-02",
          week_end_date: "2026-03-08",
          planned_weekly_load: 100,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [25, 25, 25, 25],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_load: 115,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [30, 25, 30, 30],
        },
        {
          week_index: 2,
          week_start_date: "2026-03-16",
          week_end_date: "2026-03-22",
          planned_weekly_load: 110,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [30, 25, 25, 30],
        },
        {
          week_index: 3,
          week_start_date: "2026-03-23",
          week_end_date: "2026-03-29",
          planned_weekly_load: 95,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [20, 25, 25, 25],
        },
      ],
      heuristic: {
        recommended_weekly_load: 105,
        recommended_baseline_load_range: { min: 90, max: 120 },
        microcycles: [
          { week_start_date: "2026-03-02", planned_weekly_load: 102 },
          { week_start_date: "2026-03-09", planned_weekly_load: 108 },
          { week_start_date: "2026-03-16", planned_weekly_load: 109 },
          { week_start_date: "2026-03-23", planned_weekly_load: 96 },
        ],
      },
      toleranceClass: "tight",
    });

    expect(comparison.compared_week_count).toBe(4);
    expect(comparison.average_plan_weekly_load).toBe(105);
    expect(comparison.recommended_weekly_load_error_load).toBe(0);
    expect(comparison.average_within_baseline_range).toBe(true);
    expect(comparison.per_week.every((week) => week.within_tolerance !== false)).toBe(true);
    expect(comparison.rolling_blocks).toHaveLength(1);
    expect(comparison.rolling_blocks[0]?.within_tolerance).toBe(true);
  });

  it("returns structured coaching invariant results for pass, fail, and placeholder cases", () => {
    const passing = assertCoachingInvariants({
      weeklyLoads: [
        {
          week_index: 0,
          week_start_date: "2026-03-02",
          week_end_date: "2026-03-08",
          planned_weekly_load: 100,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [25, 25, 25, 25],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_load: 115,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [30, 30, 25, 30],
        },
        {
          week_index: 2,
          week_start_date: "2026-03-16",
          week_end_date: "2026-03-22",
          planned_weekly_load: 95,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [20, 25, 25, 25],
        },
        {
          week_index: 3,
          week_start_date: "2026-03-23",
          week_end_date: "2026-03-29",
          planned_weekly_load: 80,
          planned_session_count: 3,
          rest_day_count: 4,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [25, 25, 30],
        },
      ],
      expectations: {
        cadence: {
          target_sessions_per_week: 4,
          allowed_deviation: 1,
        },
        taper: {
          build_week_index: 1,
          taper_week_index: 2,
          minimum_drop_pct: 0.1,
        },
        recovery: {
          goal_week_index: 2,
          recovery_week_index: 3,
          minimum_drop_pct: 0.1,
        },
      },
    });

    const failing = assertCoachingInvariants({
      weeklyLoads: [
        {
          week_index: 0,
          week_start_date: "2026-03-02",
          week_end_date: "2026-03-08",
          planned_weekly_load: 80,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [20, 20, 20, 20],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_load: 130,
          planned_session_count: 6,
          rest_day_count: 1,
          unresolved_session_count: 0,
          session_titles: [],
          session_load: [20, 20, 20, 20, 25, 25],
        },
      ],
      expectations: {
        cadence: {
          target_sessions_per_week: 4,
          allowed_deviation: 1,
        },
      },
    });

    expect(passing.passed).toBe(true);
    expect(passing.checks.find((check) => check.id === "taper")?.status).toBe("pass");
    expect(passing.checks.find((check) => check.id === "recovery")?.status).toBe("pass");
    expect(failing.passed).toBe(false);
    expect(failing.checks.find((check) => check.id === "ramp_rate")?.status).toBe("fail");
    expect(failing.checks.find((check) => check.id === "cadence")?.status).toBe("fail");
    expect(failing.checks.find((check) => check.id === "taper")?.status).toBe("not_applicable");
  });
});
