import { z } from "zod";
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  feetToMeters,
  formatDistance,
  formatPace,
  formatSpeed,
  formatWeight,
  kgToLbs,
  kmToMiles,
  kphToMps,
  lbsToKg,
  metersPerSecondToKph,
  metersPerSecondToMph,
  metersToFeet,
  milesToKm,
  mphToMps,
} from "../calculations";

export * from "./effort";

/** The persisted display-system choices supported throughout the product. */
export const preferredUnitSystemValues = ["metric", "imperial"] as const;
export const preferredUnitSystemSchema = z.enum(preferredUnitSystemValues);
export type PreferredUnitSystem = z.infer<typeof preferredUnitSystemSchema>;
export const defaultPreferredUnitSystem: PreferredUnitSystem = "metric";

export const preferredUnitSystemLabels: Record<PreferredUnitSystem, string> = {
  metric: "Metric",
  imperial: "Imperial",
};

/** Resolves absent or invalid persisted values without changing the stored value. */
export function resolvePreferredUnitSystem(value: unknown): PreferredUnitSystem {
  const parsed = preferredUnitSystemSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultPreferredUnitSystem;
}

// Existing SI conversion and formatting primitives retain their public behavior.
export {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  feetToMeters,
  formatDistance,
  formatPace,
  formatSpeed,
  formatWeight,
  kgToLbs,
  kmToMiles,
  kphToMps,
  lbsToKg,
  metersPerSecondToKph,
  metersPerSecondToMph,
  metersToFeet,
  milesToKm,
  mphToMps,
};
