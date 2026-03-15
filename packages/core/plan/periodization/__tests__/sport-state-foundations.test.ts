import { describe, expect, it } from "vitest";
import {
  advanceSportLoadState,
  buildDailyLoadState,
  calculateMechanicalFatigueScore,
  calculateSystemicLoadMetrics,
  getSportModelConfig,
  listSportModelConfigs,
} from "../index";

describe("sport registry and load state foundations", () => {
  it("resolves sport configs through the registry", () => {
    expect(getSportModelConfig("run")).toMatchObject({
      sport: "run",
      atl_tau_days: 10,
      impact_factor: 1,
    });
    expect(listSportModelConfigs()).toHaveLength(5);
  });

  it("applies sport-specific decay and load factors", () => {
    const runState = advanceSportLoadState({
      sport: "run",
      dailyLoad: 100,
    });
    const swimState = advanceSportLoadState({
      sport: "swim",
      dailyLoad: 100,
    });

    expect(swimState.atl).toBeGreaterThan(runState.atl);
    expect(runState.impact_load).toBe(100);
    expect(swimState.impact_load).toBe(20);
  });

  it("calculates systemic load with sport impact weighting", () => {
    const metrics = calculateSystemicLoadMetrics({
      history: [
        {
          sport_loads: [{ sport: "bike", load: 100 }],
        },
      ],
      dailySportLoads: [
        { sport: "run", load: 100 },
        { sport: "bike", load: 100 },
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
          sport_loads: [{ sport: "strength", load: 40 }],
        },
      ],
      dailySportLoads: [
        { sport: "run", load: 60 },
        { sport: "strength", load: 40 },
      ],
      sportLoadHistory: {
        run: [45, 50],
        strength: [30],
      },
    });
    const mechanicalFatigue = calculateMechanicalFatigueScore({
      history: [
        {
          sport_loads: [{ sport: "bike", load: 100 }],
        },
      ],
      dailySportLoads: [{ sport: "strength", load: 40 }],
    });

    expect(state.systemic_load_7d).toBeGreaterThan(0);
    expect(state.sport_load_states.run?.daily_load).toBe(60);
    expect(state.sport_load_states.strength?.mechanical_load).toBe(50);
    expect(state.mechanical_fatigue_score).toBeGreaterThan(0);
    expect(state.readiness_score).toBeGreaterThanOrEqual(0);
    expect(state.readiness_score).toBeLessThanOrEqual(1);
    expect(mechanicalFatigue).toBe(42.5);
  });
});
