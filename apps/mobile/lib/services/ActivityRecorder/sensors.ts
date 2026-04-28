import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BLE_SERVICE_UUIDS,
  type CscParserState,
  FTMS_CHARACTERISTICS,
  parseCscMeasurement,
  parseCyclingPowerMeasurement,
  parseFtmsIndoorBikeData,
  parseHeartRateMeasurement,
} from "@repo/core";
import { BleError, BleManager, Characteristic, Device } from "react-native-ble-plx";
import { decodeBase64ToBytes, toDataView } from "./ble-bytes";
import {
  ControlMode,
  type FTMSCommandContext,
  FTMSController,
  type FTMSFeatures,
} from "./FTMSController";
import {
  type RecordingServiceError,
  type RecordingServiceErrorCategory,
  type RecordingTrainerConnectionState,
  type RecordingTrainerControlState,
  type RecordingTrainerDataFlowState,
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
export const KnownCharacteristics: Record<string, BleMetricType> = {
  "00002a37-0000-1000-8000-00805f9b34fb": BleMetricType.HeartRate,
  "00002a63-0000-1000-8000-00805f9b34fb": BleMetricType.Power,
  "00002a5b-0000-1000-8000-00805f9b34fb": BleMetricType.Cadence, // CSC: Cycling Speed and Cadence
  "00002a53-0000-1000-8000-00805f9b34fb": BleMetricType.Speed, // RSC: Running Speed and Cadence
  "00002a19-0000-1000-8000-00805f9b34fb": BleMetricType.Battery,
};

/** --- Sensor Data Types (imported from types.ts) --- */
// SensorReading is now imported from types.ts for consistency

/** --- Storage key for persisted sensors --- */
const PERSISTED_SENSORS_KEY = "@sensors:persisted_devices";

/** --- Persisted sensor data structure --- */
export interface PersistedSensor {
  id: string;
  name: string;
  lastConnected: number; // timestamp
}

export interface TrainerStateSnapshot {
  deviceId: string | null;
  deviceName: string | null;
  connectionState: RecordingTrainerConnectionState;
  dataFlowState: RecordingTrainerDataFlowState;
  controlState: RecordingTrainerControlState;
  lastServiceError: RecordingServiceError | null;
}

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private bleManager = new BleManager();
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private connectionCallbacks: Set<(sensor: ConnectedSensor) => void> = new Set();
  private connectionMonitorTimer?: ReturnType<typeof setInterval>;
  private readonly DISCONNECT_TIMEOUT_MS = 60000; // 60 seconds (increased from 30s for better stability)
  private readonly HEALTH_CHECK_INTERVAL_MS = 15000; // 15 seconds (increased from 10s to reduce battery drain)

  // BLE state tracking
  private bleState: string = "Unknown";

  // Track controllable trainer
  private controllableTrainer?: ConnectedSensor;
  private trainerState: TrainerStateSnapshot = this.createEmptyTrainerState();

  // Enhanced reconnection with exponential backoff
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly MAX_RECONNECTION_ATTEMPTS = 8; // Increased from 5 for better reliability
  private readonly RECONNECTION_BACKOFF_BASE_MS = 1000; // Increased from 500ms to 1s

  // Sensor persistence
  private persistedSensors: Map<string, PersistedSensor> = new Map();
  private persistenceInitialized: boolean = false;

  // State transition debouncing
  private stateTransitionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly STATE_TRANSITION_DEBOUNCE_MS = 500;

  // CSC parser state must be maintained per-device for delta-based cadence.
  private cscParserStates: Map<string, CscParserState> = new Map();

  constructor() {
    this.initialize();
    this.startConnectionMonitoring();
    // Load persisted sensors and attempt auto-reconnection
    this.loadPersistedSensors();
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
      console.log(`[SensorsManager] BLE state changed: ${state}`);

      if (state === "PoweredOn") {
        console.log("BLE ready");
        // Attempt to reconnect to persisted sensors when BLE is ready
        if (this.persistenceInitialized && this.persistedSensors.size > 0) {
          console.log(
            `[SensorsManager] BLE powered on, attempting to reconnect ${this.persistedSensors.size} persisted sensors`,
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
    if (!this.controllableTrainer) {
      return;
    }

    if (deviceId && this.controllableTrainer.id !== deviceId) {
      return;
    }

    this.controllableTrainer.isControllable = false;
    this.controllableTrainer.ftmsController = undefined;
    this.controllableTrainer.currentControlMode = undefined;
    this.controllableTrainer = undefined;
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
   * Load persisted sensors from AsyncStorage
   */
  private async loadPersistedSensors(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(PERSISTED_SENSORS_KEY);
      if (data) {
        const sensors: PersistedSensor[] = JSON.parse(data);
        this.persistedSensors = new Map(sensors.map((s) => [s.id, s]));
        console.log(`[SensorsManager] Loaded ${sensors.length} persisted sensors`);
      }
    } catch (error) {
      console.warn("[SensorsManager] Failed to load persisted sensors:", error);
      this.persistedSensors = new Map();
    } finally {
      this.persistenceInitialized = true;
    }
  }

  /**
   * Save persisted sensors to AsyncStorage
   */
  private async savePersistedSensors(): Promise<void> {
    try {
      const sensors = Array.from(this.persistedSensors.values());
      await AsyncStorage.setItem(PERSISTED_SENSORS_KEY, JSON.stringify(sensors));
      console.log(`[SensorsManager] Saved ${sensors.length} persisted sensors`);
    } catch (error) {
      console.warn("[SensorsManager] Failed to save persisted sensors:", error);
    }
  }

  /**
   * Add sensor to persistence
   */
  private async addPersistedSensor(id: string, name: string): Promise<void> {
    this.persistedSensors.set(id, {
      id,
      name,
      lastConnected: Date.now(),
    });
    await this.savePersistedSensors();
  }

  /**
   * Remove sensor from persistence
   */
  private async removePersistedSensor(id: string): Promise<void> {
    this.persistedSensors.delete(id);
    await this.savePersistedSensors();
  }

  /**
   * Attempt to reconnect all persisted sensors
   * Called on BLE power on or app initialization
   */
  private async reconnectPersistedSensors(): Promise<void> {
    console.log(
      `[SensorsManager] Attempting to reconnect ${this.persistedSensors.size} persisted sensors`,
    );

    for (const [id, sensorData] of this.persistedSensors) {
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

  /**
   * Clear all persisted sensors
   * Useful for "reset" functionality or when user wants to forget all devices
   * Does NOT disconnect currently connected sensors
   */
  async clearPersistedSensors(): Promise<void> {
    console.log(`[SensorsManager] Clearing ${this.persistedSensors.size} persisted sensors`);
    this.persistedSensors.clear();
    try {
      await AsyncStorage.removeItem(PERSISTED_SENSORS_KEY);
      console.log("[SensorsManager] Persisted sensors cleared successfully");
    } catch (error) {
      console.warn("[SensorsManager] Failed to clear persisted sensors:", error);
      throw error;
    }
  }

  /**
   * Clear persisted sensors and disconnect all
   * Complete reset of sensor connections
   */
  async resetAllSensors(): Promise<void> {
    console.log("[SensorsManager] Resetting all sensors");
    await this.disconnectAll();
    await this.clearPersistedSensors();
    this.clearControllableTrainer();
    this.trainerState = this.createEmptyTrainerState();
  }

  /**
   * Public method to get list of persisted sensors (for UI display)
   */
  public getPersistedSensors(): PersistedSensor[] {
    return Array.from(this.persistedSensors.values());
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
    const sensor = this.connectedSensors.get(sensorId);
    if (!sensor) {
      console.warn(`[SensorsManager] Sensor ${sensorId} not found for reconnection`);
      return;
    }

    // Check if max attempts reached
    if (attempt > this.MAX_RECONNECTION_ATTEMPTS) {
      console.error(
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
    } catch (error) {
      console.warn(
        `[SensorsManager] Reconnection attempt ${attempt} failed for ${sensor.name}:`,
        error,
      );

      // Calculate exponential backoff: 500ms, 1s, 2s, 4s, 8s
      const delayMs = this.RECONNECTION_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`[SensorsManager] Retrying in ${delayMs}ms...`);

      // Schedule next attempt
      const timer = setTimeout(() => {
        this.reconnectionTimers.delete(sensorId);
        this.attemptReconnection(sensorId, attempt + 1);
      }, delayMs);

      this.reconnectionTimers.set(sensorId, timer);
    }
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

  /** Scan for devices */
  private scanCallbacks: ((device: Device) => void)[] = [];
  private currentScanTimeout: ReturnType<typeof setTimeout> | number | null = null;

  subscribeScan(callback: (device: Device) => void): () => void {
    this.scanCallbacks.push(callback);
    return () => {
      const index = this.scanCallbacks.indexOf(callback);
      if (index > -1) {
        this.scanCallbacks.splice(index, 1);
      }
    };
  }

  async startScan(timeoutMs = 10000): Promise<void> {
    // Stop any existing scan
    this.stopScan();

    const discoveredIds = new Set<string>();

    return new Promise((resolve, reject) => {
      this.currentScanTimeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        this.currentScanTimeout = null;
        resolve();
      }, timeoutMs);

      this.bleManager.startDeviceScan(
        [
          BLE_SERVICE_UUIDS.HEART_RATE,
          BLE_SERVICE_UUIDS.CYCLING_SPEED_AND_CADENCE,
          BLE_SERVICE_UUIDS.CYCLING_POWER,
          BLE_SERVICE_UUIDS.RUNNING_SPEED_AND_CADENCE,
          BLE_SERVICE_UUIDS.FITNESS_MACHINE,
        ],
        null,
        (error, device) => {
          if (error) {
            if (this.currentScanTimeout) {
              clearTimeout(this.currentScanTimeout);
              this.currentScanTimeout = null;
            }
            this.bleManager.stopDeviceScan();
            this.recordServiceError("scan_error", error.message || "BLE scan failed", {
              recoverable: true,
            });
            reject(error);
            return;
          }

          if (device && device.name && !discoveredIds.has(device.id)) {
            discoveredIds.add(device.id);
            // Emit device to all scan subscribers
            this.scanCallbacks.forEach((callback) => callback(device));
          }
        },
      );
    });
  }

  stopScan(): void {
    if (this.currentScanTimeout) {
      clearTimeout(this.currentScanTimeout);
      this.currentScanTimeout = null;
    }
    this.bleManager.stopDeviceScan();
  }

  /** Connect to a device with auto-reconnect support */
  async connectSensor(deviceId: string): Promise<ConnectedSensor | null> {
    try {
      // Update state to connecting
      let sensor = this.connectedSensors.get(deviceId);
      const isReconnect = this.reconnectionAttempts.has(deviceId);
      if (sensor) {
        this.transitionSensorState(sensor, isReconnect ? "reconnecting" : "connecting", true);
      } else {
        const persistedSensor = this.persistedSensors.get(deviceId);
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

      const device = await this.bleManager.connectToDevice(deviceId, {
        timeout: 10000,
      });
      const discovered = await device.discoverAllServicesAndCharacteristics();
      const services = await discovered.services();

      const characteristics = new Map<string, string>();
      for (const service of services) {
        const chars = await service.characteristics();
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
        await this.setupFTMSControl(connectedSensor);
      }

      // Enhanced disconnect handler with reconnection
      device.onDisconnected((error) => {
        console.log("Disconnected:", device.name, error?.message || "");

        if (connectedSensor.connectionState === "disconnecting") {
          this.transitionSensorState(connectedSensor, "disconnected", true);
          connectedSensor.lastDataTimestamp = undefined;
          return;
        }

        this.transitionSensorState(connectedSensor, "disconnected", true);
        connectedSensor.lastDataTimestamp = undefined;
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
      await this.addPersistedSensor(connectedSensor.id, connectedSensor.name);

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
    const knownSensorIds = new Set<string>([
      ...this.connectedSensors.keys(),
      ...this.persistedSensors.keys(),
    ]);

    for (const sensorId of knownSensorIds) {
      const sensor = this.connectedSensors.get(sensorId);
      const persistedSensor = this.persistedSensors.get(sensorId);

      if (sensor?.connectionState === "connected" || this.reconnectionAttempts.has(sensorId)) {
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
  async disconnectSensor(deviceId: string, options?: { forgetPersisted?: boolean }) {
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
        await sensor.device.cancelConnection();
        console.log(`Successfully disconnected from ${sensor.name}`);
      } catch (error) {
        console.error(`Error disconnecting from ${sensor.name}:`, error);
      }
    }

    this.transitionSensorState(sensor, "disconnected", true);

    // Remove from connected sensors map
    this.connectedSensors.delete(deviceId);
    this.cscParserStates.delete(deviceId);

    // Remove from persistence - user manually disconnected
    if (options?.forgetPersisted ?? true) {
      console.log(
        `[SensorsManager] Removing ${sensor.name} from persisted sensors (manual disconnect)`,
      );
      await this.removePersistedSensor(deviceId);
    }

    if (this.trainerState.deviceId === deviceId) {
      if (options?.forgetPersisted ?? true) {
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

  /** Disconnect all devices */
  async disconnectAll() {
    // Cancel all ongoing reconnection attempts
    this.cancelReconnectionAttempts();

    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) =>
        this.disconnectSensor(id, { forgetPersisted: false }),
      ),
    );
    this.cscParserStates.clear();
    this.clearControllableTrainer();
  }

  /**
   * Setup FTMS control for a trainer
   * Reads features, requests control, and initializes FTMSController
   */
  private async setupFTMSControl(sensor: ConnectedSensor): Promise<void> {
    try {
      // Create FTMS controller
      const controller = new FTMSController(sensor.device);

      // Read features to determine capabilities
      const features = await controller.readFeatures();

      this.updateTrainerState({
        deviceId: sensor.id,
        deviceName: sensor.name,
        connectionState: "connected",
        dataFlowState: sensor.lastDataTimestamp ? "flowing" : "waiting_for_data",
        controlState: "requesting_control",
        lastServiceError: null,
      });

      // Request control
      const controlGranted = await controller.requestControl();

      if (controlGranted) {
        sensor.isControllable = true;
        sensor.ftmsController = controller;
        sensor.ftmsFeatures = features;
        this.controllableTrainer = sensor;
        this.clearServiceError(sensor.id);
        this.updateTrainerState({
          deviceId: sensor.id,
          deviceName: sensor.name,
          connectionState: "connected",
          dataFlowState: sensor.lastDataTimestamp ? "flowing" : "waiting_for_data",
          controlState: "controllable",
          lastServiceError: null,
        });

        // Subscribe to status updates
        await controller.subscribeStatus((status) => {
          console.log(`[SensorsManager] Trainer status: ${status}`);
        });

        // Monitor FTMS Indoor Bike Data characteristic for power, cadence, etc.
        await this.monitorFTMSIndoorBikeData(sensor);

        console.log("[SensorsManager] FTMS control setup successful");
        console.log("[SensorsManager] Capabilities:", features);

        // Notify connection callbacks (triggers UI update)
        this.notifyConnectionChange(sensor);
      } else {
        console.warn("[SensorsManager] Failed to gain FTMS control");
        sensor.isControllable = false;
        sensor.ftmsController = undefined;
        sensor.ftmsFeatures = features;
        this.clearControllableTrainer(sensor.id);
        const controlError = this.recordServiceError(
          "control_conflict_suspected",
          `Trainer control rejected by ${sensor.name}`,
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
          controlState: "control_rejected",
          lastServiceError: controlError,
        });
        this.notifyConnectionChange(sensor);
      }
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
      const metricType = KnownCharacteristics[charUuid.toLowerCase()];
      if (!metricType) continue;

      const service = (await sensor.device.services()).find((s) => s.uuid === serviceUuid);
      if (!service) continue;

      const characteristic = (await service.characteristics()).find((c) => c.uuid === charUuid);
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
              characteristic.monitor(monitorCallback);
            }
          }
          return;
        }

        if (!char?.value) return;

        const rawBytes = decodeBase64ToBytes(char.value);
        const reading = this.parseBleData(metricType, rawBytes, sensor.id);
        if (reading) {
          // Update sensor health timestamp
          this.updateSensorDataTimestamp(sensor.id);
          this.dataCallbacks.forEach((cb) => cb(reading));
        }
      };

      characteristic.monitor(monitorCallback);
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
      const service = (await sensor.device.services()).find(
        (s) => s.uuid.toLowerCase() === batteryServiceUuid.toLowerCase(),
      );

      if (!service) {
        console.warn(`[SensorsManager] Battery service not found for ${sensor.name}`);
        return;
      }

      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid.toLowerCase() === batteryLevelCharUuid.toLowerCase(),
      );

      if (!characteristic) {
        console.warn(`[SensorsManager] Battery level characteristic not found`);
        return;
      }

      // Read initial battery level
      const initialValue = await characteristic.read();
      if (initialValue?.value) {
        const bytes = decodeBase64ToBytes(initialValue.value);
        const batteryLevel = bytes[0];
        console.log(`[SensorsManager] Initial battery level for ${sensor.name}: ${batteryLevel}%`);
        this.handleBatteryUpdate(sensor.id, sensor.name, batteryLevel);
      }

      // Monitor for changes (some devices support notifications)
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
      });
    } catch (error) {
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

  /**
   * Monitor FTMS Indoor Bike Data characteristic (0x2AD2)
   * Provides power, cadence, speed, distance, and more from smart trainers
   * https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/
   */
  private async monitorFTMSIndoorBikeData(sensor: ConnectedSensor): Promise<void> {
    const indoorBikeDataUuid = FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA.toLowerCase();

    if (!sensor.characteristics.has(indoorBikeDataUuid)) {
      console.log(
        `[SensorsManager] ${sensor.name} does not provide Indoor Bike Data characteristic`,
      );
      return;
    }

    console.log(`[SensorsManager] Monitoring Indoor Bike Data for ${sensor.name}`);

    try {
      const service = (await sensor.device.services()).find(
        (s) => s.uuid.toLowerCase() === BLE_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase(),
      );

      if (!service) {
        console.warn(`[SensorsManager] Fitness Machine service not found for ${sensor.name}`);
        return;
      }

      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid.toLowerCase() === indoorBikeDataUuid,
      );

      if (!characteristic) {
        console.warn(`[SensorsManager] Indoor Bike Data characteristic not found`);
        return;
      }

      // Monitor for updates
      characteristic.monitor((error, char) => {
        if (error) {
          console.warn(
            `[SensorsManager] Indoor Bike Data monitoring error for ${sensor.name}:`,
            error,
          );
          const subscriptionError = this.recordServiceError(
            "measurement_subscription_error",
            error.message || `Indoor Bike Data monitoring failed for ${sensor.name}`,
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
        const readings = this.parseIndoorBikeData(rawBytes, sensor.id);

        if (readings && readings.length > 0) {
          // Update sensor health timestamp
          this.updateSensorDataTimestamp(sensor.id);

          // Emit all parsed readings
          readings.forEach((reading) => {
            this.dataCallbacks.forEach((cb) => cb(reading));
          });
        }
      });
    } catch (error) {
      console.error(
        `[SensorsManager] Failed to monitor Indoor Bike Data for ${sensor.name}:`,
        error,
      );
      const subscriptionError = this.recordServiceError(
        "measurement_subscription_error",
        error instanceof Error
          ? error.message
          : `Failed to monitor Indoor Bike Data for ${sensor.name}`,
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

  /**
   * Parse FTMS Indoor Bike Data characteristic
   * Flags indicate which fields are present according to FTMS spec Section 4.9.2
   *
   * @param data - Raw characteristic data buffer
   * @param deviceId - Device ID for metadata
   * @returns Array of sensor readings (power, cadence, speed, etc.)
   */
  private parseIndoorBikeData(data: Uint8Array, deviceId: string): SensorReading[] {
    const parsed = parseFtmsIndoorBikeData(data);
    this.logParserDebug(`ftms-indoor-bike:${deviceId}`, data, parsed);

    const timestamp = Date.now();
    const readings: SensorReading[] = [];

    if (typeof parsed.speedMps === "number") {
      const reading = this.createReading(
        "speed",
        parsed.speedMps,
        deviceId,
        "ftms_indoor_bike",
        timestamp,
      );
      if (reading) readings.push(reading);
    }

    if (typeof parsed.cadenceRpm === "number") {
      const reading = this.createReading(
        "cadence",
        parsed.cadenceRpm,
        deviceId,
        "ftms_indoor_bike",
        timestamp,
      );
      if (reading) readings.push(reading);
    }

    if (typeof parsed.powerWatts === "number") {
      const reading = this.createReading(
        "power",
        parsed.powerWatts,
        deviceId,
        "ftms_indoor_bike",
        timestamp,
      );
      if (reading) readings.push(reading);
    }

    if (typeof parsed.hrBpm === "number") {
      const reading = this.createReading(
        "heartrate",
        parsed.hrBpm,
        deviceId,
        "ftms_indoor_bike",
        timestamp,
      );
      if (reading) readings.push(reading);
    }

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
    const bytes = this.toBytes(data);
    const previousState = this.cscParserStates.get(deviceId);
    const parsed = parseCscMeasurement(data, previousState);
    this.cscParserStates.set(deviceId, parsed.nextState);
    this.logParserDebug(`csc:${deviceId}`, bytes, parsed);

    if (typeof parsed.cadenceRpm === "number") {
      return this.createReading("cadence", parsed.cadenceRpm, deviceId);
    }

    if (typeof parsed.speedMps === "number") {
      return this.createReading("speed", parsed.speedMps, deviceId);
    }

    return null;
  }

  parseRSCMeasurement(data: Uint8Array | ArrayBuffer, deviceId: string): SensorReading | null {
    const bytes = this.toBytes(data);
    const view = toDataView(bytes);
    if (bytes.byteLength < 1) return null;
    const flags = view.getUint8(0);
    let offset = 1;

    // Instantaneous Speed is always present (uint16, 1/256 m/s)
    if (bytes.byteLength >= offset + 2) {
      const rawSpeed = view.getUint16(offset, true);
      const speedMs = rawSpeed / 256; // Convert to m/s
      offset += 2;

      // Instantaneous Cadence (uint8, steps/min) - only if bit 0 is set
      if (flags & 0x01 && bytes.byteLength >= offset + 1) {
        const cadence = view.getUint8(offset);
        this.logParserDebug(`rsc:${deviceId}`, bytes, {
          flags,
          cadenceRpm: cadence,
          speedMps: speedMs,
        });
        // Return cadence reading (prioritize cadence over speed for this characteristic)
        return this.createReading("cadence", cadence, deviceId);
      }

      this.logParserDebug(`rsc:${deviceId}`, bytes, {
        flags,
        cadenceRpm: null,
        speedMps: speedMs,
      });

      // If no cadence, return speed
      return this.createReading("speed", speedMs, deviceId);
    }
    return null;
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
    return this.controllableTrainer;
  }

  /**
   * Set power target in ERG mode
   */
  async setPowerTarget(watts: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setPowerTarget(watts, context);
  }

  /**
   * Set resistance target level
   */
  async setResistanceTarget(level: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setResistanceTarget(level, context);
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
    if (!this.controllableTrainer?.ftmsController) {
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

    return await this.controllableTrainer.ftmsController.setSimulation(simParams, context);
  }

  /**
   * Set target speed
   */
  async setTargetSpeed(speedKph: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetSpeed(speedKph, context);
  }

  /**
   * Set target inclination
   */
  async setTargetInclination(percent: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetInclination(percent, context);
  }

  /**
   * Set target heart rate
   */
  async setTargetHeartRate(bpm: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetHeartRate(bpm, context);
  }

  /**
   * Set target cadence
   */
  async setTargetCadence(rpm: number, context?: FTMSCommandContext): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetCadence(rpm, context);
  }

  /**
   * Reset trainer control
   */
  async resetTrainerControl(): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.reset();
  }

  /**
   * Get FTMS controller for advanced access
   */
  getFTMSController(sensorId?: string): import("./FTMSController").FTMSController | undefined {
    if (sensorId) {
      const sensor = this.connectedSensors.get(sensorId);
      return sensor?.ftmsController;
    }
    return this.controllableTrainer?.ftmsController;
  }

  public async cleanup(): Promise<void> {
    this.stopConnectionMonitoring();
    await this.disconnectAll();
  }

  /**
   * Get control events for current session
   */
  getControlEvents(): any[] {
    if (!this.controllableTrainer?.ftmsController) {
      return [];
    }

    return this.controllableTrainer.ftmsController.getControlEvents();
  }

  getLastTrainerCommandStatus() {
    if (!this.controllableTrainer?.ftmsController) {
      return null;
    }

    return this.controllableTrainer.ftmsController.getLastCommandStatus();
  }

  /**
   * Clear control events history
   */
  clearControlEvents(): void {
    if (this.controllableTrainer?.ftmsController) {
      this.controllableTrainer.ftmsController.clearControlEvents();
    }
  }
}
