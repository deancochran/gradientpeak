import { useCallback, useEffect, useRef, useState } from "react";
import { BleManager, Device } from "react-native-ble-plx";

// Known fitness services and characteristics
const FITNESS_SERVICES = {
  HEART_RATE: "180D",
  RUNNING_CADENCE: "1814",
  CYCLING_POWER: "1818",
};

const CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "2A37",
  RUNNING_SPEED_CADENCE: "2A5B",
  CYCLING_POWER_MEASUREMENT: "2A63",
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
};

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

  // Parse heart rate from characteristic (proper implementation)
  const parseHeartRate = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      // Heart rate measurement format depends on flags in first byte
      const flags = buffer.readUInt8(0);
      const hrFormat = flags & 0x01; // 0 = UINT8, 1 = UINT16

      if (hrFormat === 0) {
        return buffer.readUInt8(1); // 8-bit heart rate
      } else {
        return buffer.readUInt16LE(1); // 16-bit heart rate
      }
    } catch (error) {
      console.warn("Failed to parse heart rate:", error);
      return 0;
    }
  }, []);

  // Parse power or cadence (16-bit values)
  const parseUInt16 = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      return buffer.readUInt16LE(0);
    } catch (error) {
      console.warn("Failed to parse UInt16:", error);
      return 0;
    }
  }, []);

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

  // Scan for devices with configurable duration
  const scanForDevices = useCallback(
    (duration?: number) => {
      if (!isBluetoothEnabled || isScanning) return;

      console.log("🔍 Starting Bluetooth scan...");
      setIsScanning(true);

      // Clear any existing timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      manager.startDeviceScan(
        Object.values(FITNESS_SERVICES),
        { allowDuplicates: false },
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
            );
            addOrUpdateDevice(device);
          }
        },
      );

      // Set timeout to stop scanning
      if (duration && duration > 0) {
        // Use type assertion for React Native compatibility
        scanTimeoutRef.current = setTimeout(() => {
          stopScan();
        }, duration) as unknown as number;
      }
    },
    [manager, isBluetoothEnabled, isScanning, addOrUpdateDevice, stopScan],
  );

  // Subscribe to a characteristic
  const subscribeCharacteristic = useCallback(
    async (
      device: Device,
      serviceUUID: string,
      characteristicUUID: string,
      parser: (value: string) => number,
      callback: (value: number) => void,
    ) => {
      try {
        console.log(
          `🔔 Subscribing to ${serviceUUID}:${characteristicUUID} on ${device.name}`,
        );

        const subscription = device.monitorCharacteristicForService(
          serviceUUID,
          characteristicUUID,
          (error, characteristic) => {
            if (error) {
              console.warn("❌ Characteristic monitor error:", error);
              return;
            }

            if (characteristic?.value) {
              const parsedValue = parser(characteristic.value);
              console.log(`📊 ${serviceUUID} value:`, parsedValue);
              callback(parsedValue);
            }
          },
        );

        return () => {
          console.log(
            `🔕 Unsubscribing from ${serviceUUID}:${characteristicUUID}`,
          );
          subscription.remove();
        };
      } catch (err) {
        console.warn("❌ Failed to subscribe to characteristic:", err);
        return () => {};
      }
    },
    [],
  );

  // Connect to device by ID
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
        await device.discoverAllServicesAndCharacteristics();

        const subscriptions: (() => void)[] = [];
        const services = await device.services();

        // Heart Rate Service
        const hasHeartRate = services.some((s) =>
          s.uuid.toUpperCase().includes(FITNESS_SERVICES.HEART_RATE),
        );
        if (hasHeartRate) {
          const unsubscribe = await subscribeCharacteristic(
            device,
            FITNESS_SERVICES.HEART_RATE,
            CHARACTERISTICS.HEART_RATE_MEASUREMENT,
            parseHeartRate,
            (heartRate) => {
              setSensorValues((prev) => ({
                ...prev,
                heartRate,
                timestamp: Date.now(),
              }));
            },
          );
          subscriptions.push(unsubscribe);
        }

        // Running Cadence Service
        const hasRunningCadence = services.some((s) =>
          s.uuid.toUpperCase().includes(FITNESS_SERVICES.RUNNING_CADENCE),
        );
        if (hasRunningCadence) {
          const unsubscribe = await subscribeCharacteristic(
            device,
            FITNESS_SERVICES.RUNNING_CADENCE,
            CHARACTERISTICS.RUNNING_SPEED_CADENCE,
            parseUInt16,
            (cadence) => {
              setSensorValues((prev) => ({
                ...prev,
                cadence,
                timestamp: Date.now(),
              }));
            },
          );
          subscriptions.push(unsubscribe);
        }

        // Cycling Power Service
        const hasCyclingPower = services.some((s) =>
          s.uuid.toUpperCase().includes(FITNESS_SERVICES.CYCLING_POWER),
        );
        if (hasCyclingPower) {
          const unsubscribe = await subscribeCharacteristic(
            device,
            FITNESS_SERVICES.CYCLING_POWER,
            CHARACTERISTICS.CYCLING_POWER_MEASUREMENT,
            parseUInt16,
            (power) => {
              setSensorValues((prev) => ({
                ...prev,
                power,
                timestamp: Date.now(),
              }));
            },
          );
          subscriptions.push(unsubscribe);
        }

        setConnectedDevices((prev) => [...prev, { device, subscriptions }]);

        console.log("✅ Successfully connected to device:", device.name);
      } catch (err) {
        console.warn("❌ Failed to connect to device:", err);
        throw err;
      }
    },
    [
      manager,
      connectedDevices,
      isScanning,
      stopScan,
      subscribeCharacteristic,
      parseHeartRate,
      parseUInt16,
    ],
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

        // Remove subscriptions
        connectedDevice.subscriptions.forEach((unsubscribe) => unsubscribe());

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
      }
    }, true);

    return () => {
      subscription.remove();
    };
  }, [manager, isScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      // Cleanup all subscriptions
      connectedDevices.forEach((cd) => {
        cd.subscriptions.forEach((unsubscribe) => unsubscribe());
      });

      // Stop scanning and destroy manager
      manager.stopDeviceScan();
      manager.destroy();
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
