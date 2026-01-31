/**
 * Training Effect Calculation
 *
 * Categorizes the training effect of an activity based on the time spent in different
 * heart rate zones relative to the Lactate Threshold Heart Rate (LTHR).
 *
 * Categories:
 * - Recovery: Mostly Zone 1
 * - Base: Mostly Zone 2
 * - Tempo: Mostly Zone 3
 * - Threshold: Mostly Zone 4
 * - VO2Max: Significant time in Zone 5
 */

export type TrainingEffectLabel =
  | "recovery"
  | "base"
  | "tempo"
  | "threshold"
  | "vo2max";

/**
 * Calculates the primary Training Effect label for an activity.
 *
 * Algorithm:
 * 1. Calculate time spent in each HR zone (based on LTHR).
 * 2. Assign a weight to each zone (higher zones = higher weight).
 * 3. Calculate a "Training Load Score" for each zone (Time * Weight).
 * 4. Determine the dominant training effect based on the distribution of scores.
 *
 * @param hrStream - Array of heart rate values (bpm).
 * @param timestamps - Array of timestamps (seconds).
 * @param lthr - Lactate Threshold Heart Rate (bpm).
 * @returns Training Effect label.
 */
export function calculateTrainingEffect(
  hrStream: number[],
  timestamps: number[],
  lthr: number,
): TrainingEffectLabel {
  if (!hrStream || !timestamps || hrStream.length === 0 || lthr <= 0) {
    return "recovery"; // Default fallback
  }

  // Define Zones based on Coggan's LTHR zones
  // Z1: < 81% LTHR
  // Z2: 81-89% LTHR
  // Z3: 90-93% LTHR
  // Z4: 94-99% LTHR
  // Z5: >= 100% LTHR
  const zones = {
    z1: { min: 0, max: lthr * 0.81, weight: 1 },
    z2: { min: lthr * 0.81, max: lthr * 0.89, weight: 2 },
    z3: { min: lthr * 0.89, max: lthr * 0.93, weight: 4 },
    z4: { min: lthr * 0.93, max: lthr * 0.99, weight: 8 },
    z5: { min: lthr * 0.99, max: Infinity, weight: 16 },
  };

  const timeInZones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  for (let i = 0; i < hrStream.length; i++) {
    const hr = hrStream[i];
    if (hr === undefined) continue;

    const currentTimestamp = timestamps[i];
    const nextTimestamp = timestamps[i + 1];

    // Calculate duration of this sample
    // If it's the last sample, assume 1 second or same as previous interval
    let duration = 1;
    if (nextTimestamp !== undefined && currentTimestamp !== undefined) {
      duration = nextTimestamp - currentTimestamp;
    } else if (
      i > 0 &&
      currentTimestamp !== undefined &&
      timestamps[i - 1] !== undefined
    ) {
      duration = currentTimestamp - timestamps[i - 1]!;
    }

    if (hr < zones.z1.max) timeInZones.z1 += duration;
    else if (hr < zones.z2.max) timeInZones.z2 += duration;
    else if (hr < zones.z3.max) timeInZones.z3 += duration;
    else if (hr < zones.z4.max) timeInZones.z4 += duration;
    else timeInZones.z5 += duration;
  }

  const totalDuration = Object.values(timeInZones).reduce((a, b) => a + b, 0);
  if (totalDuration === 0) return "recovery";

  // Calculate scores
  const scores = {
    recovery: timeInZones.z1 * zones.z1.weight,
    base: timeInZones.z2 * zones.z2.weight,
    tempo: timeInZones.z3 * zones.z3.weight,
    threshold: timeInZones.z4 * zones.z4.weight,
    vo2max: timeInZones.z5 * zones.z5.weight,
  };

  // Determine label based on highest weighted score, but with some logic overrides
  // For example, even a small amount of VO2max work might classify it as VO2max session
  // if it meets a minimum threshold.

  // Thresholds for classification (percentage of total weighted score)
  // This is a simplified heuristic.

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  // If significant time in Z5 (e.g., > 5% of duration or high score contribution)
  if (
    timeInZones.z5 / totalDuration > 0.05 ||
    scores.vo2max / totalScore > 0.3
  ) {
    return "vo2max";
  }

  // If significant time in Z4
  if (
    timeInZones.z4 / totalDuration > 0.1 ||
    scores.threshold / totalScore > 0.3
  ) {
    return "threshold";
  }

  // If significant time in Z3
  if (
    timeInZones.z3 / totalDuration > 0.15 ||
    scores.tempo / totalScore > 0.3
  ) {
    return "tempo";
  }

  // If mostly Z2
  if (scores.base > scores.recovery) {
    return "base";
  }

  return "recovery";
}
