/**
 * Pure activity summary calculation functions
 * These functions process raw activity data to compute aggregated metrics
 */

import type { ActivitySummary } from "../types";

// ================================
// Activity Stream Processing Types
// ================================

export interface ActivityStream {
  metric: string;
  data: number[] | [number, number][];
  timestamps: number[];
}

export interface ActivityStreamData {
  heartrate?: number[];
  power?: number[];
  speed?: number[];
  cadence?: number[];
  distance?: number[];
  latlng?: [number, number][];
  altitude?: number[];
  timestamps: number[];
}

export interface ProfileSnapshot {
  weightKg?: number;
  ftp?: number;
  thresholdHr?: number;
}

// ================================
// Distance Calculations
// ================================

/**
 * Calculate total distance from GPS coordinates
 */
export function calculateTotalDistance(
  coordinates: [number, number][],
): number {
  if (coordinates.length < 2) return 0;

  let totalDistance = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lat1, lon1] = coordinates[i - 1];
    const [lat2, lon2] = coordinates[i];
    totalDistance += calculateDistanceBetweenPoints(lat1, lon1, lat2, lon2);
  }

  return totalDistance;
}

/**
 * Calculate distance from speed data (fallback when GPS unavailable)
 */
export function calculateDistanceFromSpeed(
  speedData: number[],
  timestamps: number[],
): number {
  if (speedData.length !== timestamps.length || speedData.length < 2) {
    return 0;
  }

  let totalDistance = 0;

  for (let i = 1; i < speedData.length; i++) {
    const timeDelta = (timestamps[i] - timestamps[i - 1]) / 1000; // seconds
    const averageSpeed = (speedData[i] + speedData[i - 1]) / 2; // m/s
    totalDistance += averageSpeed * timeDelta;
  }

  return Math.max(0, totalDistance);
}

// ================================
// Time Calculations
// ================================

/**
 * Calculate moving time by excluding stopped periods
 */
export function calculateMovingTime(
  speedData: number[],
  timestamps: number[],
  stopThreshold: number = 0.5, // m/s (1.8 km/h)
): number {
  if (speedData.length !== timestamps.length || speedData.length < 2) {
    return 0;
  }

  let movingTime = 0;

  for (let i = 1; i < speedData.length; i++) {
    const timeDelta = (timestamps[i] - timestamps[i - 1]) / 1000; // seconds
    const speed = speedData[i];

    if (speed > stopThreshold) {
      movingTime += timeDelta;
    }
  }

  return movingTime;
}

/**
 * Calculate total elapsed time from timestamps
 */
export function calculateTotalTime(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;

  const startTime = Math.min(...timestamps);
  const endTime = Math.max(...timestamps);

  return (endTime - startTime) / 1000; // seconds
}

// ================================
// Elevation Calculations
// ================================

/**
 * Calculate total elevation gain from altitude data
 */
export function calculateElevationGain(altitudeData: number[]): number {
  if (altitudeData.length < 2) return 0;

  // Smooth altitude data to reduce GPS noise
  const smoothedAltitude = smoothAltitudeData(altitudeData);
  let totalGain = 0;

  for (let i = 1; i < smoothedAltitude.length; i++) {
    const elevationChange = smoothedAltitude[i] - smoothedAltitude[i - 1];
    if (elevationChange > 0) {
      totalGain += elevationChange;
    }
  }

  return totalGain;
}

/**
 * Calculate total elevation loss from altitude data
 */
export function calculateElevationLoss(altitudeData: number[]): number {
  if (altitudeData.length < 2) return 0;

  const smoothedAltitude = smoothAltitudeData(altitudeData);
  let totalLoss = 0;

  for (let i = 1; i < smoothedAltitude.length; i++) {
    const elevationChange = smoothedAltitude[i] - smoothedAltitude[i - 1];
    if (elevationChange < 0) {
      totalLoss += Math.abs(elevationChange);
    }
  }

  return totalLoss;
}

// ================================
// Calorie Calculations
// ================================

/**
 * Calculate calories burned using multiple methods based on available data
 */
export function calculateCalories(
  profile: ProfileSnapshot,
  durationSeconds: number,
  avgPower?: number,
  avgHeartRate?: number,
  activityType: string = "outdoor_bike",
): number {
  // Method 1: Power-based calculation (most accurate for cycling)
  if (avgPower && avgPower > 0) {
    return calculateCaloriesFromPower(avgPower, durationSeconds);
  }

  // Method 2: Heart rate-based calculation
  if (avgHeartRate && profile.weightKg && avgHeartRate > 0) {
    return calculateCaloriesFromHeartRate(
      avgHeartRate,
      durationSeconds,
      profile.weightKg,
      activityType,
    );
  }

  // Method 3: Fallback to METs estimation
  return calculateCaloriesFromMETs(
    profile.weightKg || 70,
    durationSeconds,
    activityType,
  );
}

/**
 * Calculate calories from power data (cycling)
 */
function calculateCaloriesFromPower(
  avgPower: number,
  durationSeconds: number,
): number {
  // Gross mechanical efficiency of ~22% for cycling
  const efficiency = 0.22;
  const kJoules = (avgPower * durationSeconds) / 1000;
  const calories = kJoules / efficiency / 4.184; // Convert to calories

  return Math.round(calories);
}

/**
 * Calculate calories from heart rate using Keytel formula
 */
function calculateCaloriesFromHeartRate(
  avgHeartRate: number,
  durationSeconds: number,
  weightKg: number,
  activityType: string,
): number {
  const durationMinutes = durationSeconds / 60;

  // Gender coefficient (assuming male for now - could be added to profile)
  const genderCoeff = 1.0; // 1.0 for male, 0.9 for female

  // Activity-specific adjustments
  const activityCoeff = getActivityCoefficient(activityType);

  // Keytel formula: Calories/min = (0.6309 × HR + 0.1988 × weight + 0.2017 × age - 55.0969) × time/4.184
  // Simplified without age: focus on HR and weight
  const caloriesPerMinute =
    ((0.6309 * avgHeartRate + 0.1988 * weightKg - 55.0969) *
      genderCoeff *
      activityCoeff) /
    4.184;

  return Math.round(Math.max(0, caloriesPerMinute * durationMinutes));
}

/**
 * Calculate calories using METs (Metabolic Equivalents)
 */
function calculateCaloriesFromMETs(
  weightKg: number,
  durationSeconds: number,
  activityType: string,
): number {
  const durationHours = durationSeconds / 3600;
  const mets = getMETSForActivity(activityType);

  // Calories = METs × weight (kg) × time (hours)
  return Math.round(mets * weightKg * durationHours);
}

// ================================
// Average Metric Calculations
// ================================

/**
 * Calculate average of non-zero values
 */
export function calculateAverageMetric(
  data: number[],
  excludeZeros: boolean = true,
): number {
  if (data.length === 0) return 0;

  const filteredData = excludeZeros ? data.filter((val) => val > 0) : data;

  if (filteredData.length === 0) return 0;

  const sum = filteredData.reduce((acc, val) => acc + val, 0);
  return sum / filteredData.length;
}

/**
 * Calculate maximum value in dataset
 */
export function calculateMaxMetric(data: number[]): number {
  if (data.length === 0) return 0;
  return Math.max(...data);
}

/**
 * Calculate weighted average (useful for power/speed averaging)
 */
export function calculateWeightedAverage(
  values: number[],
  weights: number[],
): number {
  if (values.length !== weights.length || values.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < values.length; i++) {
    if (weights[i] > 0) {
      weightedSum += values[i] * weights[i];
      totalWeight += weights[i];
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ================================
// Main Activity Summary Function
// ================================

/**
 * Compute complete activity summary from stream data
 */
export function computeActivitySummary(
  streamData: ActivityStreamData,
  profile: ProfileSnapshot,
  activityType: string = "outdoor_bike",
): ActivitySummary {
  const { timestamps } = streamData;

  // Time calculations
  const totalTime = calculateTotalTime(timestamps);
  const movingTime = streamData.speed
    ? calculateMovingTime(streamData.speed, timestamps)
    : totalTime;

  // Distance calculations
  let distance = 0;
  if (streamData.latlng && streamData.latlng.length > 1) {
    distance = calculateTotalDistance(streamData.latlng);
  } else if (streamData.speed) {
    distance = calculateDistanceFromSpeed(streamData.speed, timestamps);
  }

  // Elevation calculations
  const elevation = streamData.altitude
    ? calculateElevationGain(streamData.altitude)
    : 0;

  // Speed calculations
  const averageSpeed = movingTime > 0 ? distance / movingTime : 0;
  const maxSpeed = streamData.speed ? calculateMaxMetric(streamData.speed) : 0;

  // Heart rate calculations
  const averageHeartRate = streamData.heartrate
    ? calculateAverageMetric(streamData.heartrate)
    : undefined;
  const maxHeartRate = streamData.heartrate
    ? calculateMaxMetric(streamData.heartrate)
    : undefined;

  // Power calculations
  const averagePower = streamData.power
    ? calculateAverageMetric(streamData.power)
    : undefined;
  const normalizedPower = streamData.power
    ? calculateNormalizedPower(streamData.power)
    : undefined;

  // Calorie calculations
  const calories = calculateCalories(
    profile,
    movingTime,
    averagePower,
    averageHeartRate,
    activityType,
  );

  // TSS calculation (if power data available)
  const tss =
    averagePower && normalizedPower && profile.ftp
      ? calculateTSS(normalizedPower, movingTime, profile.ftp)
      : undefined;

  return {
    duration: Math.round(totalTime),
    distance: Math.round(distance),
    elevation: Math.round(elevation),
    calories,
    tss,
    averagePower,
    normalizedPower,
    averageHeartRate: averageHeartRate
      ? Math.round(averageHeartRate)
      : undefined,
    maxHeartRate: maxHeartRate ? Math.round(maxHeartRate) : undefined,
    averageSpeed,
    maxSpeed,
  };
}

// ================================
// Utility Functions
// ================================

/**
 * Calculate distance between two GPS points using Haversine formula
 */
export function calculateDistanceBetweenPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function calculateAltitudeBetweenPoints(
  Ωç: number,
  lat2: number,
  lon2: number,
): number {}

/**
 * Smooth altitude data using moving average to reduce GPS noise
 */
function smoothAltitudeData(
  altitudeData: number[],
  windowSize: number = 5,
): number[] {
  if (altitudeData.length < windowSize) return altitudeData;

  const smoothed: number[] = [];

  for (let i = 0; i < altitudeData.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(altitudeData.length, start + windowSize);

    const sum = altitudeData
      .slice(start, end)
      .reduce((acc, val) => acc + val, 0);
    smoothed.push(sum / (end - start));
  }

  return smoothed;
}

/**
 * Calculate Normalized Power (30-second rolling average)
 */
function calculateNormalizedPower(powerData: number[]): number {
  if (powerData.length < 30) return calculateAverageMetric(powerData);

  const rollingAverages: number[] = [];

  for (let i = 29; i < powerData.length; i++) {
    const window = powerData.slice(i - 29, i + 1);
    const average = calculateAverageMetric(window, false);
    rollingAverages.push(Math.pow(average, 4));
  }

  const avgOfFourthPowers = calculateAverageMetric(rollingAverages, false);
  return Math.pow(avgOfFourthPowers, 0.25);
}

/**
 * Calculate Training Stress Score from power data
 */
function calculateTSS(
  normalizedPower: number,
  durationSeconds: number,
  ftp: number,
): number {
  const intensityFactor = normalizedPower / ftp;
  const durationHours = durationSeconds / 3600;

  return Math.round(durationHours * intensityFactor * intensityFactor * 100);
}

/**
 * Get activity coefficient for heart rate calorie calculations
 */
function getActivityCoefficient(activityType: string): number {
  const coefficients: Record<string, number> = {
    outdoor_run: 1.2,
    outdoor_bike: 1.0,
    indoor_treadmill: 1.1,
    indoor_strength: 0.8,
    indoor_swim: 1.3,
    other: 1.0,
  };

  return coefficients[activityType] || 1.0;
}

/**
 * Get METs value for different activity types
 */
function getMETSForActivity(activityType: string): number {
  const metsValues: Record<string, number> = {
    outdoor_run: 9.0,
    outdoor_bike: 7.5,
    indoor_treadmill: 8.0,
    indoor_strength: 6.0,
    indoor_swim: 8.0,
    other: 6.0,
  };

  return metsValues[activityType] || 6.0;
}
