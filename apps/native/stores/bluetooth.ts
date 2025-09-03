// stores/bluetoothStore.ts
import { BleManager, Device } from "react-native-ble-plx";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// Bluetooth Service UUIDs for fitness sensors
export const BLE_SERVICES = {
  HEART_RATE: "180D",
  CYCLING_POWER: "1818",
  CYCLING_SPEED_CADENCE: "1816",
  RUNNING_SPEED_CADENCE: "1814",
  FITNESS_MACHINE: "1826",
  DEVICE_INFORMATION: "180A",
} as const;

// Characteristic UUIDs
export const BLE_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "2A37",
  CYCLING_POWER_MEASUREMENT: "2A63",
  CSC_MEASUREMENT: "2A5B",
  RSC_MEASUREMENT: "2A53",
  DEVICE_NAME: "2A00",
  MANUFACTURER_NAME: "2A29",
  MODEL_NUMBER: "2A24",
  SERIAL_NUMBER: "2A25",
  BATTERY_LEVEL: "2A19",
} as const;

// Fitness service UUIDs for device detection
const FITNESS_SERVICE_UUIDS = [
  "180D", // Heart Rate
  "1818", // Cycling Power
  "1816", // Cycling Speed and Cadence
  "1814", // Running Speed and Cadence
] as const;

// Fitness device name patterns
const FITNESS_DEVICE_PATTERNS = [
  /heart\s*rate/i,
  /hrm/i,
  /polar/i,
  /garmin/i,
  /wahoo/i,
  /suunto/i,
  /stages/i,
  /quarq/i,
  /kickr/i,
  /trainer/i,
  /power/i,
  /cadence/i,
  /speed/i,
  /fitness/i,
  /bike/i,
  /cycling/i,
  /running/i,
  /watch/i,
  /sensor/i,
] as const;

export interface SensorData {
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  timestamp: number;
}

export type SensorType = "heartRate" | "power" | "cadence" | "speed";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
  manufacturerData?: string;
  connectionStatus: ConnectionStatus;
  supportedSensors: SensorType[];
  deviceType: "fitness" | "other";
  lastSeen: number;
  connectionError?: string;
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    batteryLevel?: number;
  };
}

export interface DevicePreferences {
  preferredHeartRateDevice?: string;
  preferredPowerDevice?: string;
  preferredCadenceDevice?: string;
  preferredSpeedDevice?: string;
  autoConnect: boolean;
  reconnectAttempts: number;
  showUnknownDevices: boolean;
}

export interface BluetoothState {
  // BLE Manager
  bleManager: BleManager;

  // State
  isScanning: boolean;
  isBluetoothEnabled: boolean;

  // Simplified: Single devices array instead of dual Maps
  devices: BluetoothDevice[];

  // Sensor data
  currentSensorData: SensorData;
  sensorDataHistory: SensorData[];

  // Preferences
  devicePreferences: DevicePreferences;

  // Actions
  initializeBluetooth: () => Promise<void>;
  startScanning: (timeout?: number) => Promise<void>;
  stopScanning: () => void;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnectFromDevice: (deviceId: string) => Promise<void>;
  disconnectAllDevices: () => Promise<void>;
  setPreferredDevice: (sensorType: SensorType, deviceId: string) => void;
  updateDevicePreferences: (preferences: Partial<DevicePreferences>) => void;
  clearSensorData: () => void;
  getDeviceInfo: (deviceId: string) => Promise<void>;
  autoConnectPreferredDevices: () => Promise<void>;
  toggleShowUnknownDevices: () => void;

  // Computed getters (derived state)
  getConnectedDevices: () => BluetoothDevice[];
  getFitnessDevices: () => BluetoothDevice[];
  getDeviceById: (id: string) => BluetoothDevice | undefined;
}

// Helper functions
function isFitnessDevice(device: Device): boolean {
  const serviceUUIDs = device.serviceUUIDs || [];
  const name = (device.name || "").toLowerCase();

  // Check services first (most reliable)
  const hasFitnessService = serviceUUIDs.some((uuid) =>
    FITNESS_SERVICE_UUIDS.includes(uuid.toUpperCase() as any),
  );

  // Check name for fitness keywords
  const hasFitnessName = FITNESS_DEVICE_PATTERNS.some((pattern) =>
    pattern.test(name),
  );

  return hasFitnessService || hasFitnessName;
}

function getDeviceName(device: Device): string {
  if (device.name?.trim()) {
    return device.name;
  }

  // Fallback based on services
  const serviceUUIDs = device.serviceUUIDs || [];
  const upperCaseUUIDs = serviceUUIDs.map((uuid) => uuid.toUpperCase());

  if (upperCaseUUIDs.includes("180D")) return "Heart Rate Monitor";
  if (upperCaseUUIDs.includes("1818")) return "Power Meter";
  if (upperCaseUUIDs.includes("1816")) return "Speed/Cadence Sensor";

  return "Bluetooth Device";
}

function getSupportedSensors(serviceUUIDs: string[]): SensorType[] {
  const sensors: SensorType[] = [];
  const upperCaseUUIDs = serviceUUIDs.map((uuid) => uuid.toUpperCase());

  if (upperCaseUUIDs.includes(BLE_SERVICES.HEART_RATE)) {
    sensors.push("heartRate");
  }
  if (upperCaseUUIDs.includes(BLE_SERVICES.CYCLING_POWER)) {
    sensors.push("power");
  }
  if (upperCaseUUIDs.includes(BLE_SERVICES.CYCLING_SPEED_CADENCE)) {
    sensors.push("cadence", "speed");
  }

  return sensors;
}

// Device update helper
function updateDevice(
  devices: BluetoothDevice[],
  deviceId: string,
  updates: Partial<BluetoothDevice>,
): BluetoothDevice[] {
  return devices.map((device) =>
    device.id === deviceId ? { ...device, ...updates } : device,
  );
}

// Add or update device helper
function upsertDevice(
  devices: BluetoothDevice[],
  newDevice: BluetoothDevice,
): BluetoothDevice[] {
  const existingIndex = devices.findIndex((d) => d.id === newDevice.id);

  if (existingIndex >= 0) {
    // Update existing device
    const updated = [...devices];
    updated[existingIndex] = {
      ...updated[existingIndex],
      ...newDevice,
      lastSeen: Date.now(),
    };
    return updated;
  } else {
    // Add new device
    return [...devices, { ...newDevice, lastSeen: Date.now() }];
  }
}

export const useBluetoothStore = create<BluetoothState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    bleManager: new BleManager(),
    isScanning: false,
    isBluetoothEnabled: false,
    devices: [], // Simplified: single array instead of dual Maps
    currentSensorData: { timestamp: Date.now() },
    sensorDataHistory: [],
    devicePreferences: {
      autoConnect: true,
      reconnectAttempts: 3,
      showUnknownDevices: false,
    },

    // Initialize Bluetooth
    initializeBluetooth: async () => {
      const { bleManager } = get();
      try {
        const state = await bleManager.state();
        set({ isBluetoothEnabled: state === "PoweredOn" });

        bleManager.onStateChange((newState) => {
          set({ isBluetoothEnabled: newState === "PoweredOn" });

          if (newState === "PoweredOn") {
            get().autoConnectPreferredDevices();
          } else if (newState === "PoweredOff") {
            // Reset all devices to disconnected
            set((state) => ({
              devices: state.devices.map((device) => ({
                ...device,
                connectionStatus: "disconnected" as ConnectionStatus,
              })),
              isScanning: false,
            }));
          }
        }, true);
      } catch (error) {
        console.error("Failed to initialize Bluetooth:", error);
        throw error;
      }
    },

    // Start scanning
    startScanning: async (timeout = 10000) => {
      const { isBluetoothEnabled, bleManager, devicePreferences } = get();

      if (!isBluetoothEnabled) {
        console.warn("Bluetooth is not enabled.");
        return;
      }

      set({ isScanning: true });

      bleManager.startDeviceScan(
        null, // Scan for all devices
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            set({ isScanning: false });
            console.error("Scan Error:", error);
            return;
          }

          if (device) {
            const isFitness = isFitnessDevice(device);
            const shouldShow =
              isFitness || devicePreferences.showUnknownDevices;

            if (shouldShow) {
              const bluetoothDevice: BluetoothDevice = {
                id: device.id,
                name: getDeviceName(device),
                rssi: device.rssi || 0,
                serviceUUIDs: device.serviceUUIDs || [],
                manufacturerData: device.manufacturerData,
                connectionStatus: "disconnected",
                supportedSensors: getSupportedSensors(
                  device.serviceUUIDs || [],
                ),
                deviceType: isFitness ? "fitness" : "other",
                lastSeen: Date.now(),
              };

              set((state) => ({
                devices: upsertDevice(state.devices, bluetoothDevice),
              }));
            }
          }
        },
      );

      // Stop scanning after timeout
      setTimeout(() => {
        bleManager.stopDeviceScan();
        set({ isScanning: false });
      }, timeout);
    },

    // Stop scanning
    stopScanning: () => {
      const { bleManager } = get();
      bleManager.stopDeviceScan();
      set({ isScanning: false });
    },

    // Connect to device
    connectToDevice: async (deviceId: string) => {
      const { bleManager, devices } = get();
      const device = devices.find((d) => d.id === deviceId);

      if (!device) {
        throw new Error("Device not found");
      }

      // Mark as connecting
      set((state) => ({
        devices: updateDevice(state.devices, deviceId, {
          connectionStatus: "connecting",
          connectionError: undefined,
        }),
      }));

      try {
        const connectedDevice = await bleManager.connectToDevice(deviceId);
        await connectedDevice.discoverAllServicesAndCharacteristics();

        // Subscribe to sensor data
        await subscribeToSensorData(connectedDevice, deviceId);

        // Update connection status
        set((state) => ({
          devices: updateDevice(state.devices, deviceId, {
            connectionStatus: "connected",
          }),
        }));

        // Get device information
        await get().getDeviceInfo(deviceId);
      } catch (error) {
        console.error(`Failed to connect to device ${deviceId}:`, error);

        set((state) => ({
          devices: updateDevice(state.devices, deviceId, {
            connectionStatus: "disconnected",
            connectionError:
              error instanceof Error ? error.message : "Connection failed",
          }),
        }));

        throw error;
      }
    },

    // Disconnect from device
    disconnectFromDevice: async (deviceId: string) => {
      const { bleManager } = get();

      try {
        await bleManager.cancelDeviceConnection(deviceId);

        set((state) => ({
          devices: updateDevice(state.devices, deviceId, {
            connectionStatus: "disconnected",
            connectionError: undefined,
          }),
        }));
      } catch (error) {
        console.error(`Failed to disconnect from device ${deviceId}:`, error);
        throw error;
      }
    },

    // Disconnect all devices
    disconnectAllDevices: async () => {
      const { getConnectedDevices } = get();
      const connectedDevices = getConnectedDevices();

      const disconnectPromises = connectedDevices.map((device) =>
        get().disconnectFromDevice(device.id),
      );

      await Promise.allSettled(disconnectPromises);
    },

    // Set preferred device
    setPreferredDevice: (sensorType: SensorType, deviceId: string) => {
      set((state) => ({
        devicePreferences: {
          ...state.devicePreferences,
          [`preferred${sensorType.charAt(0).toUpperCase() + sensorType.slice(1)}Device`]:
            deviceId,
        },
      }));
    },

    // Update device preferences
    updateDevicePreferences: (preferences: Partial<DevicePreferences>) => {
      set((state) => ({
        devicePreferences: { ...state.devicePreferences, ...preferences },
      }));
    },

    // Clear sensor data
    clearSensorData: () => {
      set({
        currentSensorData: { timestamp: Date.now() },
        sensorDataHistory: [],
      });
    },

    // Get device information
    getDeviceInfo: async (deviceId: string) => {
      const { bleManager } = get();

      try {
        const services = await bleManager.servicesForDevice(deviceId);
        const deviceInfoService = services.find(
          (s) => s.uuid.toUpperCase() === BLE_SERVICES.DEVICE_INFORMATION,
        );

        if (!deviceInfoService) return;

        const characteristics = await bleManager.characteristicsForDevice(
          deviceId,
          deviceInfoService.uuid,
        );

        const deviceInfo: any = {};

        // Helper to read characteristic data
        const readCharacteristic = async (uuid: string) => {
          const char = characteristics.find(
            (c) => c.uuid.toUpperCase() === uuid,
          );
          if (char) {
            try {
              const data = await char.read();
              return data?.value ? atob(data.value) : undefined;
            } catch (error) {
              console.warn(`Failed to read ${uuid}:`, error);
              return undefined;
            }
          }
        };

        // Read device information
        deviceInfo.manufacturer = await readCharacteristic(
          BLE_CHARACTERISTICS.MANUFACTURER_NAME,
        );
        deviceInfo.model = await readCharacteristic(
          BLE_CHARACTERISTICS.MODEL_NUMBER,
        );
        deviceInfo.serialNumber = await readCharacteristic(
          BLE_CHARACTERISTICS.SERIAL_NUMBER,
        );

        // Read battery level (special handling for numeric value)
        const batteryChar = characteristics.find(
          (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.BATTERY_LEVEL,
        );
        if (batteryChar) {
          try {
            const data = await batteryChar.read();
            if (data?.value) {
              deviceInfo.batteryLevel = Buffer.from(
                data.value,
                "base64",
              ).readUInt8(0);
            }
          } catch (error) {
            console.warn("Failed to read battery level:", error);
          }
        }

        // Update device with info
        set((state) => ({
          devices: updateDevice(state.devices, deviceId, { deviceInfo }),
        }));
      } catch (error) {
        console.error(`Failed to get device info for ${deviceId}:`, error);
      }
    },

    // Auto-connect to preferred devices
    autoConnectPreferredDevices: async () => {
      const { isBluetoothEnabled, devicePreferences, getConnectedDevices } =
        get();

      if (!isBluetoothEnabled) return;

      const connectedDeviceIds = new Set(
        getConnectedDevices().map((d) => d.id),
      );
      const preferredDeviceIds = Object.values(devicePreferences)
        .filter((id): id is string => typeof id === "string")
        .filter((id) => !connectedDeviceIds.has(id));

      if (preferredDeviceIds.length === 0) return;

      console.log(
        `Attempting to auto-connect to preferred devices: ${preferredDeviceIds.join(", ")}`,
      );

      const connectionPromises = preferredDeviceIds.map((deviceId) =>
        get()
          .connectToDevice(deviceId)
          .catch((error) => {
            console.error(`Auto-connect failed for device ${deviceId}:`, error);
          }),
      );

      await Promise.allSettled(connectionPromises);
    },

    // Toggle showing unknown devices
    toggleShowUnknownDevices: () => {
      set((state) => ({
        devicePreferences: {
          ...state.devicePreferences,
          showUnknownDevices: !state.devicePreferences.showUnknownDevices,
        },
      }));
    },

    // Computed getters (derived state)
    getConnectedDevices: () => {
      return get().devices.filter(
        (device) => device.connectionStatus === "connected",
      );
    },

    getFitnessDevices: () => {
      return get().devices.filter((device) => device.deviceType === "fitness");
    },

    getDeviceById: (id: string) => {
      return get().devices.find((device) => device.id === id);
    },
  })),
);

// Subscribe to sensor data (simplified error handling)
async function subscribeToSensorData(device: Device, deviceId: string) {
  try {
    const services = await device.services();

    // Heart Rate Service
    await subscribeToHeartRate(services, deviceId);

    // Cycling Power Service
    await subscribeToPower(services, deviceId);

    // CSC Service (Cadence/Speed)
    await subscribeToCSC(services, deviceId);

    // Update timestamp periodically
    const updateInterval = setInterval(() => {
      useBluetoothStore.setState((state) => {
        const currentSensorData = {
          ...state.currentSensorData,
          timestamp: Date.now(),
        };

        return {
          devices: updateDevice(state.devices, deviceId, {
            lastSeen: Date.now(),
          }),
          currentSensorData,
          sensorDataHistory: [
            ...state.sensorDataHistory,
            currentSensorData,
          ].slice(-1000), // Keep last 1000 readings
        };
      });
    }, 1000);

    return () => clearInterval(updateInterval);
  } catch (error) {
    console.error("Error subscribing to sensor data:", error);
  }
}

// Helper functions for specific sensor subscriptions
async function subscribeToHeartRate(services: any[], deviceId: string) {
  const heartRateService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.HEART_RATE,
  );
  if (!heartRateService) return;

  const characteristics = await heartRateService.characteristics();
  const heartRateChar = characteristics.find(
    (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.HEART_RATE_MEASUREMENT,
  );

  if (heartRateChar) {
    heartRateChar.monitor((error, char) => {
      if (error || !char?.value) return;

      const heartRate = parseHeartRateData(char.value);
      useBluetoothStore.setState((state) => ({
        currentSensorData: {
          ...state.currentSensorData,
          heartRate,
          timestamp: Date.now(),
        },
      }));
    });
  }
}

async function subscribeToPower(services: any[], deviceId: string) {
  const powerService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.CYCLING_POWER,
  );
  if (!powerService) return;

  const characteristics = await powerService.characteristics();
  const powerChar = characteristics.find(
    (c) =>
      c.uuid.toUpperCase() === BLE_CHARACTERISTICS.CYCLING_POWER_MEASUREMENT,
  );

  if (powerChar) {
    powerChar.monitor((error, char) => {
      if (error || !char?.value) return;

      const power = parsePowerData(char.value);
      useBluetoothStore.setState((state) => ({
        currentSensorData: {
          ...state.currentSensorData,
          power,
          timestamp: Date.now(),
        },
      }));
    });
  }
}

async function subscribeToCSC(services: any[], deviceId: string) {
  const cscService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.CYCLING_SPEED_CADENCE,
  );
  if (!cscService) return;

  const characteristics = await cscService.characteristics();
  const cscChar = characteristics.find(
    (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.CSC_MEASUREMENT,
  );

  if (cscChar) {
    cscChar.monitor((error, char) => {
      if (error || !char?.value) return;

      const { cadence, speed } = parseCSCData(char.value);
      useBluetoothStore.setState((state) => {
        const newSensorData = {
          ...state.currentSensorData,
          timestamp: Date.now(),
        };

        if (cadence !== undefined) newSensorData.cadence = cadence;
        if (speed !== undefined) newSensorData.speed = speed;

        return { currentSensorData: newSensorData };
      });
    });
  }
}

// Data parsing functions
function parseHeartRateData(base64Data: string): number {
  const buffer = Buffer.from(base64Data, "base64");
  const flags = buffer.readUInt8(0);
  const is16Bit = !!(flags & 0x01);
  return is16Bit ? buffer.readUInt16LE(1) : buffer.readUInt8(1);
}

function parsePowerData(base64Data: string): number {
  const buffer = Buffer.from(base64Data, "base64");
  return buffer.readUInt16LE(2); // Instantaneous power at bytes 2-3
}

function parseCSCData(base64Data: string): {
  cadence?: number;
  speed?: number;
} {
  const buffer = Buffer.from(base64Data, "base64");
  const flags = buffer.readUInt8(0);

  let cadence: number | undefined;
  let speed: number | undefined;
  let offset = 1;

  // Wheel Revolution Data Present
  if (flags & 0x01) {
    const wheelRevolutions = buffer.readUInt32LE(offset);
    const wheelEventTime = buffer.readUInt16LE(offset + 4);
    offset += 6;
    // Calculate speed from wheel data (requires previous values)
  }

  // Crank Revolution Data Present
  if (flags & 0x02) {
    const crankRevolutions = buffer.readUInt16LE(offset);
    const crankEventTime = buffer.readUInt16LE(offset + 2);
    // Calculate cadence from crank data (requires previous values)
    cadence = crankRevolutions; // Simplified - calculate actual RPM
  }

  return { cadence, speed };
}
