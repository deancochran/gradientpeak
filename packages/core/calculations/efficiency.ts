/**
 * Calculates Efficiency Factor (EF) and Aerobic Decoupling.
 *
 * Efficiency Factor (EF) is the ratio of Normalized Power (or Speed) to Average Heart Rate.
 * It measures the "cost" of the effort relative to the physiological output.
 *
 * Aerobic Decoupling compares the EF of the first half of an effort to the second half.
 * A high decoupling value indicates a decline in aerobic endurance capacity.
 */

/**
 * Calculates Efficiency Factor (EF).
 *
 * Formula: EF = Normalized Metric / Average Heart Rate
 *
 * @param normalizedMetric - Normalized Power (watts) or Normalized Speed (m/s).
 * @param avgHeartRate - Average Heart Rate (bpm).
 * @returns Efficiency Factor (unitless or m/s/bpm).
 */
export function calculateEfficiencyFactor(
  normalizedMetric: number,
  avgHeartRate: number,
): number {
  if (avgHeartRate <= 0) return 0;
  return normalizedMetric / avgHeartRate;
}

/**
 * Calculates Aerobic Decoupling.
 *
 * Formula: Decoupling = (EF1 - EF2) / EF1
 * where EF1 is the Efficiency Factor of the first half,
 * and EF2 is the Efficiency Factor of the second half.
 *
 * @param ef1 - Efficiency Factor of the first half.
 * @param ef2 - Efficiency Factor of the second half.
 * @returns Aerobic Decoupling as a percentage (e.g., 0.05 for 5%).
 */
export function calculateAerobicDecoupling(ef1: number, ef2: number): number {
  if (ef1 <= 0) return 0;
  return (ef1 - ef2) / ef1;
}

/**
 * Calculates Aerobic Decoupling from raw streams.
 *
 * Splits the streams into two halves and calculates EF for each half.
 *
 * @param metricStream - Array of metric values (Power or Speed).
 * @param hrStream - Array of Heart Rate values.
 * @param timestamps - Array of timestamps (seconds).
 * @param metricCalculator - Function to calculate the representative metric (e.g., average or normalized). Defaults to average.
 * @returns Aerobic Decoupling as a percentage.
 */
export function calculateDecouplingFromStreams(
  metricStream: number[],
  hrStream: number[],
  timestamps: number[],
  metricCalculator: (stream: number[]) => number = average,
): number {
  if (
    !metricStream ||
    !hrStream ||
    !timestamps ||
    metricStream.length !== hrStream.length ||
    metricStream.length !== timestamps.length ||
    metricStream.length < 2
  ) {
    return 0;
  }

  const midPoint = Math.floor(metricStream.length / 2);

  const firstHalfMetric = metricStream.slice(0, midPoint);
  const firstHalfHR = hrStream.slice(0, midPoint);

  const secondHalfMetric = metricStream.slice(midPoint);
  const secondHalfHR = hrStream.slice(midPoint);

  const metric1 = metricCalculator(firstHalfMetric);
  const hr1 = average(firstHalfHR);
  const ef1 = calculateEfficiencyFactor(metric1, hr1);

  const metric2 = metricCalculator(secondHalfMetric);
  const hr2 = average(secondHalfHR);
  const ef2 = calculateEfficiencyFactor(metric2, hr2);

  return calculateAerobicDecoupling(ef1, ef2);
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}
