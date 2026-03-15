import type { CalculatedParameter } from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import type { CanonicalSport } from "../../../schemas/sport";
import type { OptimizationProfile } from "../../projection/safety-caps";
import { RISK_PROFILE_DEFAULTS } from "../constants";
import { getSportModelConfig } from "../sports";
import {
  applyProgressionPaceModifier,
  applyStrengthIntegrationModifier,
  applySystemicFatigueToleranceModifier,
} from "./applyPreferenceModifiers";

export interface ConstraintProfileInput {
  optimizationProfile: OptimizationProfile;
  preferenceProfile: AthletePreferenceProfile;
  sport: CanonicalSport;
}

export interface ResolvedConstraintProfile {
  optimization_profile: OptimizationProfile;
  sport: CanonicalSport;
  effective_max_weekly_tss_ramp_pct: number;
  effective_max_ctl_ramp_per_week: number;
  effective_acwr_ceiling: number;
  effective_post_goal_recovery_days: number;
  effective_tsb_floor: number;
  effective_strength_dose_multiplier: number;
  calculated_parameters: Record<string, CalculatedParameter>;
  rationale_codes: string[];
}

export function resolveConstraintProfile(
  input: ConstraintProfileInput,
): ResolvedConstraintProfile {
  const defaults = RISK_PROFILE_DEFAULTS[input.optimizationProfile];
  const sportBaseline = getSportModelConfig(input.sport);
  const progressionParameter = applyProgressionPaceModifier(
    1,
    input.preferenceProfile.training_style.progression_pace,
    1.15,
  );
  const fatigueToleranceParameter = applySystemicFatigueToleranceModifier(
    sportBaseline.acwr_ceiling,
    input.preferenceProfile.recovery_preferences.systemic_fatigue_tolerance,
    sportBaseline.acwr_ceiling,
  );
  const strengthParameter = applyStrengthIntegrationModifier(
    1,
    input.preferenceProfile.training_style.strength_integration_priority,
  );
  const weeklyRamp = Math.min(
    defaults.maxWeeklyTssRampPct,
    defaults.maxWeeklyTssRampPct * progressionParameter.effective,
  );
  const ctlRamp = Math.min(
    defaults.maxCtlRampPerWeek,
    defaults.maxCtlRampPerWeek * progressionParameter.effective,
  );

  return {
    optimization_profile: input.optimizationProfile,
    sport: input.sport,
    effective_max_weekly_tss_ramp_pct: Math.round(weeklyRamp * 100) / 100,
    effective_max_ctl_ramp_per_week: Math.round(ctlRamp * 100) / 100,
    effective_acwr_ceiling:
      Math.round(fatigueToleranceParameter.effective * 1000) / 1000,
    effective_post_goal_recovery_days: Math.max(
      defaults.postGoalRecoveryDays,
      Math.round(
        input.preferenceProfile.recovery_preferences.post_goal_recovery_days,
      ),
    ),
    effective_tsb_floor: -Math.round((5 + weeklyRamp / 2) * 100) / 100,
    effective_strength_dose_multiplier:
      Math.round(strengthParameter.effective * 1000) / 1000,
    calculated_parameters: {
      progression_pace: progressionParameter,
      systemic_fatigue_tolerance: fatigueToleranceParameter,
      strength_integration_priority: strengthParameter,
    },
    rationale_codes: [
      `optimization_profile_${input.optimizationProfile}`,
      `sport_${input.sport}_constraint_profile`,
    ],
  };
}
