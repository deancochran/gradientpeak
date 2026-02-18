import { describe, expect, it } from "vitest";
import {
  computeGoalGdi,
  computePlanGdi,
  mapGdiToFeasibilityBand,
} from "../scoring/gdi";

describe("gdi", () => {
  it("maps boundary bands correctly", () => {
    expect(mapGdiToFeasibilityBand(0.29)).toBe("feasible");
    expect(mapGdiToFeasibilityBand(0.3)).toBe("stretch");
    expect(mapGdiToFeasibilityBand(0.5)).toBe("aggressive");
    expect(mapGdiToFeasibilityBand(0.75)).toBe("nearly_impossible");
    expect(mapGdiToFeasibilityBand(0.95)).toBe("infeasible");
  });

  it("weights higher-priority goal GDI more strongly", () => {
    const highPriorityHard = computeGoalGdi({
      goal_id: "high-hard",
      priority: 10,
      performance_gap: 0.9,
      load_gap: 0.9,
      timeline_pressure: 0.9,
      sparsity_penalty: 0,
    });
    const lowPriorityEasy = computeGoalGdi({
      goal_id: "low-easy",
      priority: 0,
      performance_gap: 0.1,
      load_gap: 0.1,
      timeline_pressure: 0.1,
      sparsity_penalty: 0,
    });

    const plan = computePlanGdi([highPriorityHard, lowPriorityEasy]);
    expect(plan.gdi).toBeGreaterThan(0.8);
  });

  it("clamps goal components before GDI weighting", () => {
    const goal = computeGoalGdi({
      goal_id: "g",
      priority: 4,
      performance_gap: -1,
      load_gap: 2,
      timeline_pressure: 0.5,
      sparsity_penalty: 3,
    });

    expect(goal.components).toEqual({
      PG: 0,
      LG: 1,
      TP: 0.5,
      SP: 1,
    });
    expect(goal.gdi).toBe(1.45);
    expect(goal.feasibility_band).toBe("infeasible");
  });

  it("returns feasible defaults for empty plan GDI input", () => {
    expect(computePlanGdi([])).toEqual({
      gdi: 0,
      feasibility_band: "feasible",
    });
  });

  it("keeps equal priorities at equal aggregation pressure", () => {
    const plan = computePlanGdi([
      {
        goal_id: "g-1",
        priority: 7,
        components: { PG: 0, LG: 0, TP: 0, SP: 0 },
        gdi: 1,
        feasibility_band: "infeasible",
      },
      {
        goal_id: "g-2",
        priority: 7,
        components: { PG: 0, LG: 0, TP: 0, SP: 0 },
        gdi: 0,
        feasibility_band: "feasible",
      },
    ]);

    expect(plan.gdi).toBe(0.5);
  });

  it("marks impossible overlap as difficult instead of near-feasible", () => {
    const plan = computePlanGdi([
      computeGoalGdi({
        goal_id: "goal-a",
        priority: 10,
        performance_gap: 0.85,
        load_gap: 0.8,
        timeline_pressure: 0.9,
        sparsity_penalty: 0.1,
      }),
      computeGoalGdi({
        goal_id: "goal-b",
        priority: 9,
        performance_gap: 0.82,
        load_gap: 0.78,
        timeline_pressure: 0.88,
        sparsity_penalty: 0.1,
      }),
    ]);

    expect(plan.gdi).toBeGreaterThan(0.85);
    expect(["nearly_impossible", "infeasible"]).toContain(
      plan.feasibility_band,
    );
  });
});
