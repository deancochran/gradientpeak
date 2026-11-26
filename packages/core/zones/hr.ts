import type { AggregatedStream } from "../activity-analysis/stream-contract";
import type { FiveZoneRanges } from "./definitions";
import {
  calculateHeartRateDuration,
  calculateHeartRateZoneDuration,
  getHeartRateZoneIndexFromLthrRatio,
  type HeartRateZoneDurationResult,
  LTHR_ZONE_UPPER_RATIOS,
} from "./heart-rate-duration";

export const LTHR_ZONE_UPPER_PERCENTAGES = LTHR_ZONE_UPPER_RATIOS.map((ratio) => ratio * 100);

export function estimateMaxHRFromAge(age: number): number {
  if (age <= 0) throw new Error("Age must be greater than 0");
  if (age < 10 || age > 100) throw new Error("Age must be between 10 and 100 years");
  return 220 - age;
}

export function calculateHRReserve(maxHR: number, restingHR: number): number {
  if (maxHR <= 0 || restingHR <= 0) throw new Error("Heart rates must be greater than 0");
  if (maxHR <= restingHR) throw new Error("Max HR must be greater than resting HR");
  return maxHR - restingHR;
}

export function calculateTargetHR(maxHR: number, restingHR: number, intensity: number): number {
  if (intensity < 0 || intensity > 1) {
    throw new Error("Intensity must be between 0 and 1 (0% to 100%)");
  }

  const hrr = calculateHRReserve(maxHR, restingHR);
  return Math.round(hrr * intensity + restingHR);
}

export function calculateHRZones(maxHR: number, restingHR: number): FiveZoneRanges {
  return {
    zone1: {
      min: calculateTargetHR(maxHR, restingHR, 0.5),
      max: calculateTargetHR(maxHR, restingHR, 0.6),
    },
    zone2: {
      min: calculateTargetHR(maxHR, restingHR, 0.6),
      max: calculateTargetHR(maxHR, restingHR, 0.7),
    },
    zone3: {
      min: calculateTargetHR(maxHR, restingHR, 0.7),
      max: calculateTargetHR(maxHR, restingHR, 0.8),
    },
    zone4: {
      min: calculateTargetHR(maxHR, restingHR, 0.8),
      max: calculateTargetHR(maxHR, restingHR, 0.9),
    },
    zone5: { min: calculateTargetHR(maxHR, restingHR, 0.9), max: maxHR },
  };
}

export function calculateHRZonesFromReserve(maxHR: number, restingHR: number): FiveZoneRanges {
  return calculateHRZones(maxHR, restingHR);
}

export function getHrZoneIndexFromThresholdPercent(thresholdPercent: number): number {
  return getHeartRateZoneIndexFromLthrRatio(thresholdPercent / 100);
}

export function getHrZoneUpperBoundsFromLthr(lthrBpm: number): number[] {
  if (!Number.isFinite(lthrBpm) || lthrBpm <= 0) return [];
  return LTHR_ZONE_UPPER_PERCENTAGES.map((percentage) =>
    Number.isFinite(percentage) ? (lthrBpm * percentage) / 100 : Number.POSITIVE_INFINITY,
  );
}

export function calculateHRZoneDistribution(
  hrStream?: AggregatedStream,
  thresholdHR?: number | null,
): HeartRateZoneDurationResult {
  const samples =
    hrStream?.timestamps.map((timestampSeconds, index) => {
      const value = hrStream.values[index];
      return {
        timestampSeconds,
        heartRateBpm: typeof value === "number" ? value : null,
      };
    }) ?? [];
  return calculateHeartRateZoneDuration({
    evidence: calculateHeartRateDuration({ samples }),
    ...(thresholdHR === undefined ? {} : { lthrBpm: thresholdHR }),
  });
}
