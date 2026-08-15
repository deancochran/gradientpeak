import { getAvailablePerformanceTargetValue } from "../performance-model";
import { getHrZoneUpperBoundsFromLthr } from "./hr";
import { getPowerZoneUpperBoundsFromFtp } from "./power";

export interface ProfileZonePolicyResult {
  powerZones: {
    policyVersion: "cycling_ftp_zones_v1";
    zone1: { min: number; max: number };
    zone2: { min: number; max: number };
    zone3: { min: number; max: number };
    zone4: { min: number; max: number };
    zone5: { min: number; max: number };
    zone6: { min: number; max: number };
    zone7: { min: number; max: null };
  } | null;
  heartRateZones: {
    policyVersion: "sport_lthr_zones_v1";
    zone1: { min: number; max: number };
    zone2: { min: number; max: number };
    zone3: { min: number; max: number };
    zone4: { min: number; max: number };
    zone5: { min: number; max: null };
  } | null;
}

/**
 * Produces the bike-oriented profile-zone DTO from the versioned Core ratio policies.
 * It does not infer max HR or mix run/swim LTHR into bike zones.
 */
export function resolveProfileZones(facts: {
  thresholds: {
    bike: {
      status: "available" | "partial" | "unavailable";
      value: number | null;
    };
  };
  heartRate: {
    bike: {
      lthr: { status: "available"; valueBpm: number } | { status: "unavailable"; valueBpm: null };
    };
  };
}): ProfileZonePolicyResult {
  const planningThresholdPower = getAvailablePerformanceTargetValue(facts.thresholds.bike);
  const bikeLthr = facts.heartRate.bike.lthr;
  const powerBounds =
    planningThresholdPower === null ? [] : getPowerZoneUpperBoundsFromFtp(planningThresholdPower);
  const heartRateBounds =
    bikeLthr.status === "available" ? getHrZoneUpperBoundsFromLthr(bikeLthr.valueBpm) : [];
  const roundedBoundary = (bounds: number[], index: number) => {
    const value = bounds[index];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error("Canonical zone policy returned an invalid finite boundary");
    }
    return Math.round(value);
  };

  return {
    powerZones:
      powerBounds.length !== 7
        ? null
        : {
            policyVersion: "cycling_ftp_zones_v1",
            zone1: { min: 0, max: roundedBoundary(powerBounds, 0) },
            zone2: {
              min: roundedBoundary(powerBounds, 0),
              max: roundedBoundary(powerBounds, 1),
            },
            zone3: {
              min: roundedBoundary(powerBounds, 1),
              max: roundedBoundary(powerBounds, 2),
            },
            zone4: {
              min: roundedBoundary(powerBounds, 2),
              max: roundedBoundary(powerBounds, 3),
            },
            zone5: {
              min: roundedBoundary(powerBounds, 3),
              max: roundedBoundary(powerBounds, 4),
            },
            zone6: {
              min: roundedBoundary(powerBounds, 4),
              max: roundedBoundary(powerBounds, 5),
            },
            zone7: { min: roundedBoundary(powerBounds, 5), max: null },
          },
    heartRateZones:
      heartRateBounds.length !== 5
        ? null
        : {
            policyVersion: "sport_lthr_zones_v1",
            zone1: { min: 0, max: roundedBoundary(heartRateBounds, 0) },
            zone2: {
              min: roundedBoundary(heartRateBounds, 0),
              max: roundedBoundary(heartRateBounds, 1),
            },
            zone3: {
              min: roundedBoundary(heartRateBounds, 1),
              max: roundedBoundary(heartRateBounds, 2),
            },
            zone4: {
              min: roundedBoundary(heartRateBounds, 2),
              max: roundedBoundary(heartRateBounds, 3),
            },
            zone5: { min: roundedBoundary(heartRateBounds, 3), max: null },
          },
  };
}
