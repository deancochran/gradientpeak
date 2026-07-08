import {
  type CreationConstraints,
  mapPlanningPreferencesToCreationConstraints,
  PLANNING_PREFERENCE_FIELD_METADATA,
} from "@repo/core";
import type { TrainingPlanBuilderPlanPreferences } from "./types";

export type TrainingPlanPreferenceFieldKey =
  | "durationWeeks"
  | "weeklySessionCount"
  | "targetWeeklyHours"
  | "restDaysPerWeek"
  | "maxSingleSessionDurationMinutes"
  | "progressionPace"
  | "recoveryPriority"
  | "weekPatternPreference"
  | "strengthIntegrationPriority"
  | "doubleDayTolerance"
  | "longSessionFatigueTolerance"
  | "taperStylePreference";

export type TrainingPlanPreferenceRequirements = Partial<
  Record<TrainingPlanPreferenceFieldKey, { reason: string }>
>;

export type TrainingPlanConstraintPreset = "derive" | "light" | "balanced" | "high_frequency";

export interface TrainingPlanPreferenceFieldDescriptor {
  key: TrainingPlanPreferenceFieldKey;
  label: string;
  inputKind: "number";
  defaultUnit: string | null;
  helperText: string;
  min: number;
  max: number;
  step: number;
  value: {
    value: number | null;
    source: "default" | "manual_override" | "unknown";
    unit: string | null;
    overridden: boolean;
  };
  visible: boolean;
  required: boolean;
  reason: string | null;
  canRemove: boolean;
}

export const TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY: Record<
  TrainingPlanPreferenceFieldKey,
  {
    label: string;
    defaultUnit: string | null;
    requiredDefault: number;
  }
> = {
  durationWeeks: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.durationWeeks.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.durationWeeks.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.durationWeeks.requiredDefault,
  },
  weeklySessionCount: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.weeklySessionCount.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.weeklySessionCount.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.weeklySessionCount.requiredDefault,
  },
  targetWeeklyHours: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.targetWeeklyHours.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.targetWeeklyHours.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.targetWeeklyHours.requiredDefault,
  },
  restDaysPerWeek: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.restDaysPerWeek.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.restDaysPerWeek.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.restDaysPerWeek.requiredDefault,
  },
  maxSingleSessionDurationMinutes: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.maxSingleSessionDurationMinutes.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.maxSingleSessionDurationMinutes.unit,
    requiredDefault:
      PLANNING_PREFERENCE_FIELD_METADATA.maxSingleSessionDurationMinutes.requiredDefault,
  },
  progressionPace: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.progressionPace.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.progressionPace.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.progressionPace.requiredDefault,
  },
  recoveryPriority: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.recoveryPriority.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.recoveryPriority.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.recoveryPriority.requiredDefault,
  },
  weekPatternPreference: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.weekPatternPreference.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.weekPatternPreference.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.weekPatternPreference.requiredDefault,
  },
  strengthIntegrationPriority: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.strengthIntegrationPriority.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.strengthIntegrationPriority.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.strengthIntegrationPriority.requiredDefault,
  },
  doubleDayTolerance: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.doubleDayTolerance.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.doubleDayTolerance.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.doubleDayTolerance.requiredDefault,
  },
  longSessionFatigueTolerance: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.longSessionFatigueTolerance.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.longSessionFatigueTolerance.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.longSessionFatigueTolerance.requiredDefault,
  },
  taperStylePreference: {
    label: PLANNING_PREFERENCE_FIELD_METADATA.taperStylePreference.label,
    defaultUnit: PLANNING_PREFERENCE_FIELD_METADATA.taperStylePreference.unit,
    requiredDefault: PLANNING_PREFERENCE_FIELD_METADATA.taperStylePreference.requiredDefault,
  },
};

export const TRAINING_PLAN_CONSTRAINT_PRESETS: Array<{
  id: TrainingPlanConstraintPreset;
  label: string;
  description: string;
}> = [
  {
    id: "derive",
    label: "Let builder derive",
    description: "No fixed constraints. Use goals, submitted sessions, and activity choices.",
  },
  { id: "light", label: "Light", description: "3 sessions per week." },
  { id: "balanced", label: "Balanced", description: "4 sessions per week." },
  {
    id: "high_frequency",
    label: "High frequency",
    description: "5 sessions per week.",
  },
];

export function mapTrainingPlanPreferencesToCreationConstraints({
  preferences,
  preferredWeekdays,
}: {
  preferences: TrainingPlanBuilderPlanPreferences;
  preferredWeekdays: number[];
}): CreationConstraints {
  return mapPlanningPreferencesToCreationConstraints({
    preferences,
    preferredWeekdays,
  });
}

function getPreferenceValue(
  preferences: TrainingPlanBuilderPlanPreferences,
  key: TrainingPlanPreferenceFieldKey,
) {
  return preferences[key];
}

export function selectTrainingPlanPreferenceFields(
  preferences: TrainingPlanBuilderPlanPreferences,
  requirements: TrainingPlanPreferenceRequirements = {},
): TrainingPlanPreferenceFieldDescriptor[] {
  return (
    Object.keys(TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY) as TrainingPlanPreferenceFieldKey[]
  ).map((key) => {
    const definition = TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY[key];
    const metadata = PLANNING_PREFERENCE_FIELD_METADATA[key];
    const rawValue = getPreferenceValue(preferences, key);
    const requiredReason = requirements[key]?.reason ?? null;
    const required = requiredReason !== null;
    const value = rawValue ?? (required ? definition.requiredDefault : null);

    return {
      key,
      label: definition.label,
      inputKind: "number",
      defaultUnit: definition.defaultUnit,
      helperText: metadata.helperText,
      min: metadata.min,
      max: metadata.max,
      step: metadata.step,
      value: {
        value,
        source:
          rawValue === null && required
            ? "default"
            : rawValue === null
              ? "unknown"
              : "manual_override",
        unit: definition.defaultUnit,
        overridden: rawValue !== null,
      },
      visible: value !== null || required,
      required,
      reason: requiredReason,
      canRemove: !required && rawValue !== null,
    };
  });
}

export function applyTrainingPlanPreferenceFieldOverride(
  preferences: TrainingPlanBuilderPlanPreferences,
  key: TrainingPlanPreferenceFieldKey,
  value: number | null,
): TrainingPlanBuilderPlanPreferences {
  const integerKeys = new Set<TrainingPlanPreferenceFieldKey>([
    "durationWeeks",
    "weeklySessionCount",
    "restDaysPerWeek",
    "maxSingleSessionDurationMinutes",
  ]);
  const metadata = PLANNING_PREFERENCE_FIELD_METADATA[key];
  const normalizedValue =
    value === null
      ? null
      : Math.min(
          metadata.max,
          Math.max(metadata.min, integerKeys.has(key) ? Math.round(value) : value),
        );
  return {
    ...preferences,
    [key]: normalizedValue,
  };
}

export function addTrainingPlanPreferenceField(
  preferences: TrainingPlanBuilderPlanPreferences,
  key: TrainingPlanPreferenceFieldKey,
): TrainingPlanBuilderPlanPreferences {
  return applyTrainingPlanPreferenceFieldOverride(
    preferences,
    key,
    TRAINING_PLAN_PREFERENCE_FIELD_REGISTRY[key].requiredDefault,
  );
}

export function applyTrainingPlanConstraintPreset(
  preset: TrainingPlanConstraintPreset,
): TrainingPlanBuilderPlanPreferences {
  if (preset === "derive") {
    return {
      durationWeeks: null,
      weeklySessionCount: null,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
      maxSingleSessionDurationMinutes: null,
      progressionPace: null,
      recoveryPriority: null,
      weekPatternPreference: null,
      strengthIntegrationPriority: null,
      doubleDayTolerance: null,
      longSessionFatigueTolerance: null,
      taperStylePreference: null,
    };
  }

  if (preset === "light") {
    return {
      durationWeeks: null,
      weeklySessionCount: 3,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
      maxSingleSessionDurationMinutes: null,
      progressionPace: null,
      recoveryPriority: null,
      weekPatternPreference: null,
      strengthIntegrationPriority: null,
      doubleDayTolerance: null,
      longSessionFatigueTolerance: null,
      taperStylePreference: null,
    };
  }

  if (preset === "high_frequency") {
    return {
      durationWeeks: null,
      weeklySessionCount: 5,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
      maxSingleSessionDurationMinutes: null,
      progressionPace: null,
      recoveryPriority: null,
      weekPatternPreference: null,
      strengthIntegrationPriority: null,
      doubleDayTolerance: null,
      longSessionFatigueTolerance: null,
      taperStylePreference: null,
    };
  }

  return {
    durationWeeks: null,
    weeklySessionCount: 4,
    targetWeeklyHours: null,
    restDaysPerWeek: null,
    maxSingleSessionDurationMinutes: null,
    progressionPace: null,
    recoveryPriority: null,
    weekPatternPreference: null,
    strengthIntegrationPriority: null,
    doubleDayTolerance: null,
    longSessionFatigueTolerance: null,
    taperStylePreference: null,
  };
}
