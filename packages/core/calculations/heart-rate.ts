/**
 * Heart Rate Calculations
 *
 * Functions for calculating and estimating heart rate-related metrics including:
 * - VO2max estimation from HR data
 * - Lactate Threshold Heart Rate (LTHR) estimation
 * - Maximum Heart Rate estimation from age
 * - Heart Rate Reserve (HRR) calculation
 *
 * Used during onboarding to derive physiological metrics from minimal user input,
 * creating a complete cardiovascular fitness profile.
 */

/**
 * Calculates VO2max from maximum and resting heart rate.
 *
 * Uses the Uth-Sørensen-Overgaard-Pedersen formula, which provides a reasonable
 * estimate of VO2max based on the ratio of max HR to resting HR.
 *
 * Formula: VO2max = 15.3 × (Max HR / Resting HR)
 *
 * Note: This is an estimation and may not be as accurate as lab testing or
 * field tests with performance data. Best used for initial profiling.
 *
 * @param maxHR - Maximum heart rate in bpm (typically 180-220 for adults)
 * @param restingHR - Resting heart rate in bpm (typically 40-80 for athletes)
 * @returns Estimated VO2max in ml/kg/min
 * @throws Error if heart rates are invalid (maxHR <= restingHR or values out of range)
 *
 * @example
 * const vo2max = calculateVO2MaxFromHR(190, 55);
 * // Returns: 52.8 ml/kg/min (well-trained athlete)
 *
 * @example
 * const vo2max = calculateVO2MaxFromHR(185, 70);
 * // Returns: 40.4 ml/kg/min (recreational athlete)
 */
export function calculateVO2MaxFromHR(
  maxHR: number,
  restingHR: number,
): number {
  // Validate inputs
  if (maxHR <= 0 || restingHR <= 0) {
    throw new Error("Heart rates must be greater than 0");
  }

  if (maxHR <= restingHR) {
    throw new Error("Max HR must be greater than resting HR");
  }

  if (maxHR < 100 || maxHR > 250) {
    throw new Error("Max HR must be between 100 and 250 bpm");
  }

  if (restingHR < 30 || restingHR > 120) {
    throw new Error("Resting HR must be between 30 and 120 bpm");
  }

  // Apply Uth-Sørensen-Overgaard-Pedersen formula
  const vo2max = 15.3 * (maxHR / restingHR);

  // Clamp to reasonable human limits (20-100 ml/kg/min)
  return Math.max(20, Math.min(vo2max, 100));
}

/**
 * Estimates Lactate Threshold Heart Rate (LTHR) from maximum heart rate.
 *
 * LTHR is the heart rate at which lactate begins to accumulate in the blood,
 * typically occurring at approximately 85% of maximum heart rate.
 *
 * This is a simplified estimation. More accurate LTHR can be determined through:
 * - Lab testing with blood lactate measurements
 * - Field tests (30-minute time trial average HR)
 * - Threshold pace/power testing
 *
 * @param maxHR - Maximum heart rate in bpm
 * @returns Estimated LTHR in bpm (rounded to nearest integer)
 * @throws Error if maxHR is invalid
 *
 * @example
 * const lthr = estimateLTHR(190);
 * // Returns: 162 bpm (85% of 190)
 *
 * @example
 * const lthr = estimateLTHR(180);
 * // Returns: 153 bpm (85% of 180)
 */
export function estimateLTHR(maxHR: number): number {
  if (maxHR <= 0) {
    throw new Error("Max HR must be greater than 0");
  }

  if (maxHR < 100 || maxHR > 250) {
    throw new Error("Max HR must be between 100 and 250 bpm");
  }

  // LTHR is approximately 85% of max HR
  return Math.round(maxHR * 0.85);
}

/**
 * Estimates maximum heart rate from age using the traditional 220 - age formula.
 *
 * Note: This is a population average and can vary significantly between individuals
 * (±10-15 bpm is common). More accurate methods include:
 * - Actual max HR from recent hard efforts
 * - Lab testing
 * - Field testing (all-out 3-5 minute effort)
 * - Alternative formulas: 207 - (0.7 × age) or 211 - (0.8 × age)
 *
 * @param age - Age in years (must be between 10 and 100)
 * @returns Estimated max HR in bpm
 * @throws Error if age is invalid
 *
 * @example
 * const maxHR = estimateMaxHRFromAge(30);
 * // Returns: 190 bpm
 *
 * @example
 * const maxHR = estimateMaxHRFromAge(50);
 * // Returns: 170 bpm
 */
export function estimateMaxHRFromAge(age: number): number {
  if (age <= 0) {
    throw new Error("Age must be greater than 0");
  }

  if (age < 10 || age > 100) {
    throw new Error("Age must be between 10 and 100 years");
  }

  // Traditional formula: 220 - age
  return 220 - age;
}

/**
 * Calculates Heart Rate Reserve (HRR).
 *
 * HRR represents the difference between maximum and resting heart rate,
 * and is used in the Karvonen formula for calculating target heart rate zones.
 *
 * Target HR = ((Max HR - Resting HR) × intensity%) + Resting HR
 *
 * @param maxHR - Maximum heart rate in bpm
 * @param restingHR - Resting heart rate in bpm
 * @returns Heart rate reserve in bpm
 * @throws Error if heart rates are invalid
 *
 * @example
 * const hrr = calculateHRReserve(190, 55);
 * // Returns: 135 bpm
 *
 * @example
 * // Calculate 70% intensity target HR using HRR
 * const hrr = calculateHRReserve(190, 55);
 * const targetHR = (hrr * 0.7) + 55;
 * // Returns: 149.5 bpm
 */
export function calculateHRReserve(maxHR: number, restingHR: number): number {
  if (maxHR <= 0 || restingHR <= 0) {
    throw new Error("Heart rates must be greater than 0");
  }

  if (maxHR <= restingHR) {
    throw new Error("Max HR must be greater than resting HR");
  }

  return maxHR - restingHR;
}

/**
 * Calculates target heart rate for a given training intensity using the Karvonen formula.
 *
 * The Karvonen formula accounts for resting heart rate, providing more personalized
 * training zones than simple percentage of max HR.
 *
 * Formula: Target HR = ((Max HR - Resting HR) × intensity) + Resting HR
 *
 * @param maxHR - Maximum heart rate in bpm
 * @param restingHR - Resting heart rate in bpm
 * @param intensity - Training intensity as decimal (0.0-1.0, e.g., 0.7 for 70%)
 * @returns Target heart rate in bpm (rounded to nearest integer)
 * @throws Error if inputs are invalid
 *
 * @example
 * // Calculate 70% intensity target HR
 * const targetHR = calculateTargetHR(190, 55, 0.7);
 * // Returns: 150 bpm
 *
 * @example
 * // Calculate 85% intensity (threshold) target HR
 * const thresholdHR = calculateTargetHR(190, 55, 0.85);
 * // Returns: 170 bpm
 */
export function calculateTargetHR(
  maxHR: number,
  restingHR: number,
  intensity: number,
): number {
  if (maxHR <= 0 || restingHR <= 0) {
    throw new Error("Heart rates must be greater than 0");
  }

  if (maxHR <= restingHR) {
    throw new Error("Max HR must be greater than resting HR");
  }

  if (intensity < 0 || intensity > 1) {
    throw new Error("Intensity must be between 0 and 1 (0% to 100%)");
  }

  const hrr = calculateHRReserve(maxHR, restingHR);
  const targetHR = hrr * intensity + restingHR;

  return Math.round(targetHR);
}

/**
 * Calculates heart rate training zones using the Karvonen method.
 *
 * Returns 5 training zones commonly used in endurance training:
 * - Zone 1: Recovery/Easy (50-60% HRR)
 * - Zone 2: Aerobic/Base (60-70% HRR)
 * - Zone 3: Tempo (70-80% HRR)
 * - Zone 4: Threshold (80-90% HRR)
 * - Zone 5: VO2max (90-100% HRR)
 *
 * @param maxHR - Maximum heart rate in bpm
 * @param restingHR - Resting heart rate in bpm
 * @returns Object containing min/max HR for each of 5 zones
 *
 * @example
 * const zones = calculateHRZones(190, 55);
 * // Returns: {
 * //   zone1: { min: 123, max: 136 },  // Recovery
 * //   zone2: { min: 136, max: 150 },  // Aerobic
 * //   zone3: { min: 150, max: 163 },  // Tempo
 * //   zone4: { min: 163, max: 177 },  // Threshold
 * //   zone5: { min: 177, max: 190 },  // VO2max
 * // }
 */
export function calculateHRZones(
  maxHR: number,
  restingHR: number,
): {
  zone1: { min: number; max: number };
  zone2: { min: number; max: number };
  zone3: { min: number; max: number };
  zone4: { min: number; max: number };
  zone5: { min: number; max: number };
} {
  return {
    zone1: {
      min: calculateTargetHR(maxHR, restingHR, 0.5),
      max: calculateTargetHR(maxHR, restingHR, 0.6),
    },
    zone2: {
      min: calculateTargetHR(maxHR, restingHR, 0.6),
      max: calculateTargetHR(maxHR, restingHR, 0.7),
    },
    zone3: {
      min: calculateTargetHR(maxHR, restingHR, 0.7),
      max: calculateTargetHR(maxHR, restingHR, 0.8),
    },
    zone4: {
      min: calculateTargetHR(maxHR, restingHR, 0.8),
      max: calculateTargetHR(maxHR, restingHR, 0.9),
    },
    zone5: {
      min: calculateTargetHR(maxHR, restingHR, 0.9),
      max: maxHR,
    },
  };
}
