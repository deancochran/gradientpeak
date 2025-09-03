// stores/bluetoothStore.ts
import { BleManager, Device } from "react-native-ble-plx";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// Bluetooth Service UUIDs for common fitness sensors
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

export interface SensorData {
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
  timestamp: number;
}

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
  serviceUUIDs: string[];
  manufacturerData?: string;
  isConnected: boolean;
  isConnecting: boolean;
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    batteryLevel?: number;
  };
  supportedSensors: SensorType[];
  lastSeen: number;
}

export type SensorType = "heartRate" | "power" | "cadence" | "speed";

export interface DevicePreferences {
  preferredHeartRateDevice?: string;
  preferredPowerDevice?: string;
  preferredCadenceDevice?: string;
  preferredSpeedDevice?: string;
  autoConnect: boolean;
  reconnectAttempts: number;
}

export interface BluetoothState {
  // BLE Manager
  bleManager: BleManager;

  // Scanning
  isScanning: boolean;

  // Devices
  discoveredDevices: Map<string, BluetoothDevice>;
  connectedDevices: Map<string, BluetoothDevice>;

  // Sensor data
  currentSensorData: SensorData;
  sensorDataHistory: SensorData[];

  // Preferences
  devicePreferences: DevicePreferences;

  // Connection state
  isBluetoothEnabled: boolean;
  connectionErrors: Map<string, string>;

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
}

export const useBluetoothStore = create<BluetoothState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    bleManager: new BleManager(),
    isScanning: false,
    discoveredDevices: new Map(),
    connectedDevices: new Map(),
    currentSensorData: { timestamp: Date.now() },
    sensorDataHistory: [],
    devicePreferences: {
      autoConnect: true,
      reconnectAttempts: 3,
    },
    isBluetoothEnabled: false,
    connectionErrors: new Map(),

    // Initialize Bluetooth
    initializeBluetooth: async () => {
      const { bleManager } = get();
      try {
        const state = await bleManager.state();
        set({ isBluetoothEnabled: state === "PoweredOn" });

        // Listen for Bluetooth state changes
        bleManager.onStateChange((newState) => {
          set({ isBluetoothEnabled: newState === "PoweredOn" });
          if (newState === "PoweredOn") {
            // Auto-connect to preferred devices when Bluetooth becomes available
            get().autoConnectPreferredDevices();
          } else if (newState === "PoweredOff") {
            // Clear connected devices when Bluetooth is disabled
            set({
              connectedDevices: new Map(),
              discoveredDevices: new Map(),
              isScanning: false,
            });
          }
        }, true);
      } catch (error) {
        console.error("Failed to initialize Bluetooth:", error);
        throw error;
      }
    },

    startScanning: async (timeout = 10000) => {
      const { isBluetoothEnabled, bleManager, set } = get();

      if (!isBluetoothEnabled) {
        console.warn("Bluetooth is not enabled.");
        return;
      }

      set({
        isScanning: true,
        discoveredDevices: new Map(),
        connectionErrors: new Map(),
      });

      bleManager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            set({ isScanning: false });
            console.error("Scan Error:", error);
            return;
          }

          if (device) {
            set((state) => {
              const newMap = new Map(state.discoveredDevices).set(
                device.id,
                device as BluetoothDevice,
              );
              return { discoveredDevices: newMap };
            });
          }
        },
      );

      // Stop scanning after the specified timeout
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
      const { bleManager, discoveredDevices } = get();
      const device = discoveredDevices.get(deviceId);
      if (!device) {
        throw new Error("Device not found");
      }

      // Mark device as connecting
      set((state) => ({
        discoveredDevices: new Map(state.discoveredDevices).set(deviceId, {
          ...device,
          isConnecting: true,
        }),
        connectionErrors: new Map(state.connectionErrors).set(deviceId, ""),
      }));

      try {
        const connectedDevice = await bleManager.connectToDevice(deviceId);
        await connectedDevice.discoverAllServicesAndCharacteristics();
        const updatedDevice: BluetoothDevice = {
          ...device,
          isConnected: true,
          isConnecting: false,
        };

        // Subscribe to sensor data
        await subscribeToSensorData(connectedDevice, deviceId);

        // Get device information
        await get().getDeviceInfo(deviceId);

        set((state) => ({
          connectedDevices: new Map(state.connectedDevices).set(
            deviceId,
            updatedDevice,
          ),
          discoveredDevices: new Map(state.discoveredDevices).set(
            deviceId,
            updatedDevice,
          ),
        }));
      } catch (error) {
        console.error(`Failed to connect to device ${deviceId}:`, error);

        set((state) => ({
          discoveredDevices: new Map(state.discoveredDevices).set(deviceId, {
            ...device,
            isConnecting: false,
            isConnected: false,
          }),
          connectionErrors: new Map(state.connectionErrors).set(
            deviceId,
            error instanceof Error ? error.message : "Connection failed",
          ),
        }));
        throw error;
      }
    },

    // Disconnect from device
    disconnectFromDevice: async (deviceId: string) => {
      const { bleManager, connectedDevices } = get();

      try {
        await bleManager.cancelDeviceConnection(deviceId);
        const device = connectedDevices.get(deviceId);
        if (device) {
          const updatedDevice = { ...device, isConnected: false };

          set((state) => {
            const newConnectedDevices = new Map(state.connectedDevices);
            newConnectedDevices.delete(deviceId);

            return {
              connectedDevices: newConnectedDevices,
              discoveredDevices: new Map(state.discoveredDevices).set(
                deviceId,
                updatedDevice,
              ),
            };
          });
        }
      } catch (error) {
        console.error(`Failed to disconnect from device ${deviceId}:`, error);
        throw error;
      }
    },

    // Disconnect all devices
    disconnectAllDevices: async () => {
      const { connectedDevices } = get();
      const disconnectPromises = Array.from(connectedDevices.keys()).map(
        (deviceId) => get().disconnectFromDevice(deviceId),
      );
      await Promise.allSettled(disconnectPromises);
    },

    // Set preferred device for sensor type
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

        if (deviceInfoService) {
          const deviceCharacteristics =
            await bleManager.characteristicsForDevice(
              deviceId,
              deviceInfoService.uuid,
            );

          const manufacturerCharacteristic = deviceCharacteristics.find(
            (c) =>
              c.uuid.toUpperCase() === BLE_CHARACTERISTICS.MANUFACTURER_NAME,
          );
          const modelCharacteristic = deviceCharacteristics.find(
            (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.MODEL_NUMBER,
          );
          const serialCharacteristic = deviceCharacteristics.find(
            (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.SERIAL_NUMBER,
          );
          const batteryCharacteristic = deviceCharacteristics.find(
            (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.BATTERY_LEVEL,
          );

          let deviceInfo = {};
          if (manufacturerCharacteristic) {
            const data = await manufacturerCharacteristic.read();
            if (data?.value) {
              deviceInfo = { ...deviceInfo, manufacturer: atob(data.value) };
            }
          }
          if (modelCharacteristic) {
            const data = await modelCharacteristic.read();
            if (data?.value) {
              deviceInfo = { ...deviceInfo, model: atob(data.value) };
            }
          }
          if (serialCharacteristic) {
            const data = await serialCharacteristic.read();
            if (data?.value) {
              deviceInfo = { ...deviceInfo, serialNumber: atob(data.value) };
            }
          }
          if (batteryCharacteristic) {
            const data = await batteryCharacteristic.read();
            if (data?.value) {
              deviceInfo = {
                ...deviceInfo,
                batteryLevel: Buffer.from(data.value, "base64").readUInt8(0),
              };
            }
          }

          set((state) => {
            const currentDevice =
              state.connectedDevices.get(deviceId) ||
              state.discoveredDevices.get(deviceId);
            if (currentDevice) {
              const updatedDevice = { ...currentDevice, deviceInfo };
              const newConnectedDevices = new Map(state.connectedDevices).set(
                deviceId,
                updatedDevice,
              );
              const newDiscoveredDevices = new Map(state.discoveredDevices).set(
                deviceId,
                updatedDevice,
              );
              return {
                connectedDevices: newConnectedDevices,
                discoveredDevices: newDiscoveredDevices,
              };
            }
            return state;
          });
        }
      } catch (error) {
        console.error(`Failed to get device info for ${deviceId}:`, error);
      }
    },

    // Auto-connect to preferred devices
    autoConnectPreferredDevices: async () => {
      const {
        isBluetoothEnabled,
        devicePreferences,
        connectedDevices,
        connectToDevice,
      } = get();

      if (!isBluetoothEnabled) {
        return;
      }

      const preferredDeviceIds = Object.values(devicePreferences).filter(
        (id) => typeof id === "string",
      ) as string[];

      const devicesToConnect = preferredDeviceIds.filter(
        (id) => !connectedDevices.has(id),
      );

      if (devicesToConnect.length > 0) {
        console.log(
          `Attempting to auto-connect to preferred devices: ${devicesToConnect.join(", ")}`,
        );

        const connectionPromises = devicesToConnect.map((deviceId) =>
          connectToDevice(deviceId).catch((error) => {
            console.error(`Auto-connect failed for device ${deviceId}:`, error);
          }),
        );
        await Promise.allSettled(connectionPromises);
      }
    },
  })),
);

// Subscribe to sensor data
async function subscribeToSensorData(device: Device, deviceId: string) {
  const { set } = useBluetoothStore.getState();

  const services = await device.services();

  // Handle Heart Rate Service
  const heartRateService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.HEART_RATE,
  );
  if (heartRateService) {
    const characteristics = await heartRateService.characteristics();
    const heartRateCharacteristic = characteristics.find(
      (c) =>
        c.uuid.toUpperCase() === BLE_CHARACTERISTICS.HEART_RATE_MEASUREMENT,
    );
    if (heartRateCharacteristic) {
      heartRateCharacteristic.monitor((error, char) => {
        if (error) {
          console.error("Heart Rate Monitor Error:", error);
          return;
        }
        if (char && char.value) {
          const heartRate = parseHeartRateData(char.value);
          set((state) => ({
            currentSensorData: { ...state.currentSensorData, heartRate },
          }));
        }
      });
    }
  }

  // Handle Cycling Power Service
  const cyclingPowerService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.CYCLING_POWER,
  );
  if (cyclingPowerService) {
    const characteristics = await cyclingPowerService.characteristics();
    const cyclingPowerCharacteristic = characteristics.find(
      (c) =>
        c.uuid.toUpperCase() === BLE_CHARACTERISTICS.CYCLING_POWER_MEASUREMENT,
    );
    if (cyclingPowerCharacteristic) {
      cyclingPowerCharacteristic.monitor((error, char) => {
        if (error) {
          console.error("Cycling Power Monitor Error:", error);
          return;
        }
        if (char && char.value) {
          const power = parsePowerData(char.value);
          set((state) => ({
            currentSensorData: { ...state.currentSensorData, power },
          }));
        }
      });
    }
  }

  // Handle CSC Service (Cadence/Speed)
  const cscService = services.find(
    (s) => s.uuid.toUpperCase() === BLE_SERVICES.CYCLING_SPEED_CADENCE,
  );
  if (cscService) {
    const characteristics = await cscService.characteristics();
    const cscCharacteristic = characteristics.find(
      (c) => c.uuid.toUpperCase() === BLE_CHARACTERISTICS.CSC_MEASUREMENT,
    );
    if (cscCharacteristic) {
      cscCharacteristic.monitor((error, char) => {
        if (error) {
          console.error("CSC Monitor Error:", error);
          return;
        }
        if (char && char.value) {
          const { cadence, speed } = parseCSCData(char.value);
          set((state) => {
            const newSensorData = { ...state.currentSensorData };
            if (cadence !== undefined) newSensorData.cadence = cadence;
            if (speed !== undefined) newSensorData.speed = speed;
            return { currentSensorData: newSensorData };
          });
        }
      });
    }
  }

  // Update last seen timestamp and sensor data timestamp for all connected sensors
  const updateTimestamp = setInterval(() => {
    set((state) => {
      const currentSensorData = {
        ...state.currentSensorData,
        timestamp: Date.now(),
      };
      const connected = state.connectedDevices.get(deviceId);
      if (connected) {
        const updated = { ...connected, lastSeen: Date.now() };
        const newMap = new Map(state.connectedDevices).set(deviceId, updated);
        return {
          connectedDevices: newMap,
          currentSensorData,
          sensorDataHistory: [
            ...state.sensorDataHistory,
            currentSensorData,
          ].slice(-1000), // Keep last 1000 readings
        };
      }
      return state;
    });
  }, 1000); // Update every second

  // Cleanup function for subscriptions (not used in this file but good practice)
  return () => {
    // Note: React-Native-BLE-PLX doesn't have a simple way to unsubscribe all monitors
    // at once. This would require storing individual subscriptions and calling remove() on each.
    // For simplicity, we just clear the interval.
    clearInterval(updateTimestamp);
  };
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
  return buffer.readUInt16LE(2); // Instantaneous power is at bytes 2-3
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
    // Calculate speed from wheel data if previous data exists
  }

  // Crank Revolution Data Present
  if (flags & 0x02) {
    const crankRevolutions = buffer.readUInt16LE(offset);
    const crankEventTime = buffer.readUInt16LE(offset + 2);
    offset += 4;
    // Calculate cadence from crank data if previous data exists
    cadence = crankRevolutions; // Simplified for now
  }
  return { cadence, speed };
}
