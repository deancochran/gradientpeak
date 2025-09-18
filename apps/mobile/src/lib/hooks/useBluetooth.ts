import { Buffer } from "buffer";
import { useCallback, useEffect, useState } from "react";
import { BleManager, Device } from "react-native-ble-plx";

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
};

// Standard Bluetooth fitness services and characteristics
const FITNESS_SERVICES = {
  HEART_RATE: "180D",
  CYCLING_POWER: "1818",
  RUNNING_SPEED_CADENCE: "1814",
  CYCLING_SPEED_CADENCE: "1816",
} as const;

const FITNESS_CHARACTERISTICS = {
  HEART_RATE_MEASUREMENT: "2A37",
  CYCLING_POWER_MEASUREMENT: "2A63",
  RSC_MEASUREMENT: "2A53", // Running Speed and Cadence
  CSC_MEASUREMENT: "2A5B", // Cycling Speed and Cadence
} as const;

export const useBluetooth = () => {
  const [manager] = useState(() => new BleManager());
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<Device[]>([]);
  const [sensorValues, setSensorValues] = useState<SensorValues>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(true);

  // Parse heart rate from standard format
  const parseHeartRate = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 2) return 0;

      const flags = buffer.readUInt8(0);
      const hrFormat = flags & 0x01;

      if (hrFormat === 0 && buffer.length >= 2) {
        return buffer.readUInt8(1); // 8-bit heart rate
      } else if (hrFormat === 1 && buffer.length >= 3) {
        return buffer.readUInt16LE(1); // 16-bit heart rate
      }

      return 0;
    } catch (error) {
      console.warn("Heart rate parsing error:", error);
      return 0;
    }
  }, []);

  // Parse cycling power from standard format
  const parseCyclingPower = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 4) return 0;

      // Skip flags (2 bytes) and read instantaneous power (2 bytes)
      return buffer.readUInt16LE(2);
    } catch (error) {
      console.warn("Power parsing error:", error);
      return 0;
    }
  }, []);

  // Parse running speed and cadence
  const parseRSC = useCallback(
    (base64Value: string): { speed?: number; cadence?: number } => {
      try {
        const buffer = Buffer.from(base64Value, "base64");
        if (buffer.length < 4) return {};

        const instantaneousSpeed = buffer.readUInt16LE(1); // Speed in m/s * 256
        const instantaneousCadence = buffer.readUInt8(3); // Steps per minute

        return {
          speed: instantaneousSpeed / 256, // Convert to m/s
          cadence: instantaneousCadence,
        };
      } catch (error) {
        console.warn("RSC parsing error:", error);
        return {};
      }
    },
    [],
  );

  // Parse cycling speed and cadence
  const parseCSC = useCallback(
    (base64Value: string): { speed?: number; cadence?: number } => {
      try {
        const buffer = Buffer.from(base64Value, "base64");
        if (buffer.length < 5) return {};

        const flags = buffer.readUInt8(0);
        let offset = 1;
        let crankRevolutions;

        // Skip wheel data if present
        if (flags & 0x01) {
          offset += 6;
        }

        // Crank revolution data present
        if (flags & 0x02 && buffer.length >= offset + 4) {
          crankRevolutions = buffer.readUInt16LE(offset);
          return { cadence: crankRevolutions };
        }

        return {};
      } catch (error) {
        console.warn("CSC parsing error:", error);
        return {};
      }
    },
    [],
  );

  // Device scanning - scans for all fitness sensors
  const scanForDevices = useCallback(
    (duration: number = 10000) => {
      if (!isBluetoothEnabled || isScanning) return;

      console.log("🔍 Starting BLE scan for fitness devices...");
      setIsScanning(true);
      setDevices([]);

      // Scan for all fitness sensor services
      const fitnessServices = Object.values(FITNESS_SERVICES);

      manager.startDeviceScan(
        fitnessServices,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.warn("BLE scan error:", error);
            return;
          }

          if (device?.name) {
            console.log(
              `📱 Found fitness device: ${device.name}`,
              device.serviceUUIDs,
            );
            setDevices((prev) => {
              const exists = prev.find((d) => d.id === device.id);
              if (exists) return prev;

              return [
                ...prev,
                {
                  id: device.id,
                  name: device.name,
                  rssi: device.rssi,
                  isConnected: false,
                },
              ];
            });
          }
        },
      );

      setTimeout(() => {
        console.log("🛑 Stopping BLE scan");
        manager.stopDeviceScan();
        setIsScanning(false);
      }, duration);
    },
    [manager, isBluetoothEnabled, isScanning],
  );

  // Enhanced connection - handle multiple fitness sensor types
  const connectDevice = useCallback(
    async (deviceId: string) => {
      try {
        console.log(`🔄 Connecting to device: ${deviceId}`);

        const device = await manager.connectToDevice(deviceId);
        console.log(`✅ Connected to ${device.name}`);

        await device.discoverAllServicesAndCharacteristics();
        const services = await device.services();

        console.log(
          `📋 Available services on ${device.name}:`,
          services.map((s) => s.uuid.toUpperCase()),
        );

        let hasActiveMonitors = false;

        // Check each fitness service type
        for (const service of services) {
          const serviceUuid = service.uuid.toUpperCase();
          const characteristics = await service.characteristics();

          // Heart Rate Service
          if (serviceUuid === FITNESS_SERVICES.HEART_RATE) {
            const hrChar = characteristics.find(
              (c) =>
                c.uuid.toUpperCase() ===
                  FITNESS_CHARACTERISTICS.HEART_RATE_MEASUREMENT &&
                c.isNotifiable,
            );

            if (hrChar) {
              console.log(
                `💓 Starting heart rate monitoring for ${device.name}`,
              );
              hrChar.monitor((error, char) => {
                if (error || !char?.value) return;

                const heartRate = parseHeartRate(char.value);
                if (heartRate > 0 && heartRate <= 220) {
                  console.log(`💓 Heart rate: ${heartRate} bpm`);
                  setSensorValues((prev) => ({
                    ...prev,
                    heartRate,
                    timestamp: Date.now(),
                  }));
                }
              });
              hasActiveMonitors = true;
            }
          }

          // Cycling Power Service
          else if (serviceUuid === FITNESS_SERVICES.CYCLING_POWER) {
            const powerChar = characteristics.find(
              (c) =>
                c.uuid.toUpperCase() ===
                  FITNESS_CHARACTERISTICS.CYCLING_POWER_MEASUREMENT &&
                c.isNotifiable,
            );

            if (powerChar) {
              console.log(`⚡ Starting power monitoring for ${device.name}`);
              powerChar.monitor((error, char) => {
                if (error || !char?.value) return;

                const power = parseCyclingPower(char.value);
                if (power > 0 && power <= 2000) {
                  console.log(`⚡ Power: ${power} watts`);
                  setSensorValues((prev) => ({
                    ...prev,
                    power,
                    timestamp: Date.now(),
                  }));
                }
              });
              hasActiveMonitors = true;
            }
          }

          // Running Speed and Cadence Service
          else if (serviceUuid === FITNESS_SERVICES.RUNNING_SPEED_CADENCE) {
            const rscChar = characteristics.find(
              (c) =>
                c.uuid.toUpperCase() ===
                  FITNESS_CHARACTERISTICS.RSC_MEASUREMENT && c.isNotifiable,
            );

            if (rscChar) {
              console.log(`🏃 Starting RSC monitoring for ${device.name}`);
              rscChar.monitor((error, char) => {
                if (error || !char?.value) return;

                const rscData = parseRSC(char.value);
                if (rscData.speed || rscData.cadence) {
                  console.log(`🏃 RSC data:`, rscData);
                  setSensorValues((prev) => ({
                    ...prev,
                    ...(rscData.cadence && { cadence: rscData.cadence }),
                    timestamp: Date.now(),
                  }));
                }
              });
              hasActiveMonitors = true;
            }
          }

          // Cycling Speed and Cadence Service
          else if (serviceUuid === FITNESS_SERVICES.CYCLING_SPEED_CADENCE) {
            const cscChar = characteristics.find(
              (c) =>
                c.uuid.toUpperCase() ===
                  FITNESS_CHARACTERISTICS.CSC_MEASUREMENT && c.isNotifiable,
            );

            if (cscChar) {
              console.log(`🚴 Starting CSC monitoring for ${device.name}`);
              cscChar.monitor((error, char) => {
                if (error || !char?.value) return;

                const cscData = parseCSC(char.value);
                if (cscData.cadence) {
                  console.log(`🚴 Cycling cadence: ${cscData.cadence} rpm`);
                  setSensorValues((prev) => ({
                    ...prev,
                    cadence: cscData.cadence,
                    timestamp: Date.now(),
                  }));
                }
              });
              hasActiveMonitors = true;
            }
          }
        }

        if (!hasActiveMonitors) {
          console.warn(
            `⚠️ No compatible fitness sensors found on ${device.name}`,
          );
        }

        setConnectedDevices((prev) => [...prev, device]);
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId ? { ...d, isConnected: true } : d,
          ),
        );
      } catch (error) {
        console.warn("❌ Failed to connect:", error);
        throw error;
      }
    },
    [manager, parseHeartRate, parseCyclingPower, parseRSC, parseCSC],
  );

  // Disconnect device
  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      const device = connectedDevices.find((d) => d.id === deviceId);
      if (!device) return;

      try {
        console.log(`🔌 Disconnecting from ${device.name}`);
        await device.cancelConnection();

        setConnectedDevices((prev) => prev.filter((d) => d.id !== deviceId));
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId ? { ...d, isConnected: false } : d,
          ),
        );

        // Clear sensor values when disconnecting
        setSensorValues({});

        console.log(`✅ Disconnected from ${device.name}`);
      } catch (error) {
        console.warn("❌ Failed to disconnect:", error);
      }
    },
    [connectedDevices],
  );

  // Monitor Bluetooth state
  useEffect(() => {
    const subscription = manager.onStateChange((state) => {
      console.log(`📶 Bluetooth state: ${state}`);
      const isEnabled = state === "PoweredOn";
      setIsBluetoothEnabled(isEnabled);

      if (!isEnabled) {
        setIsScanning(false);
        setSensorValues({});
      }
    }, true);

    return () => subscription.remove();
  }, [manager]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        manager.stopDeviceScan();
        manager.destroy();
      } catch (error) {
        console.warn("Cleanup error:", error);
      }
    };
  }, [manager]);

  return {
    allDevices: devices,
    connectedDevices,
    sensorValues,
    isScanning,
    isBluetoothEnabled,
    scanForDevices,
    connectDevice,
    disconnectDevice,
    stopScan: () => {
      manager.stopDeviceScan();
      setIsScanning(false);
    },
  };
};
