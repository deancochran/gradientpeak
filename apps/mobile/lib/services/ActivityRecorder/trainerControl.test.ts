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
    const trainer = createFtmsCandidate({ isControllable: true });
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => undefined),
      getSelectedFTMSTrainer: vi.fn(() => trainer),
      getConnectedSensors: vi.fn(() => [trainer]),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setPowerTarget: vi.fn(async () => true),
    };

    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
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
    expect(sensorsManager.setPowerTarget).not.toHaveBeenCalled();
  });

  it("applies route grade through bike simulation when supported", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => {
        return createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { indoorBikeSimulationSupported: true } as never,
        });
      }),
      getSelectedFTMSTrainer: vi.fn(() => undefined),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    };

    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(6.4);

    expect(sensorsManager.setSimulation).toHaveBeenCalledWith(
      { crr: 0.005, grade: 6.4, windResistance: 0.51, windSpeed: 0 },
      expect.objectContaining({
        coalesceKey: "route_grade",
        onStatus: expect.any(Function),
        source: "periodic_refinement",
      }),
    );
    expect(sensorsManager.setTargetInclination).not.toHaveBeenCalled();
  });

  it("applies route grade as treadmill incline when simulation is unavailable", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() =>
        createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { inclinationTargetSettingSupported: true } as never,
        }),
      ),
      getSelectedFTMSTrainer: vi.fn(() => undefined),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    };

    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(3.1);

    expect(sensorsManager.setTargetInclination).toHaveBeenCalledWith(
      3.1,
      expect.objectContaining({
        coalesceKey: "route_grade",
        onStatus: expect.any(Function),
        source: "periodic_refinement",
      }),
    );
    expect(sensorsManager.setSimulation).not.toHaveBeenCalled();
  });

  it("does not resend unchanged or insignificant route grade commands", async () => {
    const sensorsManager = {
      getControllableTrainer: vi.fn(() =>
        createFtmsCandidate({
          isControllable: true,
          ftmsFeatures: { indoorBikeSimulationSupported: true } as never,
        }),
      ),
      getSelectedFTMSTrainer: vi.fn(() => undefined),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async () => true),
      setTargetInclination: vi.fn(async () => true),
    };

    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await control.applyRouteGrade(4.0);
    await control.applyRouteGrade(4.0);
    await control.applyRouteGrade(4.05);
    await control.applyRouteGrade(4.2);

    expect(sensorsManager.setSimulation).toHaveBeenCalledTimes(2);
    expect(sensorsManager.setSimulation).toHaveBeenLastCalledWith(
      { crr: 0.005, grade: 4.2, windResistance: 0.51, windSpeed: 0 },
      expect.objectContaining({
        coalesceKey: "route_grade",
        onStatus: expect.any(Function),
        source: "periodic_refinement",
      }),
    );
  });

  it("explicitly resets prior ERG load when entering a rest or transition boundary", async () => {
    const trainer = createFtmsCandidate({ isControllable: true });
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => trainer),
      getSelectedFTMSTrainer: vi.fn(() => trainer),
      getConnectedSensors: vi.fn(() => []),
      getLastTrainerCommandStatus: vi.fn(() => null),
      resetTrainerControl: vi.fn(async () => true),
    };
    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    await expect(control.neutralizeForBoundary()).resolves.toBe(true);
    expect(sensorsManager.resetTrainerControl).toHaveBeenCalledWith(
      expect.objectContaining({
        coalesceKey: "reset",
        onStatus: expect.any(Function),
        source: "step_change",
      }),
    );
  });

  it("keeps feature eligibility separate from granted control until a command succeeds", async () => {
    let granted = false;
    const status = {
      source: "manual",
      commandType: "set_power",
      controlMode: "erg",
      outcome: "success",
      targetValue: 240,
      success: true,
      resultCode: 1,
      resultCodeName: "success",
      queuedAt: 1,
      completedAt: 2,
    } as const;
    const trainer = createFtmsCandidate({
      isControllable: true,
      ftmsController: { hasControlPermission: () => granted } as never,
    });
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => (granted ? trainer : undefined)),
      getSelectedFTMSTrainer: vi.fn(() => trainer),
      getConnectedSensors: vi.fn(() => [trainer]),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setPowerTarget: vi.fn(async (_watts, context) => {
        granted = true;
        context.onStatus(status);
        return true;
      }),
    };
    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    expect(control.getControlState()).toBe("eligible");
    await expect(control.applyManualPower(240)).resolves.toBe(true);
    expect(control.getControlState()).toBe("controllable");
  });

  it("reports control_lost after a connected trainer loses permission and recovers on reacquisition", () => {
    let granted = true;
    const trainer = createFtmsCandidate({
      isControllable: true,
      ftmsController: { hasControlPermission: () => granted } as never,
    });
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => (granted ? trainer : undefined)),
      getSelectedFTMSTrainer: vi.fn(() => trainer),
      getConnectedSensors: vi.fn(() => [trainer]),
      getLastTrainerCommandStatus: vi.fn(() => null),
    };
    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError: vi.fn(),
    });

    control.handleSensorConnectionChange(trainer);
    expect(control.getControlState()).toBe("controllable");
    granted = false;
    control.handleSensorConnectionChange(trainer);
    expect(control.getControlState()).toBe("control_lost");
    granted = true;
    control.handleSensorConnectionChange(trainer);
    expect(control.getControlState()).toBe("controllable");
  });

  it("does not report expected route-grade preemption as an error", async () => {
    const trainer = createFtmsCandidate({
      isControllable: true,
      ftmsFeatures: { indoorBikeSimulationSupported: true } as never,
    });
    const onError = vi.fn();
    const sensorsManager = {
      getControllableTrainer: vi.fn(() => trainer),
      getSelectedFTMSTrainer: vi.fn(() => trainer),
      getConnectedSensors: vi.fn(() => [trainer]),
      getLastTrainerCommandStatus: vi.fn(() => null),
      setSimulation: vi.fn(async (_params, context) => {
        context.onStatus({
          source: "periodic_refinement",
          commandType: "set_simulation",
          controlMode: "sim",
          outcome: "superseded",
          targetValue: 5,
          success: false,
          queuedAt: 1,
          completedAt: 2,
        });
        return false;
      }),
    };
    const control = new TrainerControl({
      sensorsManager: sensorsManager as never,
      getCurrentReadings: () => ({}) as never,
      getSessionOverrideState: () => ({ trainerMode: "auto" }) as never,
      getSessionSnapshot: () => null,
      onError,
    });

    await control.applyRouteGrade(5);
    expect(onError).not.toHaveBeenCalled();
    expect(control.getLastCommandStatus()?.outcome).toBe("superseded");
  });
});
