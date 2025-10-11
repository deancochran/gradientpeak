import type {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityPlansRow,
  PublicProfilesRow,
} from "@repo/supabase";
import {
  flattenPlanSteps,
  getDurationMs,
  getIntensityColor,
  type ActivityPlanStructure,
  type IntensityTarget,
} from "./schemas";

// Aggregated stream data
export interface AggregatedStream {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[];
  timestamps: number[];
  sampleCount: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
}

export function calculateElapsedTime(
  startedAt: Date | string,
  endedAt: Date | string,
): number {
  if (!startedAt || !endedAt) return 0;
  return Math.floor(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );
}

export function calculateMovingTime(
  startedAt: Date | string,
  endedAt: Date | string,
  aggregatedStreams: Map<string, AggregatedStream>,
): number {
  const movingStream = aggregatedStreams.get("moving");
  if (!movingStream) return calculateElapsedTime(startedAt, endedAt);

  const movingValues = movingStream.values as number[];

  // convert 1.0/0.0 to booleans
  const movingCount = movingValues.filter((v) => v === 1).length;

  // Estimate time based on sample rate (assuming ~1 sample per second)
  return movingCount;
}

// ================================
// Power Calculations
// ================================

export function calculateNormalizedPower(
  powerStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.values) return undefined;

  const powers = powerStream.values as number[];
  if (powers.length === 0) return undefined;

  // Proper NP calculation: rolling 30s average, then 4th power average
  const windowSize = 30; // 30 samples for 30 seconds (assuming 1Hz)
  const rollingAvgs: number[] = [];

  for (let i = 0; i < powers.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = powers.slice(start, i + 1);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAvgs.push(avg);
  }

  // Calculate 4th power average
  const fourthPowers = rollingAvgs.map((p) => Math.pow(p, 4));
  const avgFourthPower =
    fourthPowers.reduce((sum, p) => sum + p, 0) / fourthPowers.length;
  const np = Math.pow(avgFourthPower, 0.25);

  return Math.round(np);
}

export function calculateIntensityFactor(
  powerStream?: AggregatedStream,
  ftp?: number | null,
): number | undefined {
  if (!ftp) return undefined;
  const np = calculateNormalizedPower(powerStream);
  if (!np) return undefined;
  return Math.round((np / ftp) * 100) / 100; // Return as decimal (e.g., 0.85)
}

export function calculateTSS(
  startedAt: Date | string,
  endedAt: Date | string,
  powerStream: AggregatedStream | undefined,
  profile: PublicProfilesRow,
): number | undefined {
  if (!profile.ftp) return undefined;
  const np = calculateNormalizedPower(powerStream);
  const if_ = calculateIntensityFactor(powerStream, profile.ftp);
  if (!np || !if_) return undefined;

  const durationHours = calculateElapsedTime(startedAt, endedAt) / 3600;
  return Math.round(durationHours * if_ * if_ * 100);
}

export function calculateVariabilityIndex(
  powerStream?: AggregatedStream,
  normalizedPower?: number,
): number | undefined {
  if (!powerStream?.avgValue || !normalizedPower) return undefined;
  return Math.round((normalizedPower / powerStream.avgValue) * 100) / 100;
}

export function calculateTotalWork(
  powerStream?: AggregatedStream,
  elapsedTime?: number,
): number | undefined {
  if (!powerStream?.avgValue || !elapsedTime) return undefined;
  // Work (kJ) = avg power (W) * time (s) / 1000
  return Math.round((powerStream.avgValue * elapsedTime) / 1000);
}

// ================================
// Heart Rate Calculations
// ================================

export function calculateHRZones(
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

  // HR Zones based on threshold HR (LTHR)
  // Z1: < 81% | Z2: 81-89% | Z3: 90-93% | Z4: 94-99% | Z5: 100%+
  const zones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };

  for (let i = 0; i < hrs.length; i++) {
    const pct = hrs[i] / thresholdHR;
    const timeInZone =
      i < timestamps.length - 1
        ? (timestamps[i + 1] - timestamps[i]) / 1000
        : 1; // Default 1 second

    if (pct < 0.81) zones.zone1 += timeInZone;
    else if (pct < 0.9) zones.zone2 += timeInZone;
    else if (pct < 0.94) zones.zone3 += timeInZone;
    else if (pct < 1.0) zones.zone4 += timeInZone;
    else zones.zone5 += timeInZone;
  }

  return {
    zone1: Math.round(zones.zone1),
    zone2: Math.round(zones.zone2),
    zone3: Math.round(zones.zone3),
    zone4: Math.round(zones.zone4),
    zone5: Math.round(zones.zone5),
  };
}

export function calculateMaxHRPercent(
  hrStream?: AggregatedStream,
  thresholdHR?: number | null,
): number | undefined {
  if (!hrStream?.maxValue || !thresholdHR) return undefined;
  return Math.round((hrStream.maxValue / thresholdHR) * 100) / 100;
}

// ================================
// Power Zone Calculations
// ================================

export function calculatePowerZones(
  powerStream?: AggregatedStream,
  ftp?: number | null,
): Record<string, number | undefined> {
  if (!powerStream?.values || !ftp) {
    return {
      zone1: undefined,
      zone2: undefined,
      zone3: undefined,
      zone4: undefined,
      zone5: undefined,
      zone6: undefined,
      zone7: undefined,
    };
  }

  const powers = powerStream.values as number[];
  const timestamps = powerStream.timestamps;

  // Power Zones based on FTP
  // Z1: < 55% | Z2: 56-75% | Z3: 76-90% | Z4: 91-105% | Z5: 106-120% | Z6: 121-150% | Z7: 150%+
  const zones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
    zone6: 0,
    zone7: 0,
  };

  for (let i = 0; i < powers.length; i++) {
    const pct = powers[i] / ftp;
    const timeInZone =
      i < timestamps.length - 1
        ? (timestamps[i + 1] - timestamps[i]) / 1000
        : 1;

    if (pct < 0.55) zones.zone1 += timeInZone;
    else if (pct < 0.76) zones.zone2 += timeInZone;
    else if (pct < 0.91) zones.zone3 += timeInZone;
    else if (pct < 1.06) zones.zone4 += timeInZone;
    else if (pct < 1.21) zones.zone5 += timeInZone;
    else if (pct < 1.51) zones.zone6 += timeInZone;
    else zones.zone7 += timeInZone;
  }

  return {
    zone1: Math.round(zones.zone1),
    zone2: Math.round(zones.zone2),
    zone3: Math.round(zones.zone3),
    zone4: Math.round(zones.zone4),
    zone5: Math.round(zones.zone5),
    zone6: Math.round(zones.zone6),
    zone7: Math.round(zones.zone7),
  };
}

// ================================
// Advanced Metrics
// ================================

export function calculateEfficiencyFactor(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.avgValue || !hrStream?.avgValue) return undefined;
  const np = calculateNormalizedPower(powerStream);
  if (!np) return undefined;
  return Math.round((np / hrStream.avgValue) * 100) / 100;
}

export function calculateDecoupling(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.values || !hrStream?.values) return undefined;

  const powers = powerStream.values as number[];
  const hrs = hrStream.values as number[];

  if (powers.length < 2 || hrs.length < 2) return undefined;

  // Split into first and second half
  const midpoint = Math.floor(powers.length / 2);

  const firstHalfPower =
    powers.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfPower =
    powers.slice(midpoint).reduce((a, b) => a + b, 0) /
    (powers.length - midpoint);

  const firstHalfHR =
    hrs.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfHR =
    hrs.slice(midpoint).reduce((a, b) => a + b, 0) / (hrs.length - midpoint);

  const firstHalfRatio = firstHalfPower / firstHalfHR;
  const secondHalfRatio = secondHalfPower / secondHalfHR;

  // Decoupling percentage
  return (
    Math.round(((secondHalfRatio - firstHalfRatio) / firstHalfRatio) * 10000) /
    100
  );
}

export function calculatePowerHeartRateRatio(
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number | undefined {
  if (!powerStream?.avgValue || !hrStream?.avgValue) return undefined;
  return Math.round((powerStream.avgValue / hrStream.avgValue) * 100) / 100;
}

export function calculatePowerWeightRatio(
  powerStream?: AggregatedStream,
  weightKg?: number | null,
): number | undefined {
  if (!powerStream?.avgValue || !weightKg) return undefined;
  return Math.round((powerStream.avgValue / weightKg) * 100) / 100;
}

// ================================
// Elevation Calculations
// ================================

export function calculateElevationChanges(elevationStream?: AggregatedStream): {
  totalAscent: number;
  totalDescent: number;
} {
  if (!elevationStream?.values) return { totalAscent: 0, totalDescent: 0 };

  const elevations = elevationStream.values as number[];
  let totalAscent = 0;
  let totalDescent = 0;

  for (let i = 1; i < elevations.length; i++) {
    const change = elevations[i] - elevations[i - 1];
    if (change > 0) totalAscent += change;
    else if (change < 0) totalDescent += Math.abs(change);
  }

  return {
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
  };
}

export function calculateAverageGrade(
  gradientStream?: AggregatedStream,
): number | undefined {
  if (!gradientStream?.avgValue) return undefined;
  return Math.round(gradientStream.avgValue * 100) / 100;
}

export function calculateElevationGainPerKm(
  totalAscent: number,
  distanceStream?: AggregatedStream,
): number | undefined {
  if (!distanceStream?.maxValue || distanceStream.maxValue === 0)
    return undefined;
  const distanceKm = distanceStream.maxValue / 1000;
  return Math.round((totalAscent / distanceKm) * 100) / 100;
}

// ================================
// Calorie Calculations
// ================================

export function calculateCalories(
  startedAt: Date | string,
  endedAt: Date | string,
  profile: PublicProfilesRow,

  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number {
  // If power is available, use it (most accurate)
  if (powerStream?.avgValue) {
    const durationHours = calculateElapsedTime(startedAt, endedAt) / 3600;
    return Math.round(powerStream.avgValue * durationHours * 3.6);
  }
  const age = calculateAge(profile.dob);
  const weight = profile.weight_kg;

  // Otherwise use HR-based estimation
  if (hrStream?.avgValue && profile && profile.ftp && age && weight) {
    const duration = calculateElapsedTime(startedAt, endedAt) / 60; // minutes
    const avgHR = hrStream.avgValue;

    // Gender-specific calorie estimation (assuming male, adjust if you have gender data)
    const calories =
      ((age * 0.2017 + weight * 0.1988 + avgHR * 0.6309 - 55.0969) * duration) /
      4.184;
    return Math.round(calories);
  }

  return 0;
}

export function calculateAge(dob: string | null): number | undefined {
  if (!dob) return undefined;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ================================
// Activity Plan Comparison Calculations
// ================================
/**
 * Calculate adherence score based on how well the user followed intensity targets.
 * Duration is not considered - the user must follow the plan duration.
 *
 * @param recording - Activity recording data
 * @param aggregatedStreams - Map of stream type to aggregated stream data
 * @param plannedAvgPower - Planned average power in watts (optional)
 * @param plannedAvgHR - Planned average heart rate in bpm (optional)
 * @param userFTP - User's FTP for power calculations (optional)
 * @param userThresholdHR - User's threshold HR (optional)
 * @returns Adherence score (0-100)
 */
export function calculateAdherenceScore(
  activity_plan: PublicActivityPlansRow,
  aggregatedStreams: Map<string, AggregatedStream>,
): number | null {
  const scores: number[] = [];

  // TODO Compare the activity structure to the raw recorded streams to ideniftiy how compliant the profiled user was to the prescribed plan

  // Get actual power data
  // const powerStream = aggregatedStreams.get("watts");
  // // Get actual heart rate data
  // const hrStream = aggregatedStreams.get("heartrate");
  //

  // If no intensity metrics available, return neutral score
  if (scores.length === 0) {
    return 100;
  }

  // Average all available intensity scores
  const overallScore = Math.round(
    scores.reduce((sum, s) => sum + s, 0) / scores.length,
  );

  return overallScore;
}

/**
 * Calculate intensity adherence score for a single metric.
 * Measures how close actual was to target.
 */
function calculateIntensityScore(actual: number, target: number): number {
  if (target <= 0) return 100;

  const ratio = actual / target;
  const deviation = Math.abs(ratio - 1.0);

  // Scoring based on deviation from target
  if (deviation <= 0.03) {
    return 100; // Within 3%: perfect
  } else if (deviation <= 0.05) {
    return 100 - ((deviation - 0.03) / 0.02) * 5; // 95-100%
  } else if (deviation <= 0.1) {
    return 95 - ((deviation - 0.05) / 0.05) * 15; // 80-95%
  } else if (deviation <= 0.15) {
    return 80 - ((deviation - 0.1) / 0.05) * 20; // 60-80%
  } else if (deviation <= 0.25) {
    return 60 - ((deviation - 0.15) / 0.1) * 30; // 30-60%
  } else {
    return Math.max(0, 30 - (deviation - 0.25) * 50);
  }
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

/**
 * Calculate total distance from an array of GPS locations
 * @param locations - Array of GPS coordinates
 * @returns Total distance in meters
 */
export function calculateTotalDistance(
  locations: Array<{ latitude: number; longitude: number }>,
): number {
  if (locations.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < locations.length; i++) {
    const prevLocation = locations[i - 1];
    const currentLocation = locations[i];
    if (prevLocation && currentLocation) {
      const distance = calculateDistance(
        prevLocation.latitude,
        prevLocation.longitude,
        currentLocation.latitude,
        currentLocation.longitude,
      );
      totalDistance += distance;
    }
  }

  return totalDistance;
}

/**
 * Calculate average speed from distance and duration
 * @param totalDistanceMeters - Total distance in meters
 * @param durationSeconds - Duration in seconds
 * @returns Average speed in meters per second
 */
export function calculateAverageSpeed(
  totalDistanceMeters: number,
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) return 0;
  return totalDistanceMeters / durationSeconds;
}

/**
 * Calculate average speed from total distance and duration
 * @param totalDistanceMeters - Total distance in meters
 * @param durationSeconds - Duration in seconds
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted speed string
 */
export function calculateAveragePace(
  totalDistanceMeters: number,
  durationSeconds: number,
  unit: "metric" | "imperial" = "metric",
): string {
  if (totalDistanceMeters <= 0 || durationSeconds <= 0) {
    return "--:--";
  }

  const averageSpeedMs = totalDistanceMeters / durationSeconds;
  return formatPace(averageSpeedMs, unit);
}

/**
 * Estimate calories burned based on duration, distance, and optional heart rate
 * Basic estimation - for more accurate results, use METs or power-based calculations
 * @param durationSeconds - Duration in seconds
 * @param totalDistanceMeters - Total distance in meters
 * @param bodyWeightKg - Body weight in kg (optional, defaults to 70kg)
 * @param averageHeartRate - Average heart rate (optional)
 * @returns Estimated calories burned
 */
export function estimateCalories(
  durationSeconds: number,
  totalDistanceMeters: number,
  bodyWeightKg: number = 70,
  averageHeartRate?: number,
): number {
  // Basic MET calculation for running/cycling
  const durationHours = durationSeconds / 3600;
  const speedKph = metersPerSecondToKph(totalDistanceMeters / durationSeconds);

  // Rough MET values based on speed (cycling/running average)
  let metValue = 3.5; // resting metabolic rate

  if (speedKph > 0) {
    if (speedKph < 8) {
      metValue = 4; // light activity
    } else if (speedKph < 12) {
      metValue = 6; // moderate activity
    } else if (speedKph < 16) {
      metValue = 8; // vigorous activity
    } else {
      metValue = 10; // very vigorous activity
    }
  }

  // Heart rate adjustment (if available)
  if (averageHeartRate) {
    const hrMultiplier = Math.max(0.5, Math.min(2.0, averageHeartRate / 120));
    metValue *= hrMultiplier;
  }

  // Calories = METs × weight(kg) × duration(hours)
  return Math.round(metValue * bodyWeightKg * durationHours);
}

/**
 * Math utilities
 */

/**
 * Calculate percentage change between two values
 * @param oldValue - Original value
 * @param newValue - New value
 * @returns Percentage change (positive for increase, negative for decrease)
 */
export function calculatePercentageChange(
  oldValue: number,
  newValue: number,
): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate moving average for an array of numbers
 * @param values - Array of numbers
 * @param windowSize - Size of moving window
 * @returns Array of moving averages
 */
export function calculateMovingAverage(
  values: number[],
  windowSize: number,
): number[] {
  if (windowSize <= 0 || windowSize > values.length) {
    throw new Error("Invalid window size");
  }

  const result: number[] = [];

  for (let i = 0; i <= values.length - windowSize; i++) {
    const windowSum = values
      .slice(i, i + windowSize)
      .reduce((sum, val) => sum + val, 0);
    result.push(windowSum / windowSize);
  }

  return result;
}

/**
 * Time and duration utilities
 */

/**
 * Format duration in seconds to readable string (HH:MM:SS or MM:SS)
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

/**
 * Parse duration string to seconds
 * @param durationString - Duration in MM:SS or HH:MM:SS format
 * @returns Duration in seconds
 */
export function parseDuration(durationString: string): number {
  const parts = durationString.split(":").map(Number);

  if (parts.length === 2) {
    // MM:SS format
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }

  throw new Error("Invalid duration format. Expected MM:SS or HH:MM:SS");
}

/**
 * Add days to a date
 * @param date - Base date
 * @param days - Number of days to add
 * @returns New date with days added
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get start of day for a given date
 * @param date - Input date
 * @returns Date set to start of day (00:00:00.000)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day for a given date
 * @param date - Input date
 * @returns Date set to end of day (23:59:59.999)
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Unit conversion utilities
 */

/**
 * Convert meters per second to kilometers per hour
 * @param mps - Speed in meters per second
 * @returns Speed in kilometers per hour
 */
export function metersPerSecondToKph(mps: number): number {
  return mps * 3.6;
}

/**
 * Convert meters per second to miles per hour
 * @param mps - Speed in meters per second
 * @returns Speed in miles per hour
 */
export function metersPerSecondToMph(mps: number): number {
  return mps * 2.237;
}

/**
 * Convert kilometers per hour to meters per second
 * @param kph - Speed in kilometers per hour
 * @returns Speed in meters per second
 */
export function kphToMps(kph: number): number {
  return kph / 3.6;
}

/**
 * Convert miles per hour to meters per second
 * @param mph - Speed in miles per hour
 * @returns Speed in meters per second
 */
export function mphToMps(mph: number): number {
  return mph / 2.237;
}

/**
 * Convert kilograms to pounds
 * @param kg - Weight in kilograms
 * @returns Weight in pounds
 */
export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

/**
 * Convert pounds to kilograms
 * @param lbs - Weight in pounds
 * @returns Weight in kilograms
 */
export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

/**
 * Convert meters to feet
 * @param meters - Distance in meters
 * @returns Distance in feet
 */
export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

/**
 * Convert feet to meters
 * @param feet - Distance in feet
 * @returns Distance in meters
 */
export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}

/**
 * Convert kilometers to miles
 * @param km - Distance in kilometers
 * @returns Distance in miles
 */
export function kmToMiles(km: number): number {
  return km * 0.621371;
}

/**
 * Convert miles to kilometers
 * @param miles - Distance in miles
 * @returns Distance in kilometers
 */
export function milesToKm(miles: number): number {
  return miles / 0.621371;
}

/**
 * Convert Celsius to Fahrenheit
 * @param celsius - Temperature in Celsius
 * @returns Temperature in Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Convert Fahrenheit to Celsius
 * @param fahrenheit - Temperature in Fahrenheit
 * @returns Temperature in Celsius
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Formatting utilities
 */

/**
 * Format distance in meters to readable string
 * @param meters - Distance in meters
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted distance string
 */
export function formatDistance(
  meters: number,
  unit: "metric" | "imperial" = "metric",
): string {
  if (unit === "imperial") {
    const miles = kmToMiles(meters / 1000);
    if (miles >= 1) {
      return `${miles.toFixed(2)} mi`;
    } else {
      const feet = metersToFeet(meters);
      return `${Math.round(feet)} ft`;
    }
  } else {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    } else {
      return `${Math.round(meters)} m`;
    }
  }
}

/**
 * Format speed in m/s to readable string
 * @param mps - Speed in meters per second
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted speed string
 */
export function formatSpeed(
  mps: number,
  unit: "metric" | "imperial" = "metric",
): string {
  if (unit === "imperial") {
    const mph = metersPerSecondToMph(mps);
    return `${mph.toFixed(1)} mph`;
  } else {
    const kph = metersPerSecondToKph(mps);
    return `${kph.toFixed(1)} km/h`;
  }
}

/**
 * Format speed from speed in m/s
 * @param speedMs - Speed in meters per second
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted speed string (min/km or min/mi)
 */
export function formatPace(
  speedMs: number,
  unit: "metric" | "imperial" = "metric",
): string {
  if (speedMs <= 0) return "--:--";

  let paceSeconds: number;
  let unitLabel: string;

  if (unit === "imperial") {
    // Pace in minutes per mile
    const milesPerSecond = speedMs * 0.000621371;
    paceSeconds = 1 / (milesPerSecond * 60);
    unitLabel = "/mi";
  } else {
    // Pace in minutes per kilometer
    const kmPerSecond = speedMs / 1000;
    paceSeconds = 1 / (kmPerSecond * 60);
    unitLabel = "/km";
  }

  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}${unitLabel}`;
}

/**
 * Format weight in kg to readable string
 * @param kg - Weight in kilograms
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted weight string
 */
export function formatWeight(
  kg: number,
  unit: "metric" | "imperial" = "metric",
): string {
  if (unit === "imperial") {
    const lbs = kgToLbs(kg);
    return `${Math.round(lbs)} lbs`;
  } else {
    return `${kg.toFixed(1)} kg`;
  }
}

/**
 * Format power in watts
 * @param watts - Power in watts
 * @returns Formatted power string
 */
export function formatPower(watts: number): string {
  return `${Math.round(watts)}W`;
}

/**
 * Format heart rate in beats per minute
 * @param bpm - Heart rate in beats per minute
 * @returns Formatted heart rate string
 */
export function formatHeartRate(bpm: number): string {
  return `${Math.round(bpm)} bpm`;
}

/**
 * Format cadence in RPM
 * @param rpm - Cadence in revolutions per minute
 * @returns Formatted cadence string
 */
export function formatCadence(rpm: number): string {
  return `${Math.round(rpm)} rpm`;
}

/**
 * Format TSS value
 * @param tss - Training Stress Score
 * @returns Formatted TSS string
 */
export function formatTSS(tss: number): string {
  return `${Math.round(tss * 10) / 10} TSS`;
}

/**
 * Geographic utilities
 */

/**
 * Clamp a value between minimum and maximum bounds
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param start - Start value
 * @param end - End value
 * @param factor - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * clamp(factor, 0, 1);
}

/**
 * Convert meters to kilometers with specified decimal places
 */
export const metersToKm = (meters: number, decimals = 2): number => {
  return Number((meters / 1000).toFixed(decimals));
};

/**
 * Convert m/s to km/h
 */
export const msToKmh = (speedMs: number): number => {
  return speedMs * 3.6;
};

/**
 * Format altitude with appropriate units
 */
export const formatAltitude = (altitude: number | null | undefined): string => {
  if (altitude === null || altitude === undefined) return "--";
  return Math.round(altitude).toString();
};

/**
 * Format GPS accuracy
 */
export const formatAccuracy = (accuracy: number | null | undefined): string => {
  if (accuracy === null || accuracy === undefined) return "--";
  return Math.round(accuracy).toString();
};

//
//
//
//
//
//
//
//
//
//
//
// ================================
// Types
// ================================

export interface ActivityProfilePoint {
  index: number;
  name: string;
  description?: string;
  intensity: number;
  intensityType?: string;
  duration: number; // in seconds
  color: string;
  targets?: IntensityTarget[];
  cumulativeTime: number;
}

export interface ActivityStats {
  totalSteps: number;
  totalDuration: number; // in seconds
  avgPower: number;
  maxPower: number;
  intervalCount: number;
  estimatedTSS: number;
  estimatedCalories: number;
  intensityZones: {
    z1: number; // Recovery (0-55% FTP)
    z2: number; // Aerobic (56-75% FTP)
    z3: number; // Tempo (76-90% FTP)
    z4: number; // Threshold (91-105% FTP)
    z5: number; // VO2 Max (106%+ FTP)
  };
}

// ================================
// Plan Processing Functions
// ================================

/**
 * Determine intensity zone from FTP percentage
 */
export function getIntensityZone(
  ftpPercent: number,
): keyof ActivityStats["intensityZones"] {
  if (ftpPercent >= 106) return "z5";
  if (ftpPercent >= 91) return "z4";
  if (ftpPercent >= 76) return "z3";
  if (ftpPercent >= 56) return "z2";
  return "z1";
}

/**
 * Extract activity profile data for visualization
 */
export function extractActivityProfile(
  structure: ActivityPlanStructure,
): ActivityProfilePoint[] {
  const flattenedSteps = flattenPlanSteps(structure.steps);
  let cumulativeTime = 0;

  return flattenedSteps.map((step, index) => {
    const primaryTarget = step.targets?.[0]; // Get main intensity target
    const intensity = primaryTarget ? primaryTarget.intensity : 0;
    const duration =
      step.duration && step.duration !== "untilFinished"
        ? getDurationMs(step.duration) / 1000
        : 300; // Default 5 minutes for untilFinished

    const point: ActivityProfilePoint = {
      index,
      name: step.name || `Step ${index + 1}`,
      description: step.description,
      intensity,
      intensityType: primaryTarget?.type,
      duration,
      color: getIntensityColor(intensity, primaryTarget?.type),
      targets: step.targets,
      cumulativeTime,
    };

    cumulativeTime += duration;
    return point;
  });
}

/**
 * Calculate comprehensive activity statistics
 */
export function calculateActivityStats(
  structure: ActivityPlanStructure,
): ActivityStats {
  const flattenedSteps = flattenPlanSteps(structure.steps);

  const stats: ActivityStats = {
    totalSteps: flattenedSteps.length,
    totalDuration: 0,
    avgPower: 0,
    maxPower: 0,
    intervalCount: 0,
    estimatedTSS: 0,
    estimatedCalories: 0,
    intensityZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
  };

  let totalIntensity = 0;
  let totalIntensityTime = 0;

  flattenedSteps.forEach((step) => {
    // Calculate duration
    const duration =
      step.duration && step.duration !== "untilFinished"
        ? getDurationMs(step.duration) / 1000
        : 300; // Default 5 minutes
    stats.totalDuration += duration;

    // Analyze targets
    step.targets?.forEach((target) => {
      if (target.type === "%FTP" || target.type === "watts") {
        const intensity = target.intensity;

        // Convert watts to FTP% for consistent analysis (assuming 250W FTP)
        const ftpPercent =
          target.type === "watts" ? (intensity / 250) * 100 : intensity;

        totalIntensity += ftpPercent * duration; // Weight by duration
        totalIntensityTime += duration;

        if (ftpPercent > stats.maxPower) stats.maxPower = ftpPercent;
        if (ftpPercent > 85) stats.intervalCount++; // High intensity intervals

        // Track intensity zones weighted by duration
        const zone = getIntensityZone(ftpPercent);
        stats.intensityZones[zone] += duration;
      }
    });
  });

  // Calculate weighted averages
  stats.avgPower =
    totalIntensityTime > 0 ? totalIntensity / totalIntensityTime : 0;

  // Estimate TSS (Training Stress Score)
  // TSS = (duration in hours) × (avg intensity as FTP decimal)² × 100
  const durationHours = stats.totalDuration / 3600;
  const avgIntensityDecimal = stats.avgPower / 100;
  stats.estimatedTSS = durationHours * Math.pow(avgIntensityDecimal, 2) * 100;

  // Rough calorie estimate (1 TSS ≈ 4 calories)
  stats.estimatedCalories = stats.estimatedTSS * 4;

  return stats;
}

// ================================
// Time Formatting
// ================================

/**
 * Format duration for compact display
 */
export function formatDurationCompact(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${Math.floor(seconds)}s`;
  }
}

export function formatDurationCompactMs(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}
