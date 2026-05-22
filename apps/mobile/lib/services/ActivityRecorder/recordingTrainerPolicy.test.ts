import { BLE_SERVICE_UUIDS, type FtmsControlMode, type FtmsMachineType } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  getTrainerSensorIdsToDisconnect,
  isFtmsModeAllowedForMachine,
  isKnownTrainerDevice,
  isTrainerLikeSensor,
  type TrainerLikePersistedSensor,
  type TrainerLikeSensor,
} from "./recordingTrainerPolicy";

function connectedSensor(overrides: Partial<TrainerLikeSensor>): TrainerLikeSensor {
  return {
    id: "sensor-1",
    services: [],
    ...overrides,
  };
}

function persistedSensor(
  overrides: Partial<TrainerLikePersistedSensor>,
): TrainerLikePersistedSensor {
  return {
    id: "sensor-1",
    services: [],
    ...overrides,
  };
}

describe("recording trainer policy", () => {
  it.each<[FtmsMachineType | undefined, FtmsControlMode[], FtmsControlMode[]]>([
    ["bike", ["erg", "grade", "resistance", "target_cadence"], ["speed", "inclination"]],
    ["treadmill", ["speed", "inclination"], ["erg", "grade", "resistance", "target_cadence"]],
    ["rower", ["resistance", "target_cadence"], ["erg", "grade", "speed", "inclination"]],
    ["cross_trainer", ["resistance", "target_cadence"], ["erg", "grade", "speed", "inclination"]],
    ["step_climber", ["resistance"], ["erg", "grade", "speed", "inclination", "target_cadence"]],
    ["stair_climber", ["resistance"], ["erg", "grade", "speed", "inclination", "target_cadence"]],
    ["unknown", ["erg", "grade", "resistance", "target_cadence"], ["speed", "inclination"]],
    [undefined, ["erg", "grade", "resistance", "target_cadence"], ["speed", "inclination"]],
  ])("filters manual modes for %s trainers", (machineType, allowed, blocked) => {
    for (const mode of allowed) {
      expect(isFtmsModeAllowedForMachine(mode, machineType)).toBe(true);
    }

    for (const mode of blocked) {
      expect(isFtmsModeAllowedForMachine(mode, machineType)).toBe(false);
    }
  });

  it("always allows status, free ride, and heart-rate target modes", () => {
    for (const machineType of ["bike", "treadmill", "rower", "cross_trainer"] as const) {
      expect(isFtmsModeAllowedForMachine("status", machineType)).toBe(true);
      expect(isFtmsModeAllowedForMachine("free_ride", machineType)).toBe(true);
      expect(isFtmsModeAllowedForMachine("target_heart_rate", machineType)).toBe(true);
    }
  });

  it("identifies connected trainer sensors by FTMS service, trainer flags, or controller metadata", () => {
    expect(
      isTrainerLikeSensor(
        connectedSensor({ id: "ftms", services: [BLE_SERVICE_UUIDS.FITNESS_MACHINE] }),
      ),
    ).toBe(true);
    expect(isTrainerLikeSensor(connectedSensor({ id: "trainer", isTrainer: true }))).toBe(true);
    expect(isTrainerLikeSensor(connectedSensor({ id: "control", isControllable: true }))).toBe(
      true,
    );
    expect(isTrainerLikeSensor(connectedSensor({ id: "features", ftmsFeatures: {} }))).toBe(true);
    expect(
      isTrainerLikeSensor(connectedSensor({ id: "hr", services: [BLE_SERVICE_UUIDS.HEART_RATE] })),
    ).toBe(false);
  });

  it("identifies persisted trainer devices before reconnect attempts", () => {
    const knownSensors = [
      persistedSensor({ id: "hr", services: [BLE_SERVICE_UUIDS.HEART_RATE] }),
      persistedSensor({ id: "trainer", services: [BLE_SERVICE_UUIDS.FITNESS_MACHINE] }),
      persistedSensor({ id: "flagged", isTrainer: true }),
    ];

    expect(isKnownTrainerDevice("trainer", knownSensors)).toBe(true);
    expect(isKnownTrainerDevice("flagged", knownSensors)).toBe(true);
    expect(isKnownTrainerDevice("hr", knownSensors)).toBe(false);
    expect(isKnownTrainerDevice("missing", knownSensors)).toBe(false);
  });

  it("selects only trainer sensors for GPS-mode disconnect", () => {
    const sensors = [
      connectedSensor({ id: "hr", services: [BLE_SERVICE_UUIDS.HEART_RATE] }),
      connectedSensor({ id: "bike", services: [BLE_SERVICE_UUIDS.FITNESS_MACHINE] }),
      connectedSensor({ id: "rower", isTrainer: true }),
    ];

    expect(getTrainerSensorIdsToDisconnect(sensors)).toEqual(["bike", "rower"]);
  });

  it("keeps the newly selected trainer while disconnecting other trainers", () => {
    const sensors = [
      connectedSensor({ id: "trainer-1", services: [BLE_SERVICE_UUIDS.FITNESS_MACHINE] }),
      connectedSensor({ id: "trainer-2", isTrainer: true }),
      connectedSensor({ id: "hr", services: [BLE_SERVICE_UUIDS.HEART_RATE] }),
    ];

    expect(getTrainerSensorIdsToDisconnect(sensors, { exceptDeviceId: "trainer-2" })).toEqual([
      "trainer-1",
    ]);
  });
});
