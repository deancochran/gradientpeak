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

  it("weights higher-priority goals more strongly in plan score", () => {
    const strongHighPriority = {
      goal_id: "high",
      priority: 10,
      goal_score_0_1: 1,
      target_scores: [],
      conflict_notes: [],
    };
    const weakLowPriority = {
      goal_id: "low",
      priority: 0,
      goal_score_0_1: 0.2,
      target_scores: [],
      conflict_notes: [],
    };

    const plan = scorePlanGoals([strongHighPriority, weakLowPriority]);

    expect(plan.tier_counts.A).toBe(1);
    expect(plan.tier_counts.C).toBe(1);
    expect(plan.plan_goal_score_0_1).toBeGreaterThan(0.6);
  });
});
