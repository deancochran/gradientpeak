import type { OptimizationProfile } from "../projection/safety-caps";

export const RISK_PROFILE_DEFAULTS: Record<
  OptimizationProfile,
  {
    postGoalRecoveryDays: number;
    maxWeeklyTssRampPct: number;
    maxCtlRampPerWeek: number;
  }
> = {
  outcome_first: {
    postGoalRecoveryDays: 3,
    maxWeeklyTssRampPct: 10,
    maxCtlRampPerWeek: 5,
  },
  balanced: {
    postGoalRecoveryDays: 5,
    maxWeeklyTssRampPct: 7,
    maxCtlRampPerWeek: 3,
  },
  sustainable: {
    postGoalRecoveryDays: 7,
    maxWeeklyTssRampPct: 5,
    maxCtlRampPerWeek: 2,
  },
};

export const PREFERENCE_MODIFIER_BOUNDS = {
  taperStylePreference: { min: 0.8, max: 1.2 },
  systemicFatigueTolerance: { min: 0.9, max: 1.15 },
  strengthIntegrationPriority: { min: 0.7, max: 1.3 },
  progressionPace: { min: 0.85, max: 1.15 },
} as const;

export const TAPER_BASELINE_LOOKUP = [
  { maxDurationMinutes: 90, baselineDays: 7 },
  { maxDurationMinutes: 240, baselineDays: 10 },
  { maxDurationMinutes: 480, baselineDays: 14 },
  { maxDurationMinutes: 960, baselineDays: 21 },
  { maxDurationMinutes: Number.POSITIVE_INFINITY, baselineDays: 28 },
] as const;

export const STICKY_REPLAN_WINDOWS = {
  immutableDays: 3,
  softMoveWindowDays: 7,
  softMoveLoadDeltaPct: 10,
} as const;

export const MAX_BIASED_AGGREGATION_WEIGHT = 0.7;
export const WEIGHTED_AVERAGE_AGGREGATION_WEIGHT = 0.3;
