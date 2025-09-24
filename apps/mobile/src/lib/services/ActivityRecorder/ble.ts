import { BleManager, Device } from "react-native-ble-plx";

export class BleManagerService {
  private static bleManager: BleManager = new BleManager();
  private static connectedSensors: Map<string, ConnectedSensor> = new Map();
  private static dataCallbacks: Set<(reading: SensorReading) => void> =
    new Set();

  static initialize() {
    this.bleManager.onStateChange((state) => {
      if (state === "PoweredOn") console.log("BLE ready");
      if (state === "PoweredOff" || state === "Unauthorized")
        this.disconnectAll();
    }, true);
  }

  /** Scanning */
  static async scan(timeoutMs = 10000): Promise<Device[]> {
    if (!this.bleManager) throw new Error("BLE not initialized");
    const found: Device[] = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager!.stopDeviceScan();
        resolve(found);
      }, timeoutMs);

      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.bleManager!.stopDeviceScan();
          reject(error);
          return;
        }
        if (device && device.name && !found.find((d) => d.id === device.id)) {
          found.push(device);
        }
      });
    });
  }

  /** Connection */
  static async connect(deviceId: string): Promise<ConnectedSensor | null> {
    if (!this.bleManager) return null;
    try {
      const device = await this.bleManager.connectToDevice(deviceId, {
        timeout: 5000,
      });
      const withServices = await device.discoverAllServicesAndCharacteristics();
      const services = await withServices.services();

      const chars = new Map<string, string>();
      for (const service of services) {
        const serviceChars = await service.characteristics();
        serviceChars.forEach((c) => chars.set(c.uuid, service.uuid));
      }

      const sensor: ConnectedSensor = {
        id: device.id,
        name: device.name || "Unknown Device",
        services: services.map((s) => s.uuid),
        device: withServices,
        connectionTime: new Date(),
        characteristics: chars,
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

  static async disconnect(deviceId: string) {
    const sensor = this.connectedSensors.get(deviceId);
    if (sensor?.device) {
      try {
        await sensor.device.cancelConnection();
      } catch (err) {
        console.error("Disconnect error", err);
      }
    }
    this.connectedSensors.delete(deviceId);
  }

  static async disconnectAll() {
    await Promise.allSettled(
      Array.from(this.connectedSensors.keys()).map((id) => this.disconnect(id)),
    );
  }

  /** Characteristic monitoring */
  private static async monitorKnownCharacteristics(sensor: ConnectedSensor) {
    const known = {
      "00002a37-0000-1000-8000-00805f9b34fb": "heart_rate",
      "00002a63-0000-1000-8000-00805f9b34fb": "cycling_power",
      "00002a5b-0000-1000-8000-00805f9b34fb": "csc_measurement",
    };

    for (const [charUuid, serviceUuid] of sensor.characteristics) {
      const type = known[charUuid.toLowerCase()];
      if (!type) continue;
      const service = (await sensor.device.services()).find(
        (s) => s.uuid === serviceUuid,
      );
      if (!service) continue;
      const characteristic = (await service.characteristics()).find(
        (c) => c.uuid === charUuid,
      );
      if (characteristic) {
        characteristic.monitor((error, char) => {
          if (error || !char?.value) return;
          this.handleData(
            type,
            Buffer.from(char.value, "base64").buffer,
            sensor.id,
          );
        });
      }
    }
  }

  private static handleData(type: string, raw: ArrayBuffer, deviceId: string) {
    let readings: SensorReading[] = [];
    switch (type) {
      case "heart_rate":
        const hr = parseHeartRate(raw);
        if (hr) readings = [hr];
        break;
      case "cycling_power":
        readings = parseCyclingPower(raw);
        break;
      case "csc_measurement":
        readings = parseCSCMeasurement(raw);
        break;
    }
    readings.forEach((r) => {
      r.deviceId = deviceId;
      if (validateSensorReading(r)) {
        this.dataCallbacks.forEach((cb) => cb(r));
      }
    });
  }

  /** Allow other services to listen to sensor data */
  static subscribe(cb: (reading: SensorReading) => void) {
    this.dataCallbacks.add(cb);
    return () => this.dataCallbacks.delete(cb);
  }

  static getConnected(): ConnectedSensor[] {
    return Array.from(this.connectedSensors.values());
  }
}
