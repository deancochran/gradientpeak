import { describe, expect, it } from "vitest";
import {
  buildGoalReadinessTrajectory,
  resolveGoalReadinessTarget,
} from "../goalReadinessTrajectory";
import { resolveGoalReadinessViewModel } from "../goalReadinessViewModel";

describe("buildGoalReadinessTrajectory", () => {
  it("anchors recommended goal readiness to the target date instead of state-readiness plateau", () => {
    const trajectory = buildGoalReadinessTrajectory({
      goalTargetDate: "2026-11-17",
      currentGoalReadiness: 78,
      confidence: "low",
      points: [
        { date: "2026-05-15", state_readiness: 78, predicted_fitness_ctl: 40 },
        { date: "2026-07-01", state_readiness: 79, predicted_fitness_ctl: 52 },
        { date: "2026-09-01", state_readiness: 80, predicted_fitness_ctl: 64 },
        { date: "2026-11-17", state_readiness: 80, predicted_fitness_ctl: 72 },
      ],
    });

    expect(trajectory[0]?.goal_readiness).toBe(78);
    expect(trajectory.at(-1)?.goal_readiness).toBe(100);
  });

  it("supports an over-prepared target when preferences raise the goal target", () => {
    const trajectory = buildGoalReadinessTrajectory({
      goalTargetDate: "2026-11-17",
      currentGoalReadiness: 70,
      targetGoalReadiness: 106,
      confidence: "medium",
      points: [
        { date: "2026-05-15", state_readiness: 70, predicted_fitness_ctl: 35 },
        { date: "2026-11-17", state_readiness: 84, predicted_fitness_ctl: 85 },
      ],
    });

    expect(trajectory.at(-1)?.goal_readiness).toBe(106);
    expect(trajectory.at(-1)?.high).toBe(110);
  });

  it("derives target readiness from target surplus preference", () => {
    expect(resolveGoalReadinessTarget({ target_surplus_preference: 0.25 })).toBe(100);
    expect(resolveGoalReadinessTarget({ target_surplus_preference: 0.45 })).toBe(103);
    expect(resolveGoalReadinessTarget({ target_surplus_preference: 1 })).toBe(110);
  });

  it("labels readiness relative to its goal target", () => {
    expect(resolveGoalReadinessViewModel({ value: 98, target: 103 }).label).toBe("In target range");
    expect(resolveGoalReadinessViewModel({ value: 90, target: 103 }).label).toBe(
      "Building toward target",
    );
    expect(resolveGoalReadinessViewModel({ value: 107, target: 103 }).label).toBe(
      "Above target range",
    );
  });
});
