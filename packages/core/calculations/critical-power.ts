import {
  classifyActivityEffortPlausibility,
  getActivityEffortObservationStatus,
} from "../athlete-inputs/activity-effort-policy";
import type { CanonicalSport } from "../schemas";
import type { BestEffort } from "../schemas/activity_efforts";

export interface CriticalPowerResult {
  source: "observed-curve-fit";
  cp: number;
  wPrime: number;
  rSquared: number;
  /** @deprecated Use rSquared. Retained as a compatibility alias. */
  error: number;
  rmseWatts: number;
  maxAbsoluteResidualWatts: number;
  fitMinDurationSeconds: number;
  fitMaxDurationSeconds: number;
  pointCount: number;
  activityCount: number;
  residuals: CriticalPowerResidual[];
  stability: CriticalPowerStabilityDiagnostics;
}

export interface CriticalPowerResidual {
  pointId: string;
  durationSeconds: number;
  observedWatts: number;
  predictedWatts: number;
  residualWatts: number;
}

export interface CriticalPowerStabilityDiagnostics {
  maxCpChangeRatio: number;
  maxWPrimeChangeRatio: number;
  maxPredictionChangeRatio: number;
}

export interface CriticalPowerFitOptions {
  minRSquared?: number;
  minCpWatts?: number;
  maxCpWatts?: number;
  minWPrimeJoules?: number;
  maxWPrimeJoules?: number;
  maxCpChangeRatio?: number;
  maxWPrimeChangeRatio?: number;
  maxPredictionChangeRatio?: number;
}

export type CriticalPowerAbstentionReason =
  | "unsupported-effort"
  | "untrusted-effort"
  | "insufficient-points"
  | "insufficient-independent-activities"
  | "duplicate-duration"
  | "implausible-effort"
  | "non-monotonic-curve"
  | "missing-short-coverage"
  | "missing-long-coverage"
  | "degenerate-fit"
  | "implausible-parameters"
  | "poor-fit"
  | "unstable-fit"
  | "dominant-point";

export type CriticalPowerEvaluation =
  | { status: "accepted"; model: CriticalPowerResult }
  | { status: "abstained"; reason: CriticalPowerAbstentionReason };

export type ObservedCriticalPowerEffort = BestEffort & {
  activity_id: string | null;
  source: Parameters<typeof getActivityEffortObservationStatus>[0]["source"];
  method: string | null;
  provenance: unknown;
};

export const CRITICAL_POWER_CANONICAL_DURATIONS = [300, 600, 1200, 1800] as const;

function isPreferredCriticalPowerEffort<T extends ObservedCriticalPowerEffort>(
  candidate: T,
  current: T,
): boolean {
  if (candidate.value !== current.value) return candidate.value > current.value;
  if (candidate.recorded_at !== current.recorded_at) {
    return candidate.recorded_at > current.recorded_at;
  }
  return (candidate.activity_id ?? "") < (current.activity_id ?? "");
}

/** Selects one deterministic strongest observation per duration for guarded CP evaluation. */
export function selectCanonicalCriticalPowerEfforts<T extends ObservedCriticalPowerEffort>(
  efforts: readonly T[],
): T[] {
  const selected = new Map<number, T>();
  for (const candidate of efforts) {
    if (
      !(CRITICAL_POWER_CANONICAL_DURATIONS as readonly number[]).includes(
        candidate.duration_seconds,
      )
    ) {
      continue;
    }
    const current = selected.get(candidate.duration_seconds);
    if (!current || isPreferredCriticalPowerEffort(candidate, current)) {
      selected.set(candidate.duration_seconds, candidate);
    }
  }
  return [...selected.values()].sort(
    (left, right) => left.duration_seconds - right.duration_seconds,
  );
}

const DEFAULT_FIT_OPTIONS: Required<CriticalPowerFitOptions> = {
  minRSquared: 0.95,
  minCpWatts: 50,
  maxCpWatts: 1_000,
  minWPrimeJoules: 1_000,
  maxWPrimeJoules: 100_000,
  maxCpChangeRatio: 0.15,
  maxWPrimeChangeRatio: 0.3,
  maxPredictionChangeRatio: 0.1,
};

interface LinearFit {
  cp: number;
  wPrime: number;
  rSquared: number;
  rmseWatts: number;
  residuals: number[];
}

/**
 * Calculates the "Season Best" Mean Maximal Power (MMP) curve from a list of efforts.
 *
 * @param efforts - Raw list of best efforts from multiple activities.
 * @param options - Optional filters for the calculation.
 * @returns A list of BestEffort objects, one for each duration, representing the best power output found.
 */
export function calculateSeasonBestCurve<T extends BestEffort>(
  efforts: T[],
  options: {
    days?: number;
    now?: Date;
    activity_category?: CanonicalSport;
    effort_type?: "power" | "speed" | "heart_rate";
  } = {},
): T[] {
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
  const bestByDuration = new Map<number, T>();

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
export function evaluateCriticalPower(
  seasonBestCurve: ObservedCriticalPowerEffort[],
  options: CriticalPowerFitOptions = {},
): CriticalPowerEvaluation {
  const config = { ...DEFAULT_FIT_OPTIONS, ...options };
  if (
    seasonBestCurve.some(
      (effort) => effort.activity_category !== "bike" || effort.effort_type !== "power",
    )
  ) {
    return { status: "abstained", reason: "unsupported-effort" };
  }
  const fitEfforts = seasonBestCurve.filter(
    (e) => e.duration_seconds >= 180 && e.duration_seconds <= 1800,
  );
  if (fitEfforts.length < 3) {
    return { status: "abstained", reason: "insufficient-points" };
  }

  const validEfforts = [...fitEfforts].sort(
    (left, right) => left.duration_seconds - right.duration_seconds,
  );
  if (
    validEfforts.some(
      (effort) =>
        getActivityEffortObservationStatus({
          activityCategory: effort.activity_category,
          effortType: effort.effort_type,
          durationSeconds: effort.duration_seconds,
          value: effort.value,
          unit: effort.unit,
          activityId: effort.activity_id,
          source: effort.source,
          method: effort.method,
          provenance: effort.provenance,
        }) !== "observed",
    )
  ) {
    return { status: "abstained", reason: "untrusted-effort" };
  }
  const activityIds = new Set(
    validEfforts
      .map((effort) => effort.activity_id)
      .filter((activityId): activityId is string => typeof activityId === "string"),
  );
  if (activityIds.size < 2) {
    return { status: "abstained", reason: "insufficient-independent-activities" };
  }
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
    return { status: "abstained", reason: "implausible-effort" };
  }

  for (let index = 1; index < validEfforts.length; index += 1) {
    const previous = validEfforts[index - 1];
    const current = validEfforts[index];
    if (!previous || !current) return { status: "abstained", reason: "degenerate-fit" };
    if (current.duration_seconds === previous.duration_seconds) {
      return { status: "abstained", reason: "duplicate-duration" };
    }
    if (current.value > previous.value) {
      return { status: "abstained", reason: "non-monotonic-curve" };
    }
  }

  const hasShortCoverage = validEfforts.some(
    (effort) => effort.duration_seconds >= 180 && effort.duration_seconds <= 300,
  );
  const hasLongCoverage = validEfforts.some(
    (effort) => effort.duration_seconds >= 900 && effort.duration_seconds <= 1_800,
  );
  if (!hasShortCoverage) return { status: "abstained", reason: "missing-short-coverage" };
  if (!hasLongCoverage) return { status: "abstained", reason: "missing-long-coverage" };

  const fit = fitLinearModel(validEfforts);
  if (!fit) return { status: "abstained", reason: "degenerate-fit" };
  if (
    fit.cp < config.minCpWatts ||
    fit.cp > config.maxCpWatts ||
    fit.wPrime < config.minWPrimeJoules ||
    fit.wPrime > config.maxWPrimeJoules
  ) {
    return { status: "abstained", reason: "implausible-parameters" };
  }
  if (fit.rSquared < config.minRSquared) {
    return { status: "abstained", reason: "poor-fit" };
  }

  const stability = calculateRemovalStability(validEfforts, fit);
  if (!stability) return { status: "abstained", reason: "unstable-fit" };
  if (
    stability.maxCpChangeRatio > config.maxCpChangeRatio ||
    stability.maxWPrimeChangeRatio > config.maxWPrimeChangeRatio
  ) {
    return { status: "abstained", reason: "unstable-fit" };
  }
  if (stability.maxPredictionChangeRatio > config.maxPredictionChangeRatio) {
    return { status: "abstained", reason: "dominant-point" };
  }

  const roundedCp = Math.round(fit.cp);
  const roundedWPrime = Math.round(fit.wPrime);
  const firstEffort = validEfforts[0];
  const lastEffort = validEfforts.at(-1);
  if (!firstEffort || !lastEffort) return { status: "abstained", reason: "degenerate-fit" };

  return {
    status: "accepted",
    model: {
      source: "observed-curve-fit",
      cp: roundedCp,
      wPrime: roundedWPrime,
      rSquared: fit.rSquared,
      error: fit.rSquared,
      rmseWatts: fit.rmseWatts,
      maxAbsoluteResidualWatts: Math.max(...fit.residuals.map(Math.abs)),
      fitMinDurationSeconds: firstEffort.duration_seconds,
      fitMaxDurationSeconds: lastEffort.duration_seconds,
      pointCount: validEfforts.length,
      activityCount: activityIds.size,
      residuals: validEfforts.map((effort, index) => ({
        pointId: `point-${index + 1}`,
        durationSeconds: effort.duration_seconds,
        observedWatts: effort.value,
        predictedWatts: fit.cp + fit.wPrime / effort.duration_seconds,
        residualWatts: fit.residuals[index] ?? 0,
      })),
      stability,
    },
  };
}

/** Compatibility wrapper for callers that use null as the abstention signal. */
export function calculateCriticalPower(
  seasonBestCurve: ObservedCriticalPowerEffort[],
  options: CriticalPowerFitOptions = {},
): CriticalPowerResult | null {
  const evaluation = evaluateCriticalPower(seasonBestCurve, options);
  return evaluation.status === "accepted" ? evaluation.model : null;
}

function fitLinearModel(efforts: ObservedCriticalPowerEffort[]): LinearFit | null {
  const n = efforts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const effort of efforts) {
    const x = 1 / effort.duration_seconds;
    sumX += x;
    sumY += effort.value;
    sumXY += x * effort.value;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < Number.EPSILON) return null;
  const wPrime = (n * sumXY - sumX * sumY) / denominator;
  const cp = (sumY - wPrime * sumX) / n;
  if (!Number.isFinite(cp) || !Number.isFinite(wPrime)) return null;

  const meanY = sumY / n;
  const residuals = efforts.map((effort) => effort.value - (cp + wPrime / effort.duration_seconds));
  const ssTotal = efforts.reduce((sum, effort) => sum + (effort.value - meanY) ** 2, 0);
  const ssResidual = residuals.reduce((sum, residual) => sum + residual ** 2, 0);
  if (!Number.isFinite(ssTotal) || ssTotal <= 0) return null;
  const rSquared = 1 - ssResidual / ssTotal;
  const rmseWatts = Math.sqrt(ssResidual / n);
  if (!Number.isFinite(rSquared) || !Number.isFinite(rmseWatts)) return null;
  return { cp, wPrime, rSquared, rmseWatts, residuals };
}

function calculateRemovalStability(
  efforts: ObservedCriticalPowerEffort[],
  fit: LinearFit,
): CriticalPowerStabilityDiagnostics | null {
  let maxCpChangeRatio = 0;
  let maxWPrimeChangeRatio = 0;
  let maxPredictionChangeRatio = 0;
  const observedRange =
    Math.max(...efforts.map((effort) => effort.value)) -
    Math.min(...efforts.map((effort) => effort.value));
  if (observedRange <= 0) return null;

  for (let removedIndex = 0; removedIndex < efforts.length; removedIndex += 1) {
    const reducedFit = fitLinearModel(efforts.filter((_, index) => index !== removedIndex));
    if (!reducedFit || reducedFit.cp <= 0 || reducedFit.wPrime <= 0) return null;
    maxCpChangeRatio = Math.max(maxCpChangeRatio, Math.abs(reducedFit.cp - fit.cp) / fit.cp);
    maxWPrimeChangeRatio = Math.max(
      maxWPrimeChangeRatio,
      Math.abs(reducedFit.wPrime - fit.wPrime) / fit.wPrime,
    );
    for (const effort of efforts) {
      const prediction = fit.cp + fit.wPrime / effort.duration_seconds;
      const reducedPrediction = reducedFit.cp + reducedFit.wPrime / effort.duration_seconds;
      maxPredictionChangeRatio = Math.max(
        maxPredictionChangeRatio,
        Math.abs(reducedPrediction - prediction) / observedRange,
      );
    }
  }
  return { maxCpChangeRatio, maxWPrimeChangeRatio, maxPredictionChangeRatio };
}
