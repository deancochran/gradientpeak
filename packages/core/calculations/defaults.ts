/**
 * Global Default Performance Metrics
 *
 * Used as fallbacks when user profile metrics are missing.
 * These are conservative values for a recreational athlete.
 */

export const GLOBAL_DEFAULTS = {
  ftp: 150, // Watts
  thresholdHr: 160, // BPM
  maxHr: 190, // BPM
  restingHr: 60, // BPM
  weightKg: 75, // kg
  thresholdPaceSecondsPerKm: 330, // 5:30/km
  cssSecondsPerHundredMeters: 105, // 1:45/100m
};

/**
 * Type for performance metrics
 */
export interface PerformanceMetrics {
  ftp?: number;
  thresholdHr?: number;
  maxHr?: number;
  restingHr?: number;
  weightKg?: number;
  thresholdPaceSecondsPerKm?: number;
  cssSecondsPerHundredMeters?: number;
}

/**
 * Merges provided metrics with global defaults
 */
export function withDefaults(
  metrics?: PerformanceMetrics,
): Required<PerformanceMetrics> {
  return {
    ftp: metrics?.ftp ?? GLOBAL_DEFAULTS.ftp,
    thresholdHr: metrics?.thresholdHr ?? GLOBAL_DEFAULTS.thresholdHr,
    maxHr: metrics?.maxHr ?? GLOBAL_DEFAULTS.maxHr,
    restingHr: metrics?.restingHr ?? GLOBAL_DEFAULTS.restingHr,
    weightKg: metrics?.weightKg ?? GLOBAL_DEFAULTS.weightKg,
    thresholdPaceSecondsPerKm:
      metrics?.thresholdPaceSecondsPerKm ??
      GLOBAL_DEFAULTS.thresholdPaceSecondsPerKm,
    cssSecondsPerHundredMeters:
      metrics?.cssSecondsPerHundredMeters ??
      GLOBAL_DEFAULTS.cssSecondsPerHundredMeters,
  };
}
