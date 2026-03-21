export const PHYSIOLOGICAL_DEFAULTS = {
  DEFAULT_WEIGHT_KG: 70,
  DEFAULT_RESTING_HR: 60,
  MAX_HR_AGE_FORMULA: 220,
  DEFAULT_FTP_PERCENTAGE: 0.95,
  DEFAULT_VO2_MAX: 35,
} as const;

export const MET_VALUES = {
  RESTING: 1.0,
  LIGHT_ACTIVITY: 3.0,
  MODERATE_ACTIVITY: 6.0,
  VIGOROUS_ACTIVITY: 9.0,
  VERY_VIGOROUS_ACTIVITY: 12.0,
} as const;

export const VALIDATION_RANGES = {
  HEART_RATE: { min: 30, max: 250 },
  POWER: { min: 0, max: 2000 },
  CADENCE: { min: 0, max: 200 },
  SPEED_MPS: { min: 0, max: 30 },
  ELEVATION: { min: -500, max: 9000 },
  WEIGHT_KG: { min: 30, max: 300 },
  HEIGHT_CM: { min: 100, max: 250 },
  AGE: { min: 10, max: 120 },
  FTP: { min: 50, max: 600 },
  TSS: { min: 0, max: 1000 },
} as const;
