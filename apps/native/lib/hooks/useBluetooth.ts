import { Buffer } from "buffer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BleManager,
  Characteristic,
  Device,
  Service,
} from "react-native-ble-plx";

// Singleton pattern to prevent multiple hook instances
let globalBluetoothState: {
  manager: BleManager | null;
  allDevices: BluetoothDevice[];
  connectedDevices: ConnectedDevice[];
  sensorValues: SensorValues;
  isScanning: boolean;
  isBluetoothEnabled: boolean;
} | null = null;

let subscribers: Set<(state: any) => void> = new Set();

// Debug: Create unique hook instance ID
const HOOK_INSTANCE_ID = Math.random().toString(36).substring(7);
console.log(`🔧 [useBluetooth] Hook instance created: ${HOOK_INSTANCE_ID}`);

// Known fitness services and characteristics (for reference and fallback)
const KNOWN_FITNESS_SERVICES = {
  HEART_RATE: "180D",
  RUNNING_CADENCE: "1814",
  CYCLING_POWER: "1818",
  FITNESS_MACHINE: "1826",
  BATTERY_SERVICE: "180F",
} as const;

const KNOWN_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "2A37",
  RUNNING_SPEED_CADENCE: "2A5B",
  CYCLING_POWER_MEASUREMENT: "2A63",
  FITNESS_MACHINE_FEATURE: "2ACC",
  BATTERY_LEVEL: "2A19",
} as const;

// Pattern-based detection for vendor-specific implementations
const SENSOR_DETECTION_PATTERNS = {
  heartRate: {
    serviceNames: /heart.*rate|hr|pulse|cardio/i,
    serviceUUIDs: /180d|2a37/i,
    characteristicNames: /heart.*rate|hr.*measurement|pulse|cardio/i,
    characteristicUUIDs: /2a37/i,
  },
  cadence: {
    serviceNames: /cadence|speed|running|pace|step/i,
    serviceUUIDs: /1814|2a5b/i,
    characteristicNames: /cadence|speed|running|pace|step/i,
    characteristicUUIDs: /2a5b/i,
  },
  power: {
    serviceNames: /power|cycling|bike|watt/i,
    serviceUUIDs: /1818|2a63/i,
    characteristicNames: /power|cycling|bike|watt/i,
    characteristicUUIDs: /2a63/i,
  },
};

// Export types for use in other components
export type SensorValues = {
  heartRate?: number;
  cadence?: number;
  power?: number;
  timestamp?: number;
};

export type BluetoothDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  isConnected: boolean;
  serviceUUIDs?: string[];
};

type ConnectedDevice = {
  device: Device;
  subscriptions: (() => void)[];
  detectedSensors: string[];
};

type SensorType = "heartRate" | "cadence" | "power";

export const useBluetooth = () => {
  // Initialize singleton state if not exists
  if (!globalBluetoothState) {
    console.log(
      `🔧 [useBluetooth:${HOOK_INSTANCE_ID}] Initializing singleton state`,
    );
    globalBluetoothState = {
      manager: new BleManager(),
      allDevices: [],
      connectedDevices: [],
      sensorValues: {},
      isScanning: false,
      isBluetoothEnabled: true,
    };
  }

  const [localState, setLocalState] = useState(globalBluetoothState);

  // Subscribe to global state changes
  useEffect(() => {
    const updateState = (newState: any) => {
      setLocalState({ ...newState });
    };

    subscribers.add(updateState);
    // console.log(
    //   `🔧 [useBluetooth:${HOOK_INSTANCE_ID}] Subscribed to singleton state. Total subscribers: ${subscribers.size}`,
    // );

    return () => {
      subscribers.delete(updateState);
      // console.log(
      //   `🔧 [useBluetooth:${HOOK_INSTANCE_ID}] Unsubscribed from singleton state. Remaining subscribers: ${subscribers.size}`,
      // );
    };
  }, []);

  const updateGlobalState = useCallback((updater: (prev: any) => any) => {
    if (globalBluetoothState) {
      globalBluetoothState = updater(globalBluetoothState);
      // Notify all subscribers
      subscribers.forEach((subscriber) => subscriber(globalBluetoothState));
    }
  }, []);

  // Use singleton state values
  const manager = globalBluetoothState?.manager!;
  const allDevices = localState.allDevices;
  const connectedDevices = localState.connectedDevices;
  const sensorValues = localState.sensorValues;
  const isScanning = localState.isScanning;
  const isBluetoothEnabled = localState.isBluetoothEnabled;

  // Debug: Track state changes to identify alternation cause
  const renderRef = useRef(0);
  const stateHistoryRef = useRef<any[]>([]);

  useEffect(() => {
    renderRef.current += 1;
    const currentState = {
      render: renderRef.current,
      timestamp: Date.now(),
      allDevicesCount: allDevices.length,
      connectedDevicesCount: connectedDevices.length,
      sensorValuesKeys: Object.keys(sensorValues),
      sensorValuesHeartRate: sensorValues.heartRate,
    };

    stateHistoryRef.current.push(currentState);

    // Keep only last 5 states
    if (stateHistoryRef.current.length > 5) {
      stateHistoryRef.current.shift();
    }

    // console.log(
    //   `📈 [useBluetooth:${HOOK_INSTANCE_ID}] State History:`,
    //   stateHistoryRef.current
    //     .map(
    //       (s) =>
    //         `R${s.render}: devices=${s.connectedDevicesCount} hr=${s.sensorValuesHeartRate}`,
    //     )
    //     .join(" | "),
    // );
  });

  // Use number type for React Native setTimeout compatibility
  const scanTimeoutRef = useRef<number | null>(null);

  // Dynamic sensor detection based on service/characteristic patterns
  const detectSensorType = useCallback(
    (service: Service, characteristic: Characteristic): SensorType | null => {
      const serviceName = service.uuid.toLowerCase();
      const serviceUuid = service.uuid.toLowerCase();
      const charName = characteristic.uuid.toLowerCase();
      const charUuid = characteristic.uuid.toLowerCase();

      // Check for heart rate patterns
      if (
        SENSOR_DETECTION_PATTERNS.heartRate.serviceUUIDs.test(serviceUuid) ||
        SENSOR_DETECTION_PATTERNS.heartRate.characteristicUUIDs.test(
          charUuid,
        ) ||
        (service.uuid &&
          SENSOR_DETECTION_PATTERNS.heartRate.serviceNames.test(serviceName)) ||
        (characteristic.uuid &&
          SENSOR_DETECTION_PATTERNS.heartRate.characteristicNames.test(
            charName,
          ))
      ) {
        return "heartRate";
      }

      // Check for cadence patterns
      if (
        SENSOR_DETECTION_PATTERNS.cadence.serviceUUIDs.test(serviceUuid) ||
        SENSOR_DETECTION_PATTERNS.cadence.characteristicUUIDs.test(charUuid) ||
        (service.uuid &&
          SENSOR_DETECTION_PATTERNS.cadence.serviceNames.test(serviceName)) ||
        (characteristic.uuid &&
          SENSOR_DETECTION_PATTERNS.cadence.characteristicNames.test(charName))
      ) {
        return "cadence";
      }

      // Check for power patterns
      if (
        SENSOR_DETECTION_PATTERNS.power.serviceUUIDs.test(serviceUuid) ||
        SENSOR_DETECTION_PATTERNS.power.characteristicUUIDs.test(charUuid) ||
        (service.uuid &&
          SENSOR_DETECTION_PATTERNS.power.serviceNames.test(serviceName)) ||
        (characteristic.uuid &&
          SENSOR_DETECTION_PATTERNS.power.characteristicNames.test(charName))
      ) {
        return "power";
      }

      return null;
    },
    [],
  );

  // Safe parsing with fallback mechanisms
  const parseHeartRate = useCallback((base64Value: string): number => {
    try {
      console.log("🔍 Raw heart rate base64:", base64Value);
      const buffer = Buffer.from(base64Value, "base64");
      console.log(
        "📊 Heart rate buffer length:",
        buffer.length,
        "bytes:",
        Array.from(buffer),
      );

      if (buffer.length < 1) {
        console.warn("Heart rate buffer empty");
        return 0;
      }

      // If only 1 byte, treat as direct heart rate value
      if (buffer.length === 1) {
        const value = buffer.readUInt8(0);
        console.log("💓 Single byte heart rate:", value);
        return Math.min(value, 220); // Cap at reasonable max
      }

      // Standard heart rate measurement format
      if (buffer.length >= 2) {
        const flags = buffer.readUInt8(0);
        const hrFormat = flags & 0x01; // 0 = UINT8, 1 = UINT16
        console.log(
          "🏃 HR flags:",
          flags.toString(2),
          "format:",
          hrFormat === 0 ? "8-bit" : "16-bit",
        );

        if (hrFormat === 0) {
          const value = buffer.readUInt8(1); // 8-bit heart rate
          console.log("💓 8-bit heart rate:", value);
          return Math.min(value, 220);
        } else if (buffer.length >= 3) {
          const value = buffer.readUInt16LE(1); // 16-bit heart rate
          console.log("💓 16-bit heart rate:", value);
          return Math.min(value, 220);
        }
      }

      // Fallback: try all bytes and pick the most reasonable value
      console.log("⚠️ Using fallback heart rate parsing");
      for (let i = 0; i < buffer.length; i++) {
        const value = buffer.readUInt8(i);
        if (value > 30 && value <= 220) {
          // Reasonable heart rate range
          console.log("💓 Fallback heart rate found at byte", i, ":", value);
          return value;
        }
      }

      console.warn("No reasonable heart rate value found in buffer");
      return 0;
    } catch (error) {
      console.warn("❌ Heart rate parsing failed:", error);
      return 0;
    }
  }, []);

  // Parse cadence with multiple format support
  const parseCadence = useCallback((base64Value: string): number => {
    try {
      console.log("🔍 Raw cadence base64:", base64Value);
      const buffer = Buffer.from(base64Value, "base64");
      console.log(
        "📊 Cadence buffer length:",
        buffer.length,
        "bytes:",
        Array.from(buffer),
      );

      if (buffer.length < 1) {
        return 0;
      }

      // Try standard running speed and cadence format
      if (buffer.length >= 5) {
        // Standard format: [flags][instantaneous speed][instantaneous cadence]
        const flags = buffer.readUInt8(0);
        const cadence = buffer.readUInt8(4); // Cadence is typically at byte 4
        console.log(
          "🏃 Standard cadence format - flags:",
          flags,
          "cadence:",
          cadence,
        );
        return cadence;
      } else if (buffer.length >= 2) {
        // Try 16-bit little endian
        const cadence = buffer.readUInt16LE(0);
        console.log("🏃 16-bit cadence:", cadence);
        return Math.min(cadence, 300); // Reasonable max cadence
      } else {
        // Single byte
        const cadence = buffer.readUInt8(0);
        console.log("🏃 8-bit cadence:", cadence);
        return Math.min(cadence, 300);
      }
    } catch (error) {
      console.warn("❌ Cadence parsing failed:", error);
      return 0;
    }
  }, []);

  // Parse power with multiple format support
  const parsePower = useCallback((base64Value: string): number => {
    try {
      console.log("🔍 Raw power base64:", base64Value);
      const buffer = Buffer.from(base64Value, "base64");
      console.log(
        "📊 Power buffer length:",
        buffer.length,
        "bytes:",
        Array.from(buffer),
      );

      if (buffer.length < 1) {
        return 0;
      }

      // Try standard cycling power measurement format
      if (buffer.length >= 4) {
        // Standard format: [flags][instantaneous power]
        const flags = buffer.readUInt16LE(0);
        const power = buffer.readUInt16LE(2); // Power is typically at bytes 2-3
        console.log(
          "🚴 Standard power format - flags:",
          flags,
          "power:",
          power,
        );
        return Math.min(power, 2000); // Reasonable max power
      } else if (buffer.length >= 2) {
        // Try 16-bit little endian
        const power = buffer.readUInt16LE(0);
        console.log("🚴 16-bit power:", power);
        return Math.min(power, 2000);
      } else {
        // Single byte
        const power = buffer.readUInt8(0);
        console.log("🚴 8-bit power:", power);
        return Math.min(power, 255);
      }
    } catch (error) {
      console.warn("❌ Power parsing failed:", error);
      return 0;
    }
  }, []);

  // Get appropriate parser for sensor type
  const getParserForSensorType = useCallback(
    (sensorType: SensorType) => {
      switch (sensorType) {
        case "heartRate":
          return parseHeartRate;
        case "cadence":
          return parseCadence;
        case "power":
          return parsePower;
        default:
          return parseHeartRate; // Default fallback
      }
    },
    [parseHeartRate, parseCadence, parsePower],
  );

  // Stop scanning
  const stopScan = useCallback(() => {
    if (!isScanning) return;

    console.log("🛑 Stopping Bluetooth scan...");
    manager.stopDeviceScan();
    updateGlobalState((prev: any) => ({ ...prev, isScanning: false }));

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, [manager, isScanning, updateGlobalState]);

  // Add or update device in allDevices list
  const addOrUpdateDevice = useCallback(
    (device: Device) => {
      const bluetoothDevice: BluetoothDevice = {
        id: device.id,
        name: device.name,
        rssi: device.rssi,
        isConnected: connectedDevices.some((cd) => cd.device.id === device.id),
        serviceUUIDs: device.serviceUUIDs || [],
      };

      updateGlobalState((prev: any) => ({
        ...prev,
        allDevices: (() => {
          const existingIndex = prev.allDevices.findIndex(
            (d: any) => d.id === device.id,
          );
          if (existingIndex >= 0) {
            // Update existing device
            const updated = [...prev.allDevices];
            updated[existingIndex] = bluetoothDevice;
            return updated;
          } else {
            // Add new device
            return [...prev.allDevices, bluetoothDevice];
          }
        })(),
      }));
    },
    [connectedDevices],
  );

  // Update connection status in allDevices
  const updateDeviceConnectionStatus = useCallback(() => {
    updateGlobalState((prev: any) => ({
      ...prev,
      allDevices: prev.allDevices.map((device: any) => ({
        ...device,
        isConnected: prev.connectedDevices.some(
          (cd: any) => cd.device.id === device.id,
        ),
      })),
    }));
  }, [updateGlobalState]);

  // Scan for ALL BLE devices dynamically
  const scanForDevices = useCallback(
    (duration: number = 15000) => {
      if (!isBluetoothEnabled || isScanning) return;

      console.log("🔍 Starting Bluetooth scan (filtering unknown devices)...");

      updateGlobalState((prev: any) => ({ ...prev, isScanning: true }));

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      manager.startDeviceScan(
        null,
        { allowDuplicates: false, scanMode: 1, callbackType: 1 },
        (error, device) => {
          if (error) {
            console.warn("❌ BLE scan error:", error);
            updateGlobalState((prev: any) => ({ ...prev, isScanning: false }));
            return;
          }

          if (device) {
            // FILTER: Only devices with a valid name
            if (device.name && device.name.trim() !== "") {
              console.log(
                "📱 Found device:",
                device.name,
                "RSSI:",
                device.rssi,
                "Services:",
                device.serviceUUIDs?.length || 0,
              );
              addOrUpdateDevice(device);
            } else {
              console.log(
                "⚪ Skipping unknown/unidentifiable device:",
                device.id,
              );
            }
          }
        },
      );

      // Stop scan after duration
      scanTimeoutRef.current = setTimeout(() => {
        stopScan();
      }, duration) as unknown as number;
    },
    [manager, isBluetoothEnabled, isScanning, addOrUpdateDevice, stopScan],
  );

  // Subscribe to a characteristic with dynamic sensor detection
  const subscribeToCharacteristic = useCallback(
    async (
      device: Device,
      service: Service,
      characteristic: Characteristic,
      sensorType: SensorType,
    ) => {
      try {
        console.log(
          `🔔 Subscribing to ${sensorType} sensor: ${service.uuid}:${characteristic.uuid} on ${device.name}`,
        );

        const parser = getParserForSensorType(sensorType);

        const subscription = characteristic.monitor(
          (error, updatedCharacteristic) => {
            if (error) {
              console.warn(`❌ ${sensorType} monitor error:`, error);
              return;
            }

            if (updatedCharacteristic?.value) {
              try {
                const parsedValue = parser(updatedCharacteristic.value);
                console.log(`📊 ${sensorType} value:`, parsedValue);

                // Update sensor values state
                const newValues = {
                  ...globalBluetoothState?.sensorValues,
                  [sensorType]: parsedValue,
                  timestamp: Date.now(),
                };
                console.log(
                  `🔄 [useBluetooth:${HOOK_INSTANCE_ID}] Updating sensorValues state:`,
                  `${sensorType}=${parsedValue}`,
                  `New state:`,
                  newValues,
                );
                updateGlobalState((prev: any) => ({
                  ...prev,
                  sensorValues: newValues,
                }));
              } catch (parseError) {
                console.warn(
                  `❌ Failed to parse ${sensorType} value:`,
                  parseError,
                );
              }
            }
          },
        );

        return () => {
          console.log(`🔕 Unsubscribing from ${sensorType} sensor`);
          subscription.remove();
        };
      } catch (err) {
        console.warn(
          `❌ Failed to subscribe to ${sensorType} characteristic:`,
          err,
        );
        return () => {};
      }
    },
    [getParserForSensorType],
  );

  // Dynamic service and characteristic discovery with comprehensive debugging
  const discoverSensors = useCallback(
    async (
      device: Device,
    ): Promise<{
      subscriptions: (() => void)[];
      detectedSensors: string[];
    }> => {
      const subscriptions: (() => void)[] = [];
      const detectedSensors: string[] = [];

      try {
        console.log(
          `🔍 Discovering services and characteristics for ${device.name}...`,
        );

        // Discover all services
        const services = await device.services();
        console.log(`📋 Found ${services.length} services on ${device.name}:`);

        // Log all services first for debugging
        for (const service of services) {
          console.log(`📋 Service: ${service.uuid.toUpperCase()}`);
        }

        // Iterate through all services and characteristics
        for (const service of services) {
          try {
            const characteristics = await service.characteristics();
            console.log(
              `🔧 Service ${service.uuid.toUpperCase()} has ${characteristics.length} characteristics:`,
            );

            for (const characteristic of characteristics) {
              console.log(
                `  📝 Characteristic: ${characteristic.uuid.toUpperCase()}`,
                `- Readable: ${characteristic.isReadable}`,
                `- Writable: ${characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse}`,
                `- Notifiable: ${characteristic.isNotifiable}`,
                `- Indicatable: ${characteristic.isIndicatable}`,
              );

              // Check if characteristic supports notifications or indications
              if (characteristic.isNotifiable || characteristic.isIndicatable) {
                console.log(
                  `🔔 Found notifiable characteristic: ${service.uuid.toUpperCase()}:${characteristic.uuid.toUpperCase()}`,
                );

                // Detect what type of sensor this might be
                const sensorType = detectSensorType(service, characteristic);

                if (sensorType) {
                  console.log(
                    `✅ Detected ${sensorType} sensor: ${service.uuid.toUpperCase()}:${characteristic.uuid.toUpperCase()}`,
                  );

                  // Subscribe to this characteristic
                  const unsubscribe = await subscribeToCharacteristic(
                    device,
                    service,
                    characteristic,
                    sensorType,
                  );

                  subscriptions.push(unsubscribe);
                  detectedSensors.push(sensorType);
                } else {
                  console.log(
                    `❓ Unknown sensor type for: ${service.uuid.toUpperCase()}:${characteristic.uuid.toUpperCase()}`,
                    `- Service might contain: ${service.uuid.toLowerCase().includes("heart") ? "heart rate" : service.uuid.toLowerCase().includes("power") ? "power" : service.uuid.toLowerCase().includes("cadence") ? "cadence" : "unknown"}`,
                  );

                  // Try to subscribe to unknown characteristics anyway (for debugging)
                  if (__DEV__) {
                    console.log(
                      `🧪 [DEBUG] Attempting to subscribe to unknown characteristic for debugging...`,
                    );
                    try {
                      const debugUnsubscribe = await subscribeToCharacteristic(
                        device,
                        service,
                        characteristic,
                        "heartRate", // Default to heart rate parser for debugging
                      );
                      subscriptions.push(debugUnsubscribe);
                      console.log(
                        `🧪 [DEBUG] Successfully subscribed to unknown characteristic`,
                      );
                    } catch (debugError) {
                      console.warn(
                        `🧪 [DEBUG] Failed to subscribe to unknown characteristic:`,
                        debugError,
                      );
                    }
                  }
                }
              } else {
                console.log(
                  `⚪ Non-notifiable characteristic: ${service.uuid.toUpperCase()}:${characteristic.uuid.toUpperCase()}`,
                );
              }
            }
          } catch (charError) {
            console.warn(
              `⚠️ Error reading characteristics for service ${service.uuid}:`,
              charError,
            );
          }
        }

        console.log(
          `🎯 Detection complete for ${device.name}:`,
          `${detectedSensors.length} sensors detected:`,
          detectedSensors,
        );

        if (detectedSensors.length === 0) {
          console.warn(
            `❌ No standard sensors detected on ${device.name}.`,
            `This might be a vendor-specific device like ELEMENT RIVAL.`,
            `Check the logs above for all available services and characteristics.`,
          );
        }

        return { subscriptions, detectedSensors };
      } catch (error) {
        console.warn(`❌ Service discovery failed for ${device.name}:`, error);
        return { subscriptions: [], detectedSensors: [] };
      }
    },
    [detectSensorType, subscribeToCharacteristic],
  );

  // Connect to device by ID with dynamic discovery
  const connectDevice = useCallback(
    async (deviceId: string) => {
      // Check if already connected
      if (connectedDevices.some((cd) => cd.device.id === deviceId)) {
        console.log("✅ Device already connected:", deviceId);
        return;
      }

      try {
        console.log("🔄 Connecting to device:", deviceId);

        // Stop scanning during connection
        if (isScanning) {
          stopScan();
        }

        const device = await manager.connectToDevice(deviceId);
        console.log(`🔗 Connected to ${device.name}, discovering services...`);

        await device.discoverAllServicesAndCharacteristics();

        // Dynamically discover and subscribe to sensors
        const { subscriptions, detectedSensors } =
          await discoverSensors(device);

        if (detectedSensors.length === 0) {
          console.warn(
            `⚠️ No sensors detected on ${device.name}. This might be a vendor-specific device.`,
          );
          console.warn(
            "🔍 Consider manually checking the device's services and characteristics.",
          );
        }

        // Add to connected devices
        updateGlobalState((prev: any) => ({
          ...prev,
          connectedDevices: [
            ...prev.connectedDevices,
            {
              device,
              subscriptions,
              detectedSensors,
            },
          ],
        }));

        console.log(
          `✅ Successfully connected to ${device.name} with ${detectedSensors.length} sensors:`,
          detectedSensors,
        );
      } catch (err) {
        console.warn("❌ Failed to connect to device:", err);
        throw err;
      }
    },
    [manager, connectedDevices, isScanning, stopScan, discoverSensors],
  );

  // Disconnect device by ID
  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      const connectedDevice = connectedDevices.find(
        (cd) => cd.device.id === deviceId,
      );
      if (!connectedDevice) {
        console.log("⚠️ Device not found in connected devices:", deviceId);
        return;
      }

      try {
        console.log("🔌 Disconnecting device:", connectedDevice.device.name);

        // Remove all subscriptions
        connectedDevice.subscriptions.forEach((unsubscribe) => {
          try {
            unsubscribe();
          } catch (error) {
            console.warn("⚠️ Error removing subscription:", error);
          }
        });

        // Disconnect device
        await connectedDevice.device.cancelConnection();

        // Remove from connected devices
        updateGlobalState((prev: any) => ({
          ...prev,
          connectedDevices: prev.connectedDevices.filter(
            (cd: any) => cd.device.id !== deviceId,
          ),
        }));

        console.log(
          "✅ Successfully disconnected device:",
          connectedDevice.device.name,
        );
      } catch (err) {
        console.warn("❌ Failed to disconnect device:", err);
        throw err;
      }
    },
    [connectedDevices],
  );

  // Update connection status when connected devices change
  useEffect(() => {
    updateDeviceConnectionStatus();
  }, [updateDeviceConnectionStatus]);

  // Monitor Bluetooth state
  useEffect(() => {
    const subscription = manager.onStateChange((state) => {
      console.log("📶 Bluetooth state changed:", state);
      const isEnabled = state === "PoweredOn";
      updateGlobalState((prev: any) => ({
        ...prev,
        isBluetoothEnabled: isEnabled,
      }));

      if (!isEnabled && isScanning) {
        updateGlobalState((prev: any) => ({ ...prev, isScanning: false }));
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
      }
    }, true);

    return () => {
      subscription.remove();
    };
  }, [manager, isScanning, updateGlobalState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 Cleaning up useBluetooth hook...");

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      // Cleanup all subscriptions
      connectedDevices.forEach((cd) => {
        cd.subscriptions.forEach((unsubscribe) => {
          try {
            unsubscribe();
          } catch (error) {
            console.warn("⚠️ Error cleaning up subscription:", error);
          }
        });
      });

      // Stop scanning and destroy manager
      try {
        manager.stopDeviceScan();
        manager.destroy();
      } catch (error) {
        console.warn("⚠️ Error destroying BLE manager:", error);
      }
    };
    // Dependencies intentionally omitted for unmount cleanup only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debug: Log hook state before returning (simple approach)
  const deviceArray = connectedDevices.map((cd) => cd.device);

  // console.log(`🔄 [useBluetooth:${HOOK_INSTANCE_ID}] Hook state:`, {
  //   allDevicesCount: allDevices.length,
  //   connectedDevicesCount: connectedDevices.length,
  //   sensorValues,
  //   isBluetoothEnabled,
  //   isScanning,
  // });

  return {
    // Device management
    allDevices,
    connectedDevices: deviceArray,

    // Scanning
    isScanning,
    scanForDevices,
    stopScan,

    // Connection management
    connectDevice,
    disconnectDevice,

    // Sensor data
    sensorValues,

    // Bluetooth state
    isBluetoothEnabled,
  };
};
