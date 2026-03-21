export type SparseHistoryStatus = "insufficient_history" | "provisional" | "stable";

export interface WorkloadEnvelope {
  value: number | null;
  source?: "hr" | "power_proxy";
  status: SparseHistoryStatus;
  coverageDays: number;
  requiredDays: number;
  reasonCode?: string;
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

function toFiniteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
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

  if (hasHrQuality && durationSeconds > 0 && maxHr > restingHr && avgHr > 0) {
    const hrReserveRatio = Math.max(0, Math.min(1, (avgHr - restingHr) / (maxHr - restingHr)));
    const sexFactor = input.sex === "female" ? 1.67 : 1.92;
    const trimp =
      (durationSeconds / 60) * hrReserveRatio * 0.64 * Math.exp(sexFactor * hrReserveRatio);

    return {
      ...envelope,
      value: toFiniteOrNull(trimp),
      source: "hr",
    };
  }

  const avgPowerWatts = sanitizeLoad(input.avgPowerWatts ?? 0);
  if (avgPowerWatts > 0 && durationSeconds > 0) {
    const powerProxy = (avgPowerWatts * durationSeconds) / 1000;
    return {
      ...envelope,
      value: toFiniteOrNull(powerProxy),
      source: "power_proxy",
      reasonCode: hasHrQuality ? "hr_inputs_missing" : "hr_quality_low",
    };
  }

  return {
    ...envelope,
    value: null,
    reasonCode: hasHrQuality ? "missing_inputs" : "hr_quality_low",
  };
}

export function computeAcwr(dailyLoads: number[], coverageDays: number): WorkloadEnvelope {
  const envelope = createEnvelope(coverageDays, 28);
  const sanitized = dailyLoads.map(sanitizeLoad);
  const acuteWindow = sanitized.slice(-7);
  const chronicWindow = sanitized.slice(-28);

  if (acuteWindow.length === 0 || chronicWindow.length === 0) {
    return {
      ...envelope,
      value: null,
      reasonCode: "no_load_data",
    };
  }

  const acuteLoad = average(acuteWindow);
  const chronicLoad = average(chronicWindow);

  if (chronicLoad <= 0) {
    return {
      ...envelope,
      value: null,
      reasonCode: "chronic_load_zero",
    };
  }

  return {
    ...envelope,
    value: toFiniteOrNull(acuteLoad / chronicLoad),
    reasonCode: undefined,
  };
}

export function computeMonotony(dailyLoads: number[], coverageDays: number): WorkloadEnvelope {
  const envelope = createEnvelope(coverageDays, 7);
  const sanitized = dailyLoads.map(sanitizeLoad).slice(-7);

  if (sanitized.length === 0) {
    return {
      ...envelope,
      value: null,
      reasonCode: "no_load_data",
    };
  }

  const meanLoad = average(sanitized);
  const sdLoad = standardDeviation(sanitized);

  if (sdLoad <= 0) {
    return {
      ...envelope,
      value: null,
      reasonCode: "zero_variance",
    };
  }

  return {
    ...envelope,
    value: toFiniteOrNull(meanLoad / sdLoad),
    reasonCode: undefined,
  };
}
