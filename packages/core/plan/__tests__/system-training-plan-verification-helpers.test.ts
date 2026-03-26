import { describe, expect, it } from "vitest";

import { ALL_SAMPLE_PLANS } from "../../samples/training-plans";
import { aggregateWeeklyPlannedLoad } from "../verification/aggregateWeeklyPlannedLoad";
import { assertCoachingInvariants } from "../verification/assertCoachingInvariants";
import { comparePlanLoadToHeuristic } from "../verification/comparePlanLoadToHeuristic";
import { deriveFixtureBackedSystemPlanContracts } from "../verification/deriveFixtureBackedSystemPlanContracts";
import { materializeSystemPlanLoad } from "../verification/materializeSystemPlanLoad";

const speedBlockPlan = ALL_SAMPLE_PLANS.find((plan) => plan.name === "5K Speed Block (8 weeks)");

describe("system training plan verification helpers", () => {
  it("derives contract scenarios from verification fixtures without duplicating plan truth", () => {
    const [exact5kContract] = deriveFixtureBackedSystemPlanContracts([
      {
        scenario_id: "exact_5k_speed_block",
        enabled: true,
        match_type: "exact",
        expected_weekly_load: 140,
        expected_mode: "target_seeking",
      },
    ]);

    expect(exact5kContract).toBeDefined();

    expect(exact5kContract).toMatchObject({
      key: "exact_5k_speed_block",
      plan_name: "5K Speed Block (8 weeks)",
      tolerance_class: "tight",
      current_ctl: 34,
      expected_mode: "target_seeking",
    });
    expect(exact5kContract!.goals).toHaveLength(1);
    const firstGoal = exact5kContract!.goals.at(0);

    expect(firstGoal?.targets).toHaveLength(1);

    const firstTarget = firstGoal?.targets?.at(0);

    expect(firstTarget).toBeDefined();
    expect(firstTarget!).toMatchObject({
      target_type: "race_performance",
      distance_m: 5000,
      target_time_s: 1140,
      activity_category: "run",
    });
  });

  it("materializes deterministic session load for a sample system plan", () => {
    expect(speedBlockPlan).toBeDefined();

    const first = materializeSystemPlanLoad({
      systemPlan: speedBlockPlan!,
      startDate: "2026-03-02",
      estimationContext: {
        thresholdHr: 172,
        thresholdPaceSecondsPerKm: 270,
      },
    });
    const second = materializeSystemPlanLoad({
      systemPlan: speedBlockPlan!,
      startDate: "2026-03-02",
      estimationContext: {
        thresholdHr: 172,
        thresholdPaceSecondsPerKm: 270,
      },
    });

    expect(first).toEqual(second);
    expect(first.unresolved_activity_plan_ids).toEqual([]);
    expect(first.total_planned_sessions).toBe(30);
    expect(first.total_estimated_tss).toBeGreaterThan(0);
    expect(first.sessions.every((session) => Number.isFinite(session.estimated_tss))).toBe(true);
    expect(first.sessions.some((session) => session.estimation_source === "structure")).toBe(true);
  });

  it("aggregates weekly load into monday-based normalized buckets with gaps", () => {
    const aggregated = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-03-03",
        event_type: "planned",
        estimated_tss: 40,
        activity_plan_id: "a",
        title: "Tuesday Run",
      },
      {
        scheduled_date: "2026-03-05",
        event_type: "planned",
        estimated_tss: 20,
        activity_plan_id: "b",
        title: "Thursday Run",
      },
      {
        scheduled_date: "2026-03-18",
        event_type: "planned",
        estimated_tss: 55,
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
    expect(aggregated.weeks.map((week) => week.planned_weekly_tss)).toEqual([60, 0, 55]);
    expect(aggregated.weeks[2]?.unresolved_session_count).toBe(1);
    expect(aggregated.total_planned_tss).toBe(115);
  });

  it("compares plan load to heuristic targets with weekly and block metrics", () => {
    const comparison = comparePlanLoadToHeuristic({
      planWeeks: [
        {
          week_index: 0,
          week_start_date: "2026-03-02",
          week_end_date: "2026-03-08",
          planned_weekly_tss: 100,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [25, 25, 25, 25],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_tss: 115,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [30, 25, 30, 30],
        },
        {
          week_index: 2,
          week_start_date: "2026-03-16",
          week_end_date: "2026-03-22",
          planned_weekly_tss: 110,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [30, 25, 25, 30],
        },
        {
          week_index: 3,
          week_start_date: "2026-03-23",
          week_end_date: "2026-03-29",
          planned_weekly_tss: 95,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [20, 25, 25, 25],
        },
      ],
      heuristic: {
        recommended_weekly_load: 105,
        recommended_baseline_tss_range: { min: 90, max: 120 },
        microcycles: [
          { week_start_date: "2026-03-02", planned_weekly_tss: 102 },
          { week_start_date: "2026-03-09", planned_weekly_tss: 108 },
          { week_start_date: "2026-03-16", planned_weekly_tss: 109 },
          { week_start_date: "2026-03-23", planned_weekly_tss: 96 },
        ],
      },
      toleranceClass: "tight",
    });

    expect(comparison.compared_week_count).toBe(4);
    expect(comparison.average_plan_weekly_tss).toBe(105);
    expect(comparison.recommended_weekly_load_error_tss).toBe(0);
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
          planned_weekly_tss: 100,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [25, 25, 25, 25],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_tss: 115,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [30, 30, 25, 30],
        },
        {
          week_index: 2,
          week_start_date: "2026-03-16",
          week_end_date: "2026-03-22",
          planned_weekly_tss: 95,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [20, 25, 25, 25],
        },
        {
          week_index: 3,
          week_start_date: "2026-03-23",
          week_end_date: "2026-03-29",
          planned_weekly_tss: 80,
          planned_session_count: 3,
          rest_day_count: 4,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [25, 25, 30],
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
          planned_weekly_tss: 80,
          planned_session_count: 4,
          rest_day_count: 3,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [20, 20, 20, 20],
        },
        {
          week_index: 1,
          week_start_date: "2026-03-09",
          week_end_date: "2026-03-15",
          planned_weekly_tss: 130,
          planned_session_count: 6,
          rest_day_count: 1,
          unresolved_session_count: 0,
          session_titles: [],
          session_tss: [20, 20, 20, 20, 25, 25],
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
