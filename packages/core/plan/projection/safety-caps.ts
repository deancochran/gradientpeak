export type OptimizationProfile = "outcome_first" | "balanced" | "sustainable";

export interface ProjectionCalibrationConfigInput {
  version?: 1;
  readiness_composite?: {
    target_attainment_weight?: number;
    envelope_weight?: number;
    durability_weight?: number;
    evidence_weight?: number;
  };
  readiness_timeline?: {
    target_tsb?: number;
    form_tolerance?: number;
    fatigue_overflow_scale?: number;
    feasibility_blend_weight?: number;
    smoothing_iterations?: number;
    smoothing_lambda?: number;
    max_step_delta?: number;
  };
  envelope_penalties?: {
    over_high_weight?: number;
    under_low_weight?: number;
    over_ramp_weight?: number;
  };
  durability_penalties?: {
    monotony_threshold?: number;
    monotony_scale?: number;
    strain_threshold?: number;
    strain_scale?: number;
    deload_debt_scale?: number;
  };
  no_history?: {
    reliability_horizon_days?: number;
    confidence_floor_high?: number;
    confidence_floor_mid?: number;
    confidence_floor_low?: number;
    demand_tier_time_pressure_scale?: number;
  };
  optimizer?: {
    preparedness_weight?: number;
    risk_penalty_weight?: number;
    volatility_penalty_weight?: number;
    churn_penalty_weight?: number;
    lookahead_weeks?: number;
    candidate_steps?: number;
  };
}

export interface ProjectionControlV2Input {
  mode?: "simple" | "advanced";
  ambition?: number;
  risk_tolerance?: number;
  curvature?: number;
  curvature_strength?: number;
}

export type RampLearningConfidence = "low" | "medium" | "high";

export interface LearnedRampRateInput {
  max_safe_ramp_rate?: number | null;
  confidence?: RampLearningConfidence | null;
}

export interface EffectiveLearnedRampRate {
  max_safe_ramp_rate: number;
  confidence: RampLearningConfidence;
  source: "learned" | "default";
}

export const ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT = 40;
export const ABSOLUTE_MAX_CTL_RAMP_PER_WEEK = 12;
export const DEFAULT_LEARNED_RAMP_RATE = 40;
export const MIN_LEARNED_RAMP_RATE = 30;
export const MAX_LEARNED_RAMP_RATE = 70;
const RAMP_PCT_BASELINE_WEEKLY_TSS = 200;

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
  learned_ramp_rate?: LearnedRampRateInput;
  projection_control_v2?: ProjectionControlV2Input;
  calibration?: ProjectionCalibrationConfigInput;
}

export interface ProjectionSafetyConfig {
  optimization_profile: OptimizationProfile;
  post_goal_recovery_days: number;
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
  learned_ramp_rate: EffectiveLearnedRampRate;
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
  const learnedRampRate = resolveEffectiveLearnedRampRate(
    input?.learned_ramp_rate,
  );
  const learnedRampPct = convertLearnedRampRateToPct(
    learnedRampRate.max_safe_ramp_rate,
  );
  const effectiveWeeklyRampPct =
    input?.max_weekly_tss_ramp_pct ??
    (learnedRampRate.source === "learned"
      ? learnedRampPct
      : defaults.max_weekly_tss_ramp_pct);

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
      Math.min(ABSOLUTE_MAX_WEEKLY_TSS_RAMP_PCT, effectiveWeeklyRampPct),
    ),
    max_ctl_ramp_per_week: Math.max(
      0,
      Math.min(
        ABSOLUTE_MAX_CTL_RAMP_PER_WEEK,
        input?.max_ctl_ramp_per_week ?? defaults.max_ctl_ramp_per_week,
      ),
    ),
    learned_ramp_rate: learnedRampRate,
  };
}

export function convertLearnedRampRateToPct(rampRate: number): number {
  const safeRampRate = Math.max(
    MIN_LEARNED_RAMP_RATE,
    Math.min(MAX_LEARNED_RAMP_RATE, rampRate),
  );
  return Math.round((safeRampRate / RAMP_PCT_BASELINE_WEEKLY_TSS) * 100);
}

export function resolveEffectiveLearnedRampRate(
  input: LearnedRampRateInput | undefined,
): EffectiveLearnedRampRate {
  const confidence = input?.confidence ?? "low";
  const hasLearnedRate = typeof input?.max_safe_ramp_rate === "number";

  if (hasLearnedRate && (confidence === "medium" || confidence === "high")) {
    return {
      max_safe_ramp_rate: Math.max(
        MIN_LEARNED_RAMP_RATE,
        Math.min(MAX_LEARNED_RAMP_RATE, Math.round(input.max_safe_ramp_rate!)),
      ),
      confidence,
      source: "learned",
    };
  }

  return {
    max_safe_ramp_rate: DEFAULT_LEARNED_RAMP_RATE,
    confidence: "low",
    source: "default",
  };
}
