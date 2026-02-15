import { describe, expect, it } from "vitest";
import { scoreGoalAssessment } from "../scoring/goalScore";
import { scorePlanGoals } from "../scoring/planScore";

describe("goal and plan scoring", () => {
  it("aggregates target scores into goal score", () => {
    const goal = scoreGoalAssessment({
      goal_id: "goal-1",
      priority: 2,
      targets: [
        {
          target_type: "power_threshold",
          target_watts: 280,
          test_duration_s: 1200,
          activity_category: "bike",
        },
        {
          target_type: "hr_threshold",
          target_lthr_bpm: 170,
        },
      ],
      projection: {
        projected_power_watts: 270,
        projected_lthr_bpm: 169,
      },
    });

    expect(goal.goal_score_0_1).toBeGreaterThan(0);
    expect(goal.target_scores).toHaveLength(2);
  });

  it("applies A/B/C precedence in plan score", () => {
    const strongC = {
      goal_id: "c",
      priority: 9,
      goal_score_0_1: 1,
      target_scores: [],
      conflict_notes: [],
    };
    const weakA = {
      goal_id: "a",
      priority: 1,
      goal_score_0_1: 0.2,
      target_scores: [],
      conflict_notes: [],
    };

    const plan = scorePlanGoals([strongC, weakA]);

    expect(plan.tier_counts.A).toBe(1);
    expect(plan.tier_counts.C).toBe(1);
    expect(plan.plan_goal_score_0_1).toBeLessThan(0.5);
  });
});
