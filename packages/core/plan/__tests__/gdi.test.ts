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

  it("applies A-goal worst-case guard in plan aggregation", () => {
    const aGoal = computeGoalGdi({
      goal_id: "a",
      priority: 10,
      performance_gap: 0.9,
      load_gap: 0.9,
      timeline_pressure: 0.9,
      sparsity_penalty: 0,
    });
    const cGoal = computeGoalGdi({
      goal_id: "c",
      priority: 0,
      performance_gap: 0.1,
      load_gap: 0.1,
      timeline_pressure: 0.1,
      sparsity_penalty: 0,
    });

    const plan = computePlanGdi([aGoal, cGoal]);

    expect(plan.gdi).toBe(aGoal.gdi);
    expect(plan.feasibility_band).toBe(aGoal.feasibility_band);
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
});
