// Export all calculation modules
export * from "./activity-summary";
export * from "./compliance-scoring";
export * from "./hr";
export * from "./power";
export * from "./schema-navigation";
export * from "./sensor-parsing";
export * from "./training-load";
export * from "./training-plan";
export * from "./trends";
export * from "./utils";

// Re-export commonly used functions for convenience
export {
  calculateComplianceScore,
  createSampleActualMetrics,
  createSamplePlannedMetrics,
} from "./compliance-scoring";
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
  adaptWeeklyPlan,
  createNewPlannedActivity,
  createWeeklySchedule,
  estimateActivityDuration,
  estimateActivityTSS,
  estimateWeeklyTSS,
  requiresFTP,
  requiresThresholdHR,
} from "./training-plan";
export {
  calculateHeartRateZoneDistribution,
  calculatePowerCurve,
  calculatePowerHeartRateTrend,
  calculatePowerZoneDistribution,
  calculateTrainingLoadProgression,
  validateTrendsData,
} from "./trends";
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
