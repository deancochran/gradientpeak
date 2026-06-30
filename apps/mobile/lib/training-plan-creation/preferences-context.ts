import { type CreationConstraints, mapPlanningPreferencesToCreationConstraints } from "@repo/core";
import type { TrainingPlanBuilderPlanPreferences } from "./types";

export type TrainingPlanPreferenceFieldKey =
  | "durationWeeks"
  | "weeklySessionCount"
  | "targetWeeklyHours"
  | "restDaysPerWeek";

export type TrainingPlanPreferenceRequirements = Partial<
  Record<TrainingPlanPreferenceFieldKey, { reason: string }>
>;

export type TrainingPlanConstraintPreset = "derive" | "light" | "balanced" | "high_frequency";

export interface TrainingPlanPreferenceFieldDescriptor {
  key: TrainingPlanPreferenceFieldKey;
  label: string;
  inputKind: "number";
  defaultUnit: string | null;
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
  durationWeeks: { label: "Duration", defaultUnit: "weeks", requiredDefault: 4 },
  weeklySessionCount: { label: "Sessions per week", defaultUnit: null, requiredDefault: 3 },
  targetWeeklyHours: { label: "Weekly time", defaultUnit: "hr", requiredDefault: 5 },
  restDaysPerWeek: { label: "Rest days", defaultUnit: "days", requiredDefault: 2 },
};

export const TRAINING_PLAN_CONSTRAINT_PRESETS: Array<{
  id: TrainingPlanConstraintPreset;
  label: string;
  description: string;
}> = [
  {
    id: "derive",
    label: "Let builder derive",
    description: "No fixed constraints. Use goals, sessions, and activity choices.",
  },
  { id: "light", label: "Light", description: "3 sessions per week across 4 weeks." },
  { id: "balanced", label: "Balanced", description: "4 sessions per week across 6 weeks." },
  {
    id: "high_frequency",
    label: "High frequency",
    description: "5 sessions per week across 8 weeks.",
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
    const rawValue = getPreferenceValue(preferences, key);
    const requiredReason = requirements[key]?.reason ?? null;
    const required = requiredReason !== null;
    const value = rawValue ?? (required ? definition.requiredDefault : null);

    return {
      key,
      label: definition.label,
      inputKind: "number",
      defaultUnit: definition.defaultUnit,
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
  ]);
  return {
    ...preferences,
    [key]: value === null ? null : integerKeys.has(key) ? Math.round(value) : value,
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
    };
  }

  if (preset === "light") {
    return {
      durationWeeks: 4,
      weeklySessionCount: 3,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
    };
  }

  if (preset === "high_frequency") {
    return {
      durationWeeks: 8,
      weeklySessionCount: 5,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
    };
  }

  return {
    durationWeeks: 6,
    weeklySessionCount: 4,
    targetWeeklyHours: null,
    restDaysPerWeek: null,
  };
}
