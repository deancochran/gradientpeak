import { BLE_SERVICE_UUIDS, FTMS_CHARACTERISTICS } from "@repo/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";
import {
  ControlMode,
  FTMSController,
  type FTMSFeatures,
} from "./FTMSController";
import { SensorReading } from "./types";

/** --- Connection states --- */
export type SensorConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed";

/** --- Valid state transitions for connection state machine --- */
const VALID_STATE_TRANSITIONS: Record<
  SensorConnectionState,
  SensorConnectionState[]
> = {
  disconnected: ["connecting", "failed"],
  connecting: ["connected", "disconnected", "failed"],
  connected: ["disconnected"],
  failed: ["connecting", "disconnected"],
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
  isControllable?: boolean;
  ftmsController?: FTMSController;
  ftmsFeatures?: FTMSFeatures;
  currentControlMode?: ControlMode;

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
}

/** --- Standard BLE Characteristics --- */
export const KnownCharacteristics: Record<string, BleMetricType> = {
  "00002a37-0000-1000-8000-00805f9b34fb": BleMetricType.HeartRate,
  "00002a63-0000-1000-8000-00805f9b34fb": BleMetricType.Power,
  "00002a5b-0000-1000-8000-00805f9b34fb": BleMetricType.Cadence, // CSC: Cycling Speed and Cadence
  "00002a53-0000-1000-8000-00805f9b34fb": BleMetricType.Speed, // RSC: Running Speed and Cadence
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

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private bleManager = new BleManager();
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private connectionCallbacks: Set<(sensor: ConnectedSensor) => void> =
    new Set();
  private connectionMonitorTimer?: ReturnType<typeof setInterval>;
  private readonly DISCONNECT_TIMEOUT_MS = 60000; // 60 seconds (increased from 30s for better stability)
  private readonly HEALTH_CHECK_INTERVAL_MS = 15000; // 15 seconds (increased from 10s to reduce battery drain)

  // BLE state tracking
  private bleState: string = "Unknown";

  // Track controllable trainer
  private controllableTrainer?: ConnectedSensor;

  // Enhanced reconnection with exponential backoff
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly MAX_RECONNECTION_ATTEMPTS = 8; // Increased from 5 for better reliability
  private readonly RECONNECTION_BACKOFF_BASE_MS = 1000; // Increased from 500ms to 1s

  // Sensor persistence
  private persistedSensors: Map<string, PersistedSensor> = new Map();
  private persistenceInitialized: boolean = false;

  // State transition debouncing
  private stateTransitionTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly STATE_TRANSITION_DEBOUNCE_MS = 500;

  constructor() {
    this.initialize();
    this.startConnectionMonitoring();
    // Load persisted sensors and attempt auto-reconnection
    this.loadPersistedSensors();
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
  private applyStateTransition(
    sensor: ConnectedSensor,
    targetState: SensorConnectionState,
  ): void {
    const previousState = sensor.connectionState;
    sensor.connectionState = targetState;
    sensor.stateTransitionInProgress = false;

    console.log(
      `[SensorsManager] ${sensor.name} state transition: ${previousState} -> ${targetState}`,
    );

    // Notify connection callbacks
    this.connectionCallbacks.forEach((cb) => cb(sensor));
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
        console.log(
          `[SensorsManager] Loaded ${sensors.length} persisted sensors`,
        );
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
      await AsyncStorage.setItem(
        PERSISTED_SENSORS_KEY,
        JSON.stringify(sensors),
      );
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
        console.log(
          `[SensorsManager] Sensor ${sensorData.name} already connected, skipping`,
        );
        continue;
      }

      console.log(
        `[SensorsManager] Attempting to reconnect persisted sensor: ${sensorData.name}`,
      );

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
    console.log(
      `[SensorsManager] Clearing ${this.persistedSensors.size} persisted sensors`,
    );
    this.persistedSensors.clear();
    try {
      await AsyncStorage.removeItem(PERSISTED_SENSORS_KEY);
      console.log("[SensorsManager] Persisted sensors cleared successfully");
    } catch (error) {
      console.warn(
        "[SensorsManager] Failed to clear persisted sensors:",
        error,
      );
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
  }

  /**
   * Public method to get list of persisted sensors (for UI display)
   */
  public getPersistedSensors(): PersistedSensor[] {
    return Array.from(this.persistedSensors.values());
  }

  /** Start monitoring sensor connection health */
  private startConnectionMonitoring() {
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
      if (
        sensor.connectionState === "connecting" ||
        sensor.connectionState === "failed"
      ) {
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
  private async attemptReconnection(
    sensorId: string,
    attempt: number = 1,
  ): Promise<void> {
    const sensor = this.connectedSensors.get(sensorId);
    if (!sensor) {
      console.warn(
        `[SensorsManager] Sensor ${sensorId} not found for reconnection`,
      );
      return;
    }

    // Check if max attempts reached
    if (attempt > this.MAX_RECONNECTION_ATTEMPTS) {
      console.error(
        `[SensorsManager] Max reconnection attempts (${this.MAX_RECONNECTION_ATTEMPTS}) reached for ${sensor.name}`,
      );
      this.transitionSensorState(sensor, "failed", true);
      this.reconnectionAttempts.delete(sensorId);
      return;
    }

    // Update state
    this.transitionSensorState(sensor, "connecting", true);
    this.reconnectionAttempts.set(sensorId, attempt);

    console.log(
      `[SensorsManager] Reconnection attempt ${attempt}/${this.MAX_RECONNECTION_ATTEMPTS} for ${sensor.name}`,
    );

    try {
      const reconnected = await this.connectSensor(sensorId);

      if (reconnected) {
        console.log(
          `[SensorsManager] Successfully reconnected to ${sensor.name}`,
        );
        this.reconnectionAttempts.delete(sensorId);
        return;
      }

      throw new Error("Reconnection returned null");
    } catch (error) {
      console.error(
        `[SensorsManager] Reconnection attempt ${attempt} failed for ${sensor.name}:`,
        error,
      );

      // Calculate exponential backoff: 500ms, 1s, 2s, 4s, 8s
      const delayMs =
        this.RECONNECTION_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
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
  private currentScanTimeout: number | null = null;

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
      if (sensor) {
        this.transitionSensorState(sensor, "connecting", true);
      } else {
        sensor = {
          id: deviceId,
          name: "Unknown",
          connectionState: "connecting",
        } as ConnectedSensor;
        this.connectedSensors.set(deviceId, sensor);
        // Note: new sensors start in "connecting" state, no transition needed
        this.connectionCallbacks.forEach((cb) => cb(sensor!));
      }

      const device = await this.bleManager.connectToDevice(deviceId, {
        timeout: 10000,
      });
      const discovered = await device.discoverAllServicesAndCharacteristics();
      const services = await discovered.services();

      const characteristics = new Map<string, string>();
      for (const service of services) {
        const chars = await service.characteristics();
        chars.forEach((c) =>
          characteristics.set(c.uuid.toLowerCase(), service.uuid),
        );
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
      await this.monitorKnownCharacteristics(connectedSensor);

      // Check if device supports FTMS control
      const hasFTMS = services.some((s) =>
        s.uuid.toLowerCase().includes("1826"),
      );

      if (hasFTMS) {
        console.log(
          `[SensorsManager] Detected FTMS trainer: ${connectedSensor.name}`,
        );
        await this.setupFTMSControl(connectedSensor);
      }

      // Enhanced disconnect handler with reconnection
      device.onDisconnected((error) => {
        console.log("Disconnected:", device.name, error?.message || "");
        this.transitionSensorState(connectedSensor, "disconnected", true);
        connectedSensor.lastDataTimestamp = undefined;
        // Health monitoring will handle reconnection attempt
      });

      console.log(
        `Connected to ${connectedSensor.name} with ${services.length} services`,
      );

      // Persist sensor for auto-reconnection in future sessions
      await this.addPersistedSensor(connectedSensor.id, connectedSensor.name);

      this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
      return connectedSensor;
    } catch (err) {
      console.error("Connect error", err);

      const existingSensor = this.connectedSensors.get(deviceId);
      if (existingSensor) {
        this.transitionSensorState(existingSensor, "failed", true);
      }
      return null;
    }
  }

  /** Public method to reconnect all sensors (to be called on AppState "active") */
  public async reconnectAll(): Promise<void> {
    const sensors = Array.from(this.connectedSensors.values());
    for (const sensor of sensors) {
      if (
        sensor.connectionState === "disconnected" &&
        !this.reconnectionAttempts.has(sensor.id)
      ) {
        console.log(
          `[SensorsManager] Reconnecting ${sensor.name} on app foreground`,
        );
        await this.attemptReconnection(sensor.id, 1);
      }
    }
  }

  /** Disconnect a device */
  async disconnectSensor(deviceId: string) {
    // Cancel any ongoing reconnection attempts
    this.cancelReconnectionAttempts(deviceId);

    const sensor = this.connectedSensors.get(deviceId);
    if (!sensor) {
      console.log(
        `[SensorsManager] Sensor ${deviceId} not found for disconnection`,
      );
      return;
    }

    console.log(`[SensorsManager] Disconnecting sensor: ${sensor.name}`);

    // Update connection state and notify callbacks first
    this.transitionSensorState(sensor, "disconnected", true);

    // Cancel BLE connection if device exists
    if (sensor.device) {
      try {
        await sensor.device.cancelConnection();
        console.log(`Successfully disconnected from ${sensor.name}`);
      } catch (error) {
        console.error(`Error disconnecting from ${sensor.name}:`, error);
      }
    }

    // Remove from connected sensors map
    this.connectedSensors.delete(deviceId);

    // Remove from persistence - user manually disconnected
    console.log(
      `[SensorsManager] Removing ${sensor.name} from persisted sensors (manual disconnect)`,
    );
    await this.removePersistedSensor(deviceId);
  }

  /** Disconnect all devices */
  async disconnectAll() {
    this.stopConnectionMonitoring();

    // Cancel all ongoing reconnection attempts
    this.cancelReconnectionAttempts();

    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) =>
        this.disconnectSensor(id),
      ),
    );
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

      // Request control
      const controlGranted = await controller.requestControl();

      if (controlGranted) {
        sensor.isControllable = true;
        sensor.ftmsController = controller;
        sensor.ftmsFeatures = features;
        this.controllableTrainer = sensor;

        // Subscribe to status updates
        await controller.subscribeStatus((status) => {
          console.log(`[SensorsManager] Trainer status: ${status}`);
        });

        // Monitor FTMS Indoor Bike Data characteristic for power, cadence, etc.
        await this.monitorFTMSIndoorBikeData(sensor);

        console.log("[SensorsManager] FTMS control setup successful");
        console.log("[SensorsManager] Capabilities:", features);

        // Notify connection callbacks (triggers UI update)
        this.connectionCallbacks.forEach((cb) => cb(sensor));
      } else {
        console.warn("[SensorsManager] Failed to gain FTMS control");
      }
    } catch (error) {
      console.error("[SensorsManager] FTMS setup failed:", error);
      sensor.isControllable = false;
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

  /** Monitor known characteristics */
  private async monitorKnownCharacteristics(sensor: ConnectedSensor) {
    for (const [charUuid, serviceUuid] of sensor.characteristics) {
      const metricType = KnownCharacteristics[charUuid.toLowerCase()];
      if (!metricType) continue;

      const service = (await sensor.device.services()).find(
        (s) => s.uuid === serviceUuid,
      );
      if (!service) continue;

      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid === charUuid,
      );
      if (!characteristic) continue;

      let retries = 0;
      const maxRetries = 2;

      const monitorCallback = (
        error: BleError | null,
        char: Characteristic | null,
      ) => {
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
              console.log(
                `Retrying monitor for ${metricType} (${retries}/${maxRetries})`,
              );
              characteristic.monitor(monitorCallback);
            }
          }
          return;
        }

        if (!char?.value) return;

        const reading = this.parseBleData(
          metricType,
          Buffer.from(char.value, "base64").buffer,
          sensor.id,
        );
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
      console.log(
        `[SensorsManager] ${sensor.name} does not support Battery Service`,
      );
      return;
    }

    console.log(`[SensorsManager] Monitoring battery for ${sensor.name}`);

    try {
      const service = (await sensor.device.services()).find(
        (s) => s.uuid.toLowerCase() === batteryServiceUuid.toLowerCase(),
      );

      if (!service) {
        console.warn(
          `[SensorsManager] Battery service not found for ${sensor.name}`,
        );
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
        const buffer = Buffer.from(initialValue.value, "base64");
        const batteryLevel = buffer.readUInt8(0);
        console.log(
          `[SensorsManager] Initial battery level for ${sensor.name}: ${batteryLevel}%`,
        );
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

        const buffer = Buffer.from(char.value, "base64");
        const batteryLevel = buffer.readUInt8(0);

        console.log(
          `[SensorsManager] Battery level for ${sensor.name}: ${batteryLevel}%`,
        );
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
  private handleBatteryUpdate(
    sensorId: string,
    sensorName: string,
    level: number,
  ): void {
    // Store battery level in sensor metadata
    const sensor = this.connectedSensors.get(sensorId);
    if (sensor) {
      sensor.batteryLevel = level;
      // Notify connection callbacks so UI can update
      this.connectionCallbacks.forEach((cb) => cb(sensor));
    }

    // Log warnings for low battery (no user-facing notifications)
    if (level <= 20 && level > 10) {
      console.warn(
        `[SensorsManager] Low battery warning: ${sensorName} at ${level}%`,
      );
    } else if (level <= 10) {
      console.error(
        `[SensorsManager] Critical battery: ${sensorName} at ${level}%`,
      );
    }
  }

  /**
   * Monitor FTMS Indoor Bike Data characteristic (0x2AD2)
   * Provides power, cadence, speed, distance, and more from smart trainers
   * https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/
   */
  private async monitorFTMSIndoorBikeData(
    sensor: ConnectedSensor,
  ): Promise<void> {
    const indoorBikeDataUuid =
      FTMS_CHARACTERISTICS.INDOOR_BIKE_DATA.toLowerCase();

    if (!sensor.characteristics.has(indoorBikeDataUuid)) {
      console.log(
        `[SensorsManager] ${sensor.name} does not provide Indoor Bike Data characteristic`,
      );
      return;
    }

    console.log(
      `[SensorsManager] Monitoring Indoor Bike Data for ${sensor.name}`,
    );

    try {
      const service = (await sensor.device.services()).find(
        (s) =>
          s.uuid.toLowerCase() ===
          BLE_SERVICE_UUIDS.FITNESS_MACHINE.toLowerCase(),
      );

      if (!service) {
        console.warn(
          `[SensorsManager] Fitness Machine service not found for ${sensor.name}`,
        );
        return;
      }

      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid.toLowerCase() === indoorBikeDataUuid,
      );

      if (!characteristic) {
        console.warn(
          `[SensorsManager] Indoor Bike Data characteristic not found`,
        );
        return;
      }

      // Monitor for updates
      characteristic.monitor((error, char) => {
        if (error) {
          console.warn(
            `[SensorsManager] Indoor Bike Data monitoring error for ${sensor.name}:`,
            error,
          );
          return;
        }

        if (!char?.value) return;

        const buffer = Buffer.from(char.value, "base64");
        const readings = this.parseIndoorBikeData(buffer.buffer, sensor.id);

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
  private parseIndoorBikeData(
    data: ArrayBuffer,
    deviceId: string,
  ): SensorReading[] {
    if (data.byteLength < 2) return [];

    const view = new DataView(data);
    const flags = view.getUint16(0, true); // Flags field (2 bytes, little-endian)
    let offset = 2; // Start after flags

    const readings: SensorReading[] = [];
    const timestamp = Date.now();

    try {
      // Bit 0: More Data (0 = no more data, 1 = more data)
      // Not used for parsing, just indicates if more characteristics exist

      // Bit 1: Average Speed present
      if (flags & 0x02) {
        if (data.byteLength >= offset + 2) {
          const avgSpeed = view.getUint16(offset, true) * 0.01; // Resolution: 0.01 km/h
          offset += 2;

          // Convert km/h to m/s for consistency with other speed sensors
          const speedMs = avgSpeed / 3.6;
          const reading = this.validateSensorReading({
            metric: "speed",
            dataType: "float",
            value: speedMs,
            timestamp,
            metadata: { deviceId, source: "ftms_indoor_bike" },
          });
          if (reading) readings.push(reading);
        }
      }

      // Bit 2: Instantaneous Cadence present
      if (flags & 0x04) {
        if (data.byteLength >= offset + 2) {
          const cadence = view.getUint16(offset, true) * 0.5; // Resolution: 0.5 rpm
          offset += 2;

          const reading = this.validateSensorReading({
            metric: "cadence",
            dataType: "float",
            value: cadence,
            timestamp,
            metadata: { deviceId, source: "ftms_indoor_bike" },
          });
          if (reading) readings.push(reading);

          console.log(
            `[SensorsManager] Parsed cadence from FTMS: ${cadence.toFixed(1)} rpm`,
          );
        }
      }

      // Bit 3: Average Cadence present
      if (flags & 0x08) {
        if (data.byteLength >= offset + 2) {
          const avgCadence = view.getUint16(offset, true) * 0.5; // Resolution: 0.5 rpm
          offset += 2;

          // We prioritize instantaneous cadence, but if only average is present, use it
          if (!(flags & 0x04)) {
            const reading = this.validateSensorReading({
              metric: "cadence",
              dataType: "float",
              value: avgCadence,
              timestamp,
              metadata: { deviceId, source: "ftms_indoor_bike_avg" },
            });
            if (reading) readings.push(reading);

            console.log(
              `[SensorsManager] Parsed average cadence from FTMS: ${avgCadence.toFixed(1)} rpm`,
            );
          }
        }
      }

      // Bit 4: Total Distance present (uint24, 1 meter resolution)
      if (flags & 0x10) {
        if (data.byteLength >= offset + 3) {
          // Read 24-bit unsigned integer (3 bytes, little-endian)
          const totalDistance =
            view.getUint8(offset) |
            (view.getUint8(offset + 1) << 8) |
            (view.getUint8(offset + 2) << 16);
          offset += 3;

          console.log(
            `[SensorsManager] FTMS Total Distance: ${totalDistance}m`,
          );
        }
      }

      // Bit 5: Resistance Level present (sint16, unitless, resolution 1)
      if (flags & 0x20) {
        if (data.byteLength >= offset + 2) {
          const resistanceLevel = view.getInt16(offset, true);
          offset += 2;

          console.log(
            `[SensorsManager] FTMS Resistance Level: ${resistanceLevel}`,
          );
        }
      }

      // Bit 6: Instantaneous Power present (sint16, watts, resolution 1W)
      if (flags & 0x40) {
        if (data.byteLength >= offset + 2) {
          const power = view.getInt16(offset, true);
          offset += 2;

          const reading = this.validateSensorReading({
            metric: "power",
            dataType: "float",
            value: power,
            timestamp,
            metadata: { deviceId, source: "ftms_indoor_bike" },
          });
          if (reading) readings.push(reading);
        }
      }

      // Bit 7: Average Power present (sint16, watts, resolution 1W)
      if (flags & 0x80) {
        if (data.byteLength >= offset + 2) {
          const avgPower = view.getInt16(offset, true);
          offset += 2;
          // We prioritize instantaneous power over average
          console.log(`[SensorsManager] FTMS Average Power: ${avgPower}W`);
        }
      }

      // Bit 8-9: Expended Energy present (uint16, total/per hour/per minute)
      if (flags & 0x100) {
        if (data.byteLength >= offset + 2) {
          const totalEnergy = view.getUint16(offset, true); // kcal
          offset += 2;
          console.log(
            `[SensorsManager] FTMS Total Energy: ${totalEnergy} kcal`,
          );
        }
        if (data.byteLength >= offset + 2) {
          const energyPerHour = view.getUint16(offset, true); // kcal/h
          offset += 2;
          console.log(
            `[SensorsManager] FTMS Energy/Hour: ${energyPerHour} kcal/h`,
          );
        }
        if (data.byteLength >= offset + 1) {
          const energyPerMinute = view.getUint8(offset); // kcal/min
          offset += 1;
          console.log(
            `[SensorsManager] FTMS Energy/Min: ${energyPerMinute} kcal/min`,
          );
        }
      }

      // Bit 10: Heart Rate present (uint8, bpm)
      if (flags & 0x200) {
        if (data.byteLength >= offset + 1) {
          const heartRate = view.getUint8(offset);
          offset += 1;

          const reading = this.validateSensorReading({
            metric: "heartrate",
            dataType: "float",
            value: heartRate,
            timestamp,
            metadata: { deviceId, source: "ftms_indoor_bike" },
          });
          if (reading) {
            readings.push(reading);
            console.log(
              `[SensorsManager] Parsed heart rate from FTMS: ${heartRate} bpm`,
            );
          }
        }
      }

      // Bit 11: Metabolic Equivalent present (uint8, resolution 0.1)
      if (flags & 0x400) {
        if (data.byteLength >= offset + 1) {
          const metabolicEquivalent = view.getUint8(offset) * 0.1;
          offset += 1;
          console.log(
            `[SensorsManager] FTMS Metabolic Equivalent: ${metabolicEquivalent.toFixed(1)}`,
          );
        }
      }

      // Bit 12: Elapsed Time present (uint16, seconds)
      if (flags & 0x800) {
        if (data.byteLength >= offset + 2) {
          const elapsedTime = view.getUint16(offset, true);
          offset += 2;
          console.log(`[SensorsManager] FTMS Elapsed Time: ${elapsedTime}s`);
        }
      }

      // Bit 13: Remaining Time present (uint16, seconds)
      if (flags & 0x1000) {
        if (data.byteLength >= offset + 2) {
          const remainingTime = view.getUint16(offset, true);
          offset += 2;
          console.log(
            `[SensorsManager] FTMS Remaining Time: ${remainingTime}s`,
          );
        }
      }

      return readings;
    } catch (error) {
      console.error("[SensorsManager] Error parsing Indoor Bike Data:", error);
      return [];
    }
  }

  /* --- BLE Data Parsing Helpers (unchanged) --- */
  parseHeartRate(data: ArrayBuffer, deviceId: string): SensorReading | null {
    if (data.byteLength < 2) return null;
    const view = new DataView(data);
    const is16Bit = (view.getUint8(0) & 0x01) !== 0;
    const value = is16Bit ? view.getUint16(1, true) : view.getUint8(1);
    if (value < 30 || value > 250) return null;

    return this.validateSensorReading({
      metric: "heartrate",
      dataType: "float",
      value,
      timestamp: Date.now(),
      metadata: { deviceId },
    });
  }

  parsePower(data: ArrayBuffer, deviceId: string): SensorReading | null {
    if (data.byteLength < 4) return null;
    const view = new DataView(data);
    const power = view.getInt16(2, true);
    const value = Math.max(0, Math.min(power, 4000));
    return this.validateSensorReading({
      metric: "power",
      dataType: "float",
      value,
      timestamp: Date.now(),
      metadata: { deviceId },
    });
  }

  parseCSCMeasurement(
    data: ArrayBuffer,
    deviceId: string,
  ): SensorReading | null {
    if (data.byteLength < 1) return null;
    const view = new DataView(data);
    const flags = view.getUint8(0);
    let offset = 1;

    if (flags & 0x01 && data.byteLength >= offset + 6) {
      const value = view.getUint32(offset, true);
      return this.validateSensorReading({
        metric: "speed",
        dataType: "float",
        value,
        timestamp: Date.now(),
        metadata: { deviceId },
      });
    }
    if (flags & 0x02 && data.byteLength >= offset + 4) {
      const value = view.getUint16(offset, true);
      return this.validateSensorReading({
        metric: "cadence",
        dataType: "float",
        value,
        timestamp: Date.now(),
        metadata: { deviceId },
      });
    }
    return null;
  }

  parseRSCMeasurement(
    data: ArrayBuffer,
    deviceId: string,
  ): SensorReading | null {
    if (data.byteLength < 1) return null;
    const view = new DataView(data);
    const flags = view.getUint8(0);
    let offset = 1;

    // Instantaneous Speed is always present (uint16, 1/256 m/s)
    if (data.byteLength >= offset + 2) {
      const rawSpeed = view.getUint16(offset, true);
      const speedMs = rawSpeed / 256; // Convert to m/s
      offset += 2;

      // Instantaneous Cadence (uint8, steps/min) - only if bit 0 is set
      if (flags & 0x01 && data.byteLength >= offset + 1) {
        const cadence = view.getUint8(offset);
        // Return cadence reading (prioritize cadence over speed for this characteristic)
        return this.validateSensorReading({
          metric: "cadence",
          dataType: "float",
          value: cadence,
          timestamp: Date.now(),
          metadata: { deviceId },
        });
      }

      // If no cadence, return speed
      return this.validateSensorReading({
        metric: "speed",
        dataType: "float",
        value: speedMs,
        timestamp: Date.now(),
        metadata: { deviceId },
      });
    }
    return null;
  }

  parseBleData(
    metricType: BleMetricType,
    raw: ArrayBuffer,
    deviceId: string,
  ): SensorReading | null {
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

    // Validate reading before returning (bounds checking)
    if (!reading) return null;

    const validated = this.validateSensorReading(reading);
    if (!validated) {
      console.warn(
        `[SensorsManager] Invalid ${reading.metric} reading rejected: ${reading.value}`,
      );
    }

    return validated;
  }

  smoothSensorData(values: number[], window = 3): number[] {
    if (values.length < window) return values;
    return values.map((_, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(values.length, start + window);
      return (
        values.slice(start, end).reduce((a, b) => a + b, 0) / (end - start)
      );
    });
  }

  validateSensorReading(reading: SensorReading): SensorReading | null {
    switch (reading.metric) {
      case "heartrate":
        if (
          typeof reading.value === "number" &&
          reading.value >= 30 &&
          reading.value <= 250
        )
          return reading;
        break;
      case "power":
        if (
          typeof reading.value === "number" &&
          reading.value >= 0 &&
          reading.value <= 4000
        )
          return reading;
        break;
      case "cadence":
        if (
          typeof reading.value === "number" &&
          reading.value >= 0 &&
          reading.value <= 300
        )
          return reading;
        break;
      case "speed":
        if (
          typeof reading.value === "number" &&
          reading.value >= 0 &&
          reading.value <= 100
        )
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
  async setPowerTarget(watts: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setPowerTarget(watts);
  }

  /**
   * Set resistance target level
   */
  async setResistanceTarget(level: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setResistanceTarget(
      level,
    );
  }

  /**
   * Set terrain simulation parameters
   */
  async setSimulation(params: {
    windSpeed?: number;
    grade?: number;
    crr?: number;
    windResistance?: number;
  }): Promise<boolean> {
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

    return await this.controllableTrainer.ftmsController.setSimulation(
      simParams,
    );
  }

  /**
   * Set target speed
   */
  async setTargetSpeed(speedKph: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetSpeed(
      speedKph,
    );
  }

  /**
   * Set target inclination
   */
  async setTargetInclination(percent: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetInclination(
      percent,
    );
  }

  /**
   * Set target heart rate
   */
  async setTargetHeartRate(bpm: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetHeartRate(
      bpm,
    );
  }

  /**
   * Set target cadence
   */
  async setTargetCadence(rpm: number): Promise<boolean> {
    if (!this.controllableTrainer?.ftmsController) {
      console.warn("[SensorsManager] No controllable trainer connected");
      return false;
    }

    return await this.controllableTrainer.ftmsController.setTargetCadence(rpm);
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
  getFTMSController(
    sensorId?: string,
  ): import("./FTMSController").FTMSController | undefined {
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

  /**
   * Clear control events history
   */
  clearControlEvents(): void {
    if (this.controllableTrainer?.ftmsController) {
      this.controllableTrainer.ftmsController.clearControlEvents();
    }
  }
}
