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

  it("honors explicit target weight in goal aggregation", () => {
    const weighted = scoreGoalAssessment({
      goal_id: "weighted",
      priority: 5,
      targets: [
        {
          target_type: "power_threshold",
          target_watts: 320,
          test_duration_s: 1200,
          activity_category: "bike",
          weight: 4,
        },
        {
          target_type: "hr_threshold",
          target_lthr_bpm: 160,
          weight: 1,
        },
      ],
      projection: {
        projected_power_watts: 280,
        projected_lthr_bpm: 165,
      },
    });

    const unweighted = scoreGoalAssessment({
      goal_id: "unweighted",
      priority: 5,
      targets: [
        {
          target_type: "power_threshold",
          target_watts: 320,
          test_duration_s: 1200,
          activity_category: "bike",
        },
        {
          target_type: "hr_threshold",
          target_lthr_bpm: 160,
        },
      ],
      projection: {
        projected_power_watts: 280,
        projected_lthr_bpm: 165,
      },
    });

    expect(weighted.goal_score_0_1).toBeLessThan(unweighted.goal_score_0_1);
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
    expect(plan.plan_goal_score_0_1).toBeGreaterThan(0.8);
  });

  it("keeps equal priorities at equal aggregation pressure", () => {
    const plan = scorePlanGoals([
      {
        goal_id: "g-1",
        priority: 6,
        goal_score_0_1: 1,
        target_scores: [],
        conflict_notes: [],
      },
      {
        goal_id: "g-2",
        priority: 6,
        goal_score_0_1: 0,
        target_scores: [],
        conflict_notes: [],
      },
    ]);

    expect(plan.plan_goal_score_0_1).toBe(0.5);
  });

  it("prevents unrealistic near-100 outcomes for impossible overlapping goals", () => {
    const goalA = scoreGoalAssessment({
      goal_id: "impossible-5k",
      priority: 10,
      targets: [
        {
          target_type: "race_performance",
          distance_m: 5000,
          target_time_s: 600,
          activity_category: "run",
          weight: 1.5,
        },
      ],
      projection: {
        readiness_score: 85,
        readiness_confidence: 0.5,
      },
    });

    const goalB = scoreGoalAssessment({
      goal_id: "impossible-threshold",
      priority: 9,
      targets: [
        {
          target_type: "pace_threshold",
          target_speed_mps: 8.6,
          test_duration_s: 1200,
          activity_category: "run",
          weight: 1.5,
        },
      ],
      projection: {
        readiness_score: 85,
        readiness_confidence: 0.5,
      },
    });

    const plan = scorePlanGoals([goalA, goalB]);

    expect(goalA.goal_score_0_1).toBeLessThan(0.9);
    expect(goalB.goal_score_0_1).toBeLessThan(0.9);
    expect(plan.plan_goal_score_0_1).toBeLessThan(0.92);
  });
});
