import {
  FTMS_CHARACTERISTICS,
  FTMS_MACHINE_STATUS_OPCODES,
  FTMS_OPCODES,
  FTMS_RESULT_CODES,
  type FTMSFeatures,
} from "@deancochran/ftms";
import { Buffer } from "buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceGattQueueRegistry } from "./DeviceGattQueue";
import { FTMSController } from "./FTMSController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

class MockFtmsDevice {
  public id = "mock-ftms-device";
  public writeOpcodes: number[] = [];
  public writeValues: number[][] = [];
  public readValues = new Map<string, string>();
  private monitorCallbacks = new Map<
    string,
    (error: Error | null, characteristic: { value?: string } | null) => void
  >();
  private pendingWrites: Array<{ opcode: number; resolve: () => void }> = [];

  monitorCharacteristicForService(
    _serviceUuid: string,
    characteristicUuid: string,
    callback: (error: Error | null, characteristic: { value?: string } | null) => void,
  ) {
    this.monitorCallbacks.set(characteristicUuid, callback);
    return {
      remove: () => {
        this.monitorCallbacks.delete(characteristicUuid);
      },
    };
  }

  async readCharacteristicForService(_serviceUuid: string, characteristicUuid: string) {
    return { value: this.readValues.get(characteristicUuid) };
  }

  async writeCharacteristicWithResponseForService(
    _serviceUuid: string,
    _characteristicUuid: string,
    value: string,
  ): Promise<void> {
    const bytes = Buffer.from(value, "base64");
    const opcode = bytes[0] ?? 0;
    this.writeOpcodes.push(opcode);
    this.writeValues.push([...bytes]);

    await new Promise<void>((resolve) => {
      this.pendingWrites.push({ opcode, resolve });
    });
  }

  async flushNext(resultCode: number = FTMS_RESULT_CODES.SUCCESS): Promise<void> {
    const next = this.pendingWrites.shift();
    if (!next) {
      return;
    }

    const payload = Buffer.from([FTMS_OPCODES.RESPONSE_CODE, next.opcode, resultCode]).toString(
      "base64",
    );

    this.monitorCallbacks.get(FTMS_CHARACTERISTICS.CONTROL_POINT)?.(null, { value: payload });
    next.resolve();
    await Promise.resolve();
  }

  async flushAll(resultCode = FTMS_RESULT_CODES.SUCCESS): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      await this.drainQueueTurns();

      if (this.pendingWrites.length === 0) {
        await vi.advanceTimersByTimeAsync(300);
        await this.drainQueueTurns();
        if (this.pendingWrites.length === 0) {
          break;
        }
      }

      await this.flushNext(resultCode);
      await vi.advanceTimersByTimeAsync(300);
    }
  }

  emitResponse(
    opcode: number,
    resultCode = FTMS_RESULT_CODES.SUCCESS,
    payload: number[] = [],
  ): void {
    this.monitorCallbacks.get(FTMS_CHARACTERISTICS.CONTROL_POINT)?.(null, {
      value: Buffer.from([FTMS_OPCODES.RESPONSE_CODE, opcode, resultCode, ...payload]).toString(
        "base64",
      ),
    });
  }

  emitMalformedControlPoint(bytes: number[]): void {
    this.monitorCallbacks.get(FTMS_CHARACTERISTICS.CONTROL_POINT)?.(null, {
      value: Buffer.from(bytes).toString("base64"),
    });
  }

  emitStatus(opcode: number): void {
    this.monitorCallbacks.get(FTMS_CHARACTERISTICS.STATUS)?.(null, {
      value: Buffer.from([opcode]).toString("base64"),
    });
  }

  resolveNextWriteWithoutResponse(): void {
    this.pendingWrites.shift()?.resolve();
  }

  async settle(): Promise<void> {
    await this.drainQueueTurns();
  }

  async waitForWriteCount(count: number): Promise<void> {
    for (let turn = 0; turn < 20 && this.writeOpcodes.length < count; turn += 1) {
      await this.drainQueueTurns();
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  private async drainQueueTurns(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
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

function createController(
  device: MockFtmsDevice,
  features: FTMSFeatures,
  queues?: DeviceGattQueueRegistry,
): FTMSController {
  const controller = queues
    ? new FTMSController(device as never, queues)
    : new FTMSController(device as never);
  (controller as unknown as { features: FTMSFeatures }).features = features;
  return controller;
}

describe("FTMSController queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("rejects malformed feature data but treats malformed optional ranges as nonfatal", async () => {
    const device = new MockFtmsDevice();
    device.readValues.set(FTMS_CHARACTERISTICS.FEATURE, Buffer.from([0, 0, 0]).toString("base64"));
    const malformed = new FTMSController(device as never);
    await expect(malformed.readFeatures()).rejects.toThrow("Malformed FTMS features payload");

    device.readValues.set(
      FTMS_CHARACTERISTICS.FEATURE,
      Buffer.from([0, 0, 0, 0, 0x1f, 0, 0, 0]).toString("base64"),
    );
    device.readValues.set(
      FTMS_CHARACTERISTICS.SUPPORTED_SPEED_RANGE,
      Buffer.from([1]).toString("base64"),
    );
    device.readValues.set(
      FTMS_CHARACTERISTICS.SUPPORTED_INCLINATION_RANGE,
      Buffer.from([1]).toString("base64"),
    );
    device.readValues.set(
      FTMS_CHARACTERISTICS.SUPPORTED_RESISTANCE_LEVEL_RANGE,
      Buffer.from([1]).toString("base64"),
    );
    device.readValues.set(
      FTMS_CHARACTERISTICS.SUPPORTED_HEART_RATE_RANGE,
      Buffer.from([1]).toString("base64"),
    );
    device.readValues.set(
      FTMS_CHARACTERISTICS.SUPPORTED_POWER_RANGE,
      Buffer.from([1]).toString("base64"),
    );
    const controller = new FTMSController(device as never);
    await expect(controller.readFeatures()).resolves.toMatchObject({
      powerTargetSettingSupported: true,
    });
    expect(controller.getFeatures()?.powerRange).toBeUndefined();
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

    const periodicStatuses: Array<{ outcome: string }> = [];
    const stepStatuses: Array<{ outcome: string }> = [];
    const manualStatuses: Array<{ outcome: string }> = [];
    const periodic = controller.setPowerTarget(180, {
      source: "periodic_refinement",
      coalesceKey: "power",
      createdAt: new Date(1).toISOString(),
      onStatus: (status) => periodicStatuses.push(status),
    });
    const stepChange = controller.setPowerTarget(220, {
      source: "step_change",
      coalesceKey: "power",
      createdAt: new Date(2).toISOString(),
      onStatus: (status) => stepStatuses.push(status),
    });
    const manual = controller.setPowerTarget(260, {
      source: "manual",
      coalesceKey: "power",
      createdAt: new Date(3).toISOString(),
      onStatus: (status) => manualStatuses.push(status),
    });

    await device.flushAll();

    await expect(blockingCommand).resolves.toBe(true);
    await expect(periodic).resolves.toBe(false);
    await expect(stepChange).resolves.toBe(false);
    await expect(manual).resolves.toBe(true);

    expect(device.writeOpcodes).toEqual([
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_SPEED,
      FTMS_OPCODES.SET_TARGET_POWER,
    ]);
    expect(periodicStatuses.at(-1)?.outcome).toBe("superseded");
    expect(stepStatuses.at(-1)?.outcome).toBe("superseded");
    expect(manualStatuses.at(-1)?.outcome).toBe("success");
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
    const refinementStatuses: Array<{ outcome: string }> = [];
    const refinement = controller.setResistanceTarget(11, {
      source: "periodic_refinement",
      coalesceKey: "resistance",
      createdAt: new Date(3).toISOString(),
      onStatus: (status) => refinementStatuses.push(status),
    });

    await device.flushAll();

    await expect(blocker).resolves.toBe(true);
    await expect(stepChange).resolves.toBe(true);
    await expect(refinement).resolves.toBe(false);
    expect(refinementStatuses.at(-1)?.outcome).toBe("superseded");
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

  it("rejects unsupported trainer commands without requesting control", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(device, createFeatures());

    await expect(controller.setPowerTarget(220, { source: "manual" })).resolves.toBe(false);

    expect(device.writeOpcodes).toEqual([]);
    expect(controller.getLastCommandStatus()).toMatchObject({
      source: "manual",
      commandType: "set_power",
      controlMode: "erg",
      targetValue: 220,
      outcome: "unsupported",
      success: false,
    });
  });

  it("clamps power targets to the advertised FTMS range before writing", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({
        powerTargetSettingSupported: true,
        powerRange: { min: 100, max: 400, increment: 5 },
      }),
    );

    const command = controller.setPowerTarget(650, { source: "manual" });

    await device.flushAll();

    await expect(command).resolves.toBe(true);
    expect(controller.getLastCommandStatus()).toMatchObject({
      commandType: "set_power",
      targetValue: 400,
      success: true,
    });
  });

  it("uses package encoding and advertised increments for target command bytes", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({
        powerTargetSettingSupported: true,
        powerRange: { min: 100, max: 400, increment: 5 },
      }),
    );
    const command = controller.setPowerTarget(253, { source: "manual" });
    await device.flushAll();
    await expect(command).resolves.toBe(true);
    expect(device.writeValues).toContainEqual([FTMS_OPCODES.SET_TARGET_POWER, 255, 0]);
  });

  it("rejects non-finite and invalid simulation values without writing", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ indoorBikeSimulationSupported: true }),
    );
    await expect(controller.setPowerTarget(Number.NaN)).resolves.toBe(false);
    await expect(
      controller.setSimulation({ windSpeed: Infinity, grade: 1, crr: 0.001, windResistance: 0.2 }),
    ).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([]);
  });

  it("does not retry a timed-out control response", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const command = controller.setPowerTarget(200);
    await vi.advanceTimersByTimeAsync(0);
    device.resolveNextWriteWithoutResponse();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(command).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);

    device.emitResponse(FTMS_OPCODES.REQUEST_CONTROL);
    const next = controller.setPowerTarget(220);
    await device.settle();
    await expect(next).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);
  });

  it("starts the response deadline only when a queued write actually starts", async () => {
    const device = new MockFtmsDevice();
    const queues = new DeviceGattQueueRegistry();
    const gate = deferred<void>();
    const blocker = queues.enqueue(device.id, "block-write", () => gate.promise);
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
      queues,
    );

    const command = controller.setPowerTarget(200);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(device.writeOpcodes).toEqual([]);

    gate.resolve();
    await blocker;
    await device.flushAll();
    await expect(command).resolves.toBe(true);
  });

  it("fails closed on a stale same-opcode response received before the queued write starts", async () => {
    const device = new MockFtmsDevice();
    const queues = new DeviceGattQueueRegistry();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
      queues,
    );
    const first = controller.setPowerTarget(200);
    await device.flushAll();
    await expect(first).resolves.toBe(true);

    const gate = deferred<void>();
    const blocker = queues.enqueue(device.id, "block-next-write", () => gate.promise);
    await Promise.resolve();
    const next = controller.setPowerTarget(220);
    await device.settle();
    device.emitResponse(FTMS_OPCODES.SET_TARGET_POWER);
    await Promise.resolve();
    expect(device.writeValues).not.toContainEqual([FTMS_OPCODES.SET_TARGET_POWER, 220, 0]);

    gate.resolve();
    await blocker;
    await vi.advanceTimersByTimeAsync(300);
    await expect(next).resolves.toBe(false);
    expect(device.writeValues).not.toContainEqual([FTMS_OPCODES.SET_TARGET_POWER, 220, 0]);
  });

  it("does not strand the queue when unsolicited responses keep extending the drain", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const first = controller.setPowerTarget(200);
    await device.waitForWriteCount(1);
    await device.flushNext();
    await device.waitForWriteCount(2);
    await device.flushNext();
    await expect(first).resolves.toBe(true);

    const next = controller.setPowerTarget(220);
    await device.settle();
    for (let duplicate = 0; duplicate < 60; duplicate += 1) {
      await vi.advanceTimersByTimeAsync(100);
      device.emitResponse(FTMS_OPCODES.SET_TARGET_POWER);
    }
    await expect(next).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_POWER,
    ]);
  });

  it("ignores malformed control-point notifications until a valid response arrives", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const command = controller.setPowerTarget(200);
    await device.waitForWriteCount(1);
    device.emitMalformedControlPoint([FTMS_OPCODES.RESPONSE_CODE]);
    await Promise.resolve();
    await device.flushAll();
    await expect(command).resolves.toBe(true);
  });

  it("ignores mismatched responses until the matching response arrives", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const command = controller.setPowerTarget(200);
    await device.waitForWriteCount(1);
    device.emitResponse(FTMS_OPCODES.SET_TARGET_POWER);
    await Promise.resolve();
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);
    await device.flushAll();
    await expect(command).resolves.toBe(true);
  });

  it("clears cached control after reset so the next command reacquires it", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const first = controller.setPowerTarget(200);
    await device.flushAll();
    await first;
    const reset = controller.reset();
    await device.flushAll();
    await reset;
    const next = controller.setPowerTarget(220);
    await device.flushAll();
    await next;
    expect(device.writeOpcodes).toEqual([
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_POWER,
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.RESET,
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_POWER,
    ]);
  });

  it("loses permission on CONTROL_NOT_PERMITTED and machine status", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const command = controller.setPowerTarget(200);
    await device.settle();
    await device.flushNext();
    await device.settle();
    await device.flushNext(FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED);
    await command;
    const next = controller.setPowerTarget(220);
    await device.flushAll();
    await next;
    expect(
      device.writeOpcodes.filter((opcode) => opcode === FTMS_OPCODES.REQUEST_CONTROL),
    ).toHaveLength(2);
    controller.handleMachineStatus(FTMS_MACHINE_STATUS_OPCODES.CONTROL_PERMISSION_LOST);
    const final = controller.setPowerTarget(240);
    await device.flushAll();
    await final;
    expect(
      device.writeOpcodes.filter((opcode) => opcode === FTMS_OPCODES.REQUEST_CONTROL),
    ).toHaveLength(3);
  });

  it("fences an in-flight request, settles queued work, and requires reconnect", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const requestControl = controller.requestControl();
    const queuedTarget = controller.setPowerTarget(240, { coalesceKey: "queued-target" });
    await device.waitForWriteCount(1);

    expect(
      controller.handleMachineStatus(FTMS_MACHINE_STATUS_OPCODES.CONTROL_PERMISSION_LOST),
    ).toBe(true);
    await expect(requestControl).resolves.toBe(false);
    await expect(queuedTarget).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);
    expect(device.writeValues).not.toContainEqual([FTMS_OPCODES.SET_TARGET_POWER, 240, 0]);

    const unsafeAfterLoss = controller.setPowerTarget(250);
    device.resolveNextWriteWithoutResponse();
    await device.settle();
    await vi.advanceTimersByTimeAsync(300);
    await expect(unsafeAfterLoss).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);

    device.emitResponse(FTMS_OPCODES.REQUEST_CONTROL);
    await device.settle();
    expect(controller.hasControlPermission()).toBe(false);

    const unsafeAfterLateResponse = controller.setPowerTarget(250);
    await expect(unsafeAfterLateResponse).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);
  });

  it("allows fresh control acquisition after a quiet permission loss", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const first = controller.setPowerTarget(200);
    await device.flushAll();
    await expect(first).resolves.toBe(true);

    controller.handleMachineStatus(FTMS_MACHINE_STATUS_OPCODES.CONTROL_PERMISSION_LOST);
    const reacquired = controller.setPowerTarget(220);
    await device.flushAll();
    await expect(reacquired).resolves.toBe(true);
    expect(device.writeOpcodes).toEqual([
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_POWER,
      FTMS_OPCODES.REQUEST_CONTROL,
      FTMS_OPCODES.SET_TARGET_POWER,
    ]);
  });

  it("dispose settles active and queued commands and prevents future writes", async () => {
    const device = new MockFtmsDevice();
    const controller = createController(
      device,
      createFeatures({ powerTargetSettingSupported: true }),
    );
    const active = controller.setPowerTarget(200);
    const queued = controller.setPowerTarget(220, { coalesceKey: "different" });
    await device.waitForWriteCount(1);
    controller.dispose();
    await expect(active).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    await expect(controller.setPowerTarget(240)).resolves.toBe(false);
    expect(device.writeOpcodes).toEqual([FTMS_OPCODES.REQUEST_CONTROL]);
  });
});
