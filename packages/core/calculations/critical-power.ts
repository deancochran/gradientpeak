import type { BestEffort } from "../schemas/activity_efforts";
import type { PublicActivityCategory } from "@repo/supabase";

export interface CriticalPowerResult {
  cp: number;
  wPrime: number;
  error: number; // R-squared or similar error metric could be useful, but for now maybe just standard error estimate if possible, or 0.
}

/**
 * Calculates the "Season Best" Mean Maximal Power (MMP) curve from a list of efforts.
 *
 * @param efforts - Raw list of best efforts from multiple activities.
 * @param options - Optional filters for the calculation.
 * @returns A list of BestEffort objects, one for each duration, representing the best power output found.
 */
export function calculateSeasonBestCurve(
  efforts: BestEffort[],
  options: {
    days?: number;
    now?: Date;
    activity_category?: PublicActivityCategory;
    effort_type?: "power" | "speed";
  } = {},
): BestEffort[] {
  const {
    days = 90,
    now = new Date(),
    activity_category = "bike",
    effort_type = "power",
  } = options;
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. Filter efforts
  const filteredEfforts = efforts.filter((effort) => {
    // Filter by category if provided
    if (activity_category && effort.activity_category !== activity_category)
      return false;

    // Filter by type if provided
    if (effort_type && effort.effort_type !== effort_type) return false;

    // Must be within time window
    const effortDate = new Date(effort.recorded_at);
    if (effortDate < cutoffDate) return false;
    return true;
  });

  // 2. Group by duration and find max value
  const bestByDuration = new Map<number, BestEffort>();

  for (const effort of filteredEfforts) {
    const currentBest = bestByDuration.get(effort.duration_seconds);
    if (!currentBest || effort.value > currentBest.value) {
      bestByDuration.set(effort.duration_seconds, effort);
    }
  }

  // 3. Convert back to array and sort by duration
  return Array.from(bestByDuration.values()).sort(
    (a, b) => a.duration_seconds - b.duration_seconds,
  );
}

/**
 * Calculates Critical Power (CP) and W' using the Monod & Scherrer 2-parameter model.
 *
 * Model: Power = CP + W' * (1/Time)
 * Linear Regression: y = mx + c
 * y = Power
 * x = 1 / Time
 * m (slope) = W'
 * c (intercept) = CP
 *
 * @param seasonBestCurve - The season best power curve (list of BestEffort).
 * @returns The calculated CP and W', or null if insufficient data.
 */
export function calculateCriticalPower(
  seasonBestCurve: BestEffort[],
): CriticalPowerResult | null {
  // Filter for valid range: 3 minutes (180s) to 30 minutes (1800s)
  // This avoids anaerobic skew (<3m) and aerobic drift (>30m)
  const validEfforts = seasonBestCurve.filter(
    (e) => e.duration_seconds >= 180 && e.duration_seconds <= 1800,
  );

  // Need at least 2 points for regression, but preferably more
  if (validEfforts.length < 2) {
    return null;
  }

  // Prepare data points for regression
  const n = validEfforts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const effort of validEfforts) {
    const t = effort.duration_seconds;
    const p = effort.value;

    const x = 1 / t;
    const y = p;

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  // Linear Regression Calculation
  // Slope (m) = (n*sumXY - sumX*sumY) / (n*sumXX - sumX*sumX)
  // Intercept (c) = (sumY - m*sumX) / n

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return null; // Vertical line, should not happen with 1/t
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Map back to CP model
  // Intercept = CP
  // Slope = W'

  const cp = intercept;
  const wPrime = slope;

  // Calculate R-squared (Coefficient of Determination)
  // SST = sum((y - meanY)^2)
  // SSR = sum((yPred - meanY)^2)
  // R2 = SSR / SST
  const meanY = sumY / n;
  let ssTotal = 0;
  let ssRes = 0;

  for (const effort of validEfforts) {
    const t = effort.duration_seconds;
    const p = effort.value;
    const x = 1 / t;
    const y = p;

    const yPred = slope * x + intercept;

    ssTotal += Math.pow(y - meanY, 2);
    ssRes += Math.pow(y - yPred, 2);
  }

  const rSquared = 1 - ssRes / ssTotal;

  return {
    cp: Math.round(cp),
    wPrime: Math.round(wPrime),
    error: rSquared, // Using R2 as a quality metric
  };
}
