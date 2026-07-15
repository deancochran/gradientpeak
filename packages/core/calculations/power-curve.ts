/**
 * Power Curve Derivation
 *
 * Represents an FTP input without inventing unobserved sprint or W' evidence.
 */

export interface DerivedEffort {
  duration_seconds: number;
  effort_type: "power" | "speed";
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
 * Estimates W' (anaerobic work capacity) based on athlete profile.
 *
 * @deprecated Demographic estimates are not observed evidence and must not be
 * used for recommendations or CP/W' models. Retained only for API compatibility.
 *
 * W' represents the finite amount of work that can be performed above CP (Critical Power).
 * It varies based on athlete characteristics and training status.
 *
 * Baseline values:
 * - Recreational male: 15,000 - 20,000 J
 * - Recreational female: 12,000 - 16,000 J
 * - Trained athletes: +20-30% higher
 * - Elite athletes: +50-100% higher
 *
 * @param weightKg - Athlete weight in kg
 * @param gender - Athlete gender
 * @param trainingLevel - Training status: 'recreational' | 'trained' | 'elite'
 * @returns Estimated W' in joules
 *
 * @example
 * const wPrime = estimateWPrime(70, 'male', 'recreational');
 * // Returns: ~17,500 J (scaled to 70kg)
 */
export function estimateWPrime(
  weightKg: number,
  gender: "male" | "female" | "other",
  trainingLevel: "recreational" | "trained" | "elite" = "recreational",
): number {
  if (weightKg <= 0) {
    throw new Error("Weight must be greater than 0");
  }

  // Base W' values per kg for 70kg reference athlete
  const baseWPrimePerKg = {
    recreational: {
      male: 250, // ~17,500 J for 70kg
      female: 200, // ~14,000 J for 70kg
      other: 225, // Average
    },
    trained: {
      male: 312, // +25% (~21,840 J for 70kg)
      female: 250, // +25% (~17,500 J for 70kg)
      other: 281,
    },
    elite: {
      male: 400, // +60% (~28,000 J for 70kg)
      female: 320, // +60% (~22,400 J for 70kg)
      other: 360,
    },
  };

  const wPrimePerKg = baseWPrimePerKg[trainingLevel][gender];
  const estimatedWPrime = weightKg * wPrimePerKg;

  return Math.round(estimatedWPrime);
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
