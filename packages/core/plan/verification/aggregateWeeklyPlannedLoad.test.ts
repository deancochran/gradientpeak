import { describe, expect, it } from "vitest";

import { aggregateWeeklyPlannedLoad } from "./aggregateWeeklyPlannedLoad";
import { assertCoachingInvariants } from "./assertCoachingInvariants";
import { comparePlanLoadToHeuristic } from "./comparePlanLoadToHeuristic";

describe("aggregateWeeklyPlannedLoad availability", () => {
  it("returns unavailable rather than zero when every planned Load is unknown", () => {
    const result = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-07-06",
        event_type: "planned",
        estimated_load: null,
        activity_plan_id: "plan-1",
      },
    ]);

    expect(result.weeks[0]).toMatchObject({
      planned_weekly_load: null,
      planned_weekly_load_status: "unavailable",
      unresolved_session_count: 1,
    });
    expect(result).toMatchObject({
      total_planned_load: null,
      total_planned_load_status: "unavailable",
    });
  });

  it("retains a known subtotal and marks mixed evidence partial", () => {
    const result = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-07-06",
        event_type: "planned",
        estimated_load: 45,
        activity_plan_id: "plan-1",
      },
      {
        scheduled_date: "2026-07-08",
        event_type: "planned",
        estimated_load: null,
        activity_plan_id: "plan-2",
      },
    ]);

    expect(result.weeks[0]).toMatchObject({
      planned_weekly_load: 45,
      planned_weekly_load_status: "partial",
    });
    expect(result).toMatchObject({
      total_planned_load: 45,
      total_planned_load_status: "partial",
    });
  });

  it("retains a canonical partial Load subtotal without promoting it to complete", () => {
    const result = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-07-06",
        event_type: "planned",
        estimated_load: 32,
        estimated_load_status: "partial",
        activity_plan_id: "plan-1",
      },
    ]);

    expect(result.weeks[0]).toMatchObject({
      planned_weekly_load: 32,
      planned_weekly_load_status: "partial",
      unresolved_session_count: 1,
    });
    expect(result).toMatchObject({
      total_planned_load: 32,
      total_planned_load_status: "partial",
    });
  });

  it("preserves an explicitly known zero as complete", () => {
    const result = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-07-06",
        event_type: "planned",
        estimated_load: 0,
        activity_plan_id: "plan-1",
      },
    ]);

    expect(result.weeks[0]).toMatchObject({
      planned_weekly_load: 0,
      planned_weekly_load_status: "complete",
    });
    expect(result).toMatchObject({
      total_planned_load: 0,
      total_planned_load_status: "complete",
    });
  });

  it("does not compare partial plan Load as if it were complete", () => {
    const aggregated = aggregateWeeklyPlannedLoad([
      {
        scheduled_date: "2026-07-06",
        event_type: "planned",
        estimated_load: 45,
        activity_plan_id: "plan-1",
      },
      {
        scheduled_date: "2026-07-08",
        event_type: "planned",
        estimated_load: null,
        activity_plan_id: "plan-2",
      },
    ]);
    const comparison = comparePlanLoadToHeuristic({
      planWeeks: aggregated.weeks,
      heuristic: { recommended_weekly_load: 100 },
    });

    expect(comparison.per_week[0]).toMatchObject({
      plan_load: 45,
      plan_load_status: "partial",
      heuristic_load: 100,
      absolute_error_load: null,
      within_tolerance: null,
    });
    expect(comparison).toMatchObject({
      compared_week_count: 0,
      average_plan_weekly_load: null,
      average_absolute_weekly_error_load: null,
    });

    const invariants = assertCoachingInvariants({
      weeklyLoads: aggregated.weeks,
      expectations: {
        ramp: {},
        taper: { build_week_index: 0, taper_week_index: 0 },
      },
    });
    expect(invariants.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "load_safety", status: "not_applicable" }),
        expect.objectContaining({ id: "ramp_rate", status: "not_applicable" }),
        expect.objectContaining({ id: "taper", status: "not_applicable" }),
      ]),
    );
  });
});
