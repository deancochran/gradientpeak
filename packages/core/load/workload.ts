import type { LoadCoverage, LoadSeries, LoadSeriesIdentity } from "./load-series";
import { evaluateLoadSeries } from "./load-series";

export type SparseHistoryStatus = "insufficient_history" | "provisional" | "stable";

export interface WorkloadEnvelope {
  value: number | null;
  source?: "hr" | "power";
  status: SparseHistoryStatus;
  coverageDays: number;
  requiredDays: number;
  reasonCode?: string;
  identity?: LoadSeriesIdentity;
  coverage?: LoadCoverage;
}

export interface ComputeTrimpInput {
  coverageDays: number;
  durationSeconds?: number | null;
  avgHeartRateBpm?: number | null;
  restingHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;
  sex?: "male" | "female";
  hrSampleCount?: number | null;
  hrCoverageRatio?: number | null;
  /** @deprecated Power is not a TRIMP input. Use computeExternalWorkKj. */
  avgPowerWatts?: number | null;
}

export interface ComputeExternalWorkKjInput {
  coverageDays: number;
  durationSeconds?: number | null;
  avgPowerWatts?: number | null;
}

function sanitizeCoverageDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function sanitizeLoad(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function createEnvelope(
  coverageDays: number,
  requiredDays: number,
): Omit<WorkloadEnvelope, "value"> {
  return {
    status: getSparseHistoryStatus(coverageDays),
    coverageDays: sanitizeCoverageDays(coverageDays),
    requiredDays,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export function getSparseHistoryStatus(coverageDays: number): SparseHistoryStatus {
  const normalizedCoverage = sanitizeCoverageDays(coverageDays);
  if (normalizedCoverage < 7) return "insufficient_history";
  if (normalizedCoverage < 28) return "provisional";
  return "stable";
}

export function computeTrimp(input: ComputeTrimpInput): WorkloadEnvelope {
  const envelope = createEnvelope(input.coverageDays, 7);
  const durationSeconds = sanitizeLoad(input.durationSeconds ?? 0);
  const hrSampleCount = sanitizeLoad(input.hrSampleCount ?? 0);
  const hrCoverageRatio = sanitizeLoad(input.hrCoverageRatio ?? 0);
  const hasHrQuality = hrSampleCount >= 10 && hrCoverageRatio >= 0.6;
  const avgHr = sanitizeLoad(input.avgHeartRateBpm ?? 0);
  const restingHr = sanitizeLoad(input.restingHeartRateBpm ?? 0);
  const maxHr = sanitizeLoad(input.maxHeartRateBpm ?? 0);

  if (!hasHrQuality) return { ...envelope, value: null, reasonCode: "hr_quality_low" };
  if (durationSeconds <= 0 || maxHr <= restingHr || avgHr <= 0) {
    return { ...envelope, value: null, reasonCode: "hr_inputs_missing" };
  }

  const hrReserveRatio = Math.max(0, Math.min(1, (avgHr - restingHr) / (maxHr - restingHr)));
  const sexFactor = input.sex === "female" ? 1.67 : 1.92;
  const value =
    (durationSeconds / 60) * hrReserveRatio * 0.64 * Math.exp(sexFactor * hrReserveRatio);
  return { ...envelope, value: Number.isFinite(value) ? value : null, source: "hr" };
}

export function computeExternalWorkKj(input: ComputeExternalWorkKjInput): WorkloadEnvelope {
  const envelope = createEnvelope(input.coverageDays, 1);
  const durationSeconds = sanitizeLoad(input.durationSeconds ?? 0);
  const avgPowerWatts = sanitizeLoad(input.avgPowerWatts ?? 0);
  if (durationSeconds <= 0 || avgPowerWatts <= 0) {
    return { ...envelope, value: null, reasonCode: "power_inputs_missing" };
  }
  return { ...envelope, value: (avgPowerWatts * durationSeconds) / 1000, source: "power" };
}

function unavailableLegacy(requiredDays: number): WorkloadEnvelope {
  return {
    ...createEnvelope(0, requiredDays),
    value: null,
    reasonCode: "identity_required",
  };
}

export function computeAcwr(series: LoadSeries): WorkloadEnvelope;
/** @deprecated Numeric arrays have no load identity and are unavailable. */
export function computeAcwr(dailyLoads: number[], coverageDays: number): WorkloadEnvelope;
export function computeAcwr(
  seriesOrLoads: LoadSeries | number[],
  _coverageDays?: number,
): WorkloadEnvelope {
  if (Array.isArray(seriesOrLoads)) return unavailableLegacy(28);
  const eligibility = evaluateLoadSeries(seriesOrLoads, 28);
  const envelope = {
    ...createEnvelope(eligibility.coverage.compatibleDays, 28),
    identity: seriesOrLoads.identity,
    coverage: eligibility.coverage,
  };
  if (!eligibility.eligible) {
    return { ...envelope, value: null, reasonCode: eligibility.reason };
  }
  const acuteLoad = average(eligibility.values.slice(-7));
  const chronicLoad = average(eligibility.values);
  if (chronicLoad <= 0) return { ...envelope, value: null, reasonCode: "chronic_load_zero" };
  return { ...envelope, value: acuteLoad / chronicLoad };
}

export function computeMonotony(series: LoadSeries): WorkloadEnvelope;
/** @deprecated Numeric arrays have no load identity and are unavailable. */
export function computeMonotony(dailyLoads: number[], coverageDays: number): WorkloadEnvelope;
export function computeMonotony(
  seriesOrLoads: LoadSeries | number[],
  _coverageDays?: number,
): WorkloadEnvelope {
  if (Array.isArray(seriesOrLoads)) return unavailableLegacy(7);
  const eligibility = evaluateLoadSeries(seriesOrLoads, 7);
  const envelope = {
    ...createEnvelope(eligibility.coverage.compatibleDays, 7),
    identity: seriesOrLoads.identity,
    coverage: eligibility.coverage,
  };
  if (!eligibility.eligible) {
    return { ...envelope, value: null, reasonCode: eligibility.reason };
  }
  const sdLoad = standardDeviation(eligibility.values);
  if (sdLoad <= 0) return { ...envelope, value: null, reasonCode: "zero_variance" };
  return { ...envelope, value: average(eligibility.values) / sdLoad };
}
