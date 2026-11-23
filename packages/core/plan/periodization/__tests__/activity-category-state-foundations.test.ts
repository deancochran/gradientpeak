import { describe, expect, it } from "vitest";
import {
  advanceActivityCategoryLoadState,
  buildDailyLoadState,
  calculateMechanicalFatigueScore,
  calculateSystemicLoadMetrics,
  getActivityCategoryModelConfig,
  listActivityCategoryModelConfigs,
} from "../index";

describe("activity_category registry and load state foundations", () => {
  it("resolves activity_category configs through the registry", () => {
    expect(getActivityCategoryModelConfig("run")).toMatchObject({
      activity_category: "run",
      recentLoad_tau_days: 10,
      impact_factor: 1,
    });
    expect(listActivityCategoryModelConfigs()).toHaveLength(5);
  });

  it("applies activity-category-specific decay and load factors", () => {
    const runState = advanceActivityCategoryLoadState({
      activity_category: "run",
      dailyLoad: 100,
    });
    const swimState = advanceActivityCategoryLoadState({
      activity_category: "swim",
      dailyLoad: 100,
    });

    expect(swimState.recentLoad).toBeGreaterThan(runState.recentLoad);
    expect(runState.impact_load).toBe(100);
    expect(swimState.impact_load).toBe(20);
  });

  it("calculates systemic load with activity_category impact weighting", () => {
    const metrics = calculateSystemicLoadMetrics({
      history: [
        {
          activity_category_loads: [{ activity_category: "bike", load: 100 }],
        },
      ],
      dailyActivityCategoryLoads: [
        { activity_category: "run", load: 100 },
        { activity_category: "bike", load: 100 },
      ],
    });

    expect(metrics.daily_systemic_load).toBe(135);
    expect(metrics.systemic_load_7d).toBe(170);
    expect(metrics.systemic_load_28d).toBe(170);
  });

  it("tracks daily aggregate state and strength-aware mechanical fatigue", () => {
    const state = buildDailyLoadState({
      history: [
        {
          activity_category_loads: [{ activity_category: "strength", load: 40 }],
        },
      ],
      dailyActivityCategoryLoads: [
        { activity_category: "run", load: 60 },
        { activity_category: "strength", load: 40 },
      ],
      activityCategoryLoadHistory: {
        run: [45, 50],
        strength: [30],
      },
    });
    const mechanicalFatigue = calculateMechanicalFatigueScore({
      history: [
        {
          activity_category_loads: [{ activity_category: "bike", load: 100 }],
        },
      ],
      dailyActivityCategoryLoads: [{ activity_category: "strength", load: 40 }],
    });

    expect(state.systemic_load_7d).toBeGreaterThan(0);
    expect(state.activity_category_load_states.run?.daily_load).toBe(60);
    expect(state.activity_category_load_states.strength?.mechanical_load).toBe(50);
    expect(state.mechanical_fatigue_score).toBeGreaterThan(0);
    expect(state.readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.readiness_score).toBeLessThanOrEqual(1);
    expect(mechanicalFatigue).toBe(42.5);
  });
});
