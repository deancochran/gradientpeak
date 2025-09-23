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
import { ActivityRecorderService } from "../services/activity-recorder";
import type {
  ConnectedSensor,
  ConnectionStatus,
  LiveMetrics,
  PermissionState,
  PermissionType,
  RecordingSession,
  RecordingState,
} from "../services/activity-recorder.types";

export interface ActivityMetrics extends LiveMetrics {
  duration: number;
  distance: number;
  currentSpeed: number;
  avgSpeed: number;
  heartRate?: number;
  calories?: number;
  power?: number;
  cadence?: number;
}

/**
 * Enhanced activity recording hook with integrated sensor and permission management
 */
export const useEnhancedActivityRecording = () => {
  const [state, setState] = useState<RecordingState>("pending");
  const [currentRecording, setCurrentRecording] =
    useState<RecordingSession | null>(null);
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

  // Computed values
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isReady = state === "ready";
  const isFinished = state === "finished";

  /** Update hook state from service */
  const updateFromService = useCallback(() => {
    try {
      // Find active session
      const activeSession = Object.values(
        ActivityRecorderService.sessions,
      ).find((s) => s.state !== "finished" && s.state !== "discarded");

      if (activeSession) {
        setState(activeSession.state);
        setCurrentRecording(activeSession);

        // Update metrics
        const liveMetrics = activeSession.currentMetrics;
        setMetrics({
          ...liveMetrics,
          duration: liveMetrics.totalTimerTime || activeSession.movingTime || 0,
          distance: liveMetrics.distance || 0,
          currentSpeed: liveMetrics.currentSpeed || 0,
          avgSpeed: liveMetrics.avgSpeed || 0,
          heartRate: liveMetrics.currentHeartRate,
          calories: liveMetrics.calories,
          power: liveMetrics.currentPower,
          cadence: liveMetrics.currentCadence,
          totalElapsedTime: activeSession.totalElapsedTime,
          totalTimerTime: activeSession.movingTime,
        });
      } else {
        setState("pending");
        setCurrentRecording(null);
        setMetrics({
          duration: 0,
          distance: 0,
          currentSpeed: 0,
          avgSpeed: 0,
          totalElapsedTime: 0,
          totalTimerTime: 0,
        });
      }

      // Update sensors and permissions
      const sensors = ActivityRecorderService.getConnectedSensors();
      setConnectedSensors(sensors);
      updateConnectionStatus(sensors);
      updatePermissions();
    } catch (error) {
      console.error("Error updating from service:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  /** Update connection status based on sensors and permissions */
  const updateConnectionStatus = useCallback((sensors: ConnectedSensor[]) => {
    const hasGPS =
      ActivityRecorderService.getPermissionState("location")?.granted || false;
    const hasBluetooth =
      ActivityRecorderService.getPermissionState("bluetooth")?.granted || false;

    // Dynamic sensor status based on connected devices
    const sensorStatus: Record<string, ConnectionStatus> = {};
    sensors.forEach((sensor) => {
      sensor.services.forEach((service) => {
        sensorStatus[service] = "connected";
      });
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
  }, []);

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
      newPermissions[type] = ActivityRecorderService.getPermissionState(type);
    });

    setPermissions(newPermissions);
  }, []);

  /** Start recording session */
  const startRecording = useCallback(
    async (
      activityType: PublicActivityType = "outdoor_run",
      plannedActivity?: PublicPlannedActivitiesRow,
    ): Promise<boolean> => {
      try {
        setLastError(null);
        const session = await ActivityRecorderService.createActivityRecording(
          "default-profile", // Should come from user context
          activityType,
          plannedActivity,
        );
        await ActivityRecorderService.startActivityRecording(session.id);
        updateFromService();
        return true;
      } catch (error) {
        console.error("Failed to start recording:", error);
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [updateFromService],
  );

  /** Pause active recording */
  const pauseRecording = useCallback((): boolean => {
    try {
      const activeSession = Object.values(
        ActivityRecorderService.sessions,
      ).find((s) => s.state === "recording");
      if (activeSession) {
        ActivityRecorderService.pauseActivityRecording(activeSession.id);
        updateFromService();
        return true;
      }
      return false;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [updateFromService]);

  /** Resume paused recording */
  const resumeRecording = useCallback((): boolean => {
    try {
      const pausedSession = Object.values(
        ActivityRecorderService.sessions,
      ).find((s) => s.state === "paused");
      if (pausedSession) {
        ActivityRecorderService.resumeActivityRecording(pausedSession.id);
        updateFromService();
        return true;
      }
      return false;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [updateFromService]);

  /** Stop and finish recording */
  const stopRecording =
    useCallback(async (): Promise<RecordingSession | null> => {
      try {
        const activeSession = Object.values(
          ActivityRecorderService.sessions,
        ).find((s) => s.state === "recording" || s.state === "paused");
        if (activeSession) {
          await ActivityRecorderService.finishActivityRecording(
            activeSession.id,
          );
          updateFromService();
          return { ...activeSession, state: "finished" };
        }
        return null;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return currentRecording;
      }
    }, [updateFromService, currentRecording]);

  /** Discard current recording */
  const discardRecording = useCallback(async (): Promise<void> => {
    try {
      const activeSession = Object.values(
        ActivityRecorderService.sessions,
      ).find((s) => s.state !== "finished" && s.state !== "discarded");
      if (activeSession) {
        activeSession.state = "discarded";
        delete ActivityRecorderService.sessions[activeSession.id];
        updateFromService();
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [updateFromService]);

  /** Scan for available BLE devices */
  const scanForDevices = useCallback(async () => {
    try {
      return await ActivityRecorderService.scanForDevices();
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, []);

  /** Connect to a BLE device */
  const connectToDevice = useCallback(
    async (deviceId: string) => {
      try {
        const sensor = await ActivityRecorderService.connectToDevice(deviceId);
        updateFromService();
        return sensor;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [updateFromService],
  );

  /** Disconnect from a BLE device */
  const disconnectDevice = useCallback(
    async (deviceId: string) => {
      try {
        await ActivityRecorderService.disconnectDevice(deviceId);
        updateFromService();
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
      }
    },
    [updateFromService],
  );

  /** Request specific permission */
  const requestPermission = useCallback(
    async (type: PermissionType): Promise<boolean> => {
      try {
        const granted = await ActivityRecorderService.ensurePermission(type);
        updatePermissions();
        return granted;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [updatePermissions],
  );

  /** Request all permissions */
  const requestAllPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const results = await Promise.all([
        ActivityRecorderService.ensurePermission("bluetooth"),
        ActivityRecorderService.ensurePermission("location"),
        ActivityRecorderService.ensurePermission("location-background"),
      ]);
      updatePermissions();
      return results.every(Boolean);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [updatePermissions]);

  /** Upload completed activity */
  const uploadActivity = useCallback(async (activityId: string) => {
    try {
      await ActivityRecorderService.uploadCompletedActivity(activityId);
      return true;
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);

  // Initialize service and polling
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        await ActivityRecorderService.initialize();
        if (mounted) updateFromService();
      } catch (error) {
        if (mounted)
          setLastError(error instanceof Error ? error.message : String(error));
      }
    };

    initialize();

    const updateInterval = setInterval(() => {
      if (mounted) updateFromService();
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(updateInterval);
    };
  }, [updateFromService]);

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
    currentRecording,
    connectionStatus,
    connectedSensors,
    permissions,
    lastError,

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

// Re-export types for external use
export type {
  ConnectedSensor,
  ConnectionStatus,
  LiveMetrics,
  PermissionState,
  PermissionType,
  RecordingSession,
  RecordingState,
} from "../services/activity-recorder.types";
