export const canonicalEffortUnitValues = ["watts", "meters_per_second"] as const;
export type CanonicalEffortUnit = (typeof canonicalEffortUnitValues)[number];
export type CanonicalEffortKind = "power" | "speed";

export const canonicalEffortUnitLabels: Record<CanonicalEffortUnit, string> = {
  watts: "W",
  meters_per_second: "m/s",
};

export const canonicalEffortUnitAliases: Record<CanonicalEffortKind, Record<string, number>> = {
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
};

function normalizeUnitAlias(unit: string): string {
  return unit.trim().toLowerCase().replaceAll(" ", "");
}

/** Converts recognized effort units to their canonical SI storage unit. */
export function canonicalEffortValue(input: {
  kind: CanonicalEffortKind;
  value: number;
  unit: string;
}): { value: number; unit: CanonicalEffortUnit } | null {
  const multiplier = canonicalEffortUnitAliases[input.kind][normalizeUnitAlias(input.unit)];
  if (multiplier === undefined) return null;
  return {
    value: input.value * multiplier,
    unit: input.kind === "power" ? "watts" : "meters_per_second",
  };
}
