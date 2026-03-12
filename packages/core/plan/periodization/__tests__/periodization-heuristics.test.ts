import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import {
  assessFeasibility,
  computeTaperWindow,
  fromProfileGoals,
  periodizationScenarioFixtures,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../index";

describe("periodization heuristics", () => {
  it("resolves constraint profiles with calculated parameter provenance", () => {
    const profile = resolveConstraintProfile({
      optimizationProfile: "balanced",
      preferenceProfile: defaultAthletePreferenceProfile,
      sport: "run",
    });

    expect(profile.effective_max_ctl_ramp_per_week).toBe(3);
    expect(
      profile.calculated_parameters.systemic_fatigue_tolerance,
    ).toBeDefined();
    expect(
      profile.calculated_parameters.systemic_fatigue_tolerance?.rationale_codes,
    ).toContain("systemic_fatigue_tolerance_preference_applied");
  });

  it("normalizes legacy goals and resolves max-biased event demand", () => {
    const goals = fromProfileGoals([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Dual Target Goal",
        target_date: "2026-04-20",
        priority: 9,
        targets: [
          {
            target_type: "race_performance",
            distance_m: 10000,
            target_time_s: 3600,
            activity_category: "run",
            weight: 1,
          },
          {
            target_type: "pace_threshold",
            target_speed_mps: 4.2,
            test_duration_s: 1800,
            activity_category: "run",
            weight: 0.5,
          },
        ],
      },
    ]);
    const goal = goals[0];

    expect(goal).toBeDefined();
    if (!goal) {
      return;
    }

    const result = resolveEventDemand(goal);

    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.demand.required_peak_ctl).toBeGreaterThan(54);
      expect(result.demand.rationale_codes).toContain(
        "multi_target_demand_aggregation_max_weighted",
      );
    }
  });

  it("clamps short taper preference for long-demand events with provenance", () => {
    const goals = fromProfileGoals([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Long Event",
        target_date: "2026-06-01",
        priority: 9,
        targets: [
          {
            target_type: "race_performance",
            distance_m: 120000,
            target_time_s: 61200,
            activity_category: "run",
          },
        ],
      },
    ]);
    const goal = goals[0];

    expect(goal).toBeDefined();
    if (!goal) {
      return;
    }

    const demandResult = resolveEventDemand(goal);
    const preferenceProfile = {
      ...defaultAthletePreferenceProfile,
      goal_strategy_preferences: {
        ...defaultAthletePreferenceProfile.goal_strategy_preferences,
        taper_style_preference: 0,
      },
    };

    expect(demandResult.status).toBe("supported");
    if (demandResult.status === "supported") {
      const taper = computeTaperWindow(demandResult.demand, preferenceProfile);

      expect(taper.days).toBe(22);
      expect(taper.parameter.rationale_codes).toContain(
        "taper_style_preference_applied",
      );
    }
  });

  it("keeps exact-boundary ramp cases feasible", () => {
    const normalizedGoals = fromProfileGoals(
      periodizationScenarioFixtures.boundaryFeasible.goals as never,
    );
    const demandResult = resolveEventDemand(normalizedGoals[0]!);

    expect(demandResult.status).toBe("supported");
    if (demandResult.status === "supported") {
      const result = assessFeasibility({
        currentCtl: periodizationScenarioFixtures.boundaryFeasible.currentCtl,
        weeksToPeak: periodizationScenarioFixtures.boundaryFeasible.weeksToPeak,
        goals: normalizedGoals,
        resolvedDemands: [demandResult.demand],
        preferenceProfile:
          periodizationScenarioFixtures.boundaryFeasible.preferenceProfile,
      });

      expect(result.feasibility.status).toBe("feasible");
      expect(result.mode).toBe("target_seeking");
    }
  });

  it("switches to capacity bounded mode for infeasible and no-goal scenarios", () => {
    const stretchGoals = fromProfileGoals(
      periodizationScenarioFixtures.infeasibleBeginnerStretch.goals as never,
    );
    const stretchDemand = resolveEventDemand(stretchGoals[0]!);

    expect(stretchDemand.status).toBe("supported");
    if (stretchDemand.status === "supported") {
      const infeasible = assessFeasibility({
        currentCtl:
          periodizationScenarioFixtures.infeasibleBeginnerStretch.currentCtl,
        weeksToPeak:
          periodizationScenarioFixtures.infeasibleBeginnerStretch.weeksToPeak,
        goals: stretchGoals,
        resolvedDemands: [stretchDemand.demand],
        preferenceProfile:
          periodizationScenarioFixtures.infeasibleBeginnerStretch
            .preferenceProfile,
      });

      expect(infeasible.feasibility.status).toBe("infeasible_ramp");
      expect(infeasible.mode).toBe("capacity_bounded");
      expect(infeasible.feasibility.readiness_gap_ctl).toBeGreaterThan(0);
    }

    const noGoals = assessFeasibility({
      currentCtl: periodizationScenarioFixtures.noGoals.currentCtl,
      weeksToPeak: periodizationScenarioFixtures.noGoals.weeksToPeak,
      goals: [],
      resolvedDemands: [],
      preferenceProfile:
        periodizationScenarioFixtures.noGoals.preferenceProfile,
    });

    expect(noGoals.mode).toBe("capacity_bounded");
    expect(noGoals.feasibility.rationale_codes).toContain(
      "no_goals_capacity_bounded_baseline",
    );
  });

  it("returns structured unsupported mapping feasibility diagnostics", () => {
    const unsupported = assessFeasibility({
      currentCtl: 30,
      weeksToPeak: 4,
      goals: [],
      resolvedDemands: [
        {
          goal_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          sport: "run",
          demand_family: "race_performance",
          demand_duration_minutes: 90,
          required_peak_ctl: 50,
          required_weekly_load_floor: 350,
          target_contributions: [
            {
              target_type: "race_performance",
              weight: 1,
              weight_share: 1,
              required_peak_ctl: 50,
              rationale_codes: [],
            },
          ],
          rationale_codes: [],
        },
      ],
      unsupportedGoalIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
      preferenceProfile: defaultAthletePreferenceProfile,
    });

    expect(unsupported.feasibility.status).toBe("unsupported_goal_mapping");
    expect(unsupported.mode).toBe("capacity_bounded");
  });
});
