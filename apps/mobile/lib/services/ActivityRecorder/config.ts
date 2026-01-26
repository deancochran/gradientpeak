/**
 * ActivityRecorder Configuration - Simplified
 *
 * The recording system has two core concerns:
 * 1. Real-time UI updates (1 second)
 * 2. Periodic database persistence (60 seconds)
 */

export const RECORDING_CONFIG = {
  // === Core Intervals ===
  UPDATE_INTERVAL: 1000, // 1s: Calculate metrics and update UI
  PERSISTENCE_INTERVAL: 120000, // 2min: Write to database + cleanup old data (optimized from 60s)

  // === Data Window ===
  BUFFER_WINDOW_SECONDS: 60, // Keep 60 seconds of data for calculations

  // === GPS Path Display ===
  MAX_GPS_PATH_POINTS: 1000, // Maximum GPS points to keep for map display (prevents memory leak)
} as const;

// === Metric Precision (reduce unnecessary re-renders) ===
export const METRIC_PRECISION = {
  power: 0, // Whole watts
  heartRate: 0, // Whole BPM
  speed: 1, // 1 decimal place (km/h)
  distance: 0, // Whole meters
  cadence: 0, // Whole RPM
  normalizedPower: 0, // Whole watts
  intensityFactor: 2, // 2 decimal places (0.85)
  tss: 0, // Whole points
  elevation: 1, // 1 decimal place (meters)
  temperature: 1, // 1 decimal place (°C)
  efficiency: 1, // 1 decimal place
  grade: 1, // 1 decimal place (%)
} as const;

// === Movement Thresholds ===
export const MOVEMENT_THRESHOLDS = {
  SPEED_THRESHOLD_MPS: 0.5, // 0.5 m/s = ~1.8 km/h
  ELEVATION_NOISE_THRESHOLD_M: 1, // 1 meter elevation change threshold
  DISTANCE_MIN_DELTA_M: 1, // Minimum distance delta to record
  GPS_ACCURACY_THRESHOLD_M: 50, // Filter out GPS readings with poor accuracy
} as const;

// === Zone Configuration ===
export const ZONE_CONFIG = {
  HR_ZONES: 5, // 5 heart rate zones
  POWER_ZONES: 7, // 7 power zones
} as const;

// === Utility Functions ===
export function roundToPrecision(value: number, metric: string): number {
  const precision =
    METRIC_PRECISION[metric as keyof typeof METRIC_PRECISION] || 0;
  return Number(value.toFixed(precision));
}
