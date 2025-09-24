import {
  KnownCharacteristics,
  type SensorReading,
  parseBleData,
} from "@repo/core";
import { Buffer } from "buffer";
import { BleManager, Device } from "react-native-ble-plx";

/** --- Connected sensor interface --- */
export interface ConnectedSensor {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  device: Device;
  connectionTime: Date;
}

/** --- Generic Sports BLE Manager --- */
export class SensorsManager {
  private static bleManager = new BleManager();
  private static connectedSensors: Map<string, ConnectedSensor> = new Map();
  private static dataCallbacks: Set<(reading: SensorReading) => void> =
    new Set();

  constructor() {
    SensorsManager.initialize();
  }

  /** Initialize BLE manager */
  static initialize() {
    this.bleManager.onStateChange((state) => {
      if (state === "PoweredOn") console.log("BLE ready");
      if (state === "PoweredOff" || state === "Unauthorized")
        this.disconnectAll();
    }, true);
  }

  /** Scan for devices */
  static async scan(timeoutMs = 10000): Promise<Device[]> {
    const found: Device[] = [];
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(found);
      }, timeoutMs);

      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.bleManager.stopDeviceScan();
          reject(error);
          return;
        }
        if (device && device.name && !found.find((d) => d.id === device.id)) {
          found.push(device);
        }
      });
    });
  }

  /** Connect to a device */
  static async connectSensor(
    deviceId: string,
  ): Promise<ConnectedSensor | null> {
    try {
      const device = await this.bleManager.connectToDevice(deviceId, {
        timeout: 5000,
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

      const sensor: ConnectedSensor = {
        id: device.id,
        name: device.name || "Unknown Device",
        services: services.map((s) => s.uuid),
        device: discovered,
        connectionTime: new Date(),
        characteristics,
      };

      this.connectedSensors.set(device.id, sensor);
      await this.monitorKnownCharacteristics(sensor);

      device.onDisconnected(() => {
        console.log("Disconnected:", device.name);
        this.connectedSensors.delete(device.id);
      });

      return sensor;
    } catch (err) {
      console.error("Connect error", err);
      return null;
    }
  }

  /** Disconnect a device */
  static async disconnectSensor(deviceId: string) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor?.device) {
      try {
        await sensor.device.cancelConnection();
      } catch {}
    }
    this.connectedSensors.delete(deviceId);
  }

  /** Disconnect all devices */
  static async disconnectAll() {
    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) =>
        this.disconnectSensor(id),
      ),
    );
  }

  /** Subscribe to sensor readings */
  static subscribe(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  static getConnectedSensors(): ConnectedSensor[] {
    return Array.from(this.connectedSensors.values());
  }

  /** Monitor known characteristics */
  private static async monitorKnownCharacteristics(sensor: ConnectedSensor) {
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

      characteristic.monitor((error, char) => {
        if (error || !char?.value) return;

        const reading = parseBleData(
          metricType,
          Buffer.from(char.value, "base64").buffer,
          sensor.id,
        );
        if (reading) this.dataCallbacks.forEach((cb) => cb(reading));
      });
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
