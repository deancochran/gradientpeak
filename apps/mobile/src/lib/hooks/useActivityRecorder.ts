/**
 * Enhanced hook for activity recording functionality
 *
 * Integrates with ActivityRecorderService to provide:
 * - Recording session management
 * - Real-time metrics updates
 * - Sensor connection management
 * - Permission handling
 * - Background recording support
 */

import { PublicActivityType, PublicPlannedActivitiesRow } from "@repo/core";
import { useCallback, useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { ActivityRecorderService } from "../services/ActivityRecorder";
import { useRequireAuth } from "./useAuth";

/**
 * Enhanced activity recording hook with integrated sensor and permission management
 */
export const useActivityRecorder = () => {
  const { profile } = useRequireAuth();
  // Get singleton service instance
  const service = ActivityRecorderService.getInstance();

  // State management
  const [state, setState] = useState<RecordingState>("pending");
  const [metrics, setMetrics] = useState<ActivityMetrics>({
    duration: 0,
    distance: 0,
    currentSpeed: 0,
    avgSpeed: 0,
    totalElapsedTime: 0,
    totalTimerTime: 0,
  });
  const [connectionStatus, setConnectionStatus] = useState<{
    gps: ConnectionStatus;
    bluetooth: ConnectionStatus;
    sensors: Record<string, ConnectionStatus>;
  }>({
    gps: "disabled",
    bluetooth: "disabled",
    sensors: {},
  });
  const [connectedSensors, setConnectedSensors] = useState<ConnectedSensor[]>(
    [],
  );
  const [permissions, setPermissions] = useState<
    Record<PermissionType, PermissionState | null>
  >({
    bluetooth: null,
    location: null,
    "location-background": null,
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Computed values
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isReady = state === "ready";
  const isFinished = state === "finished";

  /** Update hook state from service */
  const updateFromService = useCallback(() => {
    try {
      // Update basic state
      setState(service.state);

      // Update metrics from service properties
      const liveMetrics: LiveMetrics = {
        totalElapsedTime: service.totalElapsedTime,
        totalTimerTime: service.movingTime,
        distance: 0, // Will be calculated from GPS data
        currentSpeed: 0, // Will come from sensor readings
        avgSpeed: 0, // Will be calculated
      };

      const activityMetrics: ActivityMetrics = {
        ...liveMetrics,
        duration: service.movingTime,
        heartRate: undefined, // Will come from sensor readings
        power: undefined, // Will come from sensor readings
        cadence: undefined, // Will come from sensor readings
      };

      setMetrics(activityMetrics);

      // Update sensors
      const sensors = service.getConnectedSensors();
      setConnectedSensors(sensors);
      updateConnectionStatus(sensors);
      updatePermissions();
    } catch (error) {
      console.error("Error updating from service:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [service]);

  /** Update connection status based on sensors and permissions */
  const updateConnectionStatus = useCallback(
    (sensors: ConnectedSensor[]) => {
      const hasGPS = service.getPermissionState("location")?.granted || false;
      const hasBluetooth =
        service.getPermissionState("bluetooth")?.granted || false;

      // Dynamic sensor status based on connected devices
      const sensorStatus: Record<string, ConnectionStatus> = {};
      sensors.forEach((sensor) => {
        sensorStatus[sensor.id] =
          sensor.connectionState === "connected" ? "connected" : "disconnected";
      });

      setConnectionStatus({
        gps: hasGPS ? "connected" : "disabled",
        bluetooth: hasBluetooth
          ? sensors.length > 0
            ? "connected"
            : "disconnected"
          : "disabled",
        sensors: sensorStatus,
      });
    },
    [service],
  );

  /** Update permissions from service */
  const updatePermissions = useCallback(() => {
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    const newPermissions: Record<PermissionType, PermissionState | null> = {
      bluetooth: null,
      location: null,
      "location-background": null,
    };

    types.forEach((type) => {
      newPermissions[type] = service.getPermissionState(type);
    });

    setPermissions(newPermissions);
  }, [service]);

  /** Start recording session */
  const startRecording = useCallback(
    async (
      activityType: PublicActivityType = "outdoor_run",
      plannedActivity?: PublicPlannedActivitiesRow,
    ): Promise<boolean> => {
      try {
        setLastError(null);

        if (!profile) {
          throw new Error("Profile is required to start recording");
        }

        // Set profile and activity type on service
        service.setProfile(profile);
        service.activityType = activityType;
        service.plannedActivity = plannedActivity;

        // Start recording with activity data
        await service.startRecording({
          profileId: profile.id,
          activityType,
          plannedActivityId: plannedActivity?.id,
        });

        updateFromService();
        return true;
      } catch (error) {
        console.error("Failed to start recording:", error);
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service, profile, updateFromService],
  );

  /** Pause active recording */
  const pauseRecording = useCallback((): boolean => {
    try {
      service.pauseRecording();
      updateFromService();
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, updateFromService]);

  /** Resume paused recording */
  const resumeRecording = useCallback((): boolean => {
    try {
      service.resumeRecording();
      updateFromService();
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, updateFromService]);

  /** Stop and finish recording */
  const stopRecording = useCallback(async (): Promise<boolean> => {
    try {
      await service.finishRecording();
      updateFromService();
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, updateFromService]);

  /** Discard current recording */
  const discardRecording = useCallback(async (): Promise<void> => {
    try {
      await service.discardRecording();
      updateFromService();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [service, updateFromService]);

  /** Scan for available BLE devices */
  const scanForDevices = useCallback(async () => {
    try {
      const devices = await service.scanForDevices();
      return devices.map((device) => ({
        id: device.id,
        name: device.name || "Unknown Device",
        rssi: device.rssi,
        device,
      }));
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, [service]);

  /** Connect to a BLE device */
  const connectToDevice = useCallback(
    async (deviceId: string) => {
      try {
        const sensor = await service.connectToDevice(deviceId);
        updateFromService();
        return sensor;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [service, updateFromService],
  );

  /** Disconnect from a BLE device */
  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      try {
        await service.disconnectDevice(deviceId);
        updateFromService();
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
      }
    },
    [service, updateFromService],
  );

  /** Request specific permission */
  const requestPermission = useCallback(
    async (type: PermissionType): Promise<boolean> => {
      try {
        const granted = await service.ensurePermission(type);
        updatePermissions();
        return granted;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service, updatePermissions],
  );

  /** Request all permissions */
  const requestAllPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const results = await Promise.all([
        service.ensurePermission("bluetooth"),
        service.ensurePermission("location"),
        service.ensurePermission("location-background"),
      ]);
      updatePermissions();
      return results.every(Boolean);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, updatePermissions]);

  /** Upload completed activity */
  const uploadActivity = useCallback(
    async (recordingId?: string) => {
      try {
        await service.uploadCompletedActivity(recordingId);
        return true;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  // Initialize service and set up real-time updates
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        await service.init();
        if (profile) {
          service.setProfile(profile);
        }
        if (mounted) {
          setIsInitialized(true);
          updateFromService();
        }
      } catch (error) {
        if (mounted) {
          setLastError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    initialize();

    // Set up real-time updates
    const updateInterval = setInterval(() => {
      if (mounted && isInitialized) {
        updateFromService();
      }
    }, 1000);

    // Listen to sensor data for real-time metrics
    const handleSensorData = (reading: any) => {
      // Update real-time metrics based on sensor readings
      if (mounted) {
        updateFromService();
      }
    };

    service.addDataCallback(handleSensorData);

    return () => {
      mounted = false;
      clearInterval(updateInterval);
      service.removeDataCallback(handleSensorData);
    };
  }, [service, profile, updateFromService, isInitialized]);

  // Handle app background/foreground transitions
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        isRecording &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        console.log("📱 App backgrounded - recording continues");
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [isRecording]);

  return {
    // State
    isRecording,
    isPaused,
    isReady,
    isFinished,
    state,
    metrics,
    connectionStatus,
    connectedSensors,
    permissions,
    lastError,
    isInitialized,

    // Actions
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    scanForDevices,
    connectToDevice,
    disconnectDevice,
    requestPermission,
    requestAllPermissions,
    uploadActivity,
  };
};
