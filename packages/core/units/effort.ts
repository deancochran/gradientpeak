import { z } from "zod";

export const canonicalEffortUnitValues = ["watts", "meters_per_second", "bpm"] as const;
export const canonicalEffortUnitSchema = z.enum(canonicalEffortUnitValues);
export type CanonicalEffortUnit = z.infer<typeof canonicalEffortUnitSchema>;
export type CanonicalEffortKind = "power" | "speed" | "heart_rate";

export const canonicalEffortUnitLabels: Record<CanonicalEffortUnit, string> = {
  watts: "W",
  meters_per_second: "m/s",
  bpm: "bpm",
};

const canonicalEffortUnitByKind: Record<CanonicalEffortKind, CanonicalEffortUnit> = {
  power: "watts",
  speed: "meters_per_second",
  heart_rate: "bpm",
};

/**
 * Validates a persisted/domain effort value. Unit conversion belongs exclusively
 * to provider and file ingestion adapters before this boundary.
 */
export function canonicalEffortValue(input: {
  kind: CanonicalEffortKind;
  value: number;
  unit: string;
}): { value: number; unit: CanonicalEffortUnit } | null {
  if (!Number.isFinite(input.value)) return null;
  const unit = canonicalEffortUnitSchema.safeParse(input.unit);
  if (!unit.success || unit.data !== canonicalEffortUnitByKind[input.kind]) return null;
  return {
    value: input.value,
    unit: unit.data,
  };
}
