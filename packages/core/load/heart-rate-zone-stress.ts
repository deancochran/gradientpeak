export interface HeartRateDistributionBucket {
  bpm: number;
  seconds: number;
}

export interface CalculateHeartRateZoneStressInput {
  durationSeconds: number;
  lthrBpm: number;
  distribution: {
    coverageSeconds: number;
    buckets: readonly HeartRateDistributionBucket[];
  };
  minimumCoverageRatio?: number;
}

export interface HeartRateZoneStressResult {
  tss: number;
  equivalentIntensityFactor: number;
  coverageRatio: number;
  zoneSeconds: readonly [number, number, number, number, number];
  calculationVersion: "heart-rate-zones-v1";
}

const REPRESENTATIVE_ZONE_INTENSITY = [0.7, 0.85, 0.91, 0.965, 1.05] as const;

/**
 * Integrates an LTHR-relative HR distribution into a versioned stress score.
 * The returned IF is an equivalent value derived from TSS and covered duration;
 * it is not power or pace IF.
 */
export function calculateHeartRateZoneStress(
  input: CalculateHeartRateZoneStressInput,
): HeartRateZoneStressResult | null {
  const minimumCoverageRatio = input.minimumCoverageRatio ?? 0.5;
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    !Number.isFinite(input.lthrBpm) ||
    input.lthrBpm < 80 ||
    input.lthrBpm > 220 ||
    !Number.isFinite(input.distribution.coverageSeconds) ||
    input.distribution.coverageSeconds <= 0 ||
    minimumCoverageRatio < 0 ||
    minimumCoverageRatio > 1
  ) {
    return null;
  }

  const coverageRatio = Math.min(1, input.distribution.coverageSeconds / input.durationSeconds);
  const bucketSeconds = input.distribution.buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  if (
    input.distribution.coverageSeconds > input.durationSeconds ||
    bucketSeconds !== input.distribution.coverageSeconds
  ) {
    return null;
  }
  if (coverageRatio < minimumCoverageRatio) return null;

  const zoneSeconds = [0, 0, 0, 0, 0];
  for (const bucket of input.distribution.buckets) {
    if (
      !Number.isInteger(bucket.bpm) ||
      bucket.bpm < 30 ||
      bucket.bpm > 250 ||
      !Number.isFinite(bucket.seconds) ||
      bucket.seconds <= 0
    ) {
      return null;
    }
    const thresholdRatio = bucket.bpm / input.lthrBpm;
    const zoneIndex =
      thresholdRatio < 0.81
        ? 0
        : thresholdRatio < 0.89
          ? 1
          : thresholdRatio < 0.93
            ? 2
            : thresholdRatio < 1
              ? 3
              : 4;
    zoneSeconds[zoneIndex] = (zoneSeconds[zoneIndex] ?? 0) + bucket.seconds;
  }

  const tss = zoneSeconds.reduce((total, seconds, index) => {
    const intensity = REPRESENTATIVE_ZONE_INTENSITY[index] ?? 0;
    return total + (seconds / 3600) * intensity ** 2 * 100;
  }, 0);
  const coveredHours = input.distribution.coverageSeconds / 3600;
  const equivalentIntensityFactor = Math.sqrt(tss / (coveredHours * 100));
  if (!Number.isFinite(tss) || !Number.isFinite(equivalentIntensityFactor)) return null;

  return {
    tss: Math.round(tss * 100) / 100,
    equivalentIntensityFactor: Math.round(equivalentIntensityFactor * 10_000) / 10_000,
    coverageRatio: Math.round(coverageRatio * 10_000) / 10_000,
    zoneSeconds: zoneSeconds as [number, number, number, number, number],
    calculationVersion: "heart-rate-zones-v1",
  };
}
