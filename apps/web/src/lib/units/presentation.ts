import {
  type CanonicalUnitValue,
  formatDisplayUnitValue,
  type PreferredUnitSystem,
  resolvePreferredUnitSystem,
  toDisplayUnitValue,
} from "@repo/core/units";

export type { PreferredUnitSystem } from "@repo/core/units";

/** Resolves the persisted profile preference at the web presentation boundary. */
export function resolveViewingUserPreferredUnitSystem(value: unknown): PreferredUnitSystem {
  return resolvePreferredUnitSystem(value);
}

function formatCanonicalUnitValue(
  value: CanonicalUnitValue,
  unitSystem: PreferredUnitSystem,
): string {
  return formatDisplayUnitValue(toDisplayUnitValue(value, unitSystem));
}

export function formatDistance(meters: number, unitSystem: PreferredUnitSystem): string {
  return formatCanonicalUnitValue(
    { dimension: "distance", value: meters, unit: "meters" },
    unitSystem,
  );
}

export function formatElevation(meters: number, unitSystem: PreferredUnitSystem): string {
  return formatCanonicalUnitValue(
    { dimension: "elevation", value: meters, unit: "meters" },
    unitSystem,
  );
}

export function formatSpeed(metersPerSecond: number, unitSystem: PreferredUnitSystem): string {
  return formatCanonicalUnitValue(
    { dimension: "speed", value: metersPerSecond, unit: "meters_per_second" },
    unitSystem,
  );
}

export function formatMass(kilograms: number, unitSystem: PreferredUnitSystem): string {
  return formatCanonicalUnitValue(
    { dimension: "mass", value: kilograms, unit: "kilograms" },
    unitSystem,
  );
}

export function formatTemperature(celsius: number, unitSystem: PreferredUnitSystem): string {
  return formatCanonicalUnitValue(
    { dimension: "temperature", value: celsius, unit: "celsius" },
    unitSystem,
  );
}

export function formatRunningPace(
  secondsPerKilometer: number,
  unitSystem: PreferredUnitSystem,
): string {
  return formatCanonicalUnitValue(
    { dimension: "running_pace", value: secondsPerKilometer, unit: "seconds_per_kilometer" },
    unitSystem,
  );
}
