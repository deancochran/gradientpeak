import { HR_ZONE_PERCENTAGES } from "../constants";
import type { HRZones } from "../types";
/**
 * Calculate heart rate zones based on threshold HR
 * @param thresholdHr - User profile threshold HR
 * @returns Heart rate zones object
 */
export function calculateHrZones(thresholdHr: number): HRZones {
  return {
    zone1: Math.round(thresholdHr * HR_ZONE_PERCENTAGES.ZONE_1), // Recovery
    zone2: Math.round(thresholdHr * HR_ZONE_PERCENTAGES.ZONE_2), // Endurance
    zone3: Math.round(thresholdHr * HR_ZONE_PERCENTAGES.ZONE_3), // Tempo
    zone4: Math.round(thresholdHr * HR_ZONE_PERCENTAGES.ZONE_4), // Lactate Threshold
    zone5: Math.round(thresholdHr * HR_ZONE_PERCENTAGES.ZONE_5), // VO2 Max
  };
}

/**
 * Get heart rate zone for a given HR value
 * @param heartRate - Heart rate value
 * @param zones - Heart rate zones
 * @returns Zone number (1-5) or 0 if below zone 1
 */
export function getHeartRateZone(heartRate: number, zones: HRZones): number {
  if (heartRate >= zones.zone5) return 5;
  if (heartRate >= zones.zone4) return 4;
  if (heartRate >= zones.zone3) return 3;
  if (heartRate >= zones.zone2) return 2;
  if (heartRate >= zones.zone1) return 1;
  return 0;
}

/**
 * Calculate average heart rate zone for an activity
 * @param heartRateData - Array of heart rate values
 * @param zones - Heart rate zones
 * @returns Average zone as decimal number
 */
export function calculateAverageHRZone(
  heartRateData: number[],
  zones: HRZones,
): number {
  if (heartRateData.length === 0) return 0;

  const zoneSum = heartRateData.reduce((sum, hr) => {
    return sum + getHeartRateZone(hr, zones);
  }, 0);

  return Math.round((zoneSum / heartRateData.length) * 10) / 10;
}

/**
 * Calculate time in each heart rate zone
 * @param heartRateData - Array of heart rate values (1 per second)
 * @param zones - Heart rate zones
 * @returns Object with time spent in each zone (seconds)
 */
export function calculateTimeInZones(
  heartRateData: number[],
  zones: HRZones,
): Record<string, number> {
  const timeInZones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
  };

  heartRateData.forEach((hr) => {
    const zone = getHeartRateZone(hr, zones);
    if (zone >= 1 && zone <= 5) {
      timeInZones[`zone${zone}` as keyof typeof timeInZones] += 1;
    }
  });

  return timeInZones;
}
