import AsyncStorage from "@react-native-async-storage/async-storage";

const PERSISTED_SENSORS_KEY = "@sensors:persisted_devices";

export interface PersistedSensor {
  id: string;
  name: string;
  lastConnected: number;
  services?: string[];
  characteristics?: string[];
  batteryLevel?: number;
  isTrainer?: boolean;
  isControllable?: boolean;
  autoConnectSuppressed?: boolean;
}

interface KnownSensorInput {
  id: string;
  name: string;
  services: string[];
  characteristics: Map<string, string>;
  batteryLevel?: number;
  isTrainer?: boolean;
  isControllable?: boolean;
}

export class KnownSensorRegistry {
  private sensors: Map<string, PersistedSensor> = new Map();
  private autoReconnectSuppressedSensorIds: Set<string> = new Set();
  private callbacks: Set<(sensors: PersistedSensor[]) => void> = new Set();

  public initialized = false;

  async load(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(PERSISTED_SENSORS_KEY);
      if (data) {
        const parsed: unknown = JSON.parse(data);
        const sensors = Array.isArray(parsed)
          ? parsed.filter((sensor): sensor is PersistedSensor => {
              return (
                sensor &&
                typeof sensor === "object" &&
                typeof (sensor as PersistedSensor).id === "string" &&
                typeof (sensor as PersistedSensor).name === "string" &&
                typeof (sensor as PersistedSensor).lastConnected === "number"
              );
            })
          : [];

        this.sensors = new Map(sensors.map((sensor) => [sensor.id, sensor]));
        this.autoReconnectSuppressedSensorIds = new Set(
          sensors.filter((sensor) => sensor.autoConnectSuppressed).map((sensor) => sensor.id),
        );
        console.log(`[SensorsManager] Loaded ${sensors.length} persisted sensors`);
      }
    } catch (error) {
      console.warn("[SensorsManager] Failed to load persisted sensors:", error);
      this.sensors = new Map();
      this.autoReconnectSuppressedSensorIds.clear();
    } finally {
      this.initialized = true;
      this.notify();
    }
  }

  get(id: string): PersistedSensor | undefined {
    return this.sensors.get(id);
  }

  getAll(): PersistedSensor[] {
    return Array.from(this.sensors.values());
  }

  get size(): number {
    return this.sensors.size;
  }

  entries(): IterableIterator<[string, PersistedSensor]> {
    return this.sensors.entries();
  }

  subscribe(cb: (sensors: PersistedSensor[]) => void): () => void {
    this.callbacks.add(cb);
    cb(this.getAll());
    return () => {
      this.callbacks.delete(cb);
    };
  }

  async add(sensor: KnownSensorInput): Promise<void> {
    this.sensors.set(sensor.id, {
      id: sensor.id,
      name: sensor.name,
      lastConnected: Date.now(),
      services: sensor.services,
      characteristics: Array.from(sensor.characteristics.keys()),
      batteryLevel: sensor.batteryLevel,
      isTrainer: sensor.isTrainer,
      isControllable: sensor.isControllable,
      autoConnectSuppressed: false,
    });
    this.autoReconnectSuppressedSensorIds.delete(sensor.id);
    await this.save();
  }

  async remove(id: string): Promise<void> {
    this.sensors.delete(id);
    this.autoReconnectSuppressedSensorIds.delete(id);
    await this.save();
  }

  async clear(): Promise<void> {
    this.sensors.clear();
    this.autoReconnectSuppressedSensorIds.clear();
    try {
      await AsyncStorage.removeItem(PERSISTED_SENSORS_KEY);
      console.log("[SensorsManager] Persisted sensors cleared successfully");
      this.notify();
    } catch (error) {
      console.warn("[SensorsManager] Failed to clear persisted sensors:", error);
      throw error;
    }
  }

  async setAutoReconnectSuppressed(deviceId: string, suppressed: boolean): Promise<void> {
    if (suppressed) {
      this.autoReconnectSuppressedSensorIds.add(deviceId);
    } else {
      this.autoReconnectSuppressedSensorIds.delete(deviceId);
    }

    const persistedSensor = this.sensors.get(deviceId);
    if (persistedSensor) {
      this.sensors.set(deviceId, {
        ...persistedSensor,
        autoConnectSuppressed: suppressed,
      });
      await this.save();
    }
  }

  isAutoReconnectSuppressed(deviceId: string): boolean {
    return this.autoReconnectSuppressedSensorIds.has(deviceId);
  }

  private async save(): Promise<void> {
    try {
      const sensors = this.getAll();
      await AsyncStorage.setItem(PERSISTED_SENSORS_KEY, JSON.stringify(sensors));
      console.log(`[SensorsManager] Saved ${sensors.length} persisted sensors`);
      this.notify();
    } catch (error) {
      console.warn("[SensorsManager] Failed to save persisted sensors:", error);
    }
  }

  private notify(): void {
    const sensors = this.getAll();
    this.callbacks.forEach((cb) => {
      try {
        cb(sensors);
      } catch (error) {
        console.error("[SensorsManager] Persisted sensor callback failed:", error);
      }
    });
  }
}
