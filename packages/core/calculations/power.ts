/**
 * Calculate power zones based on FTP
 * @param profile - User profile containing FTP
 * @returns Power zones object
 */
export function calculatePowerZones(profile: Profile): PowerZones {
  if (!profile.ftp) {
    throw new Error("FTP is required for power zone calculation");
  }

  const ftp = profile.ftp;

  return {
    zone1: Math.round(ftp * 0.55), // Active Recovery
    zone2: Math.round(ftp * 0.75), // Endurance
    zone3: Math.round(ftp * 0.9), // Tempo
    zone4: Math.round(ftp * 1.05), // Lactate Threshold
    zone5: Math.round(ftp * 1.2), // VO2 Max
  };
}

/**
 * Calculate Normalized Power using 30-second rolling average
 * @param powerStream - Activity stream containing power data
 * @returns Normalized Power value in watts
 */
export function calculateNormalizedPower(powerStream: ActivityStream): number {
  if (powerStream.type !== "power" || !powerStream.data) {
    throw new Error("Power stream data is required for NP calculation");
  }

  const powerValues = powerStream.data as number[];
  if (powerValues.length === 0) {
    return 0;
  }

  // For short activities, return average power
  if (powerValues.length < 30) {
    return Math.round(
      powerValues.reduce((a, b) => a + b, 0) / powerValues.length,
    );
  }

  const smoothed: number[] = [];
  const window = 30; // 30-second rolling average

  // Calculate rolling 30-second averages
  for (let i = 0; i <= powerValues.length - window; i++) {
    const sum = powerValues.slice(i, i + window).reduce((a, b) => a + b, 0);
    const avg = sum / window;
    smoothed.push(avg);
  }

  if (smoothed.length === 0) {
    return Math.round(
      powerValues.reduce((a, b) => a + b, 0) / powerValues.length,
    );
  }

  // Calculate the fourth root of the mean of the fourth powers
  const fourthPowerSum = smoothed.reduce(
    (sum, power) => sum + Math.pow(power, 4),
    0,
  );
  const fourthPowerAvg = fourthPowerSum / smoothed.length;

  return Math.round(Math.pow(fourthPowerAvg, 1 / 4));
}

/**
 * Calculate Intensity Factor (IF)
 * @param normalizedPower - Normalized Power for the activity
 * @param profile - User profile containing FTP
 * @returns Intensity Factor as decimal (0.0 - 2.0+)
 */
export function calculateIntensityFactor(
  normalizedPower: number,
  profile: Profile,
): number {
  if (!profile.ftp) {
    return 0;
  }

  const intensityFactor = normalizedPower / profile.ftp;
  return Math.round(intensityFactor * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate Variability Index (VI)
 * @param normalizedPower - Normalized Power for the activity
 * @param averagePower - Average Power for the activity
 * @returns Variability Index as decimal
 */
export function calculateVariabilityIndex(
  normalizedPower: number,
  averagePower: number,
): number {
  if (averagePower === 0) {
    return 0;
  }

  const variabilityIndex = normalizedPower / averagePower;
  return Math.round(variabilityIndex * 100) / 100; // Round to 2 decimal places
}

/**
 * Get power zone for a given power value
 * @param power - Power value in watts
 * @param zones - Power zones
 * @returns Zone number (1-5) or 0 if below zone 1
 */
export function getPowerZone(power: number, zones: PowerZones): number {
  if (power >= zones.zone5) return 5;
  if (power >= zones.zone4) return 4;
  if (power >= zones.zone3) return 3;
  if (power >= zones.zone2) return 2;
  if (power >= zones.zone1) return 1;
  return 0;
}

/**
 * Calculate time in each power zone
 * @param powerData - Array of power values (1 per second)
 * @param zones - Power zones
 * @returns Object with time spent in each zone (seconds)
 */
export function calculateTimeInPowerZones(
  powerData: number[],
  zones: PowerZones,
): Record<string, number> {
  const timeInZones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
  };

  powerData.forEach((power) => {
    const zone = getPowerZone(power, zones);
    if (zone >= 1 && zone <= 5) {
      timeInZones[`zone${zone}` as keyof typeof timeInZones] += 1;
    }
  });

  return timeInZones;
}

/**
 * Calculate average power zone for an activity
 * @param powerData - Array of power values
 * @param zones - Power zones
 * @returns Average zone as decimal number
 */
export function calculateAveragePowerZone(
  powerData: number[],
  zones: PowerZones,
): number {
  if (powerData.length === 0) return 0;

  const zoneSum = powerData.reduce((sum, power) => {
    return sum + getPowerZone(power, zones);
  }, 0);

  return Math.round((zoneSum / powerData.length) * 10) / 10;
}
