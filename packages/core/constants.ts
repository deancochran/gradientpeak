/**
 * Core constants for fitness calculations and training zone definitions
 */

// ================================
// Activity Type Configuration
// ================================

/**
 * Activity location types
 */
export const ACTIVITY_LOCATIONS = {
  outdoor: { name: "Outdoor", description: "Outdoor activity" },
  indoor: { name: "Indoor", description: "Indoor activity" },
} as const;

/**
 * Activity category configuration for UI display
 * Each category has icon, color, and metadata
 */
export const ACTIVITY_CATEGORY_CONFIG = {
  run: {
    name: "Run",
    icon: "🏃",
    color: "#2563eb", // blue-600
    category: "cardio",
    description: "Running activity",
  },
  bike: {
    name: "Bike",
    icon: "🚴",
    color: "#16a34a", // green-600
    category: "cardio",
    description: "Cycling activity",
  },
  swim: {
    name: "Swim",
    icon: "🏊",
    color: "#0891b2", // cyan-600
    category: "cardio",
    description: "Swimming activity",
  },
  strength: {
    name: "Strength",
    icon: "💪",
    color: "#dc2626", // red-600
    category: "strength",
    description: "Resistance training",
  },
  other: {
    name: "Other",
    icon: "⚡",
    color: "#6b7280", // gray-600
    category: "other",
    description: "Other physical activity",
  },
} as const;

/**
 * Legacy: Combined activity type configuration
 * Maps old combined types to new structure for backwards compatibility
 * @deprecated Use ACTIVITY_CATEGORY_CONFIG and ACTIVITY_LOCATIONS instead
 */
export const ACTIVITY_TYPE_CONFIG = {
  outdoor_run: {
    name: "Outdoor Run",
    shortName: "Run",
    icon: "🏃",
    color: "#2563eb",
    category: "cardio",
    description: "Running outdoors",
    location: "outdoor" as const,
    activityCategory: "run" as const,
  },
  outdoor_bike: {
    name: "Outdoor Bike",
    shortName: "Bike",
    icon: "🚴",
    color: "#16a34a",
    category: "cardio",
    description: "Cycling outdoors",
    location: "outdoor" as const,
    activityCategory: "bike" as const,
  },
  indoor_treadmill: {
    name: "Treadmill",
    shortName: "Treadmill",
    icon: "🏃",
    color: "#9333ea",
    category: "cardio",
    description: "Running on treadmill",
    location: "indoor" as const,
    activityCategory: "run" as const,
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    shortName: "Trainer",
    icon: "🚴",
    color: "#ea580c",
    category: "cardio",
    description: "Cycling on indoor trainer",
    location: "indoor" as const,
    activityCategory: "bike" as const,
  },
  indoor_strength: {
    name: "Strength Training",
    shortName: "Strength",
    icon: "💪",
    color: "#dc2626",
    category: "strength",
    description: "Resistance training",
    location: "indoor" as const,
    activityCategory: "strength" as const,
  },
  indoor_swim: {
    name: "Swimming",
    shortName: "Swim",
    icon: "🏊",
    color: "#0891b2",
    category: "cardio",
    description: "Swimming activity",
    location: "indoor" as const,
    activityCategory: "swim" as const,
  },
  other: {
    name: "Other Activity",
    shortName: "Other",
    icon: "⚡",
    color: "#6b7280",
    category: "other",
    description: "Other physical activity",
    location: "outdoor" as const,
    activityCategory: "other" as const,
  },
} as const;

/**
 * Type helper for activity types
 */
export type ActivityType = keyof typeof ACTIVITY_TYPE_CONFIG;

/**
 * Activity categories for grouping
 */
export const ACTIVITY_CATEGORIES = {
  cardio: "Cardio",
  strength: "Strength",
  other: "Other",
} as const;

// ================================
// Training Zone Constants
// ================================

/**
 * Default heart rate zone percentages based on threshold HR
 */
export const HR_ZONE_PERCENTAGES = {
  ZONE_1: 0.5, // Recovery
  ZONE_2: 0.6, // Endurance
  ZONE_3: 0.7, // Tempo
  ZONE_4: 0.8, // Lactate Threshold
  ZONE_5: 0.9, // VO2 Max
} as const;

/**
 * Alternative HR zone percentages based on max HR
 */
export const HR_ZONE_MAX_PERCENTAGES = {
  ZONE_1: 0.5, // 50-60% of max HR
  ZONE_2: 0.6, // 60-70% of max HR
  ZONE_3: 0.7, // 70-80% of max HR
  ZONE_4: 0.8, // 80-90% of max HR
  ZONE_5: 0.9, // 90-100% of max HR
} as const;

/**
 * Power zone percentages based on FTP
 */
export const POWER_ZONE_PERCENTAGES = {
  ZONE_1: 0.55, // Active Recovery
  ZONE_2: 0.75, // Endurance
  ZONE_3: 0.9, // Tempo
  ZONE_4: 1.05, // Lactate Threshold
  ZONE_5: 1.2, // VO2 Max
} as const;

/**
 * Pace zone percentages based on threshold speed
 */
export const PACE_ZONE_PERCENTAGES = {
  ZONE_1: 0.85, // Recovery (slower speed = higher percentage)
  ZONE_2: 0.9, // Endurance
  ZONE_3: 0.95, // Tempo
  ZONE_4: 1.0, // Lactate Threshold
  ZONE_5: 1.05, // VO2 Max (faster speed = higher percentage)
} as const;

// ================================
// Training Load Constants
// ================================

/**
 * Training Stress Score calculation constants
 */
export const TSS_CONSTANTS = {
  /** Time constant for CTL (Chronic Training Load) in days */
  CTL_TIME_CONSTANT: 42,
  /** Time constant for ATL (Acute Training Load) in days */
  ATL_TIME_CONSTANT: 7,
  /** Alpha coefficient for CTL exponential weighted moving average */
  CTL_ALPHA: 1 - Math.exp(-1 / 42),
  /** Alpha coefficient for ATL exponential weighted moving average */
  ATL_ALPHA: 1 - Math.exp(-1 / 7),
  /** Base TSS multiplier for intensity calculation */
  BASE_TSS_MULTIPLIER: 100,
} as const;

/**
 * Training Stress Balance (TSB) interpretation thresholds
 */
export const TSB_THRESHOLDS = {
  OPTIMAL: 10, // TSB > 10: Well rested, ready for competition
  GOOD: -10, // TSB > -10: Good training balance
  TIRED: -30, // TSB > -30: Carrying fatigue, reduce intensity
  VERY_TIRED: -30, // TSB <= -30: High fatigue, focus on recovery
} as const;

/**
 * Fitness level thresholds based on CTL
 */
export const FITNESS_LEVEL_THRESHOLDS = {
  LOW: 40, // CTL < 40
  MODERATE: 60, // CTL 40-60
  HIGH: 80, // CTL 60-80
  VERY_HIGH: 80, // CTL > 80
} as const;

/**
 * Fatigue level thresholds based on ATL
 */
export const FATIGUE_LEVEL_THRESHOLDS = {
  LOW: 40, // ATL < 40
  MODERATE: 60, // ATL 40-60
  HIGH: 80, // ATL 60-80
  VERY_HIGH: 80, // ATL > 80
} as const;

// ================================
// Physical Constants
// ================================

/**
 * Earth's radius for GPS distance calculations (in meters)
 */
export const EARTH_RADIUS_METERS = 6371000;

/**
 * Conversion factors for common units
 */
export const CONVERSION_FACTORS = {
  // Speed conversions
  MPS_TO_KPH: 3.6,
  MPS_TO_MPH: 2.237,
  KPH_TO_MPS: 1 / 3.6,
  MPH_TO_MPS: 1 / 2.237,

  // Weight conversions
  KG_TO_LBS: 2.20462,
  LBS_TO_KG: 1 / 2.20462,

  // Distance conversions
  METERS_TO_FEET: 3.28084,
  FEET_TO_METERS: 1 / 3.28084,
  KM_TO_MILES: 0.621371,
  MILES_TO_KM: 1 / 0.621371,

  // Temperature conversions
  CELSIUS_TO_FAHRENHEIT_MULTIPLIER: 9 / 5,
  CELSIUS_TO_FAHRENHEIT_OFFSET: 32,
  FAHRENHEIT_TO_CELSIUS_MULTIPLIER: 5 / 9,
  FAHRENHEIT_TO_CELSIUS_OFFSET: 32,
} as const;

// ================================
// Physiological Constants
// ================================

/**
 * Default physiological values for calculations
 */
export const PHYSIOLOGICAL_DEFAULTS = {
  /** Default body weight in kg when not specified */
  DEFAULT_WEIGHT_KG: 70,
  /** Default resting heart rate in bpm */
  DEFAULT_RESTING_HR: 60,
  /** Default maximum heart rate calculation (220 - age) */
  MAX_HR_AGE_FORMULA: 220,
  /** Default FTP as percentage of max power */
  DEFAULT_FTP_PERCENTAGE: 0.95,
  /** Default VO2 max for untrained individuals */
  DEFAULT_VO2_MAX: 35,
} as const;

/**
 * MET values for different activity intensities
 */
export const MET_VALUES = {
  RESTING: 1.0,
  LIGHT_ACTIVITY: 3.0,
  MODERATE_ACTIVITY: 6.0,
  VIGOROUS_ACTIVITY: 9.0,
  VERY_VIGOROUS_ACTIVITY: 12.0,
} as const;

// ================================
// Calculation Constants
// ================================

/**
 * Normalized Power calculation constants
 */
export const NORMALIZED_POWER = {
  /** Rolling average window size in seconds */
  ROLLING_WINDOW_SECONDS: 30,
  /** Minimum data points required for NP calculation */
  MIN_DATA_POINTS: 30,
  /** Power exponent for fourth root calculation */
  POWER_EXPONENT: 4,
} as const;

/**
 * Recommendation constants for training load management
 */
export const TRAINING_RECOMMENDATIONS = {
  /** Default weekly CTL ramp rate (TSS per week) */
  DEFAULT_RAMP_RATE: 6,
  /** Conservative ramp rate for beginners */
  CONSERVATIVE_RAMP_RATE: 3,
  /** Aggressive ramp rate for experienced athletes */
  AGGRESSIVE_RAMP_RATE: 9,
  /** Maximum safe weekly ramp rate */
  MAX_RAMP_RATE: 12,
} as const;

// ================================
// Zone Names and Descriptions
// ================================

/**
 * Heart rate zone names and descriptions
 */
export const HR_ZONE_NAMES = {
  ZONE_1: { name: "Recovery", description: "Active recovery and warm-up" },
  ZONE_2: { name: "Endurance", description: "Aerobic base building" },
  ZONE_3: { name: "Tempo", description: "Aerobic threshold training" },
  ZONE_4: {
    name: "Lactate Threshold",
    description: "Lactate threshold training",
  },
  ZONE_5: { name: "VO2 Max", description: "Neuromuscular power and VO2 max" },
} as const;

/**
 * Power zone names and descriptions
 */
export const POWER_ZONE_NAMES = {
  ZONE_1: { name: "Active Recovery", description: "Very easy spinning" },
  ZONE_2: { name: "Endurance", description: "Aerobic base building" },
  ZONE_3: { name: "Tempo", description: "Aerobic threshold training" },
  ZONE_4: { name: "Lactate Threshold", description: "Sustainable hard effort" },
  ZONE_5: { name: "VO2 Max", description: "Hard anaerobic efforts" },
} as const;

// ================================
// Data Validation Constants
// ================================

/**
 * Reasonable value ranges for data validation
 */
export const VALIDATION_RANGES = {
  HEART_RATE: { min: 30, max: 250 },
  POWER: { min: 0, max: 2000 },
  CADENCE: { min: 0, max: 200 },
  SPEED_MPS: { min: 0, max: 30 }, // ~108 km/h max
  ELEVATION: { min: -500, max: 9000 }, // meters
  WEIGHT_KG: { min: 30, max: 300 },
  HEIGHT_CM: { min: 100, max: 250 },
  AGE: { min: 10, max: 120 },
  FTP: { min: 50, max: 600 },
  TSS: { min: 0, max: 1000 },
} as const;

/**
 * Time constants for calculations
 */
export const TIME_CONSTANTS = {
  SECONDS_PER_MINUTE: 60,
  SECONDS_PER_HOUR: 3600,
  SECONDS_PER_DAY: 86400,
  MILLISECONDS_PER_SECOND: 1000,
} as const;

// ================================-
// BLE Service and Characteristic UUIDs
// ================================-

export const BLE_SERVICE_UUIDS = {
  HEART_RATE: "0000180d-0000-1000-8000-00805f9b34fb",
  CYCLING_POWER: "00001818-0000-1000-8000-00805f9b34fb",
  CYCLING_SPEED_AND_CADENCE: "00001816-0000-1000-8000-00805f9b34fb",
  RUNNING_SPEED_AND_CADENCE: "00001814-0000-1000-8000-00805f9b34fb",
  FITNESS_MACHINE: "00001826-0000-1000-8000-00805f9b34fb",
} as const;

// ================================
// FTMS (Fitness Machine Service) Constants
// ================================

/**
 * FTMS Characteristic UUIDs
 */
export const FTMS_CHARACTERISTICS = {
  INDOOR_BIKE_DATA: "00002ad2-0000-1000-8000-00805f9b34fb",
  CONTROL_POINT: "00002ad9-0000-1000-8000-00805f9b34fb",
  STATUS: "00002ada-0000-1000-8000-00805f9b34fb",
  FEATURE: "00002acc-0000-1000-8000-00805f9b34fb",
  TRAINING_STATUS: "00002ad3-0000-1000-8000-00805f9b34fb",
} as const;

/**
 * FTMS Control Point Op Codes
 */
export const FTMS_OPCODES = {
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_TARGET_SPEED: 0x02,
  SET_TARGET_INCLINATION: 0x03,
  SET_TARGET_RESISTANCE: 0x04,
  SET_TARGET_POWER: 0x05,
  SET_TARGET_HEART_RATE: 0x06,
  START_RESUME: 0x07,
  STOP_PAUSE: 0x08,
  SET_INDOOR_BIKE_SIMULATION: 0x11,
  RESPONSE_CODE: 0x80,
} as const;

/**
 * FTMS Result Codes
 */
export const FTMS_RESULT_CODES = {
  SUCCESS: 0x01,
  NOT_SUPPORTED: 0x02,
  INVALID_PARAMETER: 0x03,
  OPERATION_FAILED: 0x04,
  CONTROL_NOT_PERMITTED: 0x05,
} as const;

// ================================
// Intensity Factor Zones
// ================================

/**
 * 7-zone intensity classification based on Intensity Factor (IF)
 * IF is calculated as: Normalized Power ÷ FTP
 * Stored as percentage (0-400) for values like 0.85 IF = 85%
 */
export const INTENSITY_ZONES = {
  RECOVERY: {
    name: "Recovery",
    min: 0,
    max: 55,
    description: "Active recovery and rest",
    color: "#10b981", // green-500
  },
  ENDURANCE: {
    name: "Endurance",
    min: 55,
    max: 74,
    description: "Aerobic base building",
    color: "#3b82f6", // blue-500
  },
  TEMPO: {
    name: "Tempo",
    min: 75,
    max: 84,
    description: "Aerobic threshold",
    color: "#8b5cf6", // violet-500
  },
  THRESHOLD: {
    name: "Threshold",
    min: 85,
    max: 94,
    description: "Lactate threshold",
    color: "#f59e0b", // amber-500
  },
  VO2MAX: {
    name: "VO2max",
    min: 95,
    max: 104,
    description: "VO2 max intervals",
    color: "#f97316", // orange-500
  },
  ANAEROBIC: {
    name: "Anaerobic",
    min: 105,
    max: 114,
    description: "Anaerobic capacity",
    color: "#ef4444", // red-500
  },
  NEUROMUSCULAR: {
    name: "Neuromuscular",
    min: 115,
    max: 400,
    description: "Sprint power",
    color: "#dc2626", // red-600
  },
} as const;

/**
 * Helper function to get intensity zone from IF percentage (0-400)
 */
export function getIntensityZone(
  intensityFactor: number,
): keyof typeof INTENSITY_ZONES {
  if (intensityFactor < 55) return "RECOVERY";
  if (intensityFactor < 75) return "ENDURANCE";
  if (intensityFactor < 85) return "TEMPO";
  if (intensityFactor < 95) return "THRESHOLD";
  if (intensityFactor < 105) return "VO2MAX";
  if (intensityFactor < 115) return "ANAEROBIC";
  return "NEUROMUSCULAR";
}
