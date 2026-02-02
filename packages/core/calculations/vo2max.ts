/**
 * VO2 Max Estimation
 *
 * Estimates VO2 Max based on the ratio of Maximum Heart Rate to Resting Heart Rate.
 * This is a simplified estimation formula (Uth-Sørensen-Overgaard-Pedersen estimation).
 *
 * Formula: VO2 max = 15.3 × (Max HR / Resting HR)
 *
 * Note: This is an estimation and may not be as accurate as a lab test or
 * more complex algorithms that factor in age, gender, and performance data.
 */

/**
 * Estimates VO2 Max using the Max HR / Resting HR ratio.
 *
 * @param maxHR - Maximum Heart Rate (bpm).
 * @param restingHR - Resting Heart Rate (bpm).
 * @returns Estimated VO2 Max (ml/kg/min).
 */
export function estimateVO2Max(maxHR: number, restingHR: number): number {
  if (restingHR <= 0 || maxHR <= 0) {
    return 0;
  }

  // Formula: 15.3 * (Max HR / Resting HR)
  const vo2Max = 15.3 * (maxHR / restingHR);

  // Clamp to reasonable human limits (e.g., 10-100)
  return Math.max(10, Math.min(vo2Max, 100));
}
