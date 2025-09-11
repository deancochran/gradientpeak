import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";
import { useCallback, useEffect, useRef, useState } from "react";
import { BleManager, Device, Subscription } from "react-native-ble-plx";

export type SensorValues = {
  heartRate?: number;
  cadence?: number;
  power?: number;
  speed?: number;
  distance?: number;
  calories?: number;
  steps?: number;
  timestamp?: number;
};

export type BluetoothDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  isConnected: boolean;
  type: DeviceType;
  lastSeen: number;
  autoReconnect: boolean;
};

export type DeviceType =
  | "FITNESS_SENSOR"
  | "SMARTWATCH"
  | "HEART_RATE_MONITOR"
  | "POWER_METER"
  | "CADENCE_SENSOR"
  | "SPEED_SENSOR"
  | "UNKNOWN";

type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

type DeviceConnection = {
  device: Device;
  state: ConnectionState;
  subscriptions: Subscription[];
  reconnectAttempts: number;
  lastConnected: number;
  healthCheckInterval?: NodeJS.Timeout;
};

// Enhanced fitness services including smartwatch-specific ones
const FITNESS_SERVICES = {
  // Standard Fitness Services
  HEART_RATE: "180D",
  CYCLING_POWER: "1818",
  RUNNING_SPEED_CADENCE: "1814",
  CYCLING_SPEED_CADENCE: "1816",

  // Smartwatch Services
  FITNESS_MACHINE: "1826",
  USER_DATA: "181C",
  BODY_COMPOSITION: "181B",
  WEIGHT_SCALE: "181D",
  GLUCOSE: "1808",
  CURRENT_TIME: "1805",

  // Apple Watch / HealthKit
  APPLE_NOTIFICATION_CENTER: "7905F431-B5CE-4E99-A40F-4B1E122D00D0",
  APPLE_MEDIA_SERVICE: "89D3502B-0F36-433A-8EF4-C502AD55F8DC",

  // Samsung / Wear OS
  SAMSUNG_ACCESSORY: "FE7C4C02-C621-4E66-8705-6ABDD796939A",

  // Fitbit Services
  FITBIT_SERVICE: "ADAB", // Custom Fitbit service

  // Garmin Services
  GARMIN_SERVICE: "6A4E2401-667B-11E3-949A-0800200C9A66",

  // Generic Activity Services
  ACTIVITY_TRACKER: "1815",
  LOCATION_NAVIGATION: "1819",
} as const;

const FITNESS_CHARACTERISTICS = {
  // Heart Rate
  HEART_RATE_MEASUREMENT: "00002A37-0000-1000-8000-00805F9B34FB",
  HEART_RATE_CONTROL_POINT: "2A39",

  // Power
  CYCLING_POWER_MEASUREMENT: "00002A63-0000-1000-8000-00805F9B34FB",
  CYCLING_POWER_FEATURE: "2A65",
  CYCLING_POWER_CONTROL_POINT: "2A66",

  // Speed & Cadence
  RSC_MEASUREMENT: "00002A53-0000-1000-8000-00805F9B34FB", // Running Speed and Cadence
  CSC_MEASUREMENT: "00002A5B-0000-1000-8000-00805F9B34FB", // Cycling Speed and Cadence

  // Fitness Machine
  FITNESS_MACHINE_FEATURE: "2ACC",
  TREADMILL_DATA: "2ACD",
  CROSS_TRAINER_DATA: "2ACE",
  STEP_CLIMBER_DATA: "2ACF",
  STAIR_CLIMBER_DATA: "2AD0",
  ROWER_DATA: "2AD1",
  INDOOR_BIKE_DATA: "2AD2",

  // User Data / Body Composition
  USER_CONTROL_POINT: "2A9F",
  HEIGHT: "2A8E",
  WEIGHT: "2A98",
  BODY_COMPOSITION_MEASUREMENT: "2A9C",

  // Smartwatch Activity
  STEP_COUNT: "2A3A", // Step count (custom or estimated)
  ACTIVITY_LEVEL: "2A85", // Activity level
  CALORIES_BURNED: "2A86", // Estimated calories

  // Time & Date
  CURRENT_TIME: "2A2B",
  LOCAL_TIME_INFORMATION: "2A0F",

  // Battery
  BATTERY_LEVEL: "2A19",

  // Device Information
  MANUFACTURER_NAME: "2A29",
  MODEL_NUMBER: "2A24",
  FIRMWARE_REVISION: "2A26",
  SOFTWARE_REVISION: "2A28",
} as const;

// Device type detection patterns
const DEVICE_PATTERNS = {
  APPLE_WATCH: /apple watch|watch/i,
  SAMSUNG_WATCH: /galaxy watch|gear/i,
  FITBIT: /fitbit|versa|sense|charge|ionic/i,
  GARMIN: /garmin|forerunner|fenix|vivoactive|venu/i,
  POLAR: /polar|vantage|grit|unite/i,
  SUUNTO: /suunto|ambit|traverse/i,
  WAHOO: /wahoo|kickr|elemnt/i,
  STAGES: /stages/i,
  POWER_METER: /power|watts|quarq|srm|stages/i,
  HEART_RATE: /hrm|heart rate|polar h\d+/i,
} as const;

const STORAGE_KEYS = {
  PAIRED_DEVICES: "ble_paired_devices",
  AUTO_RECONNECT_DEVICES: "ble_auto_reconnect_devices",
} as const;

export const useAdvancedBluetooth = () => {
  const [manager] = useState(() => new BleManager());
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [sensorValues, setSensorValues] = useState<SensorValues>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(true);

  // Connection management
  const connectionsRef = useRef<Map<string, DeviceConnection>>(new Map());
  const reconnectTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const subscriptionsRef = useRef<Subscription[]>([]);

  // Computed values
  const connectedDevices = Array.from(connectionsRef.current.values())
    .filter((conn) => conn.state === "connected")
    .map((conn) => conn.device);

  // Device type detection
  const detectDeviceType = useCallback(
    (deviceName: string | null, serviceUUIDs?: string[]): DeviceType => {
      if (!deviceName) return "UNKNOWN";

      const name = deviceName.toLowerCase();
      const services = serviceUUIDs?.map((s) => s.toUpperCase()) || [];

      // Check for smartwatches first (most specific)
      if (DEVICE_PATTERNS.APPLE_WATCH.test(name)) return "SMARTWATCH";
      if (DEVICE_PATTERNS.SAMSUNG_WATCH.test(name)) return "SMARTWATCH";
      if (DEVICE_PATTERNS.FITBIT.test(name)) return "SMARTWATCH";
      if (DEVICE_PATTERNS.GARMIN.test(name)) return "SMARTWATCH";
      if (DEVICE_PATTERNS.POLAR.test(name)) return "SMARTWATCH";
      if (DEVICE_PATTERNS.SUUNTO.test(name)) return "SMARTWATCH";

      // Check service UUIDs for device type
      if (services.includes(FITNESS_SERVICES.FITNESS_MACHINE))
        return "SMARTWATCH";
      if (services.includes(FITNESS_SERVICES.CYCLING_POWER))
        return "POWER_METER";
      if (services.includes(FITNESS_SERVICES.HEART_RATE))
        return "HEART_RATE_MONITOR";
      if (services.includes(FITNESS_SERVICES.CYCLING_SPEED_CADENCE))
        return "CADENCE_SENSOR";
      if (services.includes(FITNESS_SERVICES.RUNNING_SPEED_CADENCE))
        return "SPEED_SENSOR";

      // Check device name patterns
      if (DEVICE_PATTERNS.POWER_METER.test(name)) return "POWER_METER";
      if (DEVICE_PATTERNS.HEART_RATE.test(name)) return "HEART_RATE_MONITOR";

      return "FITNESS_SENSOR";
    },
    [],
  );

  // Enhanced parsing functions for smartwatch data
  const parseHeartRate = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      console.log(
        "🔍 HR Debug - Raw buffer:",
        Array.from(buffer),
        "Length:",
        buffer.length,
      );

      if (buffer.length < 2) {
        console.warn("🔍 HR Debug - Buffer too short:", buffer.length);
        return 0;
      }

      const flags = buffer.readUInt8(0);
      const hrFormat = flags & 0x01;

      console.log(
        "🔍 HR Debug - Flags:",
        flags.toString(2),
        "HR Format:",
        hrFormat,
      );

      if (hrFormat === 0 && buffer.length >= 2) {
        const heartRate = buffer.readUInt8(1);
        console.log("🔍 HR Debug - 8-bit HR:", heartRate);
        return heartRate;
      } else if (hrFormat === 1 && buffer.length >= 3) {
        const heartRate = buffer.readUInt16LE(1);
        console.log("🔍 HR Debug - 16-bit HR:", heartRate);
        return heartRate;
      }

      console.warn("🔍 HR Debug - No valid format found");
      return 0;
    } catch (error) {
      console.warn("Heart rate parsing error:", error);
      return 0;
    }
  }, []);

  const parseCyclingPower = useCallback((base64Value: string): number => {
    try {
      const buffer = Buffer.from(base64Value, "base64");
      if (buffer.length < 4) return 0;
      return buffer.readUInt16LE(2);
    } catch (error) {
      console.warn("Power parsing error:", error);
      return 0;
    }
  }, []);

  const parseRSC = useCallback(
    (base64Value: string): { speed?: number; cadence?: number } => {
      try {
        const buffer = Buffer.from(base64Value, "base64");
        if (buffer.length < 4) return {};

        const flags = buffer.readUInt8(0);
        const instantaneousSpeed = buffer.readUInt16LE(1);
        const instantaneousCadence = buffer.readUInt8(3);

        const result: { speed?: number; cadence?: number } = {};

        if (flags & 0x01) {
          // Instantaneous Speed Present
          result.speed = instantaneousSpeed / 256; // Convert to m/s
        }

        if (flags & 0x02) {
          // Instantaneous Cadence Present
          result.cadence = instantaneousCadence;
        }

        return result;
      } catch (error) {
        console.warn("RSC parsing error:", error);
        return {};
      }
    },
    [],
  );

  const parseCSC = useCallback(
    (base64Value: string): { speed?: number; cadence?: number } => {
      try {
        const buffer = Buffer.from(base64Value, "base64");
        if (buffer.length < 5) return {};

        const flags = buffer.readUInt8(0);
        let offset = 1;

        // Skip wheel data if present
        if (flags & 0x01) {
          offset += 6;
        }

        // Crank revolution data present
        if (flags & 0x02 && buffer.length >= offset + 4) {
          const crankRevolutions = buffer.readUInt16LE(offset);
          const lastCrankEventTime = buffer.readUInt16LE(offset + 2);

          // Calculate cadence (simplified)
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

  // Enhanced fitness machine data parsing for smartwatches
  const parseFitnessMachineData = useCallback(
    (
      base64Value: string,
      characteristicUUID: string,
    ): Partial<SensorValues> => {
      try {
        const buffer = Buffer.from(base64Value, "base64");
        if (buffer.length < 2) return {};

        const flags = buffer.readUInt16LE(0);
        let offset = 2;
        const result: Partial<SensorValues> = {};

        switch (characteristicUUID.toUpperCase()) {
          case FITNESS_CHARACTERISTICS.TREADMILL_DATA:
            // Parse treadmill data
            if (flags & 0x01 && buffer.length >= offset + 2) {
              // Speed present
              result.speed = buffer.readUInt16LE(offset) / 100; // km/h
              offset += 2;
            }
            if (flags & 0x02 && buffer.length >= offset + 2) {
              // Average Speed present
              offset += 2;
            }
            if (flags & 0x04 && buffer.length >= offset + 3) {
              // Total Distance present
              result.distance = buffer.readUInt24LE
                ? buffer.readUInt24LE(offset)
                : 0;
              offset += 3;
            }
            if (flags & 0x08 && buffer.length >= offset + 2) {
              // Total Energy present
              result.calories = buffer.readUInt16LE(offset);
              offset += 2;
            }
            break;

          case FITNESS_CHARACTERISTICS.INDOOR_BIKE_DATA:
            // Parse indoor bike data
            if (flags & 0x01 && buffer.length >= offset + 2) {
              // Speed present
              result.speed = buffer.readUInt16LE(offset) / 100; // km/h
              offset += 2;
            }
            if (flags & 0x04 && buffer.length >= offset + 2) {
              // Average Cadence present
              result.cadence = buffer.readUInt16LE(offset) / 2;
              offset += 2;
            }
            if (flags & 0x40 && buffer.length >= offset + 2) {
              // Instantaneous Power present
              result.power = buffer.readUInt16LE(offset);
              offset += 2;
            }
            if (flags & 0x10 && buffer.length >= offset + 2) {
              // Total Energy present
              result.calories = buffer.readUInt16LE(offset);
              offset += 2;
            }
            if (flags & 0x20 && buffer.length >= offset + 2) {
              // Heart Rate present
              result.heartRate = buffer.readUInt8(offset);
              offset += 1;
            }
            break;
        }

        return result;
      } catch (error) {
        console.warn("Fitness machine data parsing error:", error);
        return {};
      }
    },
    [],
  );

  // Device persistence
  const savePairedDevices = useCallback(async (devices: BluetoothDevice[]) => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PAIRED_DEVICES,
        JSON.stringify(devices),
      );
    } catch (error) {
      console.warn("Failed to save paired devices:", error);
    }
  }, []);

  const loadPairedDevices = useCallback(async (): Promise<
    BluetoothDevice[]
  > => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.PAIRED_DEVICES);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn("Failed to load paired devices:", error);
      return [];
    }
  }, []);

  // Connection health monitoring
  const startHealthCheck = useCallback((deviceId: string) => {
    const connection = connectionsRef.current.get(deviceId);
    if (!connection || connection.healthCheckInterval) return;

    connection.healthCheckInterval = setInterval(async () => {
      try {
        const isConnected = await connection.device.isConnected();
        if (!isConnected) {
          console.warn(
            `🔥 Health check failed for ${connection.device.name}, attempting reconnect`,
          );
          await initiateReconnect(deviceId);
        }
      } catch (error) {
        console.warn(
          `🔥 Health check error for ${connection.device.name}:`,
          error,
        );
        await initiateReconnect(deviceId);
      }
    }, 30000); // Check every 30 seconds

    connectionsRef.current.set(deviceId, connection);
  }, []);

  const stopHealthCheck = useCallback((deviceId: string) => {
    const connection = connectionsRef.current.get(deviceId);
    if (connection?.healthCheckInterval) {
      clearInterval(connection.healthCheckInterval);
      connection.healthCheckInterval = undefined;
      connectionsRef.current.set(deviceId, connection);
    }
  }, []);

  // Enhanced reconnection logic
  const initiateReconnect = useCallback(async (deviceId: string) => {
    const connection = connectionsRef.current.get(deviceId);
    if (
      !connection ||
      connection.state === "connecting" ||
      connection.state === "reconnecting"
    ) {
      return;
    }

    console.log(`🔄 Starting reconnect for ${connection.device.name}`);

    connection.state = "reconnecting";
    connection.reconnectAttempts++;
    connectionsRef.current.set(deviceId, connection);

    // Clear existing timer
    const existingTimer = reconnectTimersRef.current.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(
      1000 * Math.pow(2, connection.reconnectAttempts - 1),
      30000,
    );

    const timer = setTimeout(async () => {
      try {
        await connectDevice(deviceId, true);
      } catch (error) {
        console.warn(
          `❌ Reconnect attempt ${connection.reconnectAttempts} failed for ${connection.device.name}:`,
          error,
        );

        // Max 10 attempts, then give up for 5 minutes
        if (connection.reconnectAttempts < 10) {
          await initiateReconnect(deviceId);
        } else {
          console.log(
            `🛑 Max reconnect attempts reached for ${connection.device.name}, waiting 5 minutes`,
          );
          setTimeout(() => {
            const conn = connectionsRef.current.get(deviceId);
            if (conn) {
              conn.reconnectAttempts = 0;
              connectionsRef.current.set(deviceId, conn);
              initiateReconnect(deviceId);
            }
          }, 300000); // 5 minutes
        }
      }
    }, delay);

    reconnectTimersRef.current.set(deviceId, timer);
  }, []);

  // Enhanced device scanning with smartwatch support
  const scanForDevices = useCallback(
    (duration: number = 15000) => {
      if (!isBluetoothEnabled || isScanning) return;

      console.log(
        "🔍 Starting enhanced BLE scan for fitness devices and smartwatches...",
      );
      setIsScanning(true);
      setDevices([]);

      const allServices = Object.values(FITNESS_SERVICES);
      console.log("🔍 Scanning for services:", allServices);

      manager.startDeviceScan(
        allServices,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.warn("BLE scan error:", error);
            return;
          }

          if (device?.name) {
            const deviceType = detectDeviceType(
              device.name,
              device.serviceUUIDs,
            );

            console.log(`📱 Found ${deviceType}: ${device.name}`, {
              rssi: device.rssi,
              services: device.serviceUUIDs,
            });

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
                  type: deviceType,
                  lastSeen: Date.now(),
                  autoReconnect: false,
                },
              ];
            });
          }
        },
      );

      setTimeout(() => {
        console.log("🛑 Stopping enhanced BLE scan");
        manager.stopDeviceScan();
        setIsScanning(false);
      }, duration);
    },
    [manager, isBluetoothEnabled, isScanning, detectDeviceType],
  );

  // Enhanced connection with multi-characteristic support
  const connectDevice = useCallback(
    async (deviceId: string, isReconnect = false) => {
      try {
        const existingConnection = connectionsRef.current.get(deviceId);
        if (existingConnection && existingConnection.state === "connecting") {
          console.log(`🔄 Already connecting to device: ${deviceId}`);
          return;
        }

        console.log(
          `🔄 ${isReconnect ? "Reconnecting" : "Connecting"} to device: ${deviceId}`,
        );

        const device = await manager.connectToDevice(deviceId, {
          autoConnect: false,
          requestMTU: 512, // Request larger MTU for more data
          timeout: 20000, // 20 second timeout
        });

        console.log(`✅ Connected to ${device.name}`);

        // Create connection record
        const connection: DeviceConnection = {
          device,
          state: "connected",
          subscriptions: [],
          reconnectAttempts: isReconnect
            ? existingConnection?.reconnectAttempts || 0
            : 0,
          lastConnected: Date.now(),
        };

        connectionsRef.current.set(deviceId, connection);

        // Clear reconnect timer if exists
        const timer = reconnectTimersRef.current.get(deviceId);
        if (timer) {
          clearTimeout(timer);
          reconnectTimersRef.current.delete(deviceId);
        }

        // Discover services and characteristics
        await device.discoverAllServicesAndCharacteristics();
        const services = await device.services();

        console.log(
          `📋 Available services on ${device.name}:`,
          services.map((s) => s.uuid.toUpperCase()),
        );

        // Subscribe to multiple characteristics
        for (const service of services) {
          const serviceUuid = service.uuid.toUpperCase();
          const characteristics = await service.characteristics();

          console.log(
            `🔍 Service ${serviceUuid} characteristics:`,
            characteristics.map((c) => ({
              uuid: c.uuid.toUpperCase(),
              notifiable: c.isNotifiable,
            })),
          );

          for (const characteristic of characteristics) {
            if (!characteristic.isNotifiable) continue;

            const charUuid = characteristic.uuid.toUpperCase();

            try {
              const subscription = characteristic.monitor((error, char) => {
                if (error) {
                  console.warn(`❌ Monitor error for ${device.name}:`, error);
                  return;
                }

                if (!char?.value) return;

                const now = Date.now();
                let sensorData: Partial<SensorValues> = { timestamp: now };

                // Parse based on characteristic UUID
                console.log(
                  `🔍 Checking characteristic ${charUuid} against known UUIDs`,
                );
                switch (charUuid) {
                  case FITNESS_CHARACTERISTICS.HEART_RATE_MEASUREMENT:
                    console.log(
                      `🔍 Processing HR characteristic ${charUuid} from ${device.name}`,
                    );
                    const heartRate = parseHeartRate(char.value);
                    console.log(`🔍 Parsed HR result: ${heartRate}`);
                    if (heartRate > 0 && heartRate <= 220) {
                      sensorData.heartRate = heartRate;
                      console.log(
                        `💓 Heart rate from ${device.name}: ${heartRate} bpm`,
                      );
                    } else {
                      console.warn(
                        `🔍 HR out of range: ${heartRate} from ${device.name}`,
                      );
                    }
                    break;

                  case FITNESS_CHARACTERISTICS.CYCLING_POWER_MEASUREMENT:
                    console.log(
                      `🔍 Processing Power characteristic ${charUuid} from ${device.name}`,
                    );
                    const power = parseCyclingPower(char.value);
                    console.log(`🔍 Parsed Power result: ${power}`);
                    if (power > 0 && power <= 2000) {
                      sensorData.power = power;
                      console.log(`⚡ Power from ${device.name}: ${power} W`);
                    } else {
                      console.warn(
                        `🔍 Power out of range: ${power} from ${device.name}`,
                      );
                    }
                    break;

                  case FITNESS_CHARACTERISTICS.RSC_MEASUREMENT:
                    console.log(
                      `🔍 Processing RSC characteristic ${charUuid} from ${device.name}`,
                    );
                    const rscData = parseRSC(char.value);
                    console.log(`🔍 Parsed RSC result:`, rscData);
                    if (rscData.speed || rscData.cadence) {
                      Object.assign(sensorData, rscData);
                      console.log(`🏃 RSC from ${device.name}:`, rscData);
                    }
                    break;

                  case FITNESS_CHARACTERISTICS.CSC_MEASUREMENT:
                    const cscData = parseCSC(char.value);
                    if (cscData.cadence) {
                      Object.assign(sensorData, cscData);
                      console.log(`🚴 CSC from ${device.name}:`, cscData);
                    }
                    break;

                  case FITNESS_CHARACTERISTICS.TREADMILL_DATA:
                  case FITNESS_CHARACTERISTICS.INDOOR_BIKE_DATA:
                  case FITNESS_CHARACTERISTICS.CROSS_TRAINER_DATA:
                    const fitnessData = parseFitnessMachineData(
                      char.value,
                      charUuid,
                    );
                    if (Object.keys(fitnessData).length > 0) {
                      Object.assign(sensorData, fitnessData);
                      console.log(
                        `🏋️ Fitness machine data from ${device.name}:`,
                        fitnessData,
                      );
                    }
                    break;

                  case FITNESS_CHARACTERISTICS.BATTERY_LEVEL:
                    try {
                      const buffer = Buffer.from(char.value, "base64");
                      const batteryLevel = buffer.readUInt8(0);
                      console.log(
                        `🔋 Battery level from ${device.name}: ${batteryLevel}%`,
                      );
                    } catch (e) {
                      console.warn("Battery level parsing error:", e);
                    }
                    break;

                  default:
                    console.log(
                      `📊 Raw data from ${device.name} (${charUuid}):`,
                      char.value,
                    );

                    // Try to decode common data patterns for unknown characteristics
                    try {
                      const buffer = Buffer.from(char.value, "base64");
                      if (buffer.length >= 2) {
                        console.log(
                          `🔍 Unknown characteristic buffer:`,
                          Array.from(buffer),
                        );

                        // Check if it might be heart rate data (common pattern)
                        if (buffer.length === 2 && buffer[0] === 0) {
                          const possibleHR = buffer[1];
                          if (possibleHR > 30 && possibleHR < 220) {
                            console.log(
                              `🔍 Possible HR data in unknown characteristic: ${possibleHR} bpm`,
                            );
                          }
                        }
                      }
                    } catch (e) {
                      console.warn(
                        "Failed to decode unknown characteristic:",
                        e,
                      );
                    }
                    break;
                }

                // Update sensor values if we got valid data
                if (Object.keys(sensorData).length > 1) {
                  // More than just timestamp
                  console.log(`🔄 Updating sensor values with:`, sensorData);
                  setSensorValues((prev) => {
                    const newValues = {
                      ...prev,
                      ...sensorData,
                    };
                    console.log(`🔄 New sensor values state:`, newValues);
                    return newValues;
                  });
                } else {
                  console.log(
                    `🔍 No valid sensor data to update, only got:`,
                    sensorData,
                  );
                }
              });

              connection.subscriptions.push(subscription);
              console.log(`📡 Monitoring ${charUuid} on ${device.name}`);
            } catch (error) {
              console.warn(
                `❌ Failed to monitor ${charUuid} on ${device.name}:`,
                error,
              );
            }
          }
        }

        connectionsRef.current.set(deviceId, connection);

        // Update device list
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId ? { ...d, isConnected: true } : d,
          ),
        );

        // Start health monitoring
        startHealthCheck(deviceId);

        // Save to paired devices
        const currentDevices = await loadPairedDevices();
        const updatedDevices = [
          ...currentDevices.filter((d) => d.id !== deviceId),
          {
            id: deviceId,
            name: device.name,
            rssi: null,
            isConnected: true,
            type: detectDeviceType(device.name),
            lastSeen: Date.now(),
            autoReconnect: true,
          },
        ];
        await savePairedDevices(updatedDevices);
      } catch (error) {
        console.warn("❌ Failed to connect:", error);

        const connection = connectionsRef.current.get(deviceId);
        if (connection) {
          connection.state = "disconnected";
          connectionsRef.current.set(deviceId, connection);
        }

        throw error;
      }
    },
    [
      manager,
      parseHeartRate,
      parseCyclingPower,
      parseRSC,
      parseCSC,
      parseFitnessMachineData,
      detectDeviceType,
      startHealthCheck,
      loadPairedDevices,
      savePairedDevices,
    ],
  );

  // Enhanced disconnect with cleanup
  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      const connection = connectionsRef.current.get(deviceId);
      if (!connection) return;

      try {
        console.log(`🔌 Disconnecting from ${connection.device.name}`);

        // Stop health check
        stopHealthCheck(deviceId);

        // Clear reconnect timer
        const timer = reconnectTimersRef.current.get(deviceId);
        if (timer) {
          clearTimeout(timer);
          reconnectTimersRef.current.delete(deviceId);
        }

        // Remove subscriptions
        connection.subscriptions.forEach((sub) => {
          try {
            sub.remove();
          } catch (e) {
            console.warn("Error removing subscription:", e);
          }
        });

        // Disconnect device
        await connection.device.cancelConnection();

        // Clean up connection
        connectionsRef.current.delete(deviceId);

        // Update device list
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId ? { ...d, isConnected: false } : d,
          ),
        );

        // Clear sensor values if this was the last device
        if (connectionsRef.current.size === 0) {
          setSensorValues({});
        }

        console.log(`✅ Disconnected from ${connection.device.name}`);
      } catch (error) {
        console.warn("❌ Failed to disconnect:", error);
      }
    },
    [stopHealthCheck],
  );

  // Auto-reconnect to saved devices on startup
  const autoReconnectSavedDevices = useCallback(async () => {
    try {
      const savedDevices = await loadPairedDevices();
      const autoReconnectDevices = savedDevices.filter((d) => d.autoReconnect);

      if (autoReconnectDevices.length === 0) return;

      console.log(
        "🔄 Auto-reconnecting to saved devices:",
        autoReconnectDevices.map((d) => d.name),
      );

      // Get system connected devices
      const systemConnected = await manager.connectedDevices(
        Object.values(FITNESS_SERVICES),
      );

      for (const savedDevice of autoReconnectDevices) {
        try {
          const systemDevice = systemConnected.find(
            (d) => d.id === savedDevice.id,
          );
          if (systemDevice) {
            console.log(`🔄 Auto-reconnecting to ${systemDevice.name}`);
            await connectDevice(systemDevice.id, true);
          }
        } catch (error) {
          console.warn(
            `❌ Auto-reconnect failed for ${savedDevice.name}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.warn("❌ Auto-reconnect startup failed:", error);
    }
  }, [manager, loadPairedDevices, connectDevice]);

  // Monitor Bluetooth state
  useEffect(() => {
    const subscription = manager.onStateChange((state) => {
      console.log(`📶 Bluetooth state: ${state}`);
      const isEnabled = state === "PoweredOn";
      setIsBluetoothEnabled(isEnabled);

      if (!isEnabled) {
        setIsScanning(false);
        setSensorValues({});

        // Clear all connections
        connectionsRef.current.clear();
        reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
        reconnectTimersRef.current.clear();
      } else {
        // Auto-reconnect when Bluetooth is enabled
        setTimeout(() => autoReconnectSavedDevices(), 2000);
      }
    }, true);

    return () => subscription.remove();
  }, [manager, autoReconnectSavedDevices]);

  // Set up device disconnection monitoring - optimize to prevent loops
  useEffect(() => {
    // This effect should only run when manager changes, not the callback functions
    // Store subscriptions locally to avoid stale closure issues
    const currentSubscriptions: Subscription[] = [];

    const setupDisconnectionMonitoring = () => {
      connectionsRef.current.forEach((connection, deviceId) => {
        const subscription = manager.onDeviceDisconnected(
          deviceId,
          (error, device) => {
            if (error) {
              console.warn(
                `🔥 Disconnection error for ${device?.name || deviceId}:`,
                error,
              );
            }

            if (device) {
              console.log(`🔌 Device disconnected: ${device.name}`);

              const conn = connectionsRef.current.get(deviceId);
              if (conn) {
                conn.state = "disconnected";
                connectionsRef.current.set(deviceId, conn);

                // Check if we should auto-reconnect
                loadPairedDevices()
                  .then((devices) => {
                    const savedDevice = devices.find((d) => d.id === deviceId);
                    if (savedDevice?.autoReconnect) {
                      setTimeout(() => initiateReconnect(deviceId), 5000);
                    }
                  })
                  .catch((err) => {
                    console.warn("Failed to check auto-reconnect:", err);
                  });
              }
            }
          },
        );

        currentSubscriptions.push(subscription);
      });
    };

    // Only set up monitoring if we have connections
    if (connectionsRef.current.size > 0) {
      setupDisconnectionMonitoring();
    }

    return () => {
      currentSubscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    };
  }, [manager]); // Only depend on manager

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        manager.stopDeviceScan();

        // Clear all timers
        reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));

        // Stop health checks
        connectionsRef.current.forEach((_, deviceId) =>
          stopHealthCheck(deviceId),
        );

        // Clean up subscriptions
        subscriptionsRef.current.forEach((sub) => {
          try {
            sub.remove();
          } catch (e) {
            // Ignore cleanup errors
          }
        });

        manager.destroy();
      } catch (error) {
        console.warn("Cleanup error:", error);
      }
    };
  }, [manager, stopHealthCheck]);

  return {
    // Device management
    allDevices: devices,
    connectedDevices,
    sensorValues,
    isScanning,
    isBluetoothEnabled,

    // Connection methods
    scanForDevices,
    connectDevice: (deviceId: string) => connectDevice(deviceId, false),
    disconnectDevice,

    // Utility methods
    stopScan: () => {
      manager.stopDeviceScan();
      setIsScanning(false);
    },

    // Connection state
    getConnectionState: (deviceId: string) =>
      connectionsRef.current.get(deviceId)?.state || "disconnected",
    getReconnectAttempts: (deviceId: string) =>
      connectionsRef.current.get(deviceId)?.reconnectAttempts || 0,

    // Device management
    toggleAutoReconnect: async (deviceId: string, enabled: boolean) => {
      const devices = await loadPairedDevices();
      const updated = devices.map((d) =>
        d.id === deviceId ? { ...d, autoReconnect: enabled } : d,
      );
      await savePairedDevices(updated);

      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, autoReconnect: enabled } : d,
        ),
      );
    },

    // Manual reconnect
    forceReconnect: (deviceId: string) => initiateReconnect(deviceId),
  };
};
