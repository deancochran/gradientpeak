import {
  BLE_SERVICE_UUIDS,
  type CscParserState,
  detectFtmsMachineType,
  type FtmsMachineType,
  type FtmsMachineTypeSource,
  type FtmsParserDefinition,
  listFtmsParserDefinitions,
  type ParsedFtmsPayload,
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseHeartRateMeasurement,
} from "@repo/core";
import { type BleError, BleManager, type Characteristic, type Device } from "react-native-ble-plx";
import { BleScanController } from "./BleScanController";
import { decodeBase64ToBytes, toDataView } from "./ble-bytes";
import { DeviceGattQueueRegistry } from "./DeviceGattQueue";
import {
  type ControlMode,
  type FTMSCommandContext,
  FTMSController,
  type FTMSFeatures,
} from "./FTMSController";
import { KnownSensorRegistry, type PersistedSensor } from "./KnownSensorRegistry";
import type {
  RecordingServiceError,
  RecordingServiceErrorCategory,
  RecordingTrainerConnectionState,
  RecordingTrainerControlState,
  RecordingTrainerDataFlowState,
  SensorReading,
} from "./types";

const SENSOR_PARSER_DEBUG = {
  enabled: false,
};

export function setSensorParserDebugEnabled(enabled: boolean): void {
  SENSOR_PARSER_DEBUG.enabled = enabled;
}

/** --- Connection states --- */
export type SensorConnectionState =
  | "disconnected"
  | "disconnecting"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "failed";

/** --- Valid state transitions for connection state machine --- */
const VALID_STATE_TRANSITIONS: Record<SensorConnectionState, SensorConnectionState[]> = {
  disconnected: ["connecting", "reconnecting", "disconnecting", "failed"],
  disconnecting: ["disconnected", "failed"],
  connecting: ["connected", "disconnected", "disconnecting", "failed"],
  reconnecting: ["connected", "disconnected", "disconnecting", "failed"],
  connected: ["disconnecting", "disconnected", "failed", "reconnecting"],
  failed: ["connecting", "reconnecting", "disconnected"],
};

/** --- Connected sensor interface --- */
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionState: SensorConnectionState;
  lastDataTimestamp?: number;
  observedMetrics?: Set<SensorReading["metric"]>;

  // FTMS control support
  isTrainer?: boolean;
  isControllable?: boolean;
  ftmsController?: FTMSController;
  ftmsFeatures?: FTMSFeatures;
  currentControlMode?: ControlMode;
  lastServiceError?: RecordingServiceError;

  // Battery monitoring
  batteryLevel?: number; // 0-100

  // State machine tracking
  stateTransitionInProgress?: boolean;
  pendingStateTransition?: {
    targetState: SensorConnectionState;
    timestamp: number;
  };
}

/** --- Metric Types --- */
export enum BleMetricType {
  HeartRate = "heartrate",
  Power = "power",
  Cadence = "cadence",
  Speed = "speed",
  Battery = "battery",
}

/** --- Standard BLE Characteristics --- */
export const BleCharacteristicParsers: Record<
  string,
  {
    parserId: string;
    metricType: BleMetricType;
    purpose: "activity_metric" | "device_diagnostic";
  }
> = {
  "00002a37-0000-1000-8000-00805f9b34fb": {
    parserId: "heart-rate-measurement",
    metricType: BleMetricType.HeartRate,
    purpose: "activity_metric",
  },
  "00002a63-0000-1000-8000-00805f9b34fb": {
    parserId: "cycling-power-measurement",
    metricType: BleMetricType.Power,
    purpose: "activity_metric",
  },
  "00002a5b-0000-1000-8000-00805f9b34fb": {
    parserId: "cycling-speed-cadence-measurement",
    metricType: BleMetricType.Cadence,
    purpose: "activity_metric",
  },
  "00002a53-0000-1000-8000-00805f9b34fb": {
    parserId: "running-speed-cadence-measurement",
    metricType: BleMetricType.Speed,
    purpose: "activity_metric",
  },
  "00002a19-0000-1000-8000-00805f9b34fb": {
    parserId: "battery-level",
    metricType: BleMetricType.Battery,
    purpose: "device_diagnostic",
  },
};

export const KnownCharacteristics: Record<string, BleMetricType> = {
  ...Object.fromEntries(
    Object.entries(BleCharacteristicParsers).map(([uuid, parser]) => [uuid, parser.metricType]),
  ),
};

/** --- Sensor Data Types (imported from types.ts) --- */
// SensorReading is now imported from types.ts for consistency

export type { PersistedSensor } from "./KnownSensorRegistry";

export interface TrainerStateSnapshot {
  deviceId: string | null;
  deviceName: string | null;
  connectionState: RecordingTrainerConnectionState;
  dataFlowState: RecordingTrainerDataFlowState;
  controlState: RecordingTrainerControlState;
  lastServiceError: RecordingServiceError | null;
}

export interface FtmsDeviceSnapshot {
  deviceId: string;
  deviceName: string;
  controlState: RecordingTrainerControlState;
  features?: FTMSFeatures;
  machineType?: FtmsMachineType;
  machineTypeSource?: FtmsMachineTypeSource;
  supportsControl: boolean;
}

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private bleManager = new BleManager();
  private scanController = new BleScanController(this.bleManager, (error) => {
    this.recordServiceError("scan_error", error.message || "BLE scan failed", {
      recoverable: true,
    });
  });
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private gattQueues = new DeviceGattQueueRegistry();
  private monitorSubscriptions: Map<string, Array<{ remove: () => void }>> = new Map();
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private connectionCallbacks: Set<(sensor: ConnectedSensor) => void> = new Set();
  private bleStateCallbacks: Set<(state: string) => void> = new Set();
  private connectionMonitorTimer?: ReturnType<typeof setInterval>;
  private readonly DISCONNECT_TIMEOUT_MS = 60000; // 60 seconds (increased from 30s for better stability)
  private readonly HEALTH_CHECK_INTERVAL_MS = 15000; // 15 seconds (increased from 10s to reduce battery drain)

  // BLE state tracking
  private bleState: string = "Unknown";

  private ftmsControllers: Map<string, FTMSController> = new Map();
  private ftmsCandidates: Map<string, FtmsDeviceSnapshot> = new Map();
  private selectedFtmsDeviceId?: string;
  private trainerState: TrainerStateSnapshot = this.createEmptyTrainerState();

  // Enhanced reconnection with exponential backoff
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly MAX_RECONNECTION_ATTEMPTS = 8; // Increased from 5 for better reliability
  private readonly RECONNECTION_BACKOFF_BASE_MS = 1000; // Increased from 500ms to 1s
  private autoReconnectEnabled = false;

  private knownSensorRegistry = new KnownSensorRegistry();
  private sensorSetupResetVersion = 0;

  // State transition debouncing
  private stateTransitionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly STATE_TRANSITION_DEBOUNCE_MS = 500;

  // CSC parser state must be maintained per-device for delta-based cadence.
  private cscParserStates: Map<string, CscParserState> = new Map();

  constructor() {
    this.initialize();
    this.startConnectionMonitoring();
    // Load persisted sensors and attempt auto-reconnection
    this.knownSensorRegistry.load();
  }

  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private shouldDebugParsers(): boolean {
    const isDevRuntime = (globalThis as { __DEV__?: boolean }).__DEV__ === true;
    return isDevRuntime && SENSOR_PARSER_DEBUG.enabled;
  }

  private logParserDebug(label: string, rawBytes: Uint8Array, parsed: unknown) {
    if (!this.shouldDebugParsers()) {
      return;
    }

    console.log(`[SensorsManager][ParserDebug] ${label} raw=${this.toHex(rawBytes)}`);
    console.log(`[SensorsManager][ParserDebug] ${label} parsed=`, parsed);
  }

  private toBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  private createReading(
    metric: SensorReading["metric"],
    value: number,
    deviceId: string,
    source?: string,
    timestamp: number = Date.now(),
  ): SensorReading | null {
    return this.validateSensorReading({
      metric,
      dataType: "float",
      value,
      timestamp,
      metadata: source ? { deviceId, source } : { deviceId },
    });
  }

  /** Initialize BLE manager */
  private initialize() {
    this.bleManager.onStateChange((state) => {
      // Track BLE state for UI
      this.bleState = state;
      this.notifyBleStateChange();
      console.log(`[SensorsManager] BLE state changed: ${state}`);

      if (state === "PoweredOn") {
        console.log("BLE ready");
        // Attempt to reconnect to persisted sensors when BLE is ready
        if (
          this.autoReconnectEnabled &&
          this.knownSensorRegistry.initialized &&
          this.knownSensorRegistry.size > 0
        ) {
          console.log(
            `[SensorsManager] BLE powered on, attempting to reconnect ${this.knownSensorRegistry.size} persisted sensors`,
          );
          this.reconnectPersistedSensors();
        }
      }
      if (state === "PoweredOff" || state === "Unauthorized") {
        const bluetoothError = this.recordServiceError(
          state === "Unauthorized" ? "permission_error" : "bluetooth_unavailable",
          state === "Unauthorized"
            ? "Bluetooth permission unavailable"
            : "Bluetooth is powered off",
          {
            deviceId: this.trainerState.deviceId ?? undefined,
            recoverable: true,
          },
        );
        if (this.trainerState.deviceId) {
          this.clearControllableTrainer(this.trainerState.deviceId);
          this.updateTrainerState({
            connectionState: "disconnected",
            dataFlowState: "lost",
            controlState: "control_lost",
            lastServiceError: bluetoothError,
          });
        }
        console.log(`[SensorsManager] BLE ${state}, disconnecting all sensors`);
        this.disconnectAll();
      }
    }, true);
  }

  /**
   * Transition sensor connection state with validation and debouncing
   * Prevents rapid state changes and ensures valid state transitions
   */
  private transitionSensorState(
    sensor: ConnectedSensor,
    targetState: SensorConnectionState,
    immediate: boolean = false,
  ): void {
    if (sensor.connectionState === targetState) {
      return;
    }

    // Check if transition is valid
    const currentState = sensor.connectionState;
    const validTransitions = VALID_STATE_TRANSITIONS[currentState];

    if (!validTransitions.includes(targetState)) {
      console.warn(
        `[SensorsManager] Invalid state transition for ${sensor.name}: ${currentState} -> ${targetState}`,
      );
      return;
    }

    // Check if a transition is already in progress
    if (sensor.stateTransitionInProgress && !immediate) {
      console.log(
        `[SensorsManager] State transition already in progress for ${sensor.name}, queuing ${targetState}`,
      );
      sensor.pendingStateTransition = {
        targetState,
        timestamp: Date.now(),
      };
      return;
    }

    // Apply immediate transition (no debounce)
    if (immediate) {
      this.applyStateTransition(sensor, targetState);
      return;
    }

    // Debounce state transitions to prevent flicker
    const existingTimer = this.stateTransitionTimers.get(sensor.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    sensor.stateTransitionInProgress = true;

    const timer = setTimeout(() => {
      this.applyStateTransition(sensor, targetState);
      this.stateTransitionTimers.delete(sensor.id);

      // Process any pending transitions
      if (sensor.pendingStateTransition) {
        const pending = sensor.pendingStateTransition;
        sensor.pendingStateTransition = undefined;

        // Only apply if still recent (within 2 seconds)
        if (Date.now() - pending.timestamp < 2000) {
          this.transitionSensorState(sensor, pending.targetState, false);
        }
      }
    }, this.STATE_TRANSITION_DEBOUNCE_MS);

    this.stateTransitionTimers.set(sensor.id, timer);
  }

  /**
   * Apply state transition and notify listeners
   */
  private applyStateTransition(sensor: ConnectedSensor, targetState: SensorConnectionState): void {
    const previousState = sensor.connectionState;
    sensor.connectionState = targetState;
    sensor.stateTransitionInProgress = false;

    console.log(
      `[SensorsManager] ${sensor.name} state transition: ${previousState} -> ${targetState}`,
    );

    // Notify connection callbacks
    this.notifyConnectionChange(sensor);
  }

  private notifyConnectionChange(sensor: ConnectedSensor): void {
    this.connectionCallbacks.forEach((cb) => {
      try {
        cb(sensor);
      } catch (error) {
        console.error("[SensorsManager] Connection callback failed:", error);
      }
    });
  }

  private notifyBleStateChange(): void {
    this.bleStateCallbacks.forEach((cb) => {
      try {
        cb(this.bleState);
      } catch (error) {
        console.error("[SensorsManager] BLE state callback failed:", error);
      }
    });
  }

  private createEmptyTrainerState(): TrainerStateSnapshot {
    return {
      deviceId: null,
      deviceName: null,
      connectionState: "idle",
      dataFlowState: "unknown",
      controlState: "not_applicable",
      lastServiceError: null,
    };
  }

  private updateTrainerState(update: Partial<TrainerStateSnapshot>): void {
    this.trainerState = {
      ...this.trainerState,
      ...update,
    };
  }

  private clearControllableTrainer(deviceId?: string): void {
    const sensorIds = deviceId ? [deviceId] : Array.from(this.ftmsControllers.keys());
    for (const sensorId of sensorIds) {
      const sensor = this.connectedSensors.get(sensorId);
      if (sensor) {
        sensor.isControllable = false;
        sensor.ftmsController = undefined;
        sensor.currentControlMode = undefined;
      }
      this.ftmsControllers.get(sensorId)?.dispose();
      this.ftmsControllers.delete(sensorId);
      this.ftmsCandidates.delete(sensorId);
      if (this.selectedFtmsDeviceId === sensorId) {
        this.selectedFtmsDeviceId = undefined;
      }
    }
  }

  private addMonitorSubscription(deviceId: string, subscription: { remove: () => void }): void {
    const subscriptions = this.monitorSubscriptions.get(deviceId) ?? [];
    subscriptions.push(subscription);
    this.monitorSubscriptions.set(deviceId, subscriptions);
  }

  private clearDeviceGattRuntime(deviceId: string, reason: string): void {
    const subscriptions = this.monitorSubscriptions.get(deviceId) ?? [];
    for (const subscription of subscriptions) {
      try {
        subscription.remove();
      } catch {
        // Best-effort cleanup; disconnect/reset should continue even if a subscription is stale.
      }
    }
    this.monitorSubscriptions.delete(deviceId);
    this.ftmsControllers.get(deviceId)?.dispose();
    this.ftmsControllers.delete(deviceId);
    this.ftmsCandidates.delete(deviceId);
    if (this.selectedFtmsDeviceId === deviceId) {
      this.selectedFtmsDeviceId = undefined;
    }
    this.gattQueues.cancelDevice(deviceId, reason);
  }

  private recordServiceError(
    category: RecordingServiceErrorCategory,
    message: string,
    options?: {
      deviceId?: string;
      recoverable?: boolean;
    },
  ): RecordingServiceError {
    const error: RecordingServiceError = {
      category,
      message,
      recordedAt: Date.now(),
      deviceId: options?.deviceId,
      recoverable: options?.recoverable ?? true,
    };

    if (options?.deviceId) {
      const sensor = this.connectedSensors.get(options.deviceId);
      if (sensor) {
        sensor.lastServiceError = error;
      }

      if (this.trainerState.deviceId === options.deviceId) {
        this.updateTrainerState({ lastServiceError: error });
      }
    }

    return error;
  }

  private clearServiceError(deviceId?: string): void {
    if (deviceId) {
      const sensor = this.connectedSensors.get(deviceId);
      if (sensor) {
        sensor.lastServiceError = undefined;
      }

      if (this.trainerState.deviceId === deviceId) {
        this.updateTrainerState({ lastServiceError: null });
      }
      return;
    }

    this.updateTrainerState({ lastServiceError: null });
  }

  /**
   * Attempt to reconnect all persisted sensors
   * Called on BLE power on or app initialization
   */
  private async reconnectPersistedSensors(): Promise<void> {
    console.log(
      `[SensorsManager] Attempting to reconnect ${this.knownSensorRegistry.size} persisted sensors`,
    );

    for (const [id, sensorData] of this.knownSensorRegistry.entries()) {
      if (this.knownSensorRegistry.isAutoReconnectSuppressed(id)) {
        console.log(
          `[SensorsManager] Skipping auto-reconnect for manually disconnected sensor: ${sensorData.name}`,
        );
        continue;
      }

      // Skip if already connected
      const existing = this.connectedSensors.get(id);
      if (existing && existing.connectionState === "connected") {
        console.log(`[SensorsManager] Sensor ${sensorData.name} already connected, skipping`);
        continue;
      }

      console.log(`[SensorsManager] Attempting to reconnect persisted sensor: ${sensorData.name}`);

      // Attempt connection without blocking
      this.connectSensor(id).catch((error) => {
        console.log(
          `[SensorsManager] Failed to reconnect ${sensorData.name}:`,
          error.message || error,
        );
      });
    }
  }

  /**
   * Get current BLE state
   * Used by UI to display BLE status and errors
   */
  getBleState(): string {
    return this.bleState;
  }

  subscribeBleState(cb: (state: string) => void): () => void {
    this.bleStateCallbacks.add(cb);
    cb(this.bleState);
    return () => {
      this.bleStateCallbacks.delete(cb);
    };
  }

  /**
   * Clear all persisted sensors
   * Useful for "reset" functionality or when user wants to forget all devices
   * Does NOT disconnect currently connected sensors
   */
  async clearPersistedSensors(): Promise<void> {
    console.log(`[SensorsManager] Clearing ${this.knownSensorRegistry.size} persisted sensors`);
    await this.knownSensorRegistry.clear();
  }

  /**
   * Clear persisted sensors and disconnect all
   * Complete reset of sensor connections
   */
  async resetAllSensors(): Promise<void> {
    console.log("[SensorsManager] Resetting all sensors");
    this.sensorSetupResetVersion += 1;
    this.stopScan();
    this.cancelReconnectionAttempts();
    await this.disconnectAll({ forgetPersisted: true, suppressAutoReconnect: true });
    await this.clearPersistedSensors();
    this.clearControllableTrainer();
    this.trainerState = this.createEmptyTrainerState();
  }

  /**
   * Public method to get list of persisted sensors (for UI display)
   */
  public getPersistedSensors(): PersistedSensor[] {
    return this.knownSensorRegistry.getAll();
  }

  public subscribePersistedSensors(cb: (sensors: PersistedSensor[]) => void): () => void {
    return this.knownSensorRegistry.subscribe(cb);
  }

  public setAutoReconnectEnabled(enabled: boolean): void {
    if (this.autoReconnectEnabled === enabled) {
      return;
    }

    this.autoReconnectEnabled = enabled;

    if (!enabled) {
      this.cancelReconnectionAttempts();
    }
  }

  /** Start monitoring sensor connection health */
  private startConnectionMonitoring() {
    if (this.connectionMonitorTimer) {
      return;
    }

    this.connectionMonitorTimer = setInterval(() => {
      this.checkSensorHealth();
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /** Stop monitoring sensor connections */
  private stopConnectionMonitoring() {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer);
      this.connectionMonitorTimer = undefined;
    }
  }

  /** Check health of all connected sensors */
  private async checkSensorHealth() {
    if (!this.autoReconnectEnabled) {
      return;
    }

    const now = Date.now();
    const sensors = Array.from(this.connectedSensors.values());

    for (const sensor of sensors) {
      // Skip if not in a state that needs checking
      if (sensor.connectionState === "connecting" || sensor.connectionState === "failed") {
        continue;
      }

      // Check if sensor has gone silent
      if (sensor.lastDataTimestamp) {
        const timeSinceLastData = now - sensor.lastDataTimestamp;

        if (
          timeSinceLastData > this.DISCONNECT_TIMEOUT_MS &&
          sensor.connectionState === "connected" &&
          !this.reconnectionAttempts.has(sensor.id) // Check if reconnection in progress
        ) {
          console.log(
            `[SensorsManager] Sensor ${sensor.name} disconnected (no data for ${timeSinceLastData}ms)`,
          );
          this.transitionSensorState(sensor, "disconnected", true);
          if (this.trainerState.deviceId === sensor.id) {
            this.clearControllableTrainer(sensor.id);
            this.updateTrainerState({
              connectionState: "disconnected",
              dataFlowState: "lost",
              controlState: "control_lost",
            });
          }

          // Start reconnection with exponential backoff
          await this.attemptReconnection(sensor.id, 1);
        }
      }
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   * @param sensorId - Sensor to reconnect
   * @param attempt - Current attempt number (1-indexed)
   */
  private async attemptReconnection(sensorId: string, attempt: number = 1): Promise<void> {
    if (!this.autoReconnectEnabled) {
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    if (this.knownSensorRegistry.isAutoReconnectSuppressed(sensorId)) {
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    const sensor = this.connectedSensors.get(sensorId);
    if (!sensor) {
      console.warn(`[SensorsManager] Sensor ${sensorId} not found for reconnection`);
      return;
    }

    // Check if max attempts reached
    if (attempt > this.MAX_RECONNECTION_ATTEMPTS) {
      console.warn(
        `[SensorsManager] Max reconnection attempts (${this.MAX_RECONNECTION_ATTEMPTS}) reached for ${sensor.name}`,
      );
      this.transitionSensorState(sensor, "failed", true);
      const reconnectError = this.recordServiceError(
        "reconnect_exhausted",
        `Reconnect exhausted for ${sensor.name}`,
        {
          deviceId: sensor.id,
          recoverable: true,
        },
      );
      if (this.trainerState.deviceId === sensor.id) {
        this.clearControllableTrainer(sensor.id);
        this.updateTrainerState({
          connectionState: "failed",
          dataFlowState: "lost",
          controlState: "failed",
          lastServiceError: reconnectError,
        });
      }
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    // Update state
    this.transitionSensorState(sensor, "reconnecting", true);
    this.reconnectionAttempts.set(sensorId, attempt);
    if (this.trainerState.deviceId === sensorId) {
      this.updateTrainerState({
        connectionState: "reconnecting",
        dataFlowState: "waiting_for_data",
        controlState:
          this.trainerState.controlState === "controllable" ||
          this.trainerState.controlState === "control_lost"
            ? "recovering_control"
            : this.trainerState.controlState,
      });
    }

    console.log(
      `[SensorsManager] Reconnection attempt ${attempt}/${this.MAX_RECONNECTION_ATTEMPTS} for ${sensor.name}`,
    );

    try {
      const reconnected = await this.connectSensor(sensorId);

      if (reconnected) {
        console.log(`[SensorsManager] Successfully reconnected to ${sensor.name}`);
        this.reconnectionAttempts.delete(sensorId);
        return;
      }

      console.log(
        `[SensorsManager] Reconnection attempt ${attempt} did not restore ${sensor.name}`,
      );
      this.scheduleReconnectionAttempt(sensorId, attempt + 1);
    } catch (error) {
      console.warn(
        `[SensorsManager] Reconnection attempt ${attempt} failed for ${sensor.name}:`,
        error,
      );

      this.scheduleReconnectionAttempt(sensorId, attempt + 1);
    }
  }

  private scheduleReconnectionAttempt(sensorId: string, nextAttempt: number): void {
    if (!this.autoReconnectEnabled) {
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    if (this.knownSensorRegistry.isAutoReconnectSuppressed(sensorId)) {
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    const existingTimer = this.reconnectionTimers.get(sensorId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delayMs = this.RECONNECTION_BACKOFF_BASE_MS * 2 ** (nextAttempt - 2);
    console.log(`[SensorsManager] Retrying in ${delayMs}ms...`);

    const timer = setTimeout(() => {
      this.reconnectionTimers.delete(sensorId);
      this.attemptReconnection(sensorId, nextAttempt);
    }, delayMs);

    this.reconnectionTimers.set(sensorId, timer);
  }

  /**
   * Cancel all ongoing reconnection attempts
   * @param sensorId - Optional specific sensor to cancel, otherwise cancels all
   */
  private cancelReconnectionAttempts(sensorId?: string): void {
    if (sensorId) {
      const timer = this.reconnectionTimers.get(sensorId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectionTimers.delete(sensorId);
      }
      this.reconnectionAttempts.delete(sensorId);
    } else {
      // Cancel all
      for (const timer of this.reconnectionTimers.values()) {
        clearTimeout(timer);
      }
      this.reconnectionTimers.clear();
      this.reconnectionAttempts.clear();
    }
  }

  /** Update sensor's last data timestamp */
  private updateSensorDataTimestamp(deviceId: string) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor) {
      sensor.lastDataTimestamp = Date.now();
      if (this.trainerState.deviceId === deviceId) {
        this.updateTrainerState({
          connectionState: "connected",
          dataFlowState: "flowing",
        });
      }

      // If sensor was marked as disconnected but is sending data, update state
      if (sensor.connectionState === "disconnected") {
        this.transitionSensorState(sensor, "connected", true);
        // Cancel any ongoing reconnection attempts since sensor is back
        this.cancelReconnectionAttempts(deviceId);
      }
    }
  }

  private markObservedMetric(deviceId: string, metric: SensorReading["metric"]): void {
    const sensor = this.connectedSensors.get(deviceId);
    if (!sensor) return;

    sensor.observedMetrics ??= new Set();
    sensor.observedMetrics.add(metric);
  }

  subscribeScan(callback: (device: Device) => void): () => void {
    return this.scanController.subscribe(callback);
  }

  async startScan(timeoutMs = 10000): Promise<void> {
    return this.scanController.start(timeoutMs);
  }

  stopScan(): void {
    this.scanController.stop();
  }

  /** Connect to a device with auto-reconnect support */
  async connectSensor(deviceId: string): Promise<ConnectedSensor | null> {
    const resetVersionAtStart = this.sensorSetupResetVersion;

    try {
      this.clearDeviceGattRuntime(deviceId, "Preparing device connection");
      await this.knownSensorRegistry.setAutoReconnectSuppressed(deviceId, false);

      // Update state to connecting
      let sensor = this.connectedSensors.get(deviceId);
      const isReconnect = this.reconnectionAttempts.has(deviceId);
      if (sensor) {
        this.transitionSensorState(sensor, isReconnect ? "reconnecting" : "connecting", true);
      } else {
        const persistedSensor = this.knownSensorRegistry.get(deviceId);
        sensor = {
          id: deviceId,
          name: persistedSensor?.name ?? "Unknown",
          connectionState: isReconnect ? "reconnecting" : "connecting",
        } as ConnectedSensor;
        this.connectedSensors.set(deviceId, sensor);
        // Note: new sensors start in "connecting" state, no transition needed
        this.notifyConnectionChange(sensor);
      }

      if (this.trainerState.deviceId === deviceId) {
        this.updateTrainerState({
          deviceId,
          deviceName: sensor.name,
          connectionState: isReconnect ? "reconnecting" : "connecting",
          dataFlowState: "waiting_for_data",
          controlState:
            this.trainerState.controlState === "controllable" ||
            this.trainerState.controlState === "control_lost"
              ? "recovering_control"
              : this.trainerState.controlState,
        });
      }

      const device = await this.gattQueues.enqueue(
        deviceId,
        "connect",
        () =>
          this.bleManager.connectToDevice(deviceId, {
            timeout: 10000,
          }),
        { timeoutMs: 15000 },
      );

      if (resetVersionAtStart !== this.sensorSetupResetVersion) {
        await this.gattQueues
          .enqueue(device.id, "cancel-stale-connection", () => device.cancelConnection(), {
            timeoutMs: 5000,
          })
          .catch(() => undefined);
        return null;
      }

      const discovered = await this.gattQueues.enqueue(
        device.id,
        "discover-services-and-characteristics",
        () => device.discoverAllServicesAndCharacteristics(),
        { timeoutMs: 15000 },
      );
      const services = await this.gattQueues.enqueue(
        device.id,
        "list-services",
        () => discovered.services(),
        { timeoutMs: 5000 },
      );

      const characteristics = new Map<string, string>();
      for (const service of services) {
        const chars = await this.gattQueues.enqueue(
          device.id,
          `list-characteristics:${service.uuid}`,
          () => service.characteristics(),
          { timeoutMs: 5000 },
        );
        chars.forEach((c) => characteristics.set(c.uuid.toLowerCase(), service.uuid));
      }

      const connectedSensor: ConnectedSensor = {
        id: device.id,
        name: device.name || "Unknown Device",
        services: services.map((s) => s.uuid),
        device: discovered,
        connectionState: "connected",
        characteristics,
      };

      this.connectedSensors.set(device.id, connectedSensor);
      this.clearServiceError(device.id);
      this.cscParserStates.delete(device.id);
      await this.monitorKnownCharacteristics(connectedSensor);

      // Check if device supports FTMS control
      const hasFTMS = services.some((s) => s.uuid.toLowerCase().includes("1826"));

      if (hasFTMS) {
        console.log(`[SensorsManager] Detected FTMS trainer: ${connectedSensor.name}`);
        connectedSensor.isTrainer = true;
        this.updateTrainerState({
          deviceId: connectedSensor.id,
          deviceName: connectedSensor.name,
          connectionState: "connected",
          dataFlowState: "waiting_for_data",
          controlState: "eligible",
          lastServiceError: null,
        });

        // FTMS metric streams do not require trainer control. Subscribe before
        // requesting control so metrics continue even when control is rejected.
        await this.monitorFTMSStreams(connectedSensor);
        await this.setupFTMSRuntime(connectedSensor);
      }

      // Enhanced disconnect handler with reconnection
      device.onDisconnected((error) => {
        console.log("Disconnected:", device.name, error?.message || "");

        if (connectedSensor.connectionState === "disconnecting") {
          this.transitionSensorState(connectedSensor, "disconnected", true);
          connectedSensor.lastDataTimestamp = undefined;
          this.clearDeviceGattRuntime(connectedSensor.id, "Device disconnected");
          return;
        }

        this.transitionSensorState(connectedSensor, "disconnected", true);
        connectedSensor.lastDataTimestamp = undefined;
        this.clearDeviceGattRuntime(connectedSensor.id, "Device disconnected");
        if (this.trainerState.deviceId === connectedSensor.id) {
          this.clearControllableTrainer(connectedSensor.id);
          this.updateTrainerState({
            connectionState: "disconnected",
            dataFlowState: "lost",
            controlState: "control_lost",
          });
        }
        if (!this.reconnectionAttempts.has(connectedSensor.id)) {
          void this.attemptReconnection(connectedSensor.id, 1);
        }
      });

      console.log(`Connected to ${connectedSensor.name} with ${services.length} services`);

      // Persist sensor for auto-reconnection in future sessions
      await this.knownSensorRegistry.add(connectedSensor);

      this.notifyConnectionChange(connectedSensor);
      return connectedSensor;
    } catch (err) {
      console.warn("Connect error", err);

      const existingSensor = this.connectedSensors.get(deviceId);
      if (existingSensor) {
        this.transitionSensorState(existingSensor, "failed", true);
      }

      const connectError = this.recordServiceError(
        "device_connect_error",
        err instanceof Error ? err.message : "Failed to connect to device",
        {
          deviceId,
          recoverable: true,
        },
      );

      if (this.trainerState.deviceId === deviceId) {
        this.clearControllableTrainer(deviceId);
        this.updateTrainerState({
          connectionState: "failed",
          dataFlowState: "lost",
          controlState: "failed",
          lastServiceError: connectError,
        });
      }

      return null;
    }
  }

  /** Public method to reconnect all sensors (to be called on AppState "active") */
  public async reconnectAll(): Promise<void> {
    if (!this.autoReconnectEnabled) {
      return;
    }

    const knownSensorIds = new Set<string>([
      ...this.connectedSensors.keys(),
      ...this.knownSensorRegistry.getAll().map((sensor) => sensor.id),
    ]);

    for (const sensorId of knownSensorIds) {
      const sensor = this.connectedSensors.get(sensorId);
      const persistedSensor = this.knownSensorRegistry.get(sensorId);

      if (
        sensor?.connectionState === "connected" ||
        this.reconnectionAttempts.has(sensorId) ||
        this.knownSensorRegistry.isAutoReconnectSuppressed(sensorId)
      ) {
        continue;
      }

      console.log(
        `[SensorsManager] Reconnecting ${sensor?.name || persistedSensor?.name || sensorId} on app foreground`,
      );

      if (sensor) {
        await this.attemptReconnection(sensorId, 1);
      } else {
        await this.connectSensor(sensorId);
      }
    }
  }

  /** Disconnect a device */
  async disconnectSensor(
    deviceId: string,
    options?: { forgetPersisted?: boolean; suppressAutoReconnect?: boolean },
  ) {
    const shouldForgetPersisted = options?.forgetPersisted ?? false;
    const shouldSuppressAutoReconnect = options?.suppressAutoReconnect ?? !shouldForgetPersisted;
    await this.knownSensorRegistry.setAutoReconnectSuppressed(
      deviceId,
      shouldSuppressAutoReconnect,
    );

    // Cancel any ongoing reconnection attempts
    this.cancelReconnectionAttempts(deviceId);

    const sensor = this.connectedSensors.get(deviceId);
    if (!sensor) {
      console.log(`[SensorsManager] Sensor ${deviceId} not found for disconnection`);
      return;
    }

    console.log(`[SensorsManager] Disconnecting sensor: ${sensor.name}`);

    // Update connection state and notify callbacks first
    this.transitionSensorState(sensor, "disconnecting", true);
    if (this.trainerState.deviceId === deviceId) {
      this.clearControllableTrainer(deviceId);
      this.updateTrainerState({
        connectionState: "disconnecting",
        dataFlowState: "lost",
        controlState: "not_applicable",
      });
    }

    // Cancel BLE connection if device exists
    if (sensor.device) {
      try {
        await this.gattQueues.enqueue(
          deviceId,
          "disconnect",
          () => sensor.device.cancelConnection(),
          {
            timeoutMs: 5000,
          },
        );
        console.log(`Successfully disconnected from ${sensor.name}`);
      } catch (error) {
        console.error(`Error disconnecting from ${sensor.name}:`, error);
      }
    }

    this.transitionSensorState(sensor, "disconnected", true);

    // Remove from connected sensors map
    this.connectedSensors.delete(deviceId);
    this.cscParserStates.delete(deviceId);
    this.clearDeviceGattRuntime(deviceId, "Sensor disconnected");

    // Disconnect preserves known-device memory unless explicitly forgotten.
    if (shouldForgetPersisted) {
      console.log(
        `[SensorsManager] Removing ${sensor.name} from persisted sensors (manual disconnect)`,
      );
      await this.knownSensorRegistry.remove(deviceId);
    }

    if (this.trainerState.deviceId === deviceId) {
      if (shouldForgetPersisted) {
        this.trainerState = this.createEmptyTrainerState();
      } else {
        this.updateTrainerState({
          connectionState: "disconnected",
          dataFlowState: "lost",
          controlState: "not_applicable",
        });
      }
    }
  }

  async forgetSensor(deviceId: string): Promise<void> {
    if (this.connectedSensors.has(deviceId)) {
      await this.disconnectSensor(deviceId, { forgetPersisted: true });
      return;
    }

    await this.knownSensorRegistry.remove(deviceId);
    this.clearDeviceGattRuntime(deviceId, "Sensor forgotten");
  }

  /** Disconnect all devices */
  async disconnectAll(
    options: { forgetPersisted?: boolean; suppressAutoReconnect?: boolean } = {
      forgetPersisted: false,
      suppressAutoReconnect: false,
    },
  ) {
    // Cancel all ongoing reconnection attempts
    this.cancelReconnectionAttempts();

    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) => this.disconnectSensor(id, options)),
    );
    this.cscParserStates.clear();
    this.clearControllableTrainer();
  }

  /**
   * Setup FTMS runtime discovery for a trainer without requesting control.
   */
  private async setupFTMSRuntime(sensor: ConnectedSensor): Promise<void> {
    try {
      const controller = new FTMSController(sensor.device, this.gattQueues);

      // Read features to determine capabilities
      const features = await controller.readFeatures();
      const supportsControl = this.featuresSupportControl(features);

      sensor.isControllable = supportsControl;
      sensor.ftmsController = controller;
      sensor.ftmsFeatures = features;
      const machineTypeDetection = detectFtmsMachineType({
        characteristicUuids: Array.from(sensor.characteristics.keys()),
        features,
      });
      this.ftmsControllers.set(sensor.id, controller);
      this.ftmsCandidates.set(sensor.id, {
        deviceId: sensor.id,
        deviceName: sensor.name,
        controlState: supportsControl ? "eligible" : "not_applicable",
        features,
        machineType: machineTypeDetection.machineType,
        machineTypeSource: machineTypeDetection.source,
        supportsControl,
      });
      if (supportsControl && !this.selectedFtmsDeviceId) {
        this.selectedFtmsDeviceId = sensor.id;
      }
      this.clearServiceError(sensor.id);
      this.updateTrainerState({
        deviceId: sensor.id,
        deviceName: sensor.name,
        connectionState: "connected",
        dataFlowState: sensor.lastDataTimestamp ? "flowing" : "waiting_for_data",
        controlState: supportsControl ? "eligible" : "not_applicable",
        lastServiceError: null,
      });

      console.log("[SensorsManager] FTMS runtime setup successful");
      console.log("[SensorsManager] Capabilities:", features);
      this.notifyConnectionChange(sensor);
    } catch (error) {
      console.error("[SensorsManager] FTMS setup failed:", error);
      sensor.isControllable = false;
      sensor.ftmsController = undefined;
      this.clearControllableTrainer(sensor.id);
      const setupError = this.recordServiceError(
        "ftms_control_request_error",
        error instanceof Error ? error.message : `FTMS control setup failed for ${sensor.name}`,
        {
          deviceId: sensor.id,
          recoverable: true,
        },
      );
      this.updateTrainerState({
        deviceId: sensor.id,
        deviceName: sensor.name,
        connectionState: "connected",
        dataFlowState: sensor.lastDataTimestamp ? "flowing" : "waiting_for_data",
        controlState: "failed",
        lastServiceError: setupError,
      });
      this.notifyConnectionChange(sensor);
    }
  }

  private featuresSupportControl(features: FTMSFeatures): boolean {
    return Boolean(
      features.powerTargetSettingSupported ||
        features.speedTargetSettingSupported ||
        features.inclinationTargetSettingSupported ||
        features.resistanceTargetSettingSupported ||
        features.heartRateTargetSettingSupported ||
        features.indoorBikeSimulationSupported ||
        features.targetedCadenceSupported ||
        features.targetedDistanceSupported ||
        features.targetedExpendedEnergySupported ||
        features.targetedTrainingTimeSupported ||
        features.wheelCircumferenceSupported ||
        features.spinDownControlSupported,
    );
  }

  /** Subscribe to sensor readings */
  subscribe(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  /** Subscribe to connection state changes */
  subscribeConnection(cb: (sensor: ConnectedSensor) => void) {
    this.connectionCallbacks.add(cb);
    return () => this.connectionCallbacks.delete(cb);
  }

  getConnectedSensors(): ConnectedSensor[] {
    // Only return sensors that are fully connected, not in "connecting" state
    return Array.from(this.connectedSensors.values()).filter(
      (sensor) => sensor.connectionState === "connected",
    );
  }

  getTrainerState(): TrainerStateSnapshot {
    return { ...this.trainerState };
  }

  /** Monitor known characteristics */
  private async monitorKnownCharacteristics(sensor: ConnectedSensor) {
    for (const [charUuid, serviceUuid] of sensor.characteristics) {
      const parser = BleCharacteristicParsers[charUuid.toLowerCase()];
      if (parser?.purpose !== "activity_metric") continue;

      const metricType = parser.metricType;
      if (!metricType) continue;

      const service = (
        await this.gattQueues.enqueue(
          sensor.id,
          `services:${serviceUuid}`,
          () => sensor.device.services(),
          {
            timeoutMs: 5000,
          },
        )
      ).find((s) => s.uuid === serviceUuid);
      if (!service) continue;

      const characteristic = (
        await this.gattQueues.enqueue(
          sensor.id,
          `characteristics:${serviceUuid}`,
          () => service.characteristics(),
          { timeoutMs: 5000 },
        )
      ).find((c) => c.uuid === charUuid);
      if (!characteristic) continue;

      let retries = 0;
      const maxRetries = 2;

      const monitorCallback = (error: BleError | null, char: Characteristic | null) => {
        // Check if sensor is still in the connected sensors map
        // If not, it was disconnected intentionally - stop monitoring
        const stillConnected = this.connectedSensors.has(sensor.id);
        if (!stillConnected) {
          return;
        }

        if (error) {
          // Only log and retry if sensor is still connected
          if (sensor.connectionState === "connected") {
            console.warn(`Error monitoring ${metricType}:`, error);
            if (retries < maxRetries) {
              retries++;
              console.log(`Retrying monitor for ${metricType} (${retries}/${maxRetries})`);
              void this.gattQueues
                .enqueue(
                  sensor.id,
                  `monitor-retry:${metricType}:${charUuid}`,
                  async () => characteristic.monitor(monitorCallback),
                  { timeoutMs: 5000 },
                )
                .then((subscription) => this.addMonitorSubscription(sensor.id, subscription))
                .catch((retryError) => {
                  console.warn(`Retry monitor failed for ${metricType}:`, retryError);
                });
            }
          }
          return;
        }

        if (!char?.value) return;

        const rawBytes = decodeBase64ToBytes(char.value);
        const readings = this.parseBleReadings(metricType, rawBytes, sensor.id);
        if (readings.length > 0) {
          // Update sensor health timestamp
          this.updateSensorDataTimestamp(sensor.id);
          readings.forEach((reading) => {
            this.markObservedMetric(sensor.id, reading.metric);
            this.dataCallbacks.forEach((cb) => cb(reading));
          });
        }
      };

      const subscription = await this.gattQueues.enqueue(
        sensor.id,
        `monitor:${metricType}:${charUuid}`,
        async () => characteristic.monitor(monitorCallback),
        { timeoutMs: 5000 },
      );
      this.addMonitorSubscription(sensor.id, subscription);
    }

    // Monitor battery service if available
    await this.monitorBatteryService(sensor);
  }

  /**
   * Monitor Battery Service (BAS - 0x180F)
   * https://www.bluetooth.com/specifications/specs/battery-service-1-0/
   */
  private async monitorBatteryService(sensor: ConnectedSensor): Promise<void> {
    const batteryServiceUuid = "0000180f-0000-1000-8000-00805f9b34fb";
    const batteryLevelCharUuid = "00002a19-0000-1000-8000-00805f9b34fb";

    if (!sensor.characteristics.has(batteryLevelCharUuid.toLowerCase())) {
      console.log(`[SensorsManager] ${sensor.name} does not support Battery Service`);
      return;
    }

    console.log(`[SensorsManager] Monitoring battery for ${sensor.name}`);

    try {
      const service = (
        await this.gattQueues.enqueue(
          sensor.id,
          "battery:list-services",
          () => sensor.device.services(),
          {
            timeoutMs: 5000,
          },
        )
      ).find((s) => s.uuid.toLowerCase() === batteryServiceUuid.toLowerCase());

      if (!service) {
        console.warn(`[SensorsManager] Battery service not found for ${sensor.name}`);
        return;
      }

      const characteristic = (
        await this.gattQueues.enqueue(
          sensor.id,
          "battery:list-characteristics",
          () => service.characteristics(),
          { timeoutMs: 5000 },
        )
      ).find((c) => c.uuid.toLowerCase() === batteryLevelCharUuid.toLowerCase());

      if (!characteristic) {
        console.warn(`[SensorsManager] Battery level characteristic not found`);
        return;
      }

      // Read initial battery level
      const initialValue = await this.gattQueues.enqueue(
        sensor.id,
        "battery:read-level",
        () => characteristic.read(),
        { timeoutMs: 5000 },
      );
      if (initialValue?.value) {
        const bytes = decodeBase64ToBytes(initialValue.value);
        const batteryLevel = bytes[0];
        console.log(`[SensorsManager] Initial battery level for ${sensor.name}: ${batteryLevel}%`);
        this.handleBatteryUpdate(sensor.id, sensor.name, batteryLevel);
      }

      // Monitor for changes (some devices support notifications)
      const subscription = await this.gattQueues.enqueue(
        sensor.id,
        "battery:monitor-level",
        async () =>
          characteristic.monitor((error, char) => {
            if (error) {
              // Battery monitoring errors are non-critical - sensor will continue to work
              // Only log as debug info, don't treat as error
              console.log(
                `[SensorsManager] Battery monitoring error for ${sensor.name} (non-critical):`,
                error.message || error,
              );
              return;
            }

            if (!char?.value) return;

            const bytes = decodeBase64ToBytes(char.value);
            const batteryLevel = bytes[0];

            console.log(`[SensorsManager] Battery level for ${sensor.name}: ${batteryLevel}%`);
            this.handleBatteryUpdate(sensor.id, sensor.name, batteryLevel);
          }),
        { timeoutMs: 5000 },
      );
      this.addMonitorSubscription(sensor.id, subscription);
    } catch (_error) {
      // Battery monitoring errors are non-critical - sensor continues to provide data
      // Log as info rather than error to avoid alerting error tracking systems
      console.log(
        `[SensorsManager] Battery monitoring unavailable for ${sensor.name} (non-critical)`,
      );
    }
  }

  /**
   * Handle battery level updates
   * @param sensorId - Sensor device ID
   * @param sensorName - Sensor name for display
   * @param level - Battery level (0-100)
   */
  private handleBatteryUpdate(sensorId: string, sensorName: string, level: number): void {
    // Store battery level in sensor metadata
    const sensor = this.connectedSensors.get(sensorId);
    if (sensor) {
      sensor.batteryLevel = level;
      this.notifyConnectionChange(sensor);
    }

    // Log warnings for low battery (no user-facing notifications)
    if (level <= 20 && level > 10) {
      console.warn(`[SensorsManager] Low battery warning: ${sensorName} at ${level}%`);
    } else if (level <= 10) {
      console.error(`[SensorsManager] Critical battery: ${sensorName} at ${level}%`);
    }
  }

  /** Subscribe to all present FTMS data/status streams known by the registry. */
  private async monitorFTMSStreams(sensor: ConnectedSensor): Promise<void> {
    const presentDefinitions = listFtmsParserDefinitions().filter((definition) =>
      sensor.characteristics.has(definition.uuid.toLowerCase()),
    );

    if (presentDefinitions.length === 0) {
      console.log(`[SensorsManager] ${sensor.name} does not provide supported FTMS streams`);
      return;
    }

    try {
      const service = (
        await this.gattQueues.enqueue(
          sensor.id,
          "ftms:list-services",
          () => sensor.device.services(),
          {
            timeoutMs: 5000,
          },
        )
      ).find((s) => s.uuid.toLowerCase() === BLE_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase());

      if (!service) {
        console.warn(`[SensorsManager] Fitness Machine service not found for ${sensor.name}`);
        return;
      }

      const characteristics = await this.gattQueues.enqueue(
        sensor.id,
        "ftms:list-characteristics",
        () => service.characteristics(),
        { timeoutMs: 5000 },
      );

      for (const definition of presentDefinitions) {
        const characteristic = characteristics.find(
          (c) => c.uuid.toLowerCase() === definition.uuid.toLowerCase(),
        );
        if (!characteristic) {
          console.warn(`[SensorsManager] ${definition.name} characteristic not found`);
          continue;
        }

        console.log(`[SensorsManager] Monitoring ${definition.name} for ${sensor.name}`);
        const subscription = await this.gattQueues.enqueue(
          sensor.id,
          `ftms:monitor:${definition.uuid.toLowerCase()}`,
          async () => characteristic.monitor(this.createFtmsMonitorCallback(sensor, definition)),
          { timeoutMs: 5000 },
        );
        this.addMonitorSubscription(sensor.id, subscription);
      }
    } catch (error) {
      console.error(`[SensorsManager] Failed to monitor FTMS streams for ${sensor.name}:`, error);
      const subscriptionError = this.recordServiceError(
        "measurement_subscription_error",
        error instanceof Error
          ? error.message
          : `Failed to monitor FTMS streams for ${sensor.name}`,
        {
          deviceId: sensor.id,
          recoverable: true,
        },
      );
      this.updateTrainerState({
        dataFlowState: "lost",
        lastServiceError: subscriptionError,
      });
      this.notifyConnectionChange(sensor);
    }
  }

  private createFtmsMonitorCallback(sensor: ConnectedSensor, definition: FtmsParserDefinition) {
    return (error: BleError | null, char: Characteristic | null) => {
      if (!this.connectedSensors.has(sensor.id)) {
        return;
      }

      if (error) {
        console.warn(
          `[SensorsManager] ${definition.name} monitoring error for ${sensor.name}:`,
          error,
        );
        const subscriptionError = this.recordServiceError(
          "measurement_subscription_error",
          error.message || `${definition.name} monitoring failed for ${sensor.name}`,
          {
            deviceId: sensor.id,
            recoverable: true,
          },
        );
        if (this.trainerState.deviceId === sensor.id) {
          this.updateTrainerState({
            dataFlowState: "lost",
            lastServiceError: subscriptionError,
          });
        }
        this.notifyConnectionChange(sensor);
        return;
      }

      if (!char?.value) return;

      const rawBytes = decodeBase64ToBytes(char.value);
      const parsed = definition.parse(rawBytes);
      this.logParserDebug(`ftms:${definition.uuid.toLowerCase()}:${sensor.id}`, rawBytes, parsed);

      const readings = this.createFtmsReadings(parsed, sensor.id, Date.now())
        .map((reading) => this.validateSensorReading(reading))
        .filter((reading): reading is SensorReading => reading !== null);
      if (readings.length === 0) {
        return;
      }

      this.updateSensorDataTimestamp(sensor.id);
      readings.forEach((reading) => {
        this.markObservedMetric(sensor.id, reading.metric);
        this.dataCallbacks.forEach((cb) => cb(reading));
      });
    };
  }

  private createFtmsReadings(
    parsed: ParsedFtmsPayload,
    deviceId: string,
    timestamp: number,
  ): SensorReading[] {
    const source = `ftms_${parsed.machineType}_${parsed.kind}`;
    const readings: SensorReading[] = [];
    const append = (metric: SensorReading["metric"], value: number | null) => {
      if (typeof value !== "number") {
        return;
      }

      const reading = this.createReading(metric, value, deviceId, source, timestamp);
      if (reading) {
        readings.push(reading);
      }
    };

    append("speed", parsed.metrics.speedMps);
    append("cadence", parsed.metrics.cadenceRpm ?? parsed.metrics.strokeRateSpm);
    append("power", parsed.metrics.powerWatts);
    append("heartrate", parsed.metrics.hrBpm);
    append("distance", parsed.metrics.distanceMeters);

    return readings;
  }

  /* --- BLE Data Parsing Helpers --- */
  parseHeartRate(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading | null {
    const bytes = this.toBytes(data);
    const parsed = parseHeartRateMeasurement(data);
    this.logParserDebug(`heart-rate:${deviceId}`, bytes, parsed);

    if (typeof parsed.hrBpm !== "number") return null;
    return this.createReading("heartrate", parsed.hrBpm, deviceId);
  }

  parsePower(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading | null {
    const bytes = this.toBytes(data);
    const parsed = parseCyclingPowerMeasurement(data);
    this.logParserDebug(`cycling-power:${deviceId}`, bytes, parsed);
    if (typeof parsed.powerWatts !== "number") return null;

    const value = Math.max(0, Math.min(parsed.powerWatts, 4000));
    return this.createReading("power", value, deviceId);
  }

  parseCSCMeasurement(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading | null {
    return this.parseCSCMeasurements(data, deviceId)[0] ?? null;
  }

  parseCSCMeasurements(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading[] {
    const bytes = this.toBytes(data);
    const previousState = this.cscParserStates.get(deviceId);
    const parsed = parseCscMeasurement(data, previousState);
    this.cscParserStates.set(deviceId, parsed.nextState);
    this.logParserDebug(`csc:${deviceId}`, bytes, parsed);

    const readings: SensorReading[] = [];

    if (typeof parsed.cadenceRpm === "number") {
      const reading = this.createReading("cadence", parsed.cadenceRpm, deviceId);
      if (reading) readings.push(reading);
    }

    if (typeof parsed.speedMps === "number") {
      const reading = this.createReading("speed", parsed.speedMps, deviceId);
      if (reading) readings.push(reading);
    }

    return readings;
  }

  parseRSCMeasurement(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading | null {
    return this.parseRSCMeasurements(data, deviceId)[0] ?? null;
  }

  parseRSCMeasurements(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading[] {
    const bytes = this.toBytes(data);
    const view = toDataView(bytes);
    if (bytes.byteLength < 1) return [];
    const flags = view.getUint8(0);
    let offset = 1;
    const readings: SensorReading[] = [];

    // Instantaneous Speed is always present (uint16, 1/256 m/s)
    if (bytes.byteLength >= offset + 2) {
      const rawSpeed = view.getUint16(offset, true);
      const speedMs = rawSpeed / 256; // Convert to m/s
      offset += 2;

      const speedReading = this.createReading("speed", speedMs, deviceId);
      if (speedReading) readings.push(speedReading);

      // Instantaneous Cadence (uint8, steps/min) - only if bit 0 is set
      if (flags & 0x01 && bytes.byteLength >= offset + 1) {
        const cadence = view.getUint8(offset);
        this.logParserDebug(`rsc:${deviceId}`, bytes, {
          flags,
          cadenceRpm: cadence,
          speedMps: speedMs,
        });
        const cadenceReading = this.createReading("cadence", cadence, deviceId);
        if (cadenceReading) readings.push(cadenceReading);
        return readings;
      }

      this.logParserDebug(`rsc:${deviceId}`, bytes, {
        flags,
        cadenceRpm: null,
        speedMps: speedMs,
      });
      return readings;
    }
    return readings;
  }

  parseBleReadings(metricType: BleMetricType, raw: Uint8Array, deviceId: string): SensorReading[] {
    switch (metricType) {
      case BleMetricType.Cadence:
        return this.parseCSCMeasurements(raw, deviceId);
      case BleMetricType.Speed:
        return this.parseRSCMeasurements(raw, deviceId);
      default: {
        const reading = this.parseBleData(metricType, raw, deviceId);
        return reading ? [reading] : [];
      }
    }
  }

  parseBleData(metricType: BleMetricType, raw: Uint8Array, deviceId: string): SensorReading | null {
    let reading: SensorReading | null = null;

    switch (metricType) {
      case BleMetricType.HeartRate:
        reading = this.parseHeartRate(raw, deviceId);
        break;
      case BleMetricType.Power:
        reading = this.parsePower(raw, deviceId);
        break;
      case BleMetricType.Cadence:
        reading = this.parseCSCMeasurement(raw, deviceId);
        break;
      case BleMetricType.Speed:
        // RSC characteristic (0x2A53) uses different format than CSC
        reading = this.parseRSCMeasurement(raw, deviceId);
        break;
      default:
        return null;
    }

    return reading;
  }

  smoothSensorData(values: number[], window = 3): number[] {
    if (values.length < window) return values;
    return values.map((_, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, start + window);
      return values.slice(start, end).reduce((a, b) => a + b, 0) / (end - start);
    });
  }

  validateSensorReading(reading: SensorReading): SensorReading | null {
    switch (reading.metric) {
      case "heartrate":
        if (typeof reading.value === "number" && reading.value >= 30 && reading.value <= 250)
          return reading;
        break;
      case "power":
        if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 4000)
          return reading;
        break;
      case "cadence":
        if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 300)
          return reading;
        break;
      case "speed":
        if (typeof reading.value === "number" && reading.value >= 0 && reading.value <= 100)
          return reading;
        break;
    }
    return null;
  }

  // ==================== FTMS Control Methods ====================

  /**
   * Get the currently connected controllable trainer
   */
  getControllableTrainer(): ConnectedSensor | undefined {
    const selectedId = this.selectedFtmsDeviceId;
    return selectedId ? this.connectedSensors.get(selectedId) : undefined;
  }

  getFTMSCandidates(): Map<string, FtmsDeviceSnapshot> {
    return new Map(this.ftmsCandidates);
  }

  getSelectedFTMSDeviceId(): string | null {
    return this.selectedFtmsDeviceId ?? null;
  }

  getFTMSControllers(): Map<string, FTMSController> {
    return new Map(this.ftmsControllers);
  }

  selectFTMSControlTarget(deviceId: string | null): boolean {
    if (deviceId === null) {
      this.selectedFtmsDeviceId = undefined;
      return true;
    }

    const candidate = this.ftmsCandidates.get(deviceId);
    if (!candidate?.supportsControl) {
      return false;
    }

    this.selectedFtmsDeviceId = deviceId;
    return true;
  }

  private getSelectedFTMSController(): FTMSController | undefined {
    return this.selectedFtmsDeviceId
      ? this.ftmsControllers.get(this.selectedFtmsDeviceId)
      : undefined;
  }

  /**
   * Set power target in ERG mode
   */
  async setPowerTarget(watts: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setPowerTarget(watts, context);
  }

  /**
   * Set resistance target level
   */
  async setResistanceTarget(level: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setResistanceTarget(level, context);
  }

  /**
   * Set terrain simulation parameters
   */
  async setSimulation(
    params: {
      windSpeed?: number;
      grade?: number;
      crr?: number;
      windResistance?: number;
    },
    context?: FTMSCommandContext,
  ): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    // Provide defaults for optional parameters
    const simParams = {
      windSpeed: params.windSpeed ?? 0,
      grade: params.grade ?? 0,
      crr: params.crr ?? 0.005,
      windResistance: params.windResistance ?? 0.51,
    };

    return await controller.setSimulation(simParams, context);
  }

  /**
   * Set target speed
   */
  async setTargetSpeed(speedKph: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setTargetSpeed(speedKph, context);
  }

  /**
   * Set target inclination
   */
  async setTargetInclination(percent: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setTargetInclination(percent, context);
  }

  /**
   * Set target heart rate
   */
  async setTargetHeartRate(bpm: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setTargetHeartRate(bpm, context);
  }

  /**
   * Set target cadence
   */
  async setTargetCadence(rpm: number, context?: FTMSCommandContext): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.setTargetCadence(rpm, context);
  }

  /**
   * Reset trainer control
   */
  async resetTrainerControl(): Promise<boolean> {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await controller.reset();
  }

  /**
   * Get FTMS controller for advanced access
   */
  getFTMSController(sensorId?: string): import("./FTMSController").FTMSController | undefined {
    if (sensorId) {
      return this.ftmsControllers.get(sensorId);
    }
    return this.getSelectedFTMSController();
  }

  public async cleanup(): Promise<void> {
    this.stopConnectionMonitoring();
    await this.disconnectAll();
  }

  /**
   * Get control events for current session
   */
  getControlEvents(): any[] {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      return [];
    }

    return controller.getControlEvents();
  }

  getLastTrainerCommandStatus() {
    const controller = this.getSelectedFTMSController();
    if (!controller) {
      return null;
    }

    return controller.getLastCommandStatus();
  }

  /**
   * Clear control events history
   */
  clearControlEvents(): void {
    const controller = this.getSelectedFTMSController();
    if (controller) {
      controller.clearControlEvents();
    }
  }
}
