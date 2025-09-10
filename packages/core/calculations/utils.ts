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
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
 * Calculate age from date of birth
 * @param dateOfBirth - Date of birth
 * @param referenceDate - Reference date (defaults to today)
 * @returns Age in years
 */
export function calculateAge(
  dateOfBirth: Date,
  referenceDate: Date = new Date(),
): number {
  let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())
  ) {
    age--;
  }

  return age;
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
 * Format pace from speed in m/s
 * @param speedMs - Speed in meters per second
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted pace string (min/km or min/mi)
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
    const distance = calculateDistance(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude,
    );
    totalDistance += distance;
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
 * Calculate average pace from total distance and duration
 * @param totalDistanceMeters - Total distance in meters
 * @param durationSeconds - Duration in seconds
 * @param unit - Unit system ('metric' or 'imperial')
 * @returns Formatted pace string
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
