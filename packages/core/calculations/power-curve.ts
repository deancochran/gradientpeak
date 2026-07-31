/**
 * Power Curve Derivation
 *
 * Represents an FTP input without inventing unobserved sprint or W' evidence.
 */

export interface DerivedEffort {
  duration_seconds: number;
  effort_type: "power" | "speed" | "heart_rate";
  value: number;
  unit: string;
  activity_category: "bike" | "run" | "swim";
}

/**
 * Standard durations for power efforts in seconds.
 * Covers the full range from neuromuscular (5s) to FTP (60m).
 */
export const STANDARD_POWER_DURATIONS = [
  5, // 5 seconds (neuromuscular)
  10, // 10 seconds (neuromuscular)
  30, // 30 seconds (anaerobic)
  60, // 1 minute (anaerobic)
  180, // 3 minutes (VO2max)
  300, // 5 minutes (VO2max)
  600, // 10 minutes (threshold)
  1200, // 20 minutes (threshold)
  1800, // 30 minutes (threshold)
  3600, // 60 minutes (FTP)
] as const;

/**
 * Represents FTP as one modeled 60-minute threshold anchor. The conventional
 * one-hour duration makes the meaning explicit while avoiding an inferred W'
 * or any fabricated short-duration points.
 *
 * @param ftp - Functional Threshold Power in watts (power sustainable for ~1 hour)
 * @returns A single modeled FTP threshold anchor
 *
 * @example
 * const ftp = 250; // watts
 * const powerCurve = derivePowerCurveFromFTP(ftp);
 * // Returns: [{ duration_seconds: 3600, value: 250, ... }]
 */
export function derivePowerCurveFromFTP(ftp: number): DerivedEffort[] {
  if (!Number.isFinite(ftp) || ftp < 1 || ftp > 3_000) {
    throw new Error("FTP must be between 1 and 3000 watts");
  }

  return [
    {
      duration_seconds: 3_600,
      effort_type: "power",
      value: Math.round(ftp),
      unit: "watts",
      activity_category: "bike",
    },
  ];
}

/**
 * Predicts only within the duration span of an observed CP/W' fit. Requiring
 * fit metadata prevents an FTP estimate from being passed as if it were CP and
 * prevents silent extrapolation beyond the evidence domain.
 */
export function estimatePowerForDuration(
  model: {
    source: "observed-curve-fit";
    cp: number;
    wPrime: number;
    fitMinDurationSeconds: number;
    fitMaxDurationSeconds: number;
  },
  durationSeconds: number,
): number {
  if (
    model.source !== "observed-curve-fit" ||
    !Number.isFinite(model.cp) ||
    !Number.isFinite(model.wPrime) ||
    !Number.isFinite(model.fitMinDurationSeconds) ||
    !Number.isFinite(model.fitMaxDurationSeconds) ||
    model.cp <= 0 ||
    model.wPrime <= 0 ||
    model.fitMinDurationSeconds > model.fitMaxDurationSeconds
  ) {
    throw new Error("A valid observed CP/W' fit is required");
  }
  const minimum = Math.max(180, model.fitMinDurationSeconds);
  const maximum = Math.min(1_800, model.fitMaxDurationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < minimum || durationSeconds > maximum) {
    throw new Error(
      `Duration must be within the observed fit span (${minimum}-${maximum} seconds)`,
    );
  }

  const power = model.cp + model.wPrime / durationSeconds;
  return Math.round(power);
}
