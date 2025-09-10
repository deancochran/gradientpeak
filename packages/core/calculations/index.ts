// Export all calculation modules
export * from "./hr";
export * from "./power";
export * from "./training-load";
export * from "./utils";

// Re-export commonly used functions for convenience
export {
  calculateAverageHRZone,
  calculateHrZones,
  calculateTimeInZones,
  getHeartRateZone,
} from "./hr";
export {
  calculateAveragePowerZone,
  calculateIntensityFactor,
  calculateNormalizedPower,
  calculatePowerZones,
  calculateTimeInPowerZones,
  calculateVariabilityIndex,
  getPowerZone,
} from "./power";
export {
  analyzeTrainingLoad,
  calculateHeartRateTSS,
  calculateRecommendedTSS,
  calculateRunningTSS,
  calculateTrainingLoad,
  calculateTSS,
  projectCTL,
} from "./training-load";
export {
  addDays,
  calculateAge,
  calculateMovingAverage,
  calculatePercentageChange,
  celsiusToFahrenheit,
  clamp,
  endOfDay,
  fahrenheitToCelsius,
  feetToMeters,
  formatCadence,
  formatDistance,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatPower,
  formatSpeed,
  formatTSS,
  formatWeight,
  kgToLbs,
  kmToMiles,
  kphToMps,
  lbsToKg,
  lerp,
  metersPerSecondToKph,
  metersPerSecondToMph,
  metersToFeet,
  milesToKm,
  mphToMps,
  parseDuration,
  startOfDay,
} from "./utils";
