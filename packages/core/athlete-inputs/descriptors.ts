import type { ActivityEffortDefinition } from "./activity-efforts";
import type { ProfileMetricDefinition } from "./profile-metrics";

export interface AthleteNumberInputDescriptor {
  label: string;
  unit: string;
  inputKind: "weight" | "integer" | "decimal" | "percent" | "scale";
  min: number;
  max: number;
  decimals: number;
}

export function profileMetricToInputDescriptor(
  definition: ProfileMetricDefinition,
): AthleteNumberInputDescriptor {
  return {
    label: definition.label,
    unit: definition.unit,
    inputKind: definition.inputKind,
    min: definition.min,
    max: definition.max,
    decimals: definition.decimals,
  };
}

export function activityEffortToInputDescriptor(
  definition: ActivityEffortDefinition,
): AthleteNumberInputDescriptor {
  return {
    label: definition.valueLabel,
    unit: definition.unit,
    inputKind: definition.inputKind,
    min: definition.min,
    max: definition.max,
    decimals: definition.decimals,
  };
}
