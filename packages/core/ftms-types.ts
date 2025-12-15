/**
 * FTMS (Fitness Machine Service) Type Definitions
 *
 * These types are platform-agnostic and can be used by both web and mobile apps.
 * Based on FTMS spec Section 4.3.1
 */

export enum ControlMode {
  ERG = "erg",
  SIM = "sim",
  RESISTANCE = "resistance",
  SPEED = "speed",
  INCLINATION = "inclination",
  HEART_RATE = "heart_rate",
  CADENCE = "cadence",
}

/**
 * Comprehensive FTMS feature detection
 * Based on FTMS spec Section 4.3.1
 */
export interface FTMSFeatures {
  // Fitness Machine Features (Bytes 0-3)
  averageSpeedSupported: boolean;
  cadenceSupported: boolean;
  totalDistanceSupported: boolean;
  inclinationSupported: boolean;
  elevationGainSupported: boolean;
  paceSupported: boolean;
  stepCountSupported: boolean;
  resistanceLevelSupported: boolean;
  strideCountSupported: boolean;
  expendedEnergySupported: boolean;
  heartRateMeasurementSupported: boolean;
  metabolicEquivalentSupported: boolean;
  elapsedTimeSupported: boolean;
  remainingTimeSupported: boolean;
  powerMeasurementSupported: boolean;
  forceOnBeltSupported: boolean;
  userDataRetentionSupported: boolean;

  // Target Setting Features (Bytes 4-7)
  speedTargetSettingSupported: boolean;
  inclinationTargetSettingSupported: boolean;
  resistanceTargetSettingSupported: boolean;
  powerTargetSettingSupported: boolean;
  heartRateTargetSettingSupported: boolean;
  targetedExpendedEnergySupported: boolean;
  targetedStepNumberSupported: boolean;
  targetedStrideNumberSupported: boolean;
  targetedDistanceSupported: boolean;
  targetedTrainingTimeSupported: boolean;
  targetedTimeTwoHRZonesSupported: boolean;
  targetedTimeThreeHRZonesSupported: boolean;
  targetedTimeFiveHRZonesSupported: boolean;
  indoorBikeSimulationSupported: boolean;
  wheelCircumferenceSupported: boolean;
  spinDownControlSupported: boolean;
  targetedCadenceSupported: boolean;

  // Legacy properties (for backwards compatibility)
  /** @deprecated Use powerTargetSettingSupported */
  supportsERG: boolean;
  /** @deprecated Use indoorBikeSimulationSupported */
  supportsSIM: boolean;
  /** @deprecated Use resistanceTargetSettingSupported */
  supportsResistance: boolean;

  // Supported ranges (read from characteristics)
  speedRange?: { min: number; max: number; increment: number };
  inclinationRange?: { min: number; max: number; increment: number };
  resistanceRange?: { min: number; max: number; increment: number };
  powerRange?: { min: number; max: number; increment: number };
  heartRateRange?: { min: number; max: number; increment: number };
}

/**
 * Response code from FTMS Control Point
 */
export interface FTMSResponse {
  requestOpCode: number;
  resultCode: number;
  resultCodeName: string;
  success: boolean;
  parameters?: Uint8Array;
}

export interface FTMSControlEvent {
  timestamp: number;
  controlType: "power_target" | "simulation" | "resistance";
  targetValue: number;
  actualValue?: number;
  success: boolean;
  errorMessage?: string;
}
