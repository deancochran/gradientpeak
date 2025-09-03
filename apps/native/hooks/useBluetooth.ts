import { useCallback, useEffect, useRef, useState } from "react";
import {
  BleManager,
  Device,
  Service,
  Characteristic,
} from "react-native-ble-plx";

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
  const [manager] = useState(() => new BleManager());
  const [allDevices, setAllDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    [],
  );
  const [sensorValues, setSensorValues] = useState<SensorValues>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(true);

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
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 2) {
        console.warn("Heart rate buffer too short, trying raw value");
        return buffer.length > 0 ? buffer.readUInt8(0) : 0;
      }

      // Heart rate measurement format depends on flags in first byte
      const flags = buffer.readUInt8(0);
      const hrFormat = flags & 0x01; // 0 = UINT8, 1 = UINT16

      if (hrFormat === 0 && buffer.length >= 2) {
        return buffer.readUInt8(1); // 8-bit heart rate
      } else if (buffer.length >= 3) {
        return buffer.readUInt16LE(1); // 16-bit heart rate
      } else {
        // Fallback: try to read as simple uint8
        return buffer.readUInt8(0);
      }
    } catch (error) {
      console.warn("Failed to parse heart rate, trying fallback:", error);
      try {
        // Emergency fallback: try to parse as simple number
        const buffer = Buffer.from(base64Value, "base64");
        return buffer.length > 0 ? Math.min(buffer.readUInt8(0), 220) : 0;
      } catch (fallbackError) {
        console.warn("All heart rate parsing failed:", fallbackError);
        return 0;
      }
    }
  }, []);

  // Parse cadence with multiple format support
  const parseCadence = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 2) {
        return buffer.length > 0 ? buffer.readUInt8(0) : 0;
      }

      // Try standard running speed and cadence format
      if (buffer.length >= 5) {
        // Standard format: [flags][instantaneous speed][instantaneous cadence]
        const flags = buffer.readUInt8(0);
        const cadence = buffer.readUInt8(4); // Cadence is typically at byte 4
        return cadence;
      } else {
        // Fallback to 16-bit little endian
        return buffer.readUInt16LE(0);
      }
    } catch (error) {
      console.warn("Failed to parse cadence, trying fallback:", error);
      try {
        const buffer = Buffer.from(base64Value, "base64");
        return buffer.length > 0 ? buffer.readUInt8(0) : 0;
      } catch (fallbackError) {
        console.warn("All cadence parsing failed:", fallbackError);
        return 0;
      }
    }
  }, []);

  // Parse power with multiple format support
  const parsePower = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 2) {
        return buffer.length > 0 ? buffer.readUInt8(0) : 0;
      }

      // Try standard cycling power measurement format
      if (buffer.length >= 4) {
        // Standard format: [flags][instantaneous power]
        const power = buffer.readUInt16LE(2); // Power is typically at bytes 2-3
        return power;
      } else {
        // Fallback to 16-bit little endian
        return buffer.readUInt16LE(0);
      }
    } catch (error) {
      console.warn("Failed to parse power, trying fallback:", error);
      try {
        const buffer = Buffer.from(base64Value, "base64");
        return buffer.readUInt16LE(0);
      } catch (fallbackError) {
        console.warn("All power parsing failed:", fallbackError);
        return 0;
      }
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
    setIsScanning(false);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, [manager, isScanning]);

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

      setAllDevices((prev) => {
        const existingIndex = prev.findIndex((d) => d.id === device.id);
        if (existingIndex >= 0) {
          // Update existing device
          const updated = [...prev];
          updated[existingIndex] = bluetoothDevice;
          return updated;
        } else {
          // Add new device
          return [...prev, bluetoothDevice];
        }
      });
    },
    [connectedDevices],
  );

  // Update connection status in allDevices
  const updateDeviceConnectionStatus = useCallback(() => {
    setAllDevices((prev) =>
      prev.map((device) => ({
        ...device,
        isConnected: connectedDevices.some((cd) => cd.device.id === device.id),
      })),
    );
  }, [connectedDevices]);

  // Scan for ALL BLE devices dynamically
  const scanForDevices = useCallback(
    (duration: number = 15000) => {
      if (!isBluetoothEnabled || isScanning) return;

      console.log("🔍 Starting dynamic Bluetooth scan for all devices...");
      setIsScanning(true);

      // Clear any existing timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      // Scan for ALL devices (no service filter)
      manager.startDeviceScan(
        null, // No service filter - scan all devices
        {
          allowDuplicates: false,
          scanMode: 1, // Low power scan mode
          callbackType: 1, // All matches
        },
        (error, device) => {
          if (error) {
            console.warn("❌ BLE scan error:", error);
            setIsScanning(false);
            return;
          }

          if (device) {
            console.log(
              "📱 Found device:",
              device.name || "Unknown",
              "RSSI:",
              device.rssi,
              "Services:",
              device.serviceUUIDs?.length || 0,
            );
            addOrUpdateDevice(device);
          }
        },
      );

      // Set timeout to stop scanning
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
                setSensorValues((prev) => ({
                  ...prev,
                  [sensorType]: parsedValue,
                  timestamp: Date.now(),
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

  // Dynamic service and characteristic discovery
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
        console.log(`📋 Found ${services.length} services on ${device.name}`);

        // Iterate through all services and characteristics
        for (const service of services) {
          try {
            const characteristics = await service.characteristics();
            console.log(
              `🔧 Service ${service.uuid} has ${characteristics.length} characteristics`,
            );

            for (const characteristic of characteristics) {
              // Check if characteristic supports notifications or indications
              if (characteristic.isNotifiable || characteristic.isIndicatable) {
                // Detect what type of sensor this might be
                const sensorType = detectSensorType(service, characteristic);

                if (sensorType) {
                  console.log(
                    `✅ Detected ${sensorType} sensor: ${service.uuid}:${characteristic.uuid}`,
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
                }
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
          `🎯 Successfully detected sensors on ${device.name}:`,
          detectedSensors,
        );
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

        // Add to connected devices
        setConnectedDevices((prev) => [
          ...prev,
          {
            device,
            subscriptions,
            detectedSensors,
          },
        ]);

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
        setConnectedDevices((prev) =>
          prev.filter((cd) => cd.device.id !== deviceId),
        );

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
      setIsBluetoothEnabled(isEnabled);

      if (!isEnabled && isScanning) {
        setIsScanning(false);
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
      }
    }, true);

    return () => {
      subscription.remove();
    };
  }, [manager, isScanning]);

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

  return {
    // Device management
    allDevices,
    connectedDevices: connectedDevices.map((cd) => cd.device),

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
