/**
 * Format duration in seconds to human-readable time string
 */
export const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
};

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
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
};

/**
 * Format pace from speed in m/s to min/km format
 */
export const formatPace = (speedMs: number): string => {
  if (speedMs <= 0) return "--:--";

  const paceSeconds = 1000 / speedMs; // seconds per kilometer
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

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
 * Calculate total distance from an array of GPS locations
 */
export const calculateTotalDistance = (locations: Array<{latitude: number; longitude: number}>): number => {
  if (locations.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < locations.length; i++) {
    const distance = calculateDistance(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude
    );
    totalDistance += distance;
  }

  return totalDistance;
};

/**
 * Calculate average pace from total distance and duration
 */
export const calculateAveragePace = (totalDistanceMeters: number, durationSeconds: number): string => {
  if (totalDistanceMeters <= 0 || durationSeconds <= 0) {
    return "--:--";
  }

  const averageSpeedMs = totalDistanceMeters / durationSeconds;
  return formatPace(averageSpeedMs);
};

/**
 * Estimate calories burned based on duration, distance, and optional heart rate
 */
export const estimateCalories = (
  durationSeconds: number,
  totalDistanceMeters: number,
  heartRate?: number
): number => {
  const baseCaloriesPerSecond = 0.1;
  const heartRateMultiplier = heartRate ? heartRate / 100 : 1;
  const distanceMultiplier = totalDistanceMeters > 0 ? 1 + totalDistanceMeters / 10000 : 1;

  return Math.floor(
    durationSeconds * baseCaloriesPerSecond * heartRateMultiplier * distanceMultiplier
  );
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
