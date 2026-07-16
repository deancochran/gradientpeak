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

/** Measurements supported by the canonical-to-display unit adapter. */
export type UnitDimension =
  | "distance"
  | "elevation"
  | "height"
  | "pool_length"
  | "speed"
  | "mass"
  | "temperature"
  | "running_pace"
  | "swimming_pace";

/** The persisted and calculation units; these never vary by user preference. */
export type CanonicalUnitByDimension = {
  distance: "meters";
  elevation: "meters";
  height: "meters";
  pool_length: "meters";
  speed: "meters_per_second";
  mass: "kilograms";
  temperature: "celsius";
  running_pace: "seconds_per_kilometer";
  swimming_pace: "seconds_per_100_meters";
};

/** Display units selected from a user's metric or imperial preference. */
export type DisplayUnitByDimension = {
  distance: "kilometers" | "miles";
  elevation: "meters" | "feet";
  height: "meters" | "feet";
  pool_length: "meters" | "feet";
  speed: "kilometers_per_hour" | "miles_per_hour";
  mass: "kilograms" | "pounds";
  temperature: "celsius" | "fahrenheit";
  running_pace: "seconds_per_kilometer" | "seconds_per_mile";
  swimming_pace: "seconds_per_100_meters" | "seconds_per_100_yards";
};

export type CanonicalUnitValue = {
  [Dimension in UnitDimension]: {
    dimension: Dimension;
    value: number;
    unit: CanonicalUnitByDimension[Dimension];
  };
}[UnitDimension];

export const displayUnitLabels = {
  kilometers: "km",
  miles: "mi",
  meters: "m",
  feet: "ft",
  kilometers_per_hour: "km/h",
  miles_per_hour: "mph",
  kilograms: "kg",
  pounds: "lb",
  celsius: "°C",
  fahrenheit: "°F",
  seconds_per_kilometer: "/km",
  seconds_per_mile: "/mi",
  seconds_per_100_meters: "/100m",
  seconds_per_100_yards: "/100yd",
} as const;

export type DisplayUnitLabel = (typeof displayUnitLabels)[keyof typeof displayUnitLabels];

/**
 * Strict runtime contract for display values accepted from an input boundary.
 * A unit must belong to the declared dimension; unknown fields and non-finite
 * values are rejected.
 */
export const displayUnitValueSchema = z.discriminatedUnion("dimension", [
  z
    .object({
      dimension: z.literal("distance"),
      value: z.number().finite(),
      unit: z.enum(["kilometers", "miles"]),
    })
    .strict(),
  z
    .object({
      dimension: z.enum(["elevation", "height", "pool_length"]),
      value: z.number().finite(),
      unit: z.enum(["meters", "feet"]),
    })
    .strict(),
  z
    .object({
      dimension: z.literal("speed"),
      value: z.number().finite(),
      unit: z.enum(["kilometers_per_hour", "miles_per_hour"]),
    })
    .strict(),
  z
    .object({
      dimension: z.literal("mass"),
      value: z.number().finite(),
      unit: z.enum(["kilograms", "pounds"]),
    })
    .strict(),
  z
    .object({
      dimension: z.literal("temperature"),
      value: z.number().finite(),
      unit: z.enum(["celsius", "fahrenheit"]),
    })
    .strict(),
  z
    .object({
      dimension: z.literal("running_pace"),
      value: z.number().finite(),
      unit: z.enum(["seconds_per_kilometer", "seconds_per_mile"]),
    })
    .strict(),
  z
    .object({
      dimension: z.literal("swimming_pace"),
      value: z.number().finite(),
      unit: z.enum(["seconds_per_100_meters", "seconds_per_100_yards"]),
    })
    .strict(),
]);

export type DisplayUnitValue = z.infer<typeof displayUnitValueSchema>;

/** Returns the stable, presentation-ready label for a typed display unit. */
export function displayUnitLabel(unit: DisplayUnitValue["unit"]): DisplayUnitLabel {
  return displayUnitLabels[unit];
}

/**
 * Adapts a canonical value to the selected display system without changing its
 * persisted/calculation unit.
 */
export function toDisplayUnitValue(
  value: CanonicalUnitValue,
  unitSystem: PreferredUnitSystem,
): DisplayUnitValue {
  const imperial = unitSystem === "imperial";

  switch (value.dimension) {
    case "distance": {
      const unit = imperial ? "miles" : "kilometers";
      const displayValue = imperial ? kmToMiles(value.value / 1_000) : value.value / 1_000;
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "elevation":
    case "height":
    case "pool_length": {
      const unit = imperial ? "feet" : "meters";
      const displayValue = imperial ? metersToFeet(value.value) : value.value;
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "speed": {
      const unit = imperial ? "miles_per_hour" : "kilometers_per_hour";
      const displayValue = imperial
        ? metersPerSecondToMph(value.value)
        : metersPerSecondToKph(value.value);
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "mass": {
      const unit = imperial ? "pounds" : "kilograms";
      const displayValue = imperial ? kgToLbs(value.value) : value.value;
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "temperature": {
      const unit = imperial ? "fahrenheit" : "celsius";
      const displayValue = imperial ? celsiusToFahrenheit(value.value) : value.value;
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "running_pace": {
      const unit = imperial ? "seconds_per_mile" : "seconds_per_kilometer";
      const displayValue = imperial ? value.value * milesToKm(1) : value.value;
      return { dimension: value.dimension, value: displayValue, unit };
    }
    case "swimming_pace": {
      const unit = imperial ? "seconds_per_100_yards" : "seconds_per_100_meters";
      const displayValue = imperial ? value.value * 0.9144 : value.value;
      return { dimension: value.dimension, value: displayValue, unit };
    }
  }
}

/**
 * Converts an untrusted display input to its explicit metric canonical unit.
 * Returns null when the value is unknown, non-finite, contains extra fields,
 * or uses a unit incompatible with its dimension; it never defaults to metric.
 */
export function toCanonicalUnitValue(value: unknown): CanonicalUnitValue | null {
  const parsed = displayUnitValueSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const displayValue = parsed.data;

  switch (displayValue.dimension) {
    case "distance":
      return {
        dimension: displayValue.dimension,
        value:
          displayValue.unit === "miles"
            ? milesToKm(displayValue.value) * 1_000
            : displayValue.value * 1_000,
        unit: "meters",
      };
    case "elevation":
    case "height":
    case "pool_length":
      return {
        dimension: displayValue.dimension,
        value: displayValue.unit === "feet" ? feetToMeters(displayValue.value) : displayValue.value,
        unit: "meters",
      };
    case "speed":
      return {
        dimension: displayValue.dimension,
        value:
          displayValue.unit === "miles_per_hour"
            ? mphToMps(displayValue.value)
            : kphToMps(displayValue.value),
        unit: "meters_per_second",
      };
    case "mass":
      return {
        dimension: displayValue.dimension,
        value: displayValue.unit === "pounds" ? lbsToKg(displayValue.value) : displayValue.value,
        unit: "kilograms",
      };
    case "temperature":
      return {
        dimension: displayValue.dimension,
        value:
          displayValue.unit === "fahrenheit"
            ? fahrenheitToCelsius(displayValue.value)
            : displayValue.value,
        unit: "celsius",
      };
    case "running_pace":
      return {
        dimension: displayValue.dimension,
        value:
          displayValue.unit === "seconds_per_mile"
            ? displayValue.value / milesToKm(1)
            : displayValue.value,
        unit: "seconds_per_kilometer",
      };
    case "swimming_pace":
      return {
        dimension: displayValue.dimension,
        value:
          displayValue.unit === "seconds_per_100_yards"
            ? displayValue.value / 0.9144
            : displayValue.value,
        unit: "seconds_per_100_meters",
      };
  }
}

/** Formats a display value without applying another conversion. */
export function formatDisplayUnitValue(value: DisplayUnitValue): string {
  if (value.dimension === "running_pace" || value.dimension === "swimming_pace") {
    const totalSeconds = Math.round(value.value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}${displayUnitLabel(value.unit)}`;
  }

  return `${value.value.toFixed(1)} ${displayUnitLabel(value.unit)}`;
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
