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
