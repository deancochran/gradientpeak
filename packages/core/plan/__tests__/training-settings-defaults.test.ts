import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { mapAthletePreferencesToCreationDefaults } from "../trainingSettingsDefaults";

describe("mapAthletePreferencesToCreationDefaults", () => {
  it("maps every user-facing planning preference to creation defaults", () => {
    const mapped = mapAthletePreferencesToCreationDefaults({
      ...defaultAthletePreferenceProfile,
      availability: {
        weekly_windows: [
          {
            day: "monday",
            windows: [{ start_minute_of_day: 420, end_minute_of_day: 540 }],
            max_sessions: 3,
          },
        ],
        hard_rest_days: ["sunday"],
      },
      dose_limits: {
        min_sessions_per_week: 2,
        max_sessions_per_week: 5,
        max_single_session_duration_minutes: 100,
        max_weekly_duration_minutes: 420,
        sport_overrides: {
          strength: { max_sessions_per_week: 2, max_weekly_duration_minutes: 90 },
        },
      },
      training_style: {
        progression_pace: 0.8,
        week_pattern_preference: 0.7,
        key_session_density_preference: 0.9,
        strength_integration_priority: 0.75,
      },
      recovery_preferences: {
        recovery_priority: 0.7,
        post_goal_recovery_days: 8,
        systemic_fatigue_tolerance: 0.35,
        double_day_tolerance: 0.2,
        long_session_fatigue_tolerance: 0.3,
      },
      adaptation_preferences: {
        recency_adaptation_preference: 0.8,
        plan_churn_tolerance: 0.25,
      },
      goal_strategy_preferences: {
        target_surplus_preference: 0.4,
        priority_tradeoff_preference: 0.85,
        taper_style_preference: 0.75,
      },
    });

    expect(mapped.constraints).toMatchObject({
      hard_rest_days: ["sunday"],
      min_sessions_per_week: 2,
      max_sessions_per_week: 5,
      max_single_session_duration_minutes: 100,
      max_weekly_duration_minutes: 420,
      sport_overrides: {
        strength: { max_sessions_per_week: 2, max_weekly_duration_minutes: 90 },
      },
    });
    expect(mapped.availability_config.days.find((day) => day.day === "monday")).toMatchObject({
      max_sessions: 1,
      windows: [{ start_minute_of_day: 420, end_minute_of_day: 540 }],
    });
    expect(mapped.post_goal_recovery_days).toBe(8);
    expect(mapped.recent_influence).toEqual({ influence_score: 0.6 });
    expect(mapped.recent_influence_action).toBe("accepted");
    expect(mapped.behavior_controls_v1.aggressiveness).not.toBe(0.5);
    expect(mapped.behavior_controls_v1.spike_frequency).toBeGreaterThan(0.7);
    expect(mapped.behavior_controls_v1.recovery_priority).toBeGreaterThan(0.65);
    expect(mapped.calibration.optimizer.churn_penalty_weight).toBeGreaterThan(0.3);
    expect(mapped.calibration.readiness_timeline.target_tsb).toBeGreaterThan(10);
    expect(mapped.calibration.durability_penalties.strain_scale).toBeLessThan(900);
  });

  it("disables recent influence when recency adaptation is zero", () => {
    const mapped = mapAthletePreferencesToCreationDefaults({
      ...defaultAthletePreferenceProfile,
      adaptation_preferences: {
        ...defaultAthletePreferenceProfile.adaptation_preferences,
        recency_adaptation_preference: 0,
      },
    });

    expect(mapped.recent_influence).toEqual({ influence_score: -1 });
    expect(mapped.recent_influence_action).toBe("disabled");
  });
});
