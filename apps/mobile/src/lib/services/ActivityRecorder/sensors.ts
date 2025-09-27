import {
  BLE_SERVICE_UUIDS,
  KnownCharacteristics,
  type SensorReading,
  parseBleData,
} from "@repo/core";
import { Buffer } from "buffer";
import { BleManager, Device } from "react-native-ble-plx";

/** --- Connection states --- */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

/** --- Connected sensor interface --- */
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionTime: Date;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  lastDisconnectTime?: Date;
  autoReconnect: boolean;
}

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private bleManager = new BleManager();
  private connectedSensors: Map<string, ConnectedSensor> = new Map();
  private dataCallbacks: Set<(reading: SensorReading) => void> = new Set();
  private connectionCallbacks: Set<(sensor: ConnectedSensor) => void> =
    new Set();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 2000;

  constructor() {
    this.initialize();
  }

  /** Initialize BLE manager */
  private initialize() {
    this.bleManager.onStateChange((state) => {
      if (state === "PoweredOn") console.log("BLE ready");
      if (state === "PoweredOff" || state === "Unauthorized")
        this.disconnectAll();
    }, true);
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
  async connectSensor(
    deviceId: string,
    autoReconnect: boolean = true,
  ): Promise<ConnectedSensor | null> {
    try {
      // Update state to connecting
      let sensor = this.connectedSensors.get(deviceId);
      if (sensor) {
        sensor.connectionState = "connecting";
      } else {
        // Pre-emptively create a sensor object to track connection state
        sensor = {
          id: deviceId,
          name: "Unknown", // Will be updated on connect
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
        connectionTime: new Date(),
        connectionState: "connected",
        reconnectAttempts: 0,
        autoReconnect,
        characteristics,
      };

      this.connectedSensors.set(device.id, connectedSensor);
      await this.monitorKnownCharacteristics(connectedSensor);

      // Enhanced disconnect handler with reconnection
      device.onDisconnected((error) => {
        console.log("Disconnected:", device.name, error?.message || "");
        connectedSensor.connectionState = "disconnected";
        connectedSensor.lastDisconnectTime = new Date();
        this.connectionCallbacks.forEach((cb) => cb(connectedSensor));

        if (
          autoReconnect &&
          connectedSensor.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS
        ) {
          this.scheduleReconnect(connectedSensor);
        } else if (
          !autoReconnect ||
          connectedSensor.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS
        ) {
          connectedSensor.connectionState = "failed";
          this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
          console.warn(
            `Max reconnect attempts reached for ${connectedSensor.name}`,
          );
        }
      });

      console.log(
        `Connected to ${connectedSensor.name} with ${services.length} services`,
      );
      this.connectionCallbacks.forEach((cb) => cb(connectedSensor));
      return connectedSensor;
    } catch (err) {
      console.error("Connect error", err);

      // Update existing sensor state to failed
      const existingSensor = this.connectedSensors.get(deviceId);
      if (existingSensor) {
        existingSensor.connectionState = "failed";
        this.connectionCallbacks.forEach((cb) => cb(existingSensor));
      }

      return null;
    }
  }

  /** Schedule reconnection attempt */
  private scheduleReconnect(sensor: ConnectedSensor): void {
    // Clear existing timer if any
    const existingTimer = this.reconnectTimers.get(sensor.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const delay =
      this.RECONNECT_DELAY_MS * Math.pow(2, sensor.reconnectAttempts); // Exponential backoff

    sensor.connectionState = "reconnecting";
    sensor.reconnectAttempts++;
    this.connectionCallbacks.forEach((cb) => cb(sensor));

    console.log(
      `Scheduling reconnect attempt ${sensor.reconnectAttempts} for ${sensor.name} in ${delay}ms`,
    );

    const timer = setTimeout(async () => {
      try {
        console.log(
          `Attempting reconnect ${sensor.reconnectAttempts} for ${sensor.name}`,
        );
        await this.reconnectSensor(sensor.id);
      } catch (error) {
        console.error(
          `Reconnect attempt ${sensor.reconnectAttempts} failed for ${sensor.name}:`,
          error,
        );

        if (sensor.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect(sensor);
        } else {
          sensor.connectionState = "failed";
          this.connectionCallbacks.forEach((cb) => cb(sensor));
          console.warn(`All reconnect attempts failed for ${sensor.name}`);
        }
      }

      this.reconnectTimers.delete(sensor.id);
    }, delay);

    this.reconnectTimers.set(sensor.id, timer);
  }

  /** Reconnect to a sensor */
  private async reconnectSensor(
    deviceId: string,
  ): Promise<ConnectedSensor | null> {
    const sensor = this.connectedSensors.get(deviceId);
    if (!sensor) return null;

    try {
      // Attempt to connect to the same device
      const newSensor = await this.connectSensor(
        deviceId,
        sensor.autoReconnect,
      );

      if (newSensor) {
        // Reset reconnect attempts on successful connection
        newSensor.reconnectAttempts = 0;
        console.log(`Successfully reconnected to ${newSensor.name}`);
        return newSensor;
      }

      return null;
    } catch (error) {
      console.error(`Reconnection failed for ${sensor.name}:`, error);
      throw error;
    }
  }

  /** Disconnect a device */
  async disconnectSensor(
    deviceId: string,
    disableAutoReconnect: boolean = true,
  ) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor) {
      // Clear reconnect timer
      const timer = this.reconnectTimers.get(deviceId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(deviceId);
      }

      // Disable auto-reconnect if requested
      if (disableAutoReconnect) {
        sensor.autoReconnect = false;
      }

      // Disconnect device
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
    // Clear all reconnect timers
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) =>
        this.disconnectSensor(id, true),
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

      const monitorCallback = (error, char) => {
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

        const reading = parseBleData(
          metricType,
          Buffer.from(char.value, "base64").buffer,
          sensor.id,
        );
        if (reading) this.dataCallbacks.forEach((cb) => cb(reading));
      };

      characteristic.monitor(monitorCallback);
    }
  }
  private handleSensorData(reading: SensorReading) {
    this.updateWithSensorData(reading);
    this.dataCallbacks.forEach((cb) => {
      try {
        cb(reading);
      } catch (err) {
        console.warn("Sensor callback error:", err);
      }
    });
  }
}
