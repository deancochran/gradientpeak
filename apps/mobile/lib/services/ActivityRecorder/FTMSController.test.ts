import { FTMS_OPCODES, FTMS_RESULT_CODES, type FTMSFeatures } from "@repo/core";
import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FTMSController } from "./FTMSController";

class MockFtmsDevice {
  public writeOpcodes: number[] = [];
  private monitorCallback?: (
    error: Error | null,
    characteristic: { value?: string } | null,
  ) => void;
  private pendingWrites: Array<{ opcode: number; resolve: () => void }> = [];

  monitorCharacteristicForService(
    _serviceUuid: string,
    _characteristicUuid: string,
    callback: (error: Error | null, characteristic: { value?: string } | null) => void,
  ) {
    this.monitorCallback = callback;
    return {
      remove: () => {
        this.monitorCallback = undefined;
      },
    };
  }

  async writeCharacteristicWithResponseForService(
    _serviceUuid: string,
    _characteristicUuid: string,
    value: string,
  ): Promise<void> {
    const bytes = Buffer.from(value, "base64");
    const opcode = bytes[0] ?? 0;
    this.writeOpcodes.push(opcode);

    await new Promise<void>((resolve) => {
      this.pendingWrites.push({ opcode, resolve });
    });
  }

  async flushNext(resultCode = FTMS_RESULT_CODES.SUCCESS): Promise<void> {
    const next = this.pendingWrites.shift();
    if (!next) {
      return;
    }

    const payload = Buffer.from([FTMS_OPCODES.RESPONSE_CODE, next.opcode, resultCode]).toString(
      "base64",
    );

    this.monitorCallback?.(null, { value: payload });
    next.resolve();
    await Promise.resolve();
  }

  async flushAll(resultCode = FTMS_RESULT_CODES.SUCCESS): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (this.pendingWrites.length === 0) {
        await Promise.resolve();
        if (this.pendingWrites.length === 0) {
          break;
        }
      }

      await this.flushNext(resultCode);
      await vi.advanceTimersByTimeAsync(300);
    }
  }
}

function createFeatures(overrides: Partial<FTMSFeatures> = {}): FTMSFeatures {
  return {
    averageSpeedSupported: false,
    cadenceSupported: false,
    totalDistanceSupported: false,
    inclinationSupported: false,
    elevationGainSupported: false,
    paceSupported: false,
    stepCountSupported: false,
    resistanceLevelSupported: false,
    strideCountSupported: false,
    expendedEnergySupported: false,
    heartRateMeasurementSupported: false,
    metabolicEquivalentSupported: false,
    elapsedTimeSupported: false,
    remainingTimeSupported: false,
    powerMeasurementSupported: false,
    forceOnBeltSupported: false,
    userDataRetentionSupported: false,
    speedTargetSettingSupported: false,
    inclinationTargetSettingSupported: false,
    resistanceTargetSettingSupported: false,
    powerTargetSettingSupported: false,
    heartRateTargetSettingSupported: false,
    targetedExpendedEnergySupported: false,
    targetedStepNumberSupported: false,
    targetedStrideNumberSupported: false,
    targetedDistanceSupported: false,
    targetedTrainingTimeSupported: false,
    targetedTimeTwoHRZonesSupported: false,
    targetedTimeThreeHRZonesSupported: false,
    targetedTimeFiveHRZonesSupported: false,
    indoorBikeSimulationSupported: false,
    wheelCircumferenceSupported: false,
    spinDownControlSupported: false,
    targetedCadenceSupported: false,
    supportsERG: false,
    supportsSIM: false,
    supportsResistance: false,
    ...overrides,
  };
}

function createController(device: MockFtmsDevice, features: FTMSFeatures): FTMSController {
  const controller = new FTMSController(device as never);
  (controller as unknown as { features: FTMSFeatures }).features = features;
  return controller;
}

describe("FTMSController queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces queued auto commands and lets manual override win", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({
        powerTargetSettingSupported: true,
        speedTargetSettingSupported: true,
      }),
    );

    const blockingCommand = controller.setTargetSpeed(32, {
      source: "manual",
      coalesceKey: "speed",
    });

    await Promise.resolve();

    const periodic = controller.setPowerTarget(180, {
      source: "periodic_refinement",
      coalesceKey: "power",
      createdAt: new Date(1).toISOString(),
    });
    const stepChange = controller.setPowerTarget(220, {
      source: "step_change",
      coalesceKey: "power",
      createdAt: new Date(2).toISOString(),
    });
    const manual = controller.setPowerTarget(260, {
      source: "manual",
      coalesceKey: "power",
      createdAt: new Date(3).toISOString(),
    });

    await device.flushAll();

    await expect(blockingCommand).resolves.toBe(true);
    await expect(periodic).resolves.toBe(false);
    await expect(stepChange).resolves.toBe(false);
    await expect(manual).resolves.toBe(true);

    expect(device.writeOpcodes).toEqual([
      FTMS_OPCODES.RESET,
      FTMS_OPCODES.SET_TARGET_SPEED,
      FTMS_OPCODES.RESET,
      FTMS_OPCODES.SET_TARGET_POWER,
    ]);
  });

  it("drops lower-priority refinements when a higher-priority queued command exists", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({
        resistanceTargetSettingSupported: true,
      }),
    );

    const blocker = controller.setResistanceTarget(10, {
      source: "manual",
      coalesceKey: "resistance-blocker",
    });
    await Promise.resolve();

    const stepChange = controller.setResistanceTarget(14, {
      source: "step_change",
      coalesceKey: "resistance",
      createdAt: new Date(2).toISOString(),
    });
    const refinement = controller.setResistanceTarget(11, {
      source: "periodic_refinement",
      coalesceKey: "resistance",
      createdAt: new Date(3).toISOString(),
    });

    await device.flushAll();

    await expect(blocker).resolves.toBe(true);
    await expect(stepChange).resolves.toBe(true);
    await expect(refinement).resolves.toBe(false);
  });

  it("records the last command status with source and control mode", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({
        powerTargetSettingSupported: true,
      }),
    );

    const command = controller.setPowerTarget(245, {
      source: "manual",
      coalesceKey: "power",
    });

    await device.flushAll();
    await expect(command).resolves.toBe(true);

    expect(controller.getLastCommandStatus()).toMatchObject({
      source: "manual",
      commandType: "set_power",
      controlMode: "erg",
      targetValue: 245,
      success: true,
    });
  });
});
