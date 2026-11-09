import {
  kgToLbs,
  kmToMiles,
  metersPerSecondToKph,
  metersPerSecondToMph,
  metersToFeet,
} from "./conversions";

export function formatDistance(meters: number, unit: "metric" | "imperial" = "metric"): string {
  if (unit === "imperial") {
    const miles = kmToMiles(meters / 1000);
    return miles >= 1 ? `${miles.toFixed(2)} mi` : `${Math.round(metersToFeet(meters))} ft`;
  }
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function formatSpeed(mps: number, unit: "metric" | "imperial" = "metric"): string {
  return unit === "imperial"
    ? `${metersPerSecondToMph(mps).toFixed(1)} mph`
    : `${metersPerSecondToKph(mps).toFixed(1)} km/h`;
}

/** Formats a meters-per-second speed as a per-kilometer or per-mile pace. */
export function formatPace(speedMs: number, unit: "metric" | "imperial" = "metric"): string {
  if (speedMs <= 0) return "--:--";
  const paceSeconds =
    unit === "imperial" ? 1 / (speedMs * 0.000621371 * 60) : 1 / ((speedMs / 1000) * 60);
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}${unit === "imperial" ? "/mi" : "/km"}`;
}

export function formatWeight(kg: number, unit: "metric" | "imperial" = "metric"): string {
  return unit === "imperial" ? `${Math.round(kgToLbs(kg))} lbs` : `${kg.toFixed(1)} kg`;
}
