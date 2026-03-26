/**
 * Compatibility calculations surface.
 *
 * Canonical ownership now lives in focused domain modules such as `load/`,
 * `zones/`, `duration/`, and `estimators/`. Keep this file stable while
 * callers migrate to narrower imports.
 */
import { calculateNormalizedPower as calculateNormalizedPowerFromStream } from "./calculations/normalized-power";
import { type TrainingQualityProfile } from "./calculations/training-quality";
import {
  getFormStatusColor as getFormStatusColorFromLoad,
  getFormStatus as getFormStatusFromLoad,
} from "./load/form";
import {
  calculateATL as calculateATLFromLoad,
  calculateCTL as calculateCTLFromLoad,
  calculateCTLProjection as calculateCTLProjectionFromLoad,
  calculateTargetDailyTSS as calculateTargetDailyTSSFromLoad,
  calculateTrainingLoadSeries as calculateTrainingLoadSeriesFromLoad,
  calculateTSB as calculateTSBFromLoad,
  projectCTL as projectCTLFromLoad,
} from "./load/progression";
import {
  calculateRampRate as calculateRampRateFromLoad,
  isRampRateSafe as isRampRateSafeFromLoad,
} from "./load/ramp";
import {
  calculateTrainingIntensityFactor as calculateTrainingIntensityFactorFromLoad,
  calculateTrainingTSS as calculateTrainingTSSFromLoad,
  estimateTSS as estimateTSSFromLoad,
  getTrainingIntensityZone as getTrainingIntensityZoneFromLoad,
} from "./load/tss";
import type { ProfileWithDob } from "./profile";
import { calculateHRZoneDistribution } from "./zones/hr";
import { calculatePowerZoneDistribution } from "./zones/power";

export type PublicActivityMetric = string;
export type PublicActivityMetricDataType = "float" | "latlng" | "boolean";

// Aggregated stream data
export interface AggregatedStream {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
  values: number[] | number[][];
  timestamps: number[];
  sampleCount: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
}

export function calculateElapsedTime(startedAt: Date | string, endedAt: Date | string): number {
  if (!startedAt || !endedAt) return 0;
  return Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
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

export function calculateNormalizedPower(powerStream?: AggregatedStream): number | undefined {
  if (!powerStream?.values) return undefined;

  const powers = powerStream.values as number[];
  if (powers.length === 0) return undefined;
  return calculateNormalizedPowerFromStream(powers);
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
  ftp?: number | null,
): number | undefined {
  if (!ftp) return undefined;
  const np = calculateNormalizedPower(powerStream);
  const if_ = calculateIntensityFactor(powerStream, ftp);
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
  return calculateHRZoneDistribution(hrStream, thresholdHR);
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
  return calculatePowerZoneDistribution(powerStream, ftp);
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

  const firstHalfPower = powers.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfPower =
    powers.slice(midpoint).reduce((a, b) => a + b, 0) / (powers.length - midpoint);

  const firstHalfHR = hrs.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const secondHalfHR = hrs.slice(midpoint).reduce((a, b) => a + b, 0) / (hrs.length - midpoint);

  const firstHalfRatio = firstHalfPower / firstHalfHR;
  const secondHalfRatio = secondHalfPower / secondHalfHR;

  // Decoupling percentage
  return Math.round(((secondHalfRatio - firstHalfRatio) / firstHalfRatio) * 10000) / 100;
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
    const change = elevations[i]! - elevations[i - 1]!;
    if (change > 0) totalAscent += change;
    else if (change < 0) totalDescent += Math.abs(change);
  }

  return {
    totalAscent: Math.round(totalAscent),
    totalDescent: Math.round(totalDescent),
  };
}

export function calculateAverageGrade(gradientStream?: AggregatedStream): number | undefined {
  if (!gradientStream?.avgValue) return undefined;
  return Math.round(gradientStream.avgValue * 100) / 100;
}

export function calculateElevationGainPerKm(
  totalAscent: number,
  distanceStream?: AggregatedStream,
): number | undefined {
  if (!distanceStream?.maxValue || distanceStream.maxValue === 0) return undefined;
  const distanceKm = distanceStream.maxValue / 1000;
  return Math.round((totalAscent / distanceKm) * 100) / 100;
}

// ================================
// Calorie Calculations
// ================================

export function calculateCalories(
  startedAt: Date | string,
  endedAt: Date | string,
  profile: ProfileWithDob,
  weightKg?: number | null,
  powerStream?: AggregatedStream,
  hrStream?: AggregatedStream,
): number {
  // If power is available, use it (most accurate)
  if (powerStream?.avgValue) {
    const durationHours = calculateElapsedTime(startedAt, endedAt) / 3600;
    return Math.round(powerStream.avgValue * durationHours * 3.6);
  }
  const age = calculateAge(profile.dob);

  // Otherwise use HR-based estimation
  if (hrStream?.avgValue && weightKg && age) {
    const duration = calculateElapsedTime(startedAt, endedAt) / 60; // minutes
    const avgHR = hrStream.avgValue;

    // Gender-specific calorie estimation (assuming male, adjust if you have gender data)
    const calories =
      ((age * 0.2017 + weightKg * 0.1988 + avgHR * 0.6309 - 55.0969) * duration) / 4.184;
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
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of first point in degrees
 * @param lon1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lon2 - Longitude of second point in degrees
 * @returns Distance in meters
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate moving average for an array of numbers
 * @param values - Array of numbers
 * @param windowSize - Size of moving window
 * @returns Array of moving averages
 */
export function calculateMovingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 0 || windowSize > values.length) {
    throw new Error("Invalid window size");
  }

  const result: number[] = [];

  for (let i = 0; i <= values.length - windowSize; i++) {
    const windowSum = values.slice(i, i + windowSize).reduce((sum, val) => sum + val, 0);
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
export function formatDistance(meters: number, unit: "metric" | "imperial" = "metric"): string {
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
export function formatSpeed(mps: number, unit: "metric" | "imperial" = "metric"): string {
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
export function formatPace(speedMs: number, unit: "metric" | "imperial" = "metric"): string {
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
export function formatWeight(kg: number, unit: "metric" | "imperial" = "metric"): string {
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

// =======================
// Training Load Calculations (CTL, ATL, TSB)
// =======================

/**
 * Calculate Chronic Training Load (CTL) - Long-term fitness
 * Uses exponential weighted moving average with age-adjusted time constant
 *
 * @param previousCTL - Previous day's CTL value
 * @param todayTSS - Today's Training Stress Score
 * @param userAge - Optional user age for age-adjusted time constants
 * @returns New CTL value
 */
export function calculateCTL(previousCTL: number, todayTSS: number, userAge?: number): number {
  return calculateCTLFromLoad(previousCTL, todayTSS, userAge);
}

/**
 * Calculate Acute Training Load (ATL) - Short-term fatigue
 * Uses exponential weighted moving average with age-adjusted time constant
 *
 * @param previousATL - Previous day's ATL value
 * @param todayTSS - Today's Training Stress Score
 * @param userAge - Optional user age for age-adjusted time constants
 * @returns New ATL value
 */
export function calculateATL(
  previousATL: number,
  todayTSS: number,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): number {
  return calculateATLFromLoad(previousATL, todayTSS, userAge, userGender, trainingQuality);
}

/**
 * Calculate Training Stress Balance (TSB) - Freshness/Form
 * TSB = CTL - ATL
 *
 * Positive TSB = Fresh/Rested
 * Negative TSB = Fatigued
 *
 * @param ctl - Chronic Training Load
 * @param atl - Acute Training Load
 * @returns TSB value
 */
export function calculateTSB(ctl: number, atl: number): number {
  return calculateTSBFromLoad(ctl, atl);
}

/**
 * Calculate training load metrics for multiple days
 *
 * @param dailyTSS - Array of daily TSS values (chronological order)
 * @param initialCTL - Starting CTL value (default: 0)
 * @param initialATL - Starting ATL value (default: 0)
 * @returns Array of daily training load values
 */
export function calculateTrainingLoadSeries(
  dailyTSS: number[],
  initialCTL = 0,
  initialATL = 0,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): Array<{ date: number; tss: number; ctl: number; atl: number; tsb: number }> {
  return calculateTrainingLoadSeriesFromLoad(
    dailyTSS,
    initialCTL,
    initialATL,
    userAge,
    userGender,
    trainingQuality,
  );
}

/**
 * Get form assessment based on TSB value
 *
 * @param tsb - Training Stress Balance
 * @returns Form status string
 */
export function getFormStatus(
  tsb: number,
): "fresh" | "optimal" | "neutral" | "tired" | "overreaching" {
  return getFormStatusFromLoad(tsb);
}

/**
 * Get color indicator for form status
 *
 * @param tsb - Training Stress Balance
 * @returns Color string for UI
 */
export function getFormStatusColor(tsb: number): string {
  return getFormStatusColorFromLoad(tsb);
}

/**
 * Calculate projected CTL over time based on planned training
 * Useful for visualizing fitness progression in training plan creation
 *
 * @param config - Configuration object with training plan parameters
 * @param config.startingCTL - Starting CTL value (typically user's current CTL)
 * @param config.targetCTL - Goal CTL to reach
 * @param config.weeklyTSSAvg - Average weekly TSS from plan
 * @param config.mesocycles - Array of training mesocycles with phases and multipliers
 * @param config.recoveryWeekFrequency - Insert recovery week every N weeks (default: 3)
 * @param config.recoveryWeekReduction - TSS reduction for recovery weeks (0.5 = 50% reduction)
 * @returns Array of projected CTL values by week
 */
export function calculateCTLProjection(config: {
  startingCTL: number;
  targetCTL: number;
  weeklyTSSAvg: number;
  mesocycles: Array<{
    duration_weeks: number;
    tss_multiplier: number;
  }>;
  recoveryWeekFrequency?: number;
  recoveryWeekReduction?: number;
}): Array<{ week: number; ctl: number; date: string }> {
  return calculateCTLProjectionFromLoad(config);
}

/**
 * Calculate Intensity Factor (IF) from normalized power/pace and threshold
 * IF = NP / FTP (for cycling) or similar for running
 *
 * @param normalizedPower - Normalized power or pace for the activity
 * @param functionalThreshold - Functional threshold power or pace
 * @returns Intensity Factor (0.0 - 2.0+ range)
 */
export function calculateTrainingIntensityFactor(
  normalizedPower: number,
  functionalThreshold: number,
): number {
  return calculateTrainingIntensityFactorFromLoad(normalizedPower, functionalThreshold);
}

/**
 * Derive training intensity zone from Intensity Factor
 * This is calculated AFTER the activity, not prescribed before
 *
 * Based on standard endurance training zones:
 * - Recovery: < 0.55 (Active recovery)
 * - Endurance: 0.55-0.75 (Long aerobic base)
 * - Tempo: 0.75-0.85 (Sweet spot, steady efforts)
 * - Threshold: 0.85-0.95 (Sustained efforts near FTP)
 * - VO2max: 0.95-1.05 (Race pace, FTP-level)
 * - Anaerobic: 1.05-1.15 (Supra-threshold intervals)
 * - Neuromuscular: > 1.15 (Sprint, max effort)
 *
 * @param intensityFactor - IF score from completed activity (0.00 - 1.50+)
 * @returns Intensity zone classification (7 zones)
 */
export function getTrainingIntensityZone(
  intensityFactor: number,
): "recovery" | "endurance" | "tempo" | "threshold" | "vo2max" | "anaerobic" | "neuromuscular" {
  return getTrainingIntensityZoneFromLoad(intensityFactor);
}

/**
 * Calculate Training Stress Score (TSS) from duration and intensity factor
 * TSS = (duration_in_seconds * IF^2 * 100) / 3600
 *
 * @param durationSeconds - Activity duration in seconds
 * @param intensityFactor - IF score
 * @returns Training Stress Score
 */
export function calculateTrainingTSS(durationSeconds: number, intensityFactor: number): number {
  return calculateTrainingTSSFromLoad(durationSeconds, intensityFactor);
}

/**
 * Estimate TSS for planning purposes (before activity is completed)
 * Uses average IF for different effort levels
 *
 * @param durationMinutes - Planned duration in minutes
 * @param effortLevel - Planned effort level
 * @returns Estimated TSS for planning
 */
export function estimateTSS(
  durationMinutes: number,
  effortLevel: "easy" | "moderate" | "hard",
): number {
  return estimateTSSFromLoad(durationMinutes, effortLevel);
}

/**
 * Calculate ramp rate - rate of CTL increase
 *
 * @param currentCTL - Current CTL value
 * @param previousCTL - CTL from one week ago
 * @returns Weekly CTL change
 */
export function calculateRampRate(currentCTL: number, previousCTL: number): number {
  return calculateRampRateFromLoad(currentCTL, previousCTL);
}

/**
 * Validate if ramp rate is safe (typically should be < 5-8 TSS/week)
 *
 * @param rampRate - Weekly CTL change
 * @param threshold - Maximum safe ramp rate (default: 5)
 * @returns true if safe, false if too aggressive
 */
export function isRampRateSafe(rampRate: number, threshold = 5): boolean {
  return isRampRateSafeFromLoad(rampRate, threshold);
}

/**
 * Project future CTL based on planned TSS
 *
 * @param currentCTL - Current CTL value
 * @param plannedDailyTSS - Array of planned TSS values
 * @returns Projected CTL at end of period
 */
export function projectCTL(currentCTL: number, plannedDailyTSS: number[]): number {
  return projectCTLFromLoad(currentCTL, plannedDailyTSS);
}

/**
 * Calculate target daily TSS to reach a CTL goal
 *
 * @param currentCTL - Current CTL value
 * @param targetCTL - Desired CTL value
 * @param daysToTarget - Number of days to reach target
 * @returns Estimated daily TSS needed
 */
export function calculateTargetDailyTSS(
  currentCTL: number,
  targetCTL: number,
  daysToTarget: number,
): number {
  return calculateTargetDailyTSSFromLoad(currentCTL, targetCTL, daysToTarget);
}
