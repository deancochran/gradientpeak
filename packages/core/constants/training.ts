export const COMMON_LOAD_CONSTANTS = {
  LOAD_MODEL_VERSION: 2,
  EXPONENTIAL_CONVENTION: "one_minus_exp_negative_inverse_time_constant",
  LongTermLoad_TIME_CONSTANT: 42,
  RecentLoad_TIME_CONSTANT: 7,
  LongTermLoad_ALPHA: 1 - Math.exp(-1 / 42),
  RecentLoad_ALPHA: 1 - Math.exp(-1 / 7),
  BASE_COMMON_LOAD_MULTIPLIER: 100,
} as const;

export const LoadBalance_THRESHOLDS = {
  OPTIMAL: 10,
  GOOD: -10,
  TIRED: -30,
  VERY_TIRED: -30,
} as const;

export const FITNESS_LEVEL_THRESHOLDS = {
  LOW: 40,
  MODERATE: 60,
  HIGH: 80,
  VERY_HIGH: 80,
} as const;

export const FATIGUE_LEVEL_THRESHOLDS = {
  LOW: 40,
  MODERATE: 60,
  HIGH: 80,
  VERY_HIGH: 80,
} as const;

export const TRAINING_RECOMMENDATIONS = {
  DEFAULT_RAMP_RATE: 6,
  CONSERVATIVE_RAMP_RATE: 3,
  AGGRESSIVE_RAMP_RATE: 9,
  MAX_RAMP_RATE: 12,
} as const;

export const NORMALIZED_POWER = {
  ROLLING_WINDOW_SECONDS: 30,
  MIN_DATA_POINTS: 30,
  POWER_EXPONENT: 4,
} as const;
