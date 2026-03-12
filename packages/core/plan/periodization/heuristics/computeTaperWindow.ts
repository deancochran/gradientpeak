import type {
  CalculatedParameter,
  EventDemand,
} from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { TAPER_BASELINE_LOOKUP } from "../constants";
import { getSportModelConfig } from "../sports";
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
  const sportBounds = getSportModelConfig(demand.sport).taper_days;
  const scaled = applyTaperStyleModifier(
    baseline,
    preferenceProfile.goal_strategy_preferences.taper_style_preference,
    sportBounds.min,
    sportBounds.max,
  );
  const roundedDays = Math.min(
    sportBounds.max,
    Math.max(sportBounds.min, Math.round(scaled.effective)),
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
        `sport_taper_bounds_${sportBounds.min}_${sportBounds.max}`,
      ],
    },
    rationale_codes: ["taper_window_resolved"],
  };
}
