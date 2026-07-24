import {
  ControlMode,
  decodeFtmsControlResponse,
  decodeFtmsFeatures,
  decodeSupportedHeartRateRange,
  decodeSupportedInclinationRange,
  decodeSupportedPowerRange,
  decodeSupportedResistanceRange,
  decodeSupportedSpeedRange,
  FTMS_CHARACTERISTICS,
  FTMS_MACHINE_STATUS_OPCODES,
  FTMS_RESULT_CODES,
  FTMS_SERVICE_UUIDS,
  type FTMSControlEvent,
  type FTMSFeatures,
  type FTMSResponse,
  type FtmsControlRequest,
  type FtmsRange,
  parseFtmsMachineStatus,
  tryEncodeFtmsControlRequest,
} from "@deancochran/ftms";
import { canTrainerIntentPreempt, type RecordingTrainerIntentSource } from "@repo/core";
import { Buffer } from "buffer";
import type { Device } from "react-native-ble-plx";
import { decodeBase64ToBytes } from "./ble-bytes";
import { DeviceGattQueueRegistry } from "./DeviceGattQueue";
import type { RecordingTrainerCommandStatus } from "./types";

export type { FTMSControlEvent, FTMSFeatures, FTMSResponse };
export { ControlMode };

export interface SimulationParams {
  windSpeed: number;
  grade: number;
  crr: number;
  windResistance: number;
}

export interface FTMSCommandContext {
  source?: RecordingTrainerIntentSource;
  coalesceKey?: string;
  createdAt?: string;
  onStatus?: (status: RecordingTrainerCommandStatus) => void;
}

interface NormalizedFTMSCommandContext {
  source: RecordingTrainerIntentSource;
  coalesceKey: string;
  createdAt: string;
  onStatus?: (status: RecordingTrainerCommandStatus) => void;
}

interface FTMSQueuedCommand {
  buffer: Uint8Array;
  requestOpCode: number;
  commandType: RecordingTrainerCommandStatus["commandType"];
  controlType: FTMSControlEvent["controlType"];
  targetValue: number | undefined;
  targetMode: ControlMode | undefined;
  context: NormalizedFTMSCommandContext;
  resolve: (value: boolean) => void;
  invalidated?: boolean;
}

interface PendingResponse {
  requestOpCode: number;
  generation: number;
  resolve: (response: FTMSResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_COMMAND_SOURCE: RecordingTrainerIntentSource = "manual";
const CONTROL_POINT_SETTLE_MS = 250;
const CONTROL_POINT_RESPONSE_DRAIN_MS = 250;
const FTMS_RESPONSE_TIMEOUT_MESSAGE = "Response timeout";
const FTMS_WRITE_ABORTED_MESSAGE = "Control point write aborted";

export class FTMSController {
  private readonly deviceId: string;
  private currentControlMode: ControlMode | undefined;
  private features?: FTMSFeatures;
  public controlEvents: FTMSControlEvent[] = [];
  private commandQueue: FTMSQueuedCommand[] = [];
  private activeCommand: FTMSQueuedCommand | undefined;
  private isProcessingQueue = false;
  private controlGranted = false;
  private disposed = false;
  private lastCommandStatus: RecordingTrainerCommandStatus | null = null;
  private controlPointSubscription: { remove: () => void } | undefined;
  private statusSubscriptions: Array<{ remove: () => void }> = [];
  private pendingControlPointResponse: PendingResponse | undefined;
  private pendingGeneration = 0;
  private permissionGeneration = 0;
  private controlPointFaultReason: string | undefined;
  private controlPointFaultListeners = new Set<(error: Error) => void>();
  private responseDrainUntilByOpcode = new Map<number, number>();

  constructor(
    private readonly device: Device,
    private readonly gattQueues: DeviceGattQueueRegistry = new DeviceGattQueueRegistry(),
  ) {
    this.deviceId = device.id;
  }

  async readFeatures(): Promise<FTMSFeatures> {
    this.assertUsable();
    const characteristic = await this.gattQueues.enqueue(
      this.deviceId,
      "ftms:read-features",
      () =>
        this.device.readCharacteristicForService(
          FTMS_SERVICE_UUIDS.FITNESS_MACHINE,
          FTMS_CHARACTERISTICS.FEATURE,
        ),
      { timeoutMs: 5000 },
    );
    this.assertUsable();
    if (!characteristic.value) throw new Error("Failed to read FTMS features");
    const decoded = decodeFtmsFeatures(decodeBase64ToBytes(characteristic.value));
    if (!decoded.ok) throw new Error(`Malformed FTMS features payload: ${decoded.error.message}`);
    this.features = decoded.value;
    await this.readSupportedRanges();
    return this.features;
  }

  private async readSupportedRanges(): Promise<void> {
    if (!this.features || this.disposed) return;
    const reads: Array<
      [
        keyof Pick<
          FTMSFeatures,
          "speedRange" | "inclinationRange" | "resistanceRange" | "heartRateRange" | "powerRange"
        >,
        boolean,
        string,
        string,
        (data: Uint8Array) => ReturnType<typeof decodeSupportedSpeedRange>,
      ]
    > = [
      [
        "speedRange",
        this.features.speedTargetSettingSupported,
        "ftms:read-supported-speed-range",
        FTMS_CHARACTERISTICS.SUPPORTED_SPEED_RANGE,
        decodeSupportedSpeedRange,
      ],
      [
        "inclinationRange",
        this.features.inclinationTargetSettingSupported,
        "ftms:read-supported-inclination-range",
        FTMS_CHARACTERISTICS.SUPPORTED_INCLINATION_RANGE,
        decodeSupportedInclinationRange,
      ],
      [
        "resistanceRange",
        this.features.resistanceTargetSettingSupported,
        "ftms:read-supported-resistance-range",
        FTMS_CHARACTERISTICS.SUPPORTED_RESISTANCE_LEVEL_RANGE,
        decodeSupportedResistanceRange,
      ],
      [
        "heartRateRange",
        this.features.heartRateTargetSettingSupported,
        "ftms:read-supported-heart-rate-range",
        FTMS_CHARACTERISTICS.SUPPORTED_HEART_RATE_RANGE,
        decodeSupportedHeartRateRange,
      ],
      [
        "powerRange",
        this.features.powerTargetSettingSupported,
        "ftms:read-supported-power-range",
        FTMS_CHARACTERISTICS.SUPPORTED_POWER_RANGE,
        decodeSupportedPowerRange,
      ],
    ];
    for (const [property, supported, label, characteristic, decode] of reads) {
      if (!supported || this.disposed) continue;
      try {
        const result = await this.gattQueues.enqueue(
          this.deviceId,
          label,
          () =>
            this.device.readCharacteristicForService(
              FTMS_SERVICE_UUIDS.FITNESS_MACHINE,
              characteristic,
            ),
          { timeoutMs: 5000 },
        );
        if (!result.value || !this.features) continue;
        const decoded = decode(decodeBase64ToBytes(result.value));
        if (decoded.ok) this.features[property] = this.rangeProjection(decoded.value);
      } catch {
        // Optional range support is intentionally non-fatal.
      }
    }
  }

  private rangeProjection(range: FtmsRange): { min: number; max: number; increment: number } {
    return { min: range.min, max: range.max, increment: range.increment };
  }

  async requestControl(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.controlGranted) return true;
    return this.enqueueRequest(
      { op: "requestControl" },
      "request_control",
      "resistance",
      undefined,
      undefined,
      this.normalizeCommandContext(),
    );
  }

  async reset(context?: FTMSCommandContext): Promise<boolean> {
    if (this.disposed) return false;
    this.controlGranted = false;
    this.currentControlMode = undefined;
    return this.enqueueRequest(
      { op: "reset" },
      "reset",
      "resistance",
      undefined,
      undefined,
      this.normalizeCommandContext(context, "reset"),
    );
  }

  async setPowerTarget(watts: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_power",
      "power_target",
      ControlMode.ERG,
      watts,
      this.features?.powerTargetSettingSupported,
      this.features?.powerRange,
      [0, 4000],
      1,
      (value) => ({ op: "setTargetPower", powerWatts: value }),
      context,
      "Trainer does not support power target setting",
    );
  }

  async setResistanceTarget(level: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_resistance",
      "resistance",
      ControlMode.RESISTANCE,
      level,
      this.features?.resistanceTargetSettingSupported,
      this.features?.resistanceRange,
      [0, 100],
      0.1,
      (value) => ({ op: "setTargetResistance", resistanceLevel: value }),
      context,
      "Trainer does not support resistance target setting",
    );
  }

  async setTargetSpeed(speedKph: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_speed",
      "speed",
      ControlMode.SPEED,
      speedKph,
      this.features?.speedTargetSettingSupported,
      this.features?.speedRange,
      [0, 60],
      0.01,
      (value) => ({ op: "setTargetSpeed", speedKph: value }),
      context,
      "Trainer does not support speed target setting",
    );
  }

  async setTargetInclination(percent: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_incline",
      "inclination",
      ControlMode.INCLINATION,
      percent,
      this.features?.inclinationTargetSettingSupported,
      this.features?.inclinationRange,
      [-10, 40],
      0.1,
      (value) => ({ op: "setTargetInclination", inclinationPercent: value }),
      context,
      "Trainer does not support inclination target setting",
    );
  }

  async setTargetHeartRate(bpm: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_heart_rate",
      "heart_rate",
      ControlMode.HEART_RATE,
      bpm,
      this.features?.heartRateTargetSettingSupported,
      this.features?.heartRateRange,
      [60, 200],
      1,
      (value) => ({ op: "setTargetHeartRate", heartRateBpm: value }),
      context,
      "Trainer does not support heart rate target setting",
    );
  }

  async setTargetCadence(rpm: number, context?: FTMSCommandContext): Promise<boolean> {
    return this.setTarget(
      "set_cadence",
      "cadence",
      ControlMode.CADENCE,
      rpm,
      this.features?.targetedCadenceSupported,
      undefined,
      [0, 200],
      0.5,
      (value) => ({ op: "setTargetedCadence", cadenceRpm: value }),
      context,
      "Trainer does not support targeted cadence setting",
    );
  }

  async setSimulation(params: SimulationParams, context?: FTMSCommandContext): Promise<boolean> {
    const normalized = this.normalizeCommandContext(context, "set_simulation");
    if (this.disposed || !this.features?.indoorBikeSimulationSupported)
      return this.failWithoutQueue(
        "set_simulation",
        normalized,
        ControlMode.SIM,
        params.grade,
        this.disposed ? "Controller disposed" : "Trainer does not support indoor bike simulation",
      );
    if (![params.windSpeed, params.grade, params.crr, params.windResistance].every(Number.isFinite))
      return this.failWithoutQueue(
        "set_simulation",
        normalized,
        ControlMode.SIM,
        params.grade,
        "Simulation parameters must be finite",
      );
    return this.enqueueRequest(
      {
        op: "setIndoorBikeSimulation",
        windSpeedMps: params.windSpeed,
        gradePercent: params.grade,
        crr: params.crr,
        cwKgPerM: params.windResistance,
      },
      "set_simulation",
      "simulation",
      params.grade,
      ControlMode.SIM,
      normalized,
    );
  }

  private setTarget(
    commandType: RecordingTrainerCommandStatus["commandType"],
    controlType: FTMSControlEvent["controlType"],
    mode: ControlMode,
    value: number,
    supported: boolean | undefined,
    range: { min: number; max: number; increment: number } | undefined,
    fallback: readonly [number, number],
    resolution: number,
    request: (value: number) => FtmsControlRequest,
    context: FTMSCommandContext | undefined,
    unsupportedMessage: string,
  ): Promise<boolean> {
    const normalized = this.normalizeCommandContext(context, commandType);
    if (this.disposed)
      return Promise.resolve(
        this.failWithoutQueue(commandType, normalized, mode, value, "Controller disposed"),
      );
    if (!supported)
      return Promise.resolve(
        this.failWithoutQueue(
          commandType,
          normalized,
          mode,
          value,
          unsupportedMessage,
          "unsupported",
        ),
      );
    if (!Number.isFinite(value))
      return Promise.resolve(
        this.failWithoutQueue(
          commandType,
          normalized,
          mode,
          value,
          "Target must be a finite number",
          "invalid_parameter",
        ),
      );
    const target = this.clampToStep(value, range, fallback, resolution);
    return this.enqueueRequest(request(target), commandType, controlType, target, mode, normalized);
  }

  private clampToStep(
    value: number,
    range: { min: number; max: number; increment: number } | undefined,
    fallback: readonly [number, number],
    resolution: number,
  ): number {
    const min = range?.min ?? fallback[0];
    const max = range?.max ?? fallback[1];
    const configuredStep = range?.increment;
    const step =
      configuredStep && Number.isFinite(configuredStep) && configuredStep > 0
        ? Math.max(configuredStep, resolution)
        : resolution;
    const clamped = Math.max(min, Math.min(value, max));
    return Math.max(
      min,
      Math.min(max, Number((min + Math.round((clamped - min) / step) * step).toFixed(6))),
    );
  }

  private enqueueRequest(
    request: FtmsControlRequest,
    commandType: RecordingTrainerCommandStatus["commandType"],
    controlType: FTMSControlEvent["controlType"],
    targetValue: number | undefined,
    targetMode: ControlMode | undefined,
    context: NormalizedFTMSCommandContext,
  ): Promise<boolean> {
    const encoded = tryEncodeFtmsControlRequest(request);
    if (!encoded.ok)
      return Promise.resolve(
        this.failWithoutQueue(
          commandType,
          context,
          targetMode,
          targetValue,
          encoded.error.message,
          "invalid_parameter",
        ),
      );
    return this.enqueueBooleanCommand({
      buffer: encoded.value,
      requestOpCode: encoded.value[0] ?? 0,
      commandType,
      controlType,
      targetValue,
      targetMode,
      context,
      resolve: () => {},
    });
  }

  private enqueueBooleanCommand(command: FTMSQueuedCommand): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return new Promise((resolve) => {
      command.resolve = resolve;
      if (!this.insertQueuedCommand(command)) return;
      void this.processQueue();
    });
  }

  private insertQueuedCommand(command: FTMSQueuedCommand): boolean {
    for (let index = this.commandQueue.length - 1; index >= 0; index -= 1) {
      const existing = this.commandQueue[index];
      if (!existing || existing.context.coalesceKey !== command.context.coalesceKey) continue;
      const nextWins =
        canTrainerIntentPreempt(command.context.source, existing.context.source) ||
        (!canTrainerIntentPreempt(existing.context.source, command.context.source) &&
          Date.parse(command.context.createdAt) >= Date.parse(existing.context.createdAt));
      if (!nextWins) {
        this.recordSupersededCommand(command);
        command.resolve(false);
        return false;
      }
      this.commandQueue.splice(index, 1);
      this.recordSupersededCommand(existing);
      existing.resolve(false);
    }
    this.commandQueue.push(command);
    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    try {
      while (!this.disposed && this.commandQueue.length) {
        const command = this.commandQueue.shift();
        if (!command) continue;
        this.activeCommand = command;
        const success = await this.executeQueuedCommand(command);
        this.activeCommand = undefined;
        command.resolve(this.disposed ? false : success);
        if (!this.disposed && this.commandQueue.length)
          await new Promise((resolve) => setTimeout(resolve, CONTROL_POINT_SETTLE_MS));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async executeQueuedCommand(command: FTMSQueuedCommand): Promise<boolean> {
    try {
      if (this.disposed || command.invalidated) return false;
      if (
        command.commandType !== "request_control" &&
        !this.controlGranted &&
        !(await this.ensureControlGranted(command.context))
      )
        return false;
      const response = await this.writeControlPoint(command.buffer);
      if (command.invalidated) return false;
      this.recordCommandResult(command, response);
      return response.success && !this.disposed;
    } catch (error) {
      if (command.invalidated) return false;
      this.recordCommandResult(command, this.failureResponse(command.requestOpCode, String(error)));
      return false;
    }
  }

  private async ensureControlGranted(context: NormalizedFTMSCommandContext): Promise<boolean> {
    const encoded = tryEncodeFtmsControlRequest({ op: "requestControl" });
    if (!encoded.ok || this.disposed) return false;
    const permissionGeneration = this.permissionGeneration;
    const response = await this.writeControlPoint(encoded.value);
    if (permissionGeneration !== this.permissionGeneration) return false;
    this.controlGranted = response.success && !this.disposed;
    if (response.resultCode === FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED) {
      this.currentControlMode = undefined;
    }
    this.publishCommandStatus(context, {
      source: context.source,
      commandType: "request_control",
      controlMode: this.currentControlMode ?? null,
      outcome: this.mapResponseOutcome(response),
      success: response.success,
      ...(response.success ? {} : { errorMessage: response.resultCodeName }),
      resultCode: response.resultCode,
      resultCodeName: response.resultCodeName,
      queuedAt: Date.parse(context.createdAt),
      completedAt: Date.now(),
    });
    return this.controlGranted;
  }

  private async writeControlPoint(buffer: Uint8Array): Promise<FTMSResponse> {
    const requestOpCode = buffer[0] ?? 0;
    this.assertControlPointHealthy();
    await this.ensureControlPointMonitor();
    let response: Promise<FTMSResponse> | undefined;
    let writeStarted = false;
    try {
      await this.gattQueues.enqueue(
        this.deviceId,
        `ftms:write-control-point:0x${requestOpCode.toString(16)}`,
        async ({ signal }) => {
          await this.waitForResponseDrain(requestOpCode, signal);
          if (signal.aborted) throw new Error(FTMS_WRITE_ABORTED_MESSAGE);
          this.assertControlPointHealthy();
          this.assertUsable();
          writeStarted = true;
          response = this.waitForControlPointResponse(requestOpCode);
          // Permission loss can invalidate this response while the native write is still pending.
          // Keep a rejection handler attached until this method awaits it below.
          void response.catch(() => undefined);
          return await this.device.writeCharacteristicWithResponseForService(
            FTMS_SERVICE_UUIDS.FITNESS_MACHINE,
            FTMS_CHARACTERISTICS.CONTROL_POINT,
            Buffer.from(buffer).toString("base64"),
          );
        },
        { timeoutMs: 5000 },
      );
    } catch (error) {
      if (writeStarted) {
        this.markControlPointFault(FTMS_WRITE_ABORTED_MESSAGE);
        this.rejectPendingControlPointResponse(new Error(FTMS_WRITE_ABORTED_MESSAGE));
        await response?.catch(() => undefined);
      }
      throw error;
    }
    if (!response) throw new Error(FTMS_WRITE_ABORTED_MESSAGE);
    return await response;
  }

  private async ensureControlPointMonitor(): Promise<void> {
    if (this.controlPointSubscription || this.disposed) {
      this.assertUsable();
      return;
    }
    this.controlPointSubscription = await this.gattQueues.enqueue(
      this.deviceId,
      "ftms:monitor-control-point",
      async () =>
        this.device.monitorCharacteristicForService(
          FTMS_SERVICE_UUIDS.FITNESS_MACHINE,
          FTMS_CHARACTERISTICS.CONTROL_POINT,
          (error, characteristic) => {
            if (this.disposed) return;
            if (error) {
              this.controlPointSubscription?.remove();
              this.controlPointSubscription = undefined;
              this.markControlPointFault("Control point monitor failed");
              this.rejectPendingControlPointResponse(
                error instanceof Error ? error : new Error(String(error)),
              );
              return;
            }
            if (!characteristic?.value) return;
            const decoded = decodeFtmsControlResponse(decodeBase64ToBytes(characteristic.value));
            if (!decoded.ok) return;
            const pending = this.pendingControlPointResponse;
            if (!pending) {
              this.noteResponseForDrain(decoded.value.requestOpCode);
              this.markControlPointFault("Unsolicited control point response");
              return;
            }
            if (decoded.value.requestOpCode !== pending.requestOpCode) {
              this.noteResponseForDrain(decoded.value.requestOpCode);
              return;
            }
            this.resolvePendingControlPointResponse(decoded.value, pending.generation);
          },
        ),
      { timeoutMs: 5000 },
    );
  }

  private waitForControlPointResponse(requestOpCode: number): Promise<FTMSResponse> {
    this.rejectPendingControlPointResponse(new Error(FTMS_WRITE_ABORTED_MESSAGE));
    const generation = ++this.pendingGeneration;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.markControlPointFault(FTMS_RESPONSE_TIMEOUT_MESSAGE);
        this.rejectPendingControlPointResponse(
          new Error(FTMS_RESPONSE_TIMEOUT_MESSAGE),
          generation,
        );
      }, 2000);
      this.pendingControlPointResponse = { requestOpCode, generation, resolve, reject, timeout };
    });
  }

  private resolvePendingControlPointResponse(response: FTMSResponse, generation: number): void {
    const pending = this.pendingControlPointResponse;
    if (!pending || pending.generation !== generation || this.disposed) return;
    clearTimeout(pending.timeout);
    this.pendingControlPointResponse = undefined;
    this.noteResponseForDrain(response.requestOpCode);
    pending.resolve(response);
  }

  private rejectPendingControlPointResponse(error: Error, generation?: number): void {
    const pending = this.pendingControlPointResponse;
    if (!pending || (generation !== undefined && pending.generation !== generation)) return;
    clearTimeout(pending.timeout);
    this.pendingControlPointResponse = undefined;
    pending.reject(error);
  }

  private assertControlPointHealthy(): void {
    if (this.controlPointFaultReason) {
      throw new Error(`FTMS control point requires reconnect: ${this.controlPointFaultReason}`);
    }
  }

  private markControlPointFault(reason: string): void {
    this.controlPointFaultReason = reason;
    this.controlGranted = false;
    this.currentControlMode = undefined;
    const error = new Error(`FTMS control point requires reconnect: ${reason}`);
    for (const listener of this.controlPointFaultListeners) listener(error);
    this.controlPointFaultListeners.clear();
  }

  private noteResponseForDrain(requestOpCode: number): void {
    this.responseDrainUntilByOpcode.set(
      requestOpCode,
      Date.now() + CONTROL_POINT_RESPONSE_DRAIN_MS,
    );
  }

  private async waitForResponseDrain(requestOpCode: number, signal: AbortSignal): Promise<void> {
    while (true) {
      this.assertControlPointHealthy();
      if (signal.aborted) throw new Error(FTMS_WRITE_ABORTED_MESSAGE);
      const delay = (this.responseDrainUntilByOpcode.get(requestOpCode) ?? 0) - Date.now();
      if (delay <= 0) return;
      await new Promise<void>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout>;
        const cleanup = () => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", onAbort);
          this.controlPointFaultListeners.delete(onFault);
        };
        const onAbort = () => {
          cleanup();
          reject(new Error(FTMS_WRITE_ABORTED_MESSAGE));
        };
        const onFault = (error: Error) => {
          cleanup();
          reject(error);
        };
        timeout = setTimeout(() => {
          cleanup();
          resolve();
        }, delay);
        signal.addEventListener("abort", onAbort, { once: true });
        this.controlPointFaultListeners.add(onFault);
      });
    }
  }

  private recordCommandResult(command: FTMSQueuedCommand, response: FTMSResponse): void {
    if (this.disposed) return;
    if (response.resultCode === FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED) {
      this.controlGranted = false;
      this.currentControlMode = undefined;
    } else if (command.commandType === "request_control") this.controlGranted = response.success;
    else if (command.commandType === "reset" && response.success) {
      this.controlGranted = false;
      this.currentControlMode = undefined;
    } else if (response.success && command.targetMode) this.currentControlMode = command.targetMode;
    this.controlEvents.push({
      timestamp: Date.now(),
      controlType: command.controlType,
      targetValue: command.targetValue ?? 0,
      success: response.success,
      ...(response.success ? {} : { errorMessage: response.resultCodeName }),
    });
    this.publishCommandStatus(command.context, {
      source: command.context.source,
      commandType: command.commandType,
      controlMode: command.targetMode ?? this.currentControlMode ?? null,
      outcome: this.mapResponseOutcome(response),
      ...(command.targetValue === undefined ? {} : { targetValue: command.targetValue }),
      success: response.success,
      ...(response.success ? {} : { errorMessage: response.resultCodeName }),
      resultCode: response.resultCode,
      resultCodeName: response.resultCodeName,
      queuedAt: Date.parse(command.context.createdAt),
      completedAt: Date.now(),
    });
  }

  private recordSupersededCommand(command: FTMSQueuedCommand): void {
    this.publishCommandStatus(command.context, {
      source: command.context.source,
      commandType: command.commandType,
      controlMode: command.targetMode ?? this.currentControlMode ?? null,
      outcome: "superseded",
      ...(command.targetValue === undefined ? {} : { targetValue: command.targetValue }),
      success: false,
      queuedAt: Date.parse(command.context.createdAt),
      completedAt: Date.now(),
    });
  }

  private publishCommandStatus(
    context: NormalizedFTMSCommandContext,
    status: RecordingTrainerCommandStatus,
  ): void {
    this.lastCommandStatus = status;
    context.onStatus?.(status);
  }

  private failureResponse(requestOpCode: number, message: string): FTMSResponse {
    return {
      requestOpCode,
      resultCode: FTMS_RESULT_CODES.OPERATION_FAILED,
      resultCodeName: message,
      success: false,
    };
  }
  private mapResponseOutcome(response: FTMSResponse): RecordingTrainerCommandStatus["outcome"] {
    if (response.success) return "success";
    if (response.resultCode === FTMS_RESULT_CODES.NOT_SUPPORTED) return "unsupported";
    if (response.resultCode === FTMS_RESULT_CODES.INVALID_PARAMETER) return "invalid_parameter";
    if (response.resultCode === FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED) return "control_conflict";
    if (response.resultCodeName.includes(FTMS_RESPONSE_TIMEOUT_MESSAGE)) return "timeout";
    return "operation_failed";
  }

  private failWithoutQueue(
    commandType: RecordingTrainerCommandStatus["commandType"],
    context: NormalizedFTMSCommandContext,
    mode: ControlMode | undefined,
    targetValue: number | undefined,
    message: string,
    outcome: RecordingTrainerCommandStatus["outcome"] = "operation_failed",
  ): false {
    this.publishCommandStatus(context, {
      source: context.source,
      commandType,
      controlMode: mode ?? this.currentControlMode ?? null,
      outcome,
      ...(targetValue === undefined ? {} : { targetValue }),
      success: false,
      errorMessage: message,
      resultCodeName: message,
      queuedAt: Date.parse(context.createdAt),
      completedAt: Date.now(),
    });
    return false;
  }

  private normalizeCommandContext(
    context?: FTMSCommandContext,
    coalesceKey = "default",
  ): NormalizedFTMSCommandContext {
    return {
      source: context?.source ?? DEFAULT_COMMAND_SOURCE,
      coalesceKey: context?.coalesceKey ?? coalesceKey,
      createdAt: context?.createdAt ?? new Date().toISOString(),
      ...(context?.onStatus ? { onStatus: context.onStatus } : {}),
    };
  }
  private assertUsable(): void {
    if (this.disposed) throw new Error("FTMS controller disposed");
  }

  async subscribeStatus(callback: (status: string) => void): Promise<void> {
    this.assertUsable();
    const subscription = await this.gattQueues.enqueue(
      this.deviceId,
      "ftms:monitor-status",
      async () =>
        this.device.monitorCharacteristicForService(
          FTMS_SERVICE_UUIDS.FITNESS_MACHINE,
          FTMS_CHARACTERISTICS.STATUS,
          (error, characteristic) => {
            if (this.disposed || error || !characteristic?.value) return;
            const parsed = parseFtmsMachineStatus(decodeBase64ToBytes(characteristic.value));
            this.handleMachineStatus(parsed.status?.code ?? null);
            callback(parsed.status?.label ?? "unknown");
          },
        ),
      { timeoutMs: 5000 },
    );
    if (this.disposed) subscription.remove();
    else this.statusSubscriptions.push(subscription);
  }

  handleMachineStatus(statusCode: number | null): boolean {
    if (this.disposed || statusCode !== FTMS_MACHINE_STATUS_OPCODES.CONTROL_PERMISSION_LOST)
      return false;
    const interruptedControlProcedure = Boolean(
      this.activeCommand || this.pendingControlPointResponse,
    );
    this.controlGranted = false;
    this.currentControlMode = undefined;
    this.permissionGeneration += 1;
    this.pendingGeneration += 1;
    this.rejectPendingControlPointResponse(new Error("FTMS control permission lost"));
    if (this.activeCommand && !this.activeCommand.invalidated) {
      this.activeCommand.invalidated = true;
      this.settlePermissionLostCommand(this.activeCommand);
    }
    for (const command of this.commandQueue.splice(0)) {
      command.invalidated = true;
      this.settlePermissionLostCommand(command);
    }
    if (interruptedControlProcedure) {
      this.markControlPointFault("Control permission lost during an active procedure");
    }
    return true;
  }

  private settlePermissionLostCommand(command: FTMSQueuedCommand): void {
    this.recordCommandResult(command, {
      requestOpCode: command.requestOpCode,
      resultCode: FTMS_RESULT_CODES.CONTROL_NOT_PERMITTED,
      resultCodeName: "Control permission lost",
      success: false,
    });
    command.resolve(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controlGranted = false;
    this.currentControlMode = undefined;
    this.rejectPendingControlPointResponse(new Error(FTMS_WRITE_ABORTED_MESSAGE));
    this.activeCommand?.resolve(false);
    this.activeCommand = undefined;
    for (const command of this.commandQueue.splice(0)) command.resolve(false);
    this.controlPointSubscription?.remove();
    this.controlPointSubscription = undefined;
    this.controlPointFaultListeners.clear();
    this.responseDrainUntilByOpcode.clear();
    for (const subscription of this.statusSubscriptions.splice(0)) subscription.remove();
    this.gattQueues.cancelDevice(this.deviceId, "FTMS controller disposed");
  }

  getFeatures(): FTMSFeatures | undefined {
    return this.features;
  }
  getCurrentMode(): ControlMode | undefined {
    return this.currentControlMode;
  }
  hasControlPermission(): boolean {
    return this.controlGranted && !this.disposed;
  }
  getControlEvents(): FTMSControlEvent[] {
    return this.controlEvents;
  }
  getLastCommandStatus(): RecordingTrainerCommandStatus | null {
    return this.lastCommandStatus;
  }
  clearControlEvents(): void {
    this.controlEvents = [];
  }
}
