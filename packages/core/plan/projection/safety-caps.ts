export type OptimizationProfile = "outcome_first" | "balanced" | "sustainable";

const PROJECTION_PROFILE_DEFAULTS: Record<
  OptimizationProfile,
  {
    post_goal_recovery_days: number;
    max_weekly_tss_ramp_pct: number;
    max_ctl_ramp_per_week: number;
  }
> = {
  outcome_first: {
    post_goal_recovery_days: 3,
    max_weekly_tss_ramp_pct: 10,
    max_ctl_ramp_per_week: 5,
  },
  balanced: {
    post_goal_recovery_days: 5,
    max_weekly_tss_ramp_pct: 7,
    max_ctl_ramp_per_week: 3,
  },
  sustainable: {
    post_goal_recovery_days: 7,
    max_weekly_tss_ramp_pct: 5,
    max_ctl_ramp_per_week: 2,
  },
};

export function getProjectionProfileDefaults(profile: OptimizationProfile): {
  post_goal_recovery_days: number;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
} {
  return PROJECTION_PROFILE_DEFAULTS[profile];
}

export interface ProjectionSafetyConfigInput {
  optimization_profile?: OptimizationProfile;
  post_goal_recovery_days?: number;
  max_weekly_tss_ramp_pct?: number;
  max_ctl_ramp_per_week?: number;
}

export interface ProjectionSafetyConfig {
  optimization_profile: OptimizationProfile;
  post_goal_recovery_days: number;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
}

export interface OptimizationProfileBehavior {
  aggressiveness_score: number;
  stability_score: number;
  optimizer_lookahead_weeks: number;
  optimizer_candidate_steps: number;
  goal_readiness_weight: number;
  volatility_penalty_weight: number;
  overload_penalty_weight: number;
  baseline_deviation_penalty_weight: number;
}

const OPTIMIZATION_PROFILE_BEHAVIORS: Record<
  OptimizationProfile,
  OptimizationProfileBehavior
> = {
  outcome_first: {
    aggressiveness_score: 0.9,
    stability_score: 0.35,
    optimizer_lookahead_weeks: 6,
    optimizer_candidate_steps: 8,
    goal_readiness_weight: 1.2,
    volatility_penalty_weight: 1.1,
    overload_penalty_weight: 3.6,
    baseline_deviation_penalty_weight: 0.4,
  },
  balanced: {
    aggressiveness_score: 0.6,
    stability_score: 0.65,
    optimizer_lookahead_weeks: 4,
    optimizer_candidate_steps: 6,
    goal_readiness_weight: 1,
    volatility_penalty_weight: 1.8,
    overload_penalty_weight: 5,
    baseline_deviation_penalty_weight: 0.6,
  },
  sustainable: {
    aggressiveness_score: 0.3,
    stability_score: 0.92,
    optimizer_lookahead_weeks: 3,
    optimizer_candidate_steps: 5,
    goal_readiness_weight: 0.92,
    volatility_penalty_weight: 2.8,
    overload_penalty_weight: 7.2,
    baseline_deviation_penalty_weight: 1,
  },
};

export function getOptimizationProfileBehavior(
  profile: OptimizationProfile,
): OptimizationProfileBehavior {
  return OPTIMIZATION_PROFILE_BEHAVIORS[profile];
}

export function normalizeProjectionSafetyConfig(
  input: ProjectionSafetyConfigInput | undefined,
): ProjectionSafetyConfig {
  const profile = input?.optimization_profile ?? "balanced";
  const defaults = PROJECTION_PROFILE_DEFAULTS[profile];

  return {
    optimization_profile: profile,
    post_goal_recovery_days: Math.max(
      0,
      Math.min(
        28,
        Math.round(
          input?.post_goal_recovery_days ?? defaults.post_goal_recovery_days,
        ),
      ),
    ),
    max_weekly_tss_ramp_pct: Math.max(
      0,
      Math.min(
        20,
        input?.max_weekly_tss_ramp_pct ?? defaults.max_weekly_tss_ramp_pct,
      ),
    ),
    max_ctl_ramp_per_week: Math.max(
      0,
      Math.min(
        8,
        input?.max_ctl_ramp_per_week ?? defaults.max_ctl_ramp_per_week,
      ),
    ),
  };
}
