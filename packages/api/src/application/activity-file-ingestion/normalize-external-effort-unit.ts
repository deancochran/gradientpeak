import type { CanonicalEffortKind, CanonicalEffortUnit } from "@repo/core/units";

const externalEffortUnitMultipliers: Record<CanonicalEffortKind, Record<string, number>> = {
  power: { w: 1, watt: 1, watts: 1, kw: 1_000, kilowatt: 1_000, kilowatts: 1_000 },
  speed: {
    "m/s": 1,
    meters_per_second: 1,
    mps: 1,
    meterpersecond: 1,
    meterspersecond: 1,
    "km/h": 1 / 3.6,
    kph: 1 / 3.6,
    kmh: 1 / 3.6,
    kilometersperhour: 1 / 3.6,
    mph: 0.44704,
    milesperhour: 0.44704,
  },
  heart_rate: { bpm: 1, beatsperminute: 1, beats_per_minute: 1 },
};

const canonicalUnitByKind: Record<CanonicalEffortKind, CanonicalEffortUnit> = {
  power: "watts",
  speed: "meters_per_second",
  heart_rate: "bpm",
};

/** Converts a provider/file representation before it enters the Core/DB contract. */
export function normalizeExternalEffortUnit(input: {
  kind: CanonicalEffortKind;
  value: number;
  unit: string;
}): { value: number; unit: CanonicalEffortUnit } | null {
  if (!Number.isFinite(input.value)) return null;
  const normalizedUnit = input.unit.trim().toLowerCase().replaceAll(" ", "");
  const multiplier = externalEffortUnitMultipliers[input.kind][normalizedUnit];
  if (multiplier === undefined) return null;
  return { value: input.value * multiplier, unit: canonicalUnitByKind[input.kind] };
}
