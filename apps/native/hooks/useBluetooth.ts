// hooks/useBluetooth.ts
import { SensorData, useBluetoothStore } from "@/stores/bluetooth";
import { useEffect, useRef } from "react";
import { Alert, AppState, AppStateStatus } from "react-native";

export interface BluetoothHookOptions {
  autoInitialize?: boolean;
  autoConnect?: boolean;
  onSensorData?: (data: SensorData) => void;
  onDeviceConnected?: (deviceId: string, deviceName: string) => void;
  onDeviceDisconnected?: (deviceId: string, deviceName: string) => void;
  onConnectionError?: (deviceId: string, error: string) => void;
}

export const useBluetooth = (options: BluetoothHookOptions = {}) => {
  const {
    autoInitialize = true,
    autoConnect = true,
    onSensorData,
    onDeviceConnected,
    onDeviceDisconnected,
    onConnectionError,
  } = options;

  const appState = useRef(AppState.currentState);
  const lastSensorDataRef = useRef<SensorData | null>(null);

  const {
    bleManager,
    isScanning,
    discoveredDevices,
    connectedDevices,
    currentSensorData,
    devicePreferences,
    isBluetoothEnabled,
    connectionErrors,
    initializeBluetooth,
    startScanning,
    stopScanning,
    connectToDevice,
    disconnectFromDevice,
    disconnectAllDevices,
    autoConnectPreferredDevices,
    clearSensorData,
  } = useBluetoothStore();

  // Initialize Bluetooth on mount
  useEffect(() => {
    if (autoInitialize) {
      initializeBluetooth().catch((error) => {
        console.error("Failed to initialize Bluetooth:", error);
      });
    }

    return () => {
      // Cleanup - disconnect all devices when component unmounts
      disconnectAllDevices().catch(console.error);
    };
  }, [autoInitialize]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to the foreground
        if (autoConnect && isBluetoothEnabled) {
          autoConnectPreferredDevices();
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App has gone to the background - optionally disconnect
        // Uncomment if you want to disconnect when app goes to background
        // disconnectAllDevices();
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [autoConnect, isBluetoothEnabled]);

  // Monitor sensor data changes
  useEffect(() => {
    if (onSensorData && currentSensorData) {
      const hasNewData =
        !lastSensorDataRef.current ||
        JSON.stringify(lastSensorDataRef.current) !==
          JSON.stringify(currentSensorData);

      if (hasNewData) {
        lastSensorDataRef.current = currentSensorData;
        onSensorData(currentSensorData);
      }
    }
  }, [currentSensorData, onSensorData]);

  // Monitor device connections
  useEffect(() => {
    const connectedDeviceIds = Array.from(connectedDevices.keys());

    connectedDeviceIds.forEach((deviceId) => {
      const device = connectedDevices.get(deviceId);
      if (device && onDeviceConnected) {
        // This is a simple way to detect new connections
        // In a real app, you might want more sophisticated connection event handling
        onDeviceConnected(device.id, device.name);
      }
    });
  }, [connectedDevices, onDeviceConnected]);

  // Monitor connection errors
  useEffect(() => {
    if (onConnectionError) {
      connectionErrors.forEach((error, deviceId) => {
        if (error) {
          onConnectionError(deviceId, error);
        }
      });
    }
  }, [connectionErrors, onConnectionError]);

  // Scanning utilities
  const scanForDevices = async (duration: number = 10000) => {
    try {
      await startScanning(duration);
    } catch (error) {
      Alert.alert(
        "Scan Failed",
        error instanceof Error ? error.message : "Failed to scan for devices",
      );
    }
  };

  const stopScanForDevices = () => {
    stopScanning();
  };

  // Connection utilities
  const connectDevice = async (deviceId: string) => {
    try {
      await connectToDevice(deviceId);
      const device = connectedDevices.get(deviceId);
      if (device && onDeviceConnected) {
        onDeviceConnected(device.id, device.name);
      }
    } catch (error) {
      if (onConnectionError) {
        onConnectionError(
          deviceId,
          error instanceof Error ? error.message : "Connection failed",
        );
      }
      throw error;
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    try {
      const device = connectedDevices.get(deviceId);
      await disconnectFromDevice(deviceId);
      if (device && onDeviceDisconnected) {
        onDeviceDisconnected(device.id, device.name);
      }
    } catch (error) {
      console.error(`Failed to disconnect from device ${deviceId}:`, error);
      throw error;
    }
  };

  // Get connected devices by sensor type
  const getConnectedDevicesBySensor = (
    sensorType: "heartRate" | "power" | "cadence" | "speed",
  ) => {
    return Array.from(connectedDevices.values()).filter((device) =>
      device.supportedSensors.includes(sensorType),
    );
  };

  // Check if we have a connected device for a specific sensor
  const hasConnectedSensorDevice = (
    sensorType: "heartRate" | "power" | "cadence" | "speed",
  ) => {
    const devices = getConnectedDevicesBySensor(sensorType);
    return devices.length > 0;
  };

  // Get the preferred device for a sensor type
  const getPreferredDevice = (
    sensorType: "heartRate" | "power" | "cadence" | "speed",
  ) => {
    const preferredDeviceId = devicePreferences[
      `preferred${sensorType.charAt(0).toUpperCase() + sensorType.slice(1)}Device` as keyof typeof devicePreferences
    ] as string;

    return preferredDeviceId
      ? connectedDevices.get(preferredDeviceId)
      : undefined;
  };

  // Check if all preferred devices are connected
  const arePreferredDevicesConnected = () => {
    const preferredDevices = [
      devicePreferences.preferredHeartRateDevice,
      devicePreferences.preferredPowerDevice,
      devicePreferences.preferredCadenceDevice,
      devicePreferences.preferredSpeedDevice,
    ].filter(Boolean);

    return preferredDevices.every(
      (deviceId) => deviceId && connectedDevices.has(deviceId),
    );
  };

  // Start workout with connected sensors
  const startWorkoutWithSensors = () => {
    const connectedSensors = {
      heartRate: hasConnectedSensorDevice("heartRate"),
      power: hasConnectedSensorDevice("power"),
      cadence: hasConnectedSensorDevice("cadence"),
      speed: hasConnectedSensorDevice("speed"),
    };

    // Clear previous sensor data
    clearSensorData();

    return {
      connectedSensors,
      connectedDeviceCount: connectedDevices.size,
      isReady: connectedDevices.size > 0,
    };
  };

  // Get current sensor values with validation
  const getCurrentSensorValues = () => {
    const now = Date.now();
    const dataAge = now - currentSensorData.timestamp;
    const isDataFresh = dataAge < 5000; // Consider data fresh if less than 5 seconds old

    return {
      heartRate: isDataFresh ? currentSensorData.heartRate : undefined,
      power: isDataFresh ? currentSensorData.power : undefined,
      cadence: isDataFresh ? currentSensorData.cadence : undefined,
      speed: isDataFresh ? currentSensorData.speed : undefined,
      timestamp: currentSensorData.timestamp,
      dataAge,
      isDataFresh,
    };
  };

  return {
    // State
    isScanning,
    isBluetoothEnabled,
    discoveredDevices: Array.from(discoveredDevices.values()),
    connectedDevices: Array.from(connectedDevices.values()),
    currentSensorData,
    devicePreferences,
    connectionErrors,

    // Actions
    scanForDevices,
    stopScanForDevices,
    connectDevice,
    disconnectDevice,
    disconnectAllDevices,
    initializeBluetooth,
    autoConnectPreferredDevices,
    clearSensorData,

    // Utilities
    getConnectedDevicesBySensor,
    hasConnectedSensorDevice,
    getPreferredDevice,
    arePreferredDevicesConnected,
    startWorkoutWithSensors,
    getCurrentSensorValues,

    // Computed values
    hasConnectedDevices: connectedDevices.size > 0,
    connectedDeviceCount: connectedDevices.size,
    discoveredDeviceCount: discoveredDevices.size,
  };
};

export default useBluetooth;
