import { classifyActivityEffortPlausibility } from "../athlete-inputs/activity-effort-policy";
import type { CanonicalSport } from "../schemas";
import type { BestEffort } from "../schemas/activity_efforts";

export interface CriticalPowerResult {
  source: "observed-curve-fit";
  cp: number;
  wPrime: number;
  error: number;
  fitMinDurationSeconds: number;
  fitMaxDurationSeconds: number;
  pointCount: number;
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
    activity_category?: CanonicalSport;
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
    if (activity_category && effort.activity_category !== activity_category) return false;

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
 * The caller is responsible for supplying observed efforts; modeled threshold
 * anchors are not sufficient evidence for this fit.
 *
 * @param seasonBestCurve - An observed season-best power curve.
 * @returns The calculated CP and W', or null if insufficient data.
 */
export function calculateCriticalPower(seasonBestCurve: BestEffort[]): CriticalPowerResult | null {
  if (
    seasonBestCurve.some(
      (effort) => effort.activity_category !== "bike" || effort.effort_type !== "power",
    )
  ) {
    return null;
  }
  const fitEfforts = seasonBestCurve.filter(
    (e) => e.duration_seconds >= 180 && e.duration_seconds <= 1800,
  );
  if (fitEfforts.length < 3) {
    return null;
  }

  const validEfforts = [...fitEfforts].sort(
    (left, right) => left.duration_seconds - right.duration_seconds,
  );
  if (
    validEfforts.some(
      (effort) =>
        classifyActivityEffortPlausibility({
          activityCategory: effort.activity_category,
          effortType: effort.effort_type,
          durationSeconds: effort.duration_seconds,
          value: effort.value,
        }).classification !== "plausible",
    )
  ) {
    return null;
  }

  for (let index = 1; index < validEfforts.length; index += 1) {
    const previous = validEfforts[index - 1];
    const current = validEfforts[index];
    if (!previous || !current) return null;
    if (current.duration_seconds === previous.duration_seconds || current.value > previous.value) {
      return null;
    }
  }

  const hasShortCoverage = validEfforts.some(
    (effort) => effort.duration_seconds >= 180 && effort.duration_seconds <= 300,
  );
  const hasLongCoverage = validEfforts.some(
    (effort) => effort.duration_seconds >= 900 && effort.duration_seconds <= 1_800,
  );
  if (!hasShortCoverage || !hasLongCoverage) return null;

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
  if (!Number.isFinite(denominator) || denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Map back to CP model
  // Intercept = CP
  // Slope = W'

  const cp = intercept;
  const wPrime = slope;
  if (!Number.isFinite(cp) || !Number.isFinite(wPrime) || cp <= 0 || wPrime <= 0) return null;

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

    ssTotal += (y - meanY) ** 2;
    ssRes += (y - yPred) ** 2;
  }

  const rSquared = 1 - ssRes / ssTotal;
  if (!Number.isFinite(rSquared)) return null;

  const roundedCp = Math.round(cp);
  const roundedWPrime = Math.round(wPrime);
  if (roundedCp <= 0 || roundedWPrime <= 0) return null;
  const firstEffort = validEfforts[0];
  const lastEffort = validEfforts.at(-1);
  if (!firstEffort || !lastEffort) return null;

  return {
    source: "observed-curve-fit",
    cp: roundedCp,
    wPrime: roundedWPrime,
    error: rSquared,
    fitMinDurationSeconds: firstEffort.duration_seconds,
    fitMaxDurationSeconds: lastEffort.duration_seconds,
    pointCount: n,
  };
}
