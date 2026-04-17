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
});
