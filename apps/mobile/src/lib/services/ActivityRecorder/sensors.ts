import { BLE_SERVICE_UUIDS } from "@repo/core";
import { Buffer } from "buffer";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";
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
  reconnectAttempted?: boolean;
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
  "00002a5b-0000-1000-8000-00805f9b34fb": BleMetricType.Cadence, // Speed can be derived
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
          !sensor.reconnectAttempted
        ) {
          console.log(
            `Sensor ${sensor.name} disconnected (no data for ${timeSinceLastData}ms)`,
          );
          sensor.connectionState = "disconnected";
          this.connectionCallbacks.forEach((cb) => cb(sensor));

          // Attempt single reconnection
          await this.attemptReconnection(sensor.id);
        }
      }
    }
  }

  /** Attempt reconnection for a sensor (single retry only) */
  private async attemptReconnection(sensorId: string) {
    const sensor = this.connectedSensors.get(sensorId);
    if (!sensor) return;

    // Mark that we've attempted reconnection
    sensor.reconnectAttempted = true;
    sensor.connectionState = "connecting";
    this.connectionCallbacks.forEach((cb) => cb(sensor));

    console.log(`Attempting reconnection for ${sensor.name}...`);

    try {
      const reconnected = await this.connectSensor(sensorId);
      if (reconnected) {
        console.log(`Successfully reconnected to ${sensor.name}`);
        // Reset reconnect flag on success
        sensor.reconnectAttempted = false;
      } else {
        throw new Error("Reconnection returned null");
      }
    } catch (error) {
      console.error(`Reconnection failed for ${sensor.name}:`, error);
      sensor.connectionState = "failed";
      this.connectionCallbacks.forEach((cb) => cb(sensor));
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
        sensor.reconnectAttempted = false;
        this.connectionCallbacks.forEach((cb) => cb(sensor));
      }
    }
  }

  /** Scan for devices */
  async scan(timeoutMs = 10000): Promise<Device[]> {
    const found: Device[] = [];
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(found);
      }, timeoutMs);

      this.bleManager.startDeviceScan(
        [BLE_SERVICE_UUIDS.HEART_RATE],
        null,
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.bleManager.stopDeviceScan();
            reject(error);
            return;
          }
          if (device && device.name && !found.find((d) => d.id === device.id)) {
            found.push(device);
          }
        },
      );
    });
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
        !sensor.reconnectAttempted
      ) {
        console.log(`Reconnecting ${sensor.name} on app foreground`);
        await this.attemptReconnection(sensor.id);
      }
    }
  }

  /** Disconnect a device */
  async disconnectSensor(deviceId: string) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor) {
      if (sensor.device) {
        try {
          await sensor.device.cancelConnection();
        } catch {}
      }
    }
    this.connectedSensors.delete(deviceId);
  }

  /** Disconnect all devices */
  async disconnectAll() {
    this.stopConnectionMonitoring();

    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) =>
        this.disconnectSensor(id),
      ),
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

  parseBleData(
    metricType: BleMetricType,
    raw: ArrayBuffer,
    deviceId: string,
  ): SensorReading | null {
    switch (metricType) {
      case BleMetricType.HeartRate:
        return this.parseHeartRate(raw, deviceId);
      case BleMetricType.Power:
        return this.parsePower(raw, deviceId);
      case BleMetricType.Cadence:
      case BleMetricType.Speed:
        return this.parseCSCMeasurement(raw, deviceId);
      default:
        return null;
    }
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
}
