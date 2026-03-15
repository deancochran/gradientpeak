import { profileTrainingSettingsRecordSchema } from "./schemas/settings/profile_settings.ts";

const data = {
  profile_id: "b9f612b8-0db3-4838-9355-5b1b5c039725",
  settings: {
    locks: {
      hard_rest_days: { locked: false },
      recent_influence: { locked: false },
      availability_config: { locked: false },
      behavior_controls_v1: { locked: false },
      optimization_profile: { locked: false },
      max_sessions_per_week: { locked: false },
      min_sessions_per_week: { locked: false },
      post_goal_recovery_days: { locked: false },
      goal_difficulty_preference: { locked: false },
      max_single_session_duration_minutes: { locked: false },
    },
    calibration: {
      version: 1,
      optimizer: {
        candidate_steps: 7,
        lookahead_weeks: 5,
        preparedness_weight: 14,
        risk_penalty_weight: 0.35,
        churn_penalty_weight: 0.2,
        volatility_penalty_weight: 0.22,
      },
      no_history: {
        confidence_floor_low: 0.45,
        confidence_floor_mid: 0.6,
        confidence_floor_high: 0.75,
        reliability_horizon_days: 42,
        demand_tier_time_pressure_scale: 1,
      },
      envelope_penalties: {
        over_high_weight: 0.55,
        over_ramp_weight: 0.25,
        under_low_weight: 0.2,
      },
      readiness_timeline: {
        target_tsb: 8,
        form_tolerance: 20,
        max_step_delta: 9,
        smoothing_lambda: 0.28,
        smoothing_iterations: 24,
        fatigue_overflow_scale: 0.4,
        feasibility_blend_weight: 0,
      },
      readiness_composite: {
        envelope_weight: 0.3,
        evidence_weight: 0.1,
        durability_weight: 0.15,
        target_attainment_weight: 0.45,
      },
      durability_penalties: {
        strain_scale: 900,
        monotony_scale: 2,
        strain_threshold: 900,
        deload_debt_scale: 6,
        monotony_threshold: 2,
      },
    },
    constraints: {
      hard_rest_days: ["wednesday", "friday", "sunday"],
      max_sessions_per_week: 4,
      min_sessions_per_week: 3,
      goal_difficulty_preference: "conservative",
      max_single_session_duration_minutes: 90,
    },
    recent_influence: { influence_score: 0 },
    availability_config: {
      days: [
        {
          day: "monday",
          windows: [{ end_minute_of_day: 450, start_minute_of_day: 360 }],
          max_sessions: 1,
        },
        {
          day: "tuesday",
          windows: [{ end_minute_of_day: 450, start_minute_of_day: 360 }],
          max_sessions: 1,
        },
        { day: "wednesday", windows: [], max_sessions: 0 },
        {
          day: "thursday",
          windows: [{ end_minute_of_day: 450, start_minute_of_day: 360 }],
          max_sessions: 1,
        },
        { day: "friday", windows: [], max_sessions: 0 },
        {
          day: "saturday",
          windows: [{ end_minute_of_day: 570, start_minute_of_day: 450 }],
          max_sessions: 1,
        },
        { day: "sunday", windows: [], max_sessions: 0 },
      ],
      template: "moderate",
    },
    behavior_controls_v1: {
      variability: 0.5,
      shape_target: 0,
      aggressiveness: 0.88,
      shape_strength: 0.35,
      spike_frequency: 0.35,
      recovery_priority: 0.6,
      starting_fitness_confidence: 0.6,
    },
    optimization_profile: "balanced",
    availability_provenance: {
      source: "user",
      rationale: ["user_confirmed"],
      confidence: null,
      references: [{ id: "creation_form", type: "user_input" }],
      updated_at: "2026-03-09T16:41:17.554Z",
    },
    post_goal_recovery_days: 5,
    recent_influence_action: "disabled",
    calibration_composite_locks: {
      envelope_weight: false,
      evidence_weight: false,
      durability_weight: false,
      target_attainment_weight: false,
    },
    recent_influence_provenance: {
      source: "user",
      rationale: ["user_confirmed"],
      confidence: null,
      references: [{ id: "creation_form", type: "user_input" }],
      updated_at: "2026-03-09T16:41:17.554Z",
    },
  },
  updated_at: "2026-03-09 16:41:19.591296+00",
};

const parsed = profileTrainingSettingsRecordSchema.safeParse(data);
if (!parsed.success) {
  console.error(JSON.stringify(parsed.error.format(), null, 2));
} else {
  console.log("Success!");
}
