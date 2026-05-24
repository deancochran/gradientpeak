import { BLE_SERVICE_UUIDS } from "@repo/core";
import { describe, expect, it, vi } from "vitest";

import type { ConnectedSensor } from "./sensors";
import { TrainerControl } from "./trainerControl";

function createFtmsCandidate(overrides: Partial<ConnectedSensor> = {}): ConnectedSensor {
  return {
    id: "trainer-1",
    name: "Trainer 1",
    connectionState: "connected",
    services: [BLE_SERVICE_UUIDS.FITNESS_MACHINE],
    characteristics: new Map(),
    device: {} as never,
    ftmsFeatures: {
      powerTargetSettingSupported: true,
    } as never,
    ...overrides,
  } as ConnectedSensor;
}

describe("TrainerControl QA regressions", () => {
  it("reports control as eligible and rejects commands when no controllable trainer is ready", async () => {
    const onError = vi.fn();
    const onCommandStatus = vi.fn();
    const trainer = createFtmsCandidate({ isControllable: false });
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => undefined),
      getConnectedSensors: vi.fn(() => [trainer]),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setPowerTarget: vi.fn(async () => true),
    } as never;

    const control = new TrainerControl({
      sensorsManager,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onCommandStatus,
      onError,
    });

    await expect(control.applyManualPower(240)).resolves.toBe(false);

    expect(control.getControlState()).toBe("eligible");
    expect(control.getLastCommandStatus()).toMatchObject({
      commandType: "set_power",
      outcome: "control_unavailable",
      success: false,
    });
    expect(onError).toHaveBeenCalledWith("Trainer control is not ready.");
    expect(onCommandStatus).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "control_unavailable", success: false }),
    );
    expect((sensorsManager as any).setPowerTarget).not.toHaveBeenCalled();
  });

  it("applies route grade through bike simulation when supported", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() =>
        createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { indoorBikeSimulationSupported: true } as never,
        }),
      ),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    } as never;

    const control = new TrainerControl({
      sensorsManager,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(6.4);

    expect((sensorsManager as any).setSimulation).toHaveBeenCalledWith(
      { crr: 0.005, grade: 6.4, windResistance: 0.51, windSpeed: 0 },
      { coalesceKey: "route_grade", source: "periodic_refinement" },
    );
    expect((sensorsManager as any).setTargetInclination).not.toHaveBeenCalled();
  });

  it("applies route grade as treadmill incline when simulation is unavailable", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() =>
        createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { inclinationTargetSettingSupported: true } as never,
        }),
      ),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    } as never;

    const control = new TrainerControl({
      sensorsManager,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(3.1);

    expect((sensorsManager as any).setTargetInclination).toHaveBeenCalledWith(3.1, {
      coalesceKey: "route_grade",
      source: "periodic_refinement",
    });
    expect((sensorsManager as any).setSimulation).not.toHaveBeenCalled();
  });

  it("does not resend unchanged or insignificant route grade commands", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() =>
        createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { indoorBikeSimulationSupported: true } as never,
        }),
      ),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    } as never;

    const control = new TrainerControl({
      sensorsManager,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(4.0);
    await control.applyRouteGrade(4.0);
    await control.applyRouteGrade(4.05);
    await control.applyRouteGrade(4.2);

    expect((sensorsManager as any).setSimulation).toHaveBeenCalledTimes(2);
    expect((sensorsManager as any).setSimulation).toHaveBeenLastCalledWith(
      { crr: 0.005, grade: 4.2, windResistance: 0.51, windSpeed: 0 },
      { coalesceKey: "route_grade", source: "periodic_refinement" },
    );
  });
});
