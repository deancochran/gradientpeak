/**
 * Calculates Normalized Graded Pace (NGP) for running.
 *
 * Uses the Minetti formula to adjust pace based on grade (elevation change).
 * Then applies a smoothing algorithm similar to Normalized Power.
 */

/**
 * Calculates the energy cost of running at a specific grade using the Minetti formula.
 *
 * Formula: C = 155.4g^5 - 30.4g^4 - 43.3g^3 + 46.3g^2 + 19.5g + 3.6
 * where g is the grade (decimal, e.g., 0.05 for 5%).
 *
 * @param grade - The grade as a decimal (rise / run).
 * @returns The energy cost in J/kg/m.
 */
export function getCostFactor(grade: number): number {
  // Minetti formula coefficients
  const c5 = 155.4;
  const c4 = -30.4;
  const c3 = -43.3;
  const c2 = 46.3;
  const c1 = 19.5;
  const c0 = 3.6;

  const g = grade;
  const g2 = g * g;
  const g3 = g2 * g;
  const g4 = g3 * g;
  const g5 = g4 * g;

  const cost = c5 * g5 + c4 * g4 + c3 * g3 + c2 * g2 + c1 * g + c0;
  return cost;
}

/**
 * Calculates the Grade Adjusted Speed (GAS) for a given speed and grade.
 *
 * GAS = Speed * (Cost(grade) / Cost(0))
 *
 * @param speed - Speed in meters per second.
 * @param grade - Grade as a decimal (rise / run).
 * @returns Grade Adjusted Speed in meters per second.
 */
export function calculateGradedSpeed(speed: number, grade: number): number {
  const flatCost = getCostFactor(0); // Should be 3.6
  const currentCost = getCostFactor(grade);

  // If cost is negative (extreme downhill), clamp it or handle it?
  // Minetti formula is valid for -0.45 to +0.45 grade.
  // We'll clamp the ratio to avoid extreme values.
  const ratio = Math.max(0.5, Math.min(currentCost / flatCost, 3.0));

  return speed * ratio;
}

/**
 * Calculates the Grade Adjusted Speed stream for an entire activity.
 *
 * @param speedStream - Array of speed values (m/s).
 * @param elevationStream - Array of elevation values (meters).
 * @param timestamps - Array of timestamps (seconds).
 * @returns Array of Grade Adjusted Speed values (m/s).
 */
export function calculateGradedSpeedStream(
  speedStream: number[],
  elevationStream: number[],
  timestamps: number[],
): number[] {
  if (
    !speedStream ||
    !elevationStream ||
    !timestamps ||
    speedStream.length !== elevationStream.length ||
    speedStream.length !== timestamps.length
  ) {
    return speedStream || [];
  }

  const gradedSpeedStream: number[] = [];

  for (let i = 0; i < speedStream.length; i++) {
    const speed = speedStream[i];

    // For the first point, we can't calculate grade, so use raw speed
    if (i === 0 || speed === undefined) {
      if (speed !== undefined) {
        gradedSpeedStream.push(speed);
      }
      continue;
    }

    const currentTimestamp = timestamps[i];
    const prevTimestamp = timestamps[i - 1];
    const currentElevation = elevationStream[i];
    const prevElevation = elevationStream[i - 1];

    if (
      currentTimestamp === undefined ||
      prevTimestamp === undefined ||
      currentElevation === undefined ||
      prevElevation === undefined
    ) {
      gradedSpeedStream.push(speed);
      continue;
    }

    const dist = speed * (currentTimestamp - prevTimestamp);
    const elevDiff = currentElevation - prevElevation;

    // Avoid division by zero
    let grade = 0;
    if (dist > 0) {
      grade = elevDiff / dist;
    }

    // Clamp grade to reasonable limits for running (-45% to +45%)
    // Minetti is valid roughly in this range.
    grade = Math.max(-0.45, Math.min(grade, 0.45));

    const gradedSpeed = calculateGradedSpeed(speed, grade);
    gradedSpeedStream.push(gradedSpeed);
  }

  return gradedSpeedStream;
}

/**
 * Calculates Normalized Graded Pace (NGP) from a stream of graded speeds.
 *
 * Uses a 30-second rolling average and a weighting algorithm similar to Normalized Power.
 *
 * @param gradedSpeedStream - Array of Grade Adjusted Speed values (m/s).
 * @returns Normalized Graded Speed (m/s).
 */
export function calculateNGP(gradedSpeedStream: number[]): number {
  if (!gradedSpeedStream || gradedSpeedStream.length === 0) return 0;

  const WINDOW_SIZE = 30; // 30-second rolling average
  const rollingAverages: number[] = [];

  // Calculate 30-second rolling averages
  for (let i = 0; i < gradedSpeedStream.length; i++) {
    const start = Math.max(0, i - WINDOW_SIZE + 1);
    const window = gradedSpeedStream.slice(start, i + 1);

    if (window.length === 0) continue;

    const avg = window.reduce((sum, s) => sum + s, 0) / window.length;
    rollingAverages.push(avg);
  }

  if (rollingAverages.length === 0) return 0;

  // Raise each rolling average to the 4th power
  // Note: For speed, the relationship isn't exactly the same as power (P ~ v^3),
  // but the standard NGP algorithm often uses a similar weighting or just the rolling average.
  // TrainingPeaks uses a specific algorithm for NGP.
  // Common implementation:
  // 1. Calculate 30s rolling average of graded speed.
  // 2. Raise to 4th power.
  // 3. Average.
  // 4. 4th root.
  // This matches the NP algorithm structure.

  const raisedTo4th = rollingAverages.map((avg) => Math.pow(avg, 4));
  const avgOf4th =
    raisedTo4th.reduce((sum, val) => sum + val, 0) / raisedTo4th.length;
  const normalizedSpeed = Math.pow(avgOf4th, 1 / 4);

  return normalizedSpeed;
}
