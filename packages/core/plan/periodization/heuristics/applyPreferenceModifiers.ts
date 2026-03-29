import type { CalculatedParameter } from "../../../schemas/planning";
import { PREFERENCE_MODIFIER_BOUNDS } from "../constants";

export interface LinearModifierInput {
  key: string;
  unit: string;
  baseline: number;
  preferenceValue: number;
  minScale: number;
  maxScale: number;
  minBound?: number;
  maxBound?: number;
  source: string;
  rationaleCode: string;
}

export function interpolateLinearScale(
  preferenceValue: number,
  minScale: number,
  maxScale: number,
): number {
  return minScale + (maxScale - minScale) * preferenceValue;
}

export function applyLinearPreferenceModifier(input: LinearModifierInput): CalculatedParameter {
  const scale = interpolateLinearScale(input.preferenceValue, input.minScale, input.maxScale);
  const scaledValue = input.baseline * scale;
  const clampedValue = Math.min(
    input.maxBound ?? scaledValue,
    Math.max(input.minBound ?? scaledValue, scaledValue),
  );
  const clamped = clampedValue !== scaledValue;

  return {
    key: input.key,
    unit: input.unit,
    baseline: input.baseline,
    modifiers: [
      {
        source: input.source,
        operation: "scale",
        value: scale,
      },
      ...(clamped
        ? [
            {
              source: "biological_bounds",
              operation: "clamp" as const,
              value: clampedValue,
            },
          ]
        : []),
    ],
    effective: clampedValue,
    min_bound: input.minBound,
    max_bound: input.maxBound,
    clamped,
    rationale_codes: [
      input.rationaleCode,
      ...(clamped ? [`${input.key}_clamped_to_biological_bounds`] : []),
    ],
  };
}

export function applyProgressionPaceModifier(
  baseline: number,
  preferenceValue: number,
  maxBound: number,
): CalculatedParameter {
  return applyLinearPreferenceModifier({
    key: "progression_pace",
    unit: "multiplier",
    baseline,
    preferenceValue,
    minScale: PREFERENCE_MODIFIER_BOUNDS.progressionPace.min,
    maxScale: PREFERENCE_MODIFIER_BOUNDS.progressionPace.max,
    minBound: 0,
    maxBound,
    source: "training_style.progression_pace",
    rationaleCode: "progression_pace_preference_applied",
  });
}

export function applySystemicFatigueToleranceModifier(
  baseline: number,
  preferenceValue: number,
  maxBound: number,
): CalculatedParameter {
  return applyLinearPreferenceModifier({
    key: "systemic_fatigue_tolerance",
    unit: "multiplier",
    baseline,
    preferenceValue,
    minScale: PREFERENCE_MODIFIER_BOUNDS.systemicFatigueTolerance.min,
    maxScale: PREFERENCE_MODIFIER_BOUNDS.systemicFatigueTolerance.max,
    minBound: 0,
    maxBound,
    source: "recovery_preferences.systemic_fatigue_tolerance",
    rationaleCode: "systemic_fatigue_tolerance_preference_applied",
  });
}

export function applyStrengthIntegrationModifier(
  baseline: number,
  preferenceValue: number,
): CalculatedParameter {
  return applyLinearPreferenceModifier({
    key: "strength_integration_priority",
    unit: "multiplier",
    baseline,
    preferenceValue,
    minScale: PREFERENCE_MODIFIER_BOUNDS.strengthIntegrationPriority.min,
    maxScale: PREFERENCE_MODIFIER_BOUNDS.strengthIntegrationPriority.max,
    minBound: 0,
    source: "training_style.strength_integration_priority",
    rationaleCode: "strength_integration_priority_preference_applied",
  });
}

export function applyTaperStyleModifier(
  baselineDays: number,
  preferenceValue: number,
  minBound: number,
  maxBound: number,
): CalculatedParameter {
  return applyLinearPreferenceModifier({
    key: "taper_window_days",
    unit: "days",
    baseline: baselineDays,
    preferenceValue,
    minScale: PREFERENCE_MODIFIER_BOUNDS.taperStylePreference.min,
    maxScale: PREFERENCE_MODIFIER_BOUNDS.taperStylePreference.max,
    minBound,
    maxBound,
    source: "goal_strategy_preferences.taper_style_preference",
    rationaleCode: "taper_style_preference_applied",
  });
}
