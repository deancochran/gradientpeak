/**
 * FTMS (Fitness Machine Service) Type Definitions
 *
 * These types are platform-agnostic and can be used by both web and mobile apps.
 * Based on FTMS spec Section 4.3.1
 */

import type { RecordingTrainerControlIntent } from "./schemas/recording-session";

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
 * FTMS Device Type
 * Used to identify the type of fitness machine for device-specific calculations
 */
export type FTMSDeviceType = "bike" | "rower" | "elliptical" | "treadmill";

export type FtmsMachineType =
  | "bike"
  | "treadmill"
  | "rower"
  | "cross_trainer"
  | "step_climber"
  | "stair_climber"
  | "unknown";

export type FtmsMachineTypeSource =
  | "data_characteristic"
  | "user_confirmed"
  | "feature_heuristic"
  | "unknown";

export type FtmsControlSupportLevel =
  | "metrics_only"
  | "control_capable"
  | "control_requesting"
  | "control_granted"
  | "control_rejected"
  | "control_lost";

export type FtmsControlState = Exclude<FtmsControlSupportLevel, "metrics_only">;

export type FtmsControlMode =
  | "status"
  | "erg"
  | "free_ride"
  | "grade"
  | "inclination"
  | "resistance"
  | "speed"
  | "target_heart_rate"
  | "target_cadence"
  | "workout_goal"
  | "calibration"
  | "machine_state";

export const ftmsControlModes = [
  "status",
  "erg",
  "free_ride",
  "grade",
  "inclination",
  "resistance",
  "speed",
  "target_heart_rate",
  "target_cadence",
  "workout_goal",
  "calibration",
  "machine_state",
] as const satisfies readonly FtmsControlMode[];

export type FtmsSafetyLevel = "none" | "confirm" | "strong_confirm" | "blocked";

export interface FtmsCharacteristicProperties {
  readable?: boolean;
  notifiable?: boolean;
  indicatable?: boolean;
  writableWithResponse?: boolean;
  writableWithoutResponse?: boolean;
}

export interface FtmsAvailableModeRange {
  min: number;
  max: number;
  increment: number;
  unit: string;
}

export interface FtmsAvailableMode {
  id: FtmsControlMode;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  range?: FtmsAvailableModeRange;
  safetyLevel: FtmsSafetyLevel;
}

export type RecordingTrainerCommandStatusCode =
  | "queued"
  | "applying"
  | "succeeded"
  | "unsupported"
  | "control_rejected"
  | "control_lost"
  | "timeout"
  | "write_failed"
  | "failed";

export interface RecordingTrainerCommandStatus {
  status: RecordingTrainerCommandStatusCode;
  intent?: RecordingTrainerControlIntent;
  deviceId?: string;
  requestedAt?: string;
  completedAt?: string;
  message?: string;
  response?: FTMSResponse;
}

export interface FtmsDeviceSnapshot {
  deviceId: string;
  displayName: string;
  machineType: FtmsMachineType;
  machineTypeSource: FtmsMachineTypeSource;
  supportLevel: Extract<FtmsControlSupportLevel, "metrics_only" | "control_capable">;
  features: FTMSFeatures;
  properties: Partial<Record<string, FtmsCharacteristicProperties>>;
}

export interface FtmsControlSnapshot {
  deviceId: string;
  controlState: FtmsControlState;
  selectedMode: FtmsControlMode;
  availableModes: FtmsAvailableMode[];
  lastCommandStatus: RecordingTrainerCommandStatus | null;
}

export interface FtmsSelectedControlTargetState {
  selectedDeviceId: string | null;
  candidates: FtmsDeviceSnapshot[];
  selectedControl: FtmsControlSnapshot | null;
  integratedControlEnabled: boolean;
  manualOverrideActive: boolean;
}

export interface FtmsControlCoordinator {
  getSnapshot(): FtmsSelectedControlTargetState;
  selectDevice(deviceId: string): Promise<void>;
  setIntegratedControlEnabled(enabled: boolean): void;
  sendIntent(deviceId: string, intent: RecordingTrainerControlIntent): Promise<boolean>;
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

export type FtmsCharacteristicKind = "measurement" | "training_status" | "machine_status";

export interface FtmsRuntimeMetrics {
  hrBpm: number | null;
  powerWatts: number | null;
  cadenceRpm: number | null;
  speedMps: number | null;
  distanceMeters: number | null;
  elapsedTimeSeconds: number | null;
  energyKcal: number | null;
  stepCount: number | null;
  strideCount: number | null;
  floorCount: number | null;
  inclinationPercent: number | null;
  resistanceLevel: number | null;
  strokeRateSpm: number | null;
  strokeCount: number | null;
}

export interface FtmsParserDiagnostics {
  truncated: boolean;
  flags?: number;
  bytesRead: number;
  byteLength: number;
}

export interface FtmsStatusPayload {
  code: number | null;
  label: string;
  parameter?: number;
}

export interface ParsedFtmsPayload {
  kind: FtmsCharacteristicKind;
  characteristicUuid: string;
  machineType: FtmsMachineType;
  metrics: FtmsRuntimeMetrics;
  status: FtmsStatusPayload | null;
  diagnostics: FtmsParserDiagnostics;
}

export interface FtmsParserDefinition {
  uuid: string;
  name: string;
  kind: FtmsCharacteristicKind;
  machineType: FtmsMachineType;
  parse(data: ArrayBuffer | Uint8Array): ParsedFtmsPayload;
}
