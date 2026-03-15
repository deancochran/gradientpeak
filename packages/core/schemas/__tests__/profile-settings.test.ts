import { describe, expect, it } from "vitest";
import {
  athleteCapabilitySnapshotSchema,
  defaultAthletePreferenceProfile,
  athletePreferenceProfileSchema,
  invalidateCapabilitySnapshot,
  planPreferenceOverridesSchema,
  plannerDerivedDiagnosticsSchema,
  plannerPolicyConfigSchema,
  resolveCapabilitySnapshotFreshness,
  resolveEffectivePreferences,
  shouldInvalidateCapabilitySnapshot,
} from "../settings/profile_settings";

const canonicalProfile = athletePreferenceProfileSchema.parse({
  availability: {
    weekly_windows: [
      {
        day: "monday",
        windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
        max_sessions: 1,
      },
    ],
    hard_rest_days: ["friday"],
  },
  dose_limits: {
    min_sessions_per_week: 3,
    max_sessions_per_week: 5,
    max_single_session_duration_minutes: 120,
    max_weekly_duration_minutes: 420,
    sport_overrides: {
      run: {
        max_weekly_duration_minutes: 480,
      },
    },
  },
  training_style: {
    progression_pace: 0.55,
    week_pattern_preference: 0.4,
    key_session_density_preference: 0.6,
    strength_integration_priority: 0.45,
  },
  recovery_preferences: {
    recovery_priority: 0.7,
    post_goal_recovery_days: 6,
    systemic_fatigue_tolerance: 0.65,
    double_day_tolerance: 0.2,
    long_session_fatigue_tolerance: 0.5,
  },
  adaptation_preferences: {
    recency_adaptation_preference: 0.45,
    plan_churn_tolerance: 0.35,
  },
  goal_strategy_preferences: {
    target_surplus_preference: 0.25,
    priority_tradeoff_preference: 0.65,
    taper_style_preference: 0.4,
  },
});

const capabilitySnapshot = athleteCapabilitySnapshotSchema.parse({
  sport_slices: {
    run: {
      aerobic_base: 0.6,
      threshold_capacity: 0.55,
      high_intensity_capacity: 0.4,
      durability: 0.5,
      recovery_speed: 0.6,
      technical_proficiency: 0.45,
      evidence_quality: 0.8,
      evidence_recency_days: 7,
    },
    bike: {
      aerobic_base: 0.58,
      threshold_capacity: 0.6,
      high_intensity_capacity: 0.46,
      durability: 0.57,
      recovery_speed: 0.62,
      technical_proficiency: 0.5,
      evidence_quality: 0.78,
      evidence_recency_days: 9,
    },
    swim: {
      aerobic_base: 0.42,
      threshold_capacity: 0.38,
      high_intensity_capacity: 0.3,
      durability: 0.35,
      recovery_speed: 0.48,
      technical_proficiency: 0.4,
      evidence_quality: 0.44,
      evidence_recency_days: 20,
    },
    other: {
      aerobic_base: 0.3,
      threshold_capacity: 0.3,
      high_intensity_capacity: 0.25,
      durability: 0.32,
      recovery_speed: 0.4,
      technical_proficiency: 0.35,
      evidence_quality: 0.25,
      evidence_recency_days: 30,
    },
  },
  freshness: {
    generated_at: "2026-03-10T00:00:00.000Z",
    expires_at: "2026-03-17T00:00:00.000Z",
    invalidation_reasons: [],
    last_activity_at: "2026-03-09T00:00:00.000Z",
  },
});

describe("athletePreferenceProfileSchema", () => {
  it("accepts canonical persisted preference sections only", () => {
    const parsed = athletePreferenceProfileSchema.parse(canonicalProfile);

    expect(parsed.goal_strategy_preferences.target_surplus_preference).toBe(
      0.25,
    );
    expect(parsed.training_style.strength_integration_priority).toBe(0.45);
    expect(parsed.recovery_preferences.systemic_fatigue_tolerance).toBe(0.65);
    expect(Object.keys(parsed)).toEqual([
      "availability",
      "dose_limits",
      "training_style",
      "recovery_preferences",
      "adaptation_preferences",
      "goal_strategy_preferences",
    ]);
    expect(defaultAthletePreferenceProfile.dose_limits.sport_overrides).toEqual(
      {},
    );
  });

  it("rejects planner-only and internal fields from canonical persistence", () => {
    const result = athletePreferenceProfileSchema.safeParse({
      ...canonicalProfile,
      optimization_profile: "balanced",
      calibration: { version: 1 },
      recent_influence_action: "disabled",
    });

    expect(result.success).toBe(false);
  });

  it("keeps ownership contracts separate across overrides and planner policy", () => {
    const overrideResult = planPreferenceOverridesSchema.safeParse({
      training_style: {
        progression_pace: 0.8,
      },
      goal_strategy_preferences: {
        target_surplus_preference: 0.5,
      },
      dose_limits: {
        sport_overrides: {
          bike: {
            max_sessions_per_week: 6,
          },
        },
      },
    });
    const plannerPolicyResult = plannerPolicyConfigSchema.safeParse({
      optimization_profile: "outcome_first",
      load_tuning: {
        spike_frequency: 0.5,
        shape_target: -0.1,
        shape_strength: 0.4,
      },
      model_confidence: {
        starting_fitness_confidence: 0.7,
      },
    });
    const invalidOverrideResult = planPreferenceOverridesSchema.safeParse({
      optimization_profile: "sustainable",
    });
    const diagnosticsResult = plannerDerivedDiagnosticsSchema.safeParse({
      fallback_depth: 2,
      fallback_mode: "conservative_priors",
      confidence: 0.42,
      rationale_codes: ["weak_same_sport_evidence"],
    });

    expect(overrideResult.success).toBe(true);
    expect(plannerPolicyResult.success).toBe(true);
    expect(diagnosticsResult.success).toBe(true);
    expect(invalidOverrideResult.success).toBe(false);
    if (overrideResult.success) {
      expect(overrideResult.data.dose_limits?.sport_overrides?.bike).toEqual({
        max_sessions_per_week: 6,
      });
    }
  });
});

describe("resolveEffectivePreferences", () => {
  it("merges plan overrides deterministically and replaces array fields explicitly", () => {
    const resolved = resolveEffectivePreferences(canonicalProfile, {
      availability: {
        weekly_windows: [
          {
            day: "tuesday",
            windows: [{ start_minute_of_day: 400, end_minute_of_day: 460 }],
            max_sessions: 2,
          },
        ],
        hard_rest_days: ["sunday"],
      },
      dose_limits: {
        max_sessions_per_week: 6,
      },
      training_style: {
        progression_pace: 0.85,
      },
      goal_strategy_preferences: {
        target_surplus_preference: 0.9,
      },
    });

    expect(resolved.availability.weekly_windows).toEqual([
      {
        day: "tuesday",
        windows: [{ start_minute_of_day: 400, end_minute_of_day: 460 }],
        max_sessions: 2,
      },
    ]);
    expect(resolved.availability.hard_rest_days).toEqual(["sunday"]);
    expect(resolved.dose_limits.min_sessions_per_week).toBe(3);
    expect(resolved.dose_limits.max_sessions_per_week).toBe(6);
    expect(resolved.training_style.week_pattern_preference).toBe(0.4);
    expect(resolved.training_style.progression_pace).toBe(0.85);
    expect(resolved.goal_strategy_preferences.target_surplus_preference).toBe(
      0.9,
    );
  });

  it("returns profile defaults unchanged when no overrides are provided", () => {
    expect(resolveEffectivePreferences(canonicalProfile)).toEqual(
      canonicalProfile,
    );
  });

  it("preserves array fields when an override only changes sibling availability fields", () => {
    const resolved = resolveEffectivePreferences(canonicalProfile, {
      availability: {
        hard_rest_days: ["saturday"],
      },
    });

    expect(resolved.availability.weekly_windows).toEqual(
      canonicalProfile.availability.weekly_windows,
    );
    expect(resolved.availability.hard_rest_days).toEqual(["saturday"]);
  });

  it("merges per-sport dose overrides additively", () => {
    const resolved = resolveEffectivePreferences(canonicalProfile, {
      dose_limits: {
        sport_overrides: {
          bike: {
            max_sessions_per_week: 6,
          },
        },
      },
    });

    expect(resolved.dose_limits.sport_overrides).toEqual({
      run: {
        max_weekly_duration_minutes: 480,
      },
      bike: {
        max_sessions_per_week: 6,
      },
    });
  });
});

describe("athleteCapabilitySnapshot helpers", () => {
  it("marks snapshots fresh, stale, and invalidated using freshness metadata", () => {
    expect(
      resolveCapabilitySnapshotFreshness({
        snapshot: capabilitySnapshot,
        asOf: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe("fresh");

    expect(
      resolveCapabilitySnapshotFreshness({
        snapshot: capabilitySnapshot,
        asOf: "2026-03-18T00:00:00.000Z",
      }),
    ).toBe("stale");

    const invalidated = invalidateCapabilitySnapshot({
      snapshot: capabilitySnapshot,
      reason: "new_activity",
      invalidated_at: "2026-03-11T00:00:00.000Z",
    });

    expect(
      resolveCapabilitySnapshotFreshness({
        snapshot: invalidated,
        asOf: "2026-03-12T00:00:00.000Z",
      }),
    ).toBe("invalidated");
    expect(invalidated.freshness.invalidation_reasons).toEqual([
      "new_activity",
    ]);
  });

  it("invalidates snapshots only for changes at or after generation time", () => {
    expect(
      shouldInvalidateCapabilitySnapshot(capabilitySnapshot, {
        reason: "history_import",
        occurred_at: "2026-03-10T12:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      shouldInvalidateCapabilitySnapshot(capabilitySnapshot, {
        reason: "profile_preference_change",
        occurred_at: "2026-03-09T23:59:59.000Z",
      }),
    ).toBe(false);
  });

  it("rejects invalid freshness metadata when invalidation details are incomplete", () => {
    const result = athleteCapabilitySnapshotSchema.safeParse({
      ...capabilitySnapshot,
      freshness: {
        ...capabilitySnapshot.freshness,
        invalidation_reasons: ["threshold_update"],
      },
    });

    expect(result.success).toBe(false);
  });
});
