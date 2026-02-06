/**
 * Power Curve Derivation
 *
 * Derives a complete power curve from FTP (Functional Threshold Power) using
 * the Critical Power model (Monod & Scherrer).
 *
 * Model: Power(t) = CP + (W' / t)
 * Where:
 * - CP = Critical Power (≈ FTP)
 * - W' = Anaerobic work capacity (joules)
 * - t = Duration (seconds)
 *
 * Used during onboarding to generate estimated best efforts across all durations
 * from a single FTP input, creating a complete performance profile.
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
 * Derives a complete power curve from FTP using the Critical Power model.
 *
 * This function generates estimated power efforts across standard durations
 * based on a single FTP input. It's used during onboarding to create a
 * comprehensive performance profile from minimal user input.
 *
 * @param ftp - Functional Threshold Power in watts (power sustainable for ~1 hour)
 * @param wPrime - Anaerobic work capacity in joules (default: 20000J for recreational cyclist)
 * @returns Array of power efforts for standard durations (5s to 60m)
 *
 * @example
 * const ftp = 250; // watts
 * const powerCurve = derivePowerCurveFromFTP(ftp);
 * // Returns: [
 * //   { duration_seconds: 5, value: 4250, ... },   // 5s sprint
 * //   { duration_seconds: 60, value: 583, ... },   // 1m
 * //   { duration_seconds: 3600, value: 250, ... }, // 60m (FTP)
 * // ]
 */
export function derivePowerCurveFromFTP(
  ftp: number,
  wPrime: number = 20000,
): DerivedEffort[] {
  // Validate inputs
  if (ftp <= 0) {
    throw new Error("FTP must be greater than 0");
  }

  if (wPrime < 0) {
    throw new Error("W' (anaerobic capacity) must be non-negative");
  }

  // Generate power curve for all standard durations
  return STANDARD_POWER_DURATIONS.map((duration) => {
    // Apply Critical Power formula: Power = CP + (W' / t)
    const power = ftp + wPrime / duration;

    return {
      duration_seconds: duration,
      effort_type: "power",
      value: Math.round(power),
      unit: "watts",
      activity_category: "bike",
    };
  });
}

/**
 * Estimates W' (anaerobic work capacity) based on athlete profile.
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
 * Calculates estimated power for a specific duration from FTP and W'.
 *
 * Useful for calculating power targets for specific intervals or tests.
 *
 * @param ftp - Functional Threshold Power in watts
 * @param wPrime - Anaerobic work capacity in joules
 * @param durationSeconds - Target duration in seconds
 * @returns Estimated sustainable power for the given duration
 *
 * @example
 * const power5min = estimatePowerForDuration(250, 20000, 300);
 * // Returns: 317W (5-minute power)
 */
export function estimatePowerForDuration(
  ftp: number,
  wPrime: number,
  durationSeconds: number,
): number {
  if (ftp <= 0 || durationSeconds <= 0) {
    throw new Error("FTP and duration must be greater than 0");
  }

  if (wPrime < 0) {
    throw new Error("W' must be non-negative");
  }

  // Apply Critical Power formula
  const power = ftp + wPrime / durationSeconds;
  return Math.round(power);
}
