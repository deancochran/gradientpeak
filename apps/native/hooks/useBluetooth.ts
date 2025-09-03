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

  const store = useBluetoothStore();
  const {
    devices,
    isScanning,
    isBluetoothEnabled,
    currentSensorData,
    devicePreferences,
    initializeBluetooth,
    startScanning,
    stopScanning,
    connectToDevice,
    disconnectFromDevice,
    disconnectAllDevices,
    autoConnectPreferredDevices,
    clearSensorData,
    getConnectedDevices,
    getDeviceById,
  } = store;

  const connectedDevices = getConnectedDevices();
  const discoveredDevices = devices.filter(
    (d) => d.connectionStatus === "disconnected",
  );

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
  }, [autoInitialize, initializeBluetooth, disconnectAllDevices]);

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
  }, [autoConnect, isBluetoothEnabled, autoConnectPreferredDevices]);

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
    connectedDevices.forEach((device) => {
      if (device && onDeviceConnected) {
        onDeviceConnected(device.id, device.name);
      }
    });
  }, [connectedDevices, onDeviceConnected]);

  // Monitor connection errors
  useEffect(() => {
    if (onConnectionError) {
      devices.forEach((device) => {
        if (device.connectionError) {
          onConnectionError(device.id, device.connectionError);
        }
      });
    }
  }, [devices, onConnectionError]);

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
      const device = getDeviceById(deviceId);
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
      const device = getDeviceById(deviceId);
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
    return connectedDevices.filter((device) =>
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

    return preferredDeviceId ? getDeviceById(preferredDeviceId) : undefined;
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
      (deviceId) => deviceId && connectedDevices.some((d) => d.id === deviceId),
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
      connectedDeviceCount: connectedDevices.length,
      isReady: connectedDevices.length > 0,
    };
  };

  // Get current sensor values with validation
  const getCurrentSensorValues = () => {
    const now = Date.now();
    const dataAge = now - (currentSensorData?.timestamp ?? 0);
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
    discoveredDevices,
    connectedDevices,
    currentSensorData,
    devicePreferences,

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
    hasConnectedDevices: connectedDevices.length > 0,
    connectedDeviceCount: connectedDevices.length,
    discoveredDeviceCount: discoveredDevices.length,
  };
};

export default useBluetooth;
