import type { AggregatedStream } from "../calculations";
import type { FiveZoneRanges } from "./definitions";

export function estimateMaxHRFromAge(age: number): number {
  if (age <= 0) throw new Error("Age must be greater than 0");
  if (age < 10 || age > 100) throw new Error("Age must be between 10 and 100 years");
  return 220 - age;
}

export function estimateLTHRFromMaxHR(maxHR: number): number {
  if (maxHR <= 0) throw new Error("Max HR must be greater than 0");
  if (maxHR < 100 || maxHR > 250) throw new Error("Max HR must be between 100 and 250 bpm");
  return Math.round(maxHR * 0.85);
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
  if (thresholdPercent < 81) return 0;
  if (thresholdPercent < 90) return 1;
  if (thresholdPercent < 94) return 2;
  if (thresholdPercent < 100) return 3;
  return 4;
}

export function calculateHRZoneDistribution(
  hrStream?: AggregatedStream,
  thresholdHR?: number | null,
): Record<string, number | undefined> {
  if (!hrStream?.values || !thresholdHR) {
    return {
      zone1: undefined,
      zone2: undefined,
      zone3: undefined,
      zone4: undefined,
      zone5: undefined,
    };
  }

  const hrs = hrStream.values as number[];
  const timestamps = hrStream.timestamps;
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

  for (let index = 0; index < hrs.length; index += 1) {
    const pct = (hrs[index]! / thresholdHR) * 100;
    const timeInZone =
      index < timestamps.length - 1
        ? timestamps[index + 1]! - timestamps[index]!
        : index > 0
          ? timestamps[index]! - timestamps[index - 1]!
          : 1;
    const zoneIndex = getHrZoneIndexFromThresholdPercent(pct);
    zones[`zone${zoneIndex + 1}` as keyof typeof zones] += timeInZone;
  }

  return Object.fromEntries(Object.entries(zones).map(([key, value]) => [key, Math.round(value)]));
}
