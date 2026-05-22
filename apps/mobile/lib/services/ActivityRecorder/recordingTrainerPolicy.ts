import { BLE_SERVICE_UUIDS, type FtmsControlMode, type FtmsMachineType } from "@repo/core";

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
  return service.toLowerCase() === BLE_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase();
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
