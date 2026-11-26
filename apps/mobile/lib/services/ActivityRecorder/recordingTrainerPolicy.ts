import {
  FTMS_CHARACTERISTICS,
  FTMS_SERVICE_UUIDS,
  type FTMSFeatures,
  type FtmsMachineType,
} from "@deancochran/ftms";
import type { FtmsControlMode } from "@repo/core";

export type FtmsMachineTypeSource =
  | "data_characteristic"
  | "user_confirmed"
  | "feature_heuristic"
  | "unknown";

export interface FtmsMachineTypeDetectionInput {
  characteristicUuids?: readonly string[];
  features?: Partial<FTMSFeatures> | null;
  userConfirmedMachineType?: FtmsMachineType | null;
}

export interface FtmsMachineTypeDetectionResult {
  machineType: FtmsMachineType;
  source: FtmsMachineTypeSource;
  matchedCharacteristicUuid?: string;
}

const machineTypeByDataCharacteristicUuid: Readonly<Record<string, FtmsMachineType>> = {
  [FTMS_CHARACTERISTICS.TREADMILL_DATA]: "treadmill",
  [FTMS_CHARACTERISTICS.CROSS_TRAINER_DATA]: "cross_trainer",
  [FTMS_CHARACTERISTICS.STEP_CLIMBER_DATA]: "step_climber",
  [FTMS_CHARACTERISTICS.STAIR_CLIMBER_DATA]: "stair_climber",
  [FTMS_CHARACTERISTICS.ROWER_DATA]: "rower",
  [FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA]: "bike",
};

function inferFtmsMachineTypeFromFeatures(
  features?: Partial<FTMSFeatures> | null,
): FtmsMachineType {
  if (!features) return "unknown";
  if (features.forceOnBeltSupported || (features.inclinationSupported && features.paceSupported)) {
    return "treadmill";
  }
  if (features.powerMeasurementSupported && features.indoorBikeSimulationSupported) return "bike";
  if (features.strideCountSupported && features.resistanceLevelSupported) return "cross_trainer";
  if (features.stepCountSupported) return "step_climber";
  return "unknown";
}

/** Product-owned machine inference layered on top of protocol evidence. */
export function detectFtmsMachineType(
  input: FtmsMachineTypeDetectionInput,
): FtmsMachineTypeDetectionResult {
  for (const uuid of input.characteristicUuids ?? []) {
    const normalizedUuid = uuid.toLowerCase();
    const machineType = machineTypeByDataCharacteristicUuid[normalizedUuid];
    if (machineType) {
      return {
        machineType,
        source: "data_characteristic",
        matchedCharacteristicUuid: normalizedUuid,
      };
    }
  }

  if (input.userConfirmedMachineType && input.userConfirmedMachineType !== "unknown") {
    return { machineType: input.userConfirmedMachineType, source: "user_confirmed" };
  }

  const machineType = inferFtmsMachineTypeFromFeatures(input.features);
  return {
    machineType,
    source: machineType === "unknown" ? "unknown" : "feature_heuristic",
  };
}

export interface TrainerLikeSensor {
  id: string;
  services?: string[];
  isTrainer?: boolean;
  isControllable?: boolean;
  ftmsFeatures?: unknown;
}

export interface TrainerLikePersistedSensor {
  id: string;
  services?: string[];
  isTrainer?: boolean;
  isControllable?: boolean;
}

export function isFtmsModeAllowedForMachine(
  mode: FtmsControlMode,
  machineType: FtmsMachineType | undefined,
): boolean {
  switch (mode) {
    case "status":
    case "free_ride":
    case "target_heart_rate":
      return true;
    case "erg":
    case "grade":
    case "calibration":
      return machineType === "bike" || machineType === "unknown" || machineType === undefined;
    case "speed":
    case "inclination":
      return machineType === "treadmill";
    case "resistance":
      return (
        machineType === "bike" ||
        machineType === "rower" ||
        machineType === "cross_trainer" ||
        machineType === "step_climber" ||
        machineType === "stair_climber" ||
        machineType === "unknown" ||
        machineType === undefined
      );
    case "target_cadence":
      return (
        machineType === "bike" ||
        machineType === "rower" ||
        machineType === "cross_trainer" ||
        machineType === "unknown" ||
        machineType === undefined
      );
    case "workout_goal":
    case "machine_state":
      return true;
  }
}

export function isFtmsServiceUuid(service: string): boolean {
  return service.toLowerCase() === FTMS_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase();
}

export function isTrainerLikeSensor(sensor: TrainerLikeSensor | undefined): boolean {
  return Boolean(
    sensor?.isTrainer ||
      sensor?.isControllable ||
      sensor?.ftmsFeatures ||
      sensor?.services?.some((service) => isFtmsServiceUuid(service)),
  );
}

export function isKnownTrainerDevice(
  deviceId: string,
  persistedSensors: TrainerLikePersistedSensor[],
): boolean {
  const persisted = persistedSensors.find((sensor) => sensor.id === deviceId);
  if (!persisted) {
    return false;
  }

  return Boolean(
    persisted.isTrainer ||
      persisted.isControllable ||
      persisted.services?.some((service) => isFtmsServiceUuid(service)),
  );
}

export function getTrainerSensorIdsToDisconnect(
  sensors: TrainerLikeSensor[],
  options: { exceptDeviceId?: string } = {},
): string[] {
  return sensors
    .filter((sensor) => isTrainerLikeSensor(sensor) && sensor.id !== options.exceptDeviceId)
    .map((sensor) => sensor.id);
}
