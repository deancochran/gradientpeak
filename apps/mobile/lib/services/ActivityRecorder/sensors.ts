import { BLE_SERVICE_UUIDS } from "@repo/core";
import { Buffer } from "buffer";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";
import {
  FTMSController,
  type FTMSFeatures,
  ControlMode,
} from "./FTMSController";
import { SensorReading } from "./types";

/** --- Connection states --- */
export type SensorConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed";

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

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private bleManager = new BleManager();
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private connectionCallbacks: Set<(sensor: ConnectedSensor) => void> =
    new Set();
  private connectionMonitorTimer?: ReturnType<typeof setInterval>;
  private readonly DISCONNECT_TIMEOUT_MS = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL_MS = 10000; // 10 seconds

  // Track controllable trainer
  private controllableTrainer?: ConnectedSensor;

  // Enhanced reconnection with exponential backoff
  private reconnectionAttempts: Map<string, number> = new Map();
  private reconnectionTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly MAX_RECONNECTION_ATTEMPTS = 5;
  private readonly RECONNECTION_BACKOFF_BASE_MS = 500;

  constructor() {
    this.initialize();
    this.startConnectionMonitoring();
  }

  /** Initialize BLE manager */
  private initialize() {
    this.bleManager.onStateChange((state) => {
      if (state === "PoweredOn") console.log("BLE ready");
      if (state === "PoweredOff" || state === "Unauthorized")
        this.disconnectAll();
    }, true);
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
          sensor.connectionState = "disconnected";
          this.connectionCallbacks.forEach((cb) => cb(sensor));

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
      sensor.connectionState = "failed";
      this.reconnectionAttempts.delete(sensorId);
      this.connectionCallbacks.forEach((cb) => cb(sensor));
      return;
    }

    // Update state
    sensor.connectionState = "connecting";
    this.reconnectionAttempts.set(sensorId, attempt);
    this.connectionCallbacks.forEach((cb) => cb(sensor));

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
        sensor.connectionState = "connected";
        // Cancel any ongoing reconnection attempts since sensor is back
        this.cancelReconnectionAttempts(deviceId);
        this.connectionCallbacks.forEach((cb) => cb(sensor));
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
        sensor.connectionState = "connecting";
      } else {
        sensor = {
          id: deviceId,
          name: "Unknown",
          connectionState: "connecting",
        } as ConnectedSensor;
        this.connectedSensors.set(deviceId, sensor);
      }
      this.connectionCallbacks.forEach((cb) => cb(sensor!));

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
        connectedSensor.connectionState = "disconnected";
        connectedSensor.lastDataTimestamp = undefined;
        this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
        // Health monitoring will handle reconnection attempt
      });

      console.log(
        `Connected to ${connectedSensor.name} with ${services.length} services`,
      );
      this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
      return connectedSensor;
    } catch (err) {
      console.error("Connect error", err);

      const existingSensor = this.connectedSensors.get(deviceId);
      if (existingSensor) {
        existingSensor.connectionState = "failed";
        this.connectionCallbacks.forEach((cb) => cb(existingSensor));
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
    sensor.connectionState = "disconnected";
    this.connectionCallbacks.forEach((cb) => cb(sensor));

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
    return Array.from(this.connectedSensors.values());
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
        if (error) {
          console.warn(`Error monitoring ${metricType}:`, error);
          if (retries < maxRetries) {
            retries++;
            console.log(
              `Retrying monitor for ${metricType} (${retries}/${maxRetries})`,
            );
            characteristic.monitor(monitorCallback);
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
          console.warn(
            `[SensorsManager] Battery monitoring error for ${sensor.name}:`,
            error,
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
      console.error(
        `[SensorsManager] Failed to monitor battery for ${sensor.name}:`,
        error,
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
   * Set resistance level
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
