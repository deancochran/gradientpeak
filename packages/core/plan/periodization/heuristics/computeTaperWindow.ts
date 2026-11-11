import type { CalculatedParameter, EventDemand } from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { getActivityCategoryModelConfig } from "../activity-categories";
import { TAPER_BASELINE_LOOKUP } from "../constants";
import { applyTaperStyleModifier } from "./applyPreferenceModifiers";

export interface TaperWindowResolution {
  days: number;
  parameter: CalculatedParameter;
  rationale_codes: string[];
}

export function computeTaperWindow(
  demand: EventDemand,
  preferenceProfile: AthletePreferenceProfile,
): TaperWindowResolution {
  const baseline =
    TAPER_BASELINE_LOOKUP.find(
      (entry) => demand.demand_duration_minutes <= entry.maxDurationMinutes,
    )?.baselineDays ?? 28;
  const activityCategoryBounds = getActivityCategoryModelConfig(
    demand.activity_category,
  ).taper_days;
  const scaled = applyTaperStyleModifier(
    baseline,
    preferenceProfile.goal_strategy_preferences.taper_style_preference,
    activityCategoryBounds.min,
    activityCategoryBounds.max,
  );
  const roundedDays = Math.min(
    activityCategoryBounds.max,
    Math.max(activityCategoryBounds.min, Math.round(scaled.effective)),
  );

  return {
    days: roundedDays,
    parameter: {
      ...scaled,
      effective: roundedDays,
      clamped: scaled.clamped || roundedDays !== scaled.effective,
      rationale_codes: [
        ...scaled.rationale_codes,
        "taper_baseline_from_event_duration",
        `activity_category_taper_bounds_${activityCategoryBounds.min}_${activityCategoryBounds.max}`,
      ],
    },
    rationale_codes: ["taper_window_resolved"],
  };
}
