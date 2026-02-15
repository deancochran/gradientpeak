import type { CreationNormalizationInput } from "@repo/core";
import type { TrainingPlanConfigFormData } from "@/components/training-plan/create/SinglePageForm";

type CreationConfigUserValues = NonNullable<
  CreationNormalizationInput["user_values"]
>;

export type CreationConfigAdapterInput = Pick<
  TrainingPlanConfigFormData,
  | "availabilityConfig"
  | "availabilityProvenance"
  | "recentInfluenceScore"
  | "recentInfluenceAction"
  | "recentInfluenceProvenance"
  | "constraints"
  | "optimizationProfile"
  | "postGoalRecoveryDays"
  | "maxWeeklyTssRampPct"
  | "maxCtlRampPerWeek"
  | "constraintsSource"
  | "locks"
>;

export function toCreationNormalizationInput(
  state: CreationConfigAdapterInput,
): CreationNormalizationInput {
  const userValues: CreationConfigUserValues = {
    recent_influence: { influence_score: state.recentInfluenceScore },
    recent_influence_action: state.recentInfluenceAction,
    optimization_profile: state.optimizationProfile,
    post_goal_recovery_days: state.postGoalRecoveryDays,
    max_weekly_tss_ramp_pct: state.maxWeeklyTssRampPct,
    max_ctl_ramp_per_week: state.maxCtlRampPerWeek,
    locks: state.locks,
  };

  if (
    state.availabilityProvenance.source === "user" ||
    state.locks.availability_config.locked
  ) {
    userValues.availability_config = state.availabilityConfig;
  }

  if (state.constraintsSource === "user") {
    userValues.constraints = state.constraints;
  }

  return {
    user_values: userValues,
    provenance_overrides: {
      availability_provenance: state.availabilityProvenance,
      recent_influence_provenance: state.recentInfluenceProvenance,
    },
  };
}
