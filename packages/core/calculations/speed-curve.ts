import {
  metersPerSecondToSecondsPerKilometer,
  secondsPerKilometerToMetersPerSecond,
} from "../units";

/**
 * Pace and Speed Conversions
 *
 * Unit and display helpers only; canonical duration models own performance curves.
 */

/**
 * Converts pace (seconds per kilometer) to speed (meters per second).
 *
 * @param secondsPerKm - Pace in seconds per kilometer
 * @returns Speed in meters per second
 *
 * @example
 * const pace = 300; // 5:00/km
 * const speed = paceToSpeed(pace);
 * // Returns: 3.33 m/s
 */
export function paceToSpeed(secondsPerKm: number): number {
  return secondsPerKilometerToMetersPerSecond(secondsPerKm);
}

/**
 * Converts speed (meters per second) to pace (seconds per kilometer).
 *
 * @param metersPerSecond - Speed in meters per second
 * @returns Pace in seconds per kilometer
 *
 * @example
 * const speed = 3.33; // m/s
 * const pace = speedToPace(speed);
 * // Returns: 300 (5:00/km)
 */
export function speedToPace(metersPerSecond: number): number {
  return Math.round(metersPerSecondToSecondsPerKilometer(metersPerSecond));
}

/**
 * Formats pace in seconds to MM:SS string format.
 *
 * @param secondsPerKm - Pace in seconds per kilometer
 * @returns Formatted pace string (e.g., "4:30")
 *
 * @example
 * const pace = 270; // seconds
 * const formatted = formatPace(pace);
 * // Returns: "4:30"
 */
export function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Parses pace string (MM:SS) to seconds per kilometer.
 *
 * @param paceString - Pace in "M:SS" or "MM:SS" format (e.g., "4:30" or "10:15")
 * @returns Pace in seconds per kilometer
 *
 * @example
 * const pace = parsePace("4:30");
 * // Returns: 270 seconds
 */
export function parsePace(paceString: string): number {
  const parts = paceString.split(":");
  if (parts.length !== 2) {
    throw new Error('Invalid pace format. Expected "M:SS" or "MM:SS"');
  }

  const minutesPart = parts[0];
  const secondsPart = parts[1];

  if (!minutesPart || !secondsPart) {
    throw new Error('Invalid pace format. Expected "M:SS" or "MM:SS"');
  }

  const minutes = parseInt(minutesPart, 10);
  const seconds = parseInt(secondsPart, 10);

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds < 0 || seconds >= 60) {
    throw new Error("Invalid pace values");
  }

  return minutes * 60 + seconds;
}
