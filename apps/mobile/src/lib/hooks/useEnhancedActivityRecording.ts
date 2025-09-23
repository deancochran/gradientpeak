import { useCallback, useEffect, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  ActivityRecorderService,
  type ActivityCheckpoint,
  type ActivityResult,
  type ActivityType,
  type ConnectionStatus,
  type ErrorLogEntry,
  type LiveMetrics,
  type RecordingSession,
  type RecordingState,
} from "../services/activity-recorder";

// ===== SIMPLIFIED HOOK DELEGATING TO ENHANCED SERVICE =====

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

export interface ActivityRecording extends RecordingSession {
  // Legacy compatibility interface
}

/**
 * Simplified hook that delegates to the enhanced ActivityRecorderService
 * All complex logic has been moved to the consolidated service
 */
export const useEnhancedActivityRecording = () => {
  // ===== STATE MANAGEMENT (delegated to service) =====
  const [state, setState] = useState<RecordingState>("idle");
  const [currentRecording, setCurrentRecording] =
    useState<ActivityRecording | null>(null);
  const [metrics, setMetrics] = useState<ActivityMetrics>({
    duration: 0,
    distance: 0,
    currentSpeed: 0,
    avgSpeed: 0,
    totalElapsedTime: 0,
    totalTimerTime: 0,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    gps: "disabled",
    bluetooth: "disabled",
    sensors: {
      heartRate: "disabled",
      power: "disabled",
      cadence: "disabled",
    },
  });
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // ===== COMPUTED VALUES =====
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const canDismissModal = ActivityRecorderService.canDismissModal();

  // ===== SERVICE STATE POLLING =====
  const updateFromService = useCallback(() => {
    try {
      const serviceState = ActivityRecorderService.getState();
      const serviceSession = ActivityRecorderService.getCurrentSession();
      const serviceConnectionStatus =
        ActivityRecorderService.getConnectionStatus();
      const serviceLiveMetrics = ActivityRecorderService.getLiveMetrics();

      setState(serviceState);
      setConnectionStatus(serviceConnectionStatus);

      if (serviceSession) {
        setCurrentRecording(serviceSession as ActivityRecording);

        if (serviceLiveMetrics) {
          setMetrics({
            ...serviceLiveMetrics,
            duration: serviceLiveMetrics.totalTimerTime || 0,
            distance: serviceLiveMetrics.distance || 0,
            currentSpeed: serviceLiveMetrics.currentSpeed || 0,
            avgSpeed: serviceLiveMetrics.avgSpeed || 0,
            heartRate: serviceLiveMetrics.currentHeartRate,
            calories: serviceLiveMetrics.calories,
            power: serviceLiveMetrics.currentPower,
            cadence: serviceLiveMetrics.currentCadence,
          });
        }
      } else {
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
    } catch (error) {
      console.error("Error updating from service:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  // ===== LIFECYCLE METHODS (delegated to service) =====
  const startRecording = useCallback(
    async (
      activityType: ActivityType = "outdoor_run",
      plannedId?: string,
    ): Promise<boolean> => {
      try {
        const result = await ActivityRecorderService.startActivity(
          activityType,
          plannedId,
        );
        updateFromService();
        return result !== null;
      } catch (error) {
        console.error("Failed to start recording:", error);
        setLastError(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [updateFromService],
  );

  const pauseRecording = useCallback((): boolean => {
    try {
      const result = ActivityRecorderService.pauseActivity();
      updateFromService();
      return result;
    } catch (error) {
      console.error("Failed to pause recording:", error);
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [updateFromService]);

  const resumeRecording = useCallback((): boolean => {
    try {
      const result = ActivityRecorderService.resumeActivity();
      updateFromService();
      return result;
    } catch (error) {
      console.error("Failed to resume recording:", error);
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [updateFromService]);

  const stopRecording =
    useCallback(async (): Promise<ActivityRecording | null> => {
      try {
        const result = await ActivityRecorderService.finishActivity();
        updateFromService();

        if (result.success && currentRecording) {
          return {
            ...currentRecording,
            metrics: result.metrics || currentRecording.liveMetrics,
            status: "stopped",
          };
        }
        return null;
      } catch (error) {
        console.error("Failed to stop recording:", error);
        setLastError(error instanceof Error ? error.message : String(error));
        return currentRecording;
      }
    }, [updateFromService, currentRecording]);

  const discardRecording = useCallback(async (): Promise<void> => {
    try {
      await ActivityRecorderService.discardActivity();
      updateFromService();
    } catch (error) {
      console.error("Failed to discard recording:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [updateFromService]);

  // ===== SENSOR DATA INTEGRATION =====
  const addSensorData = useCallback(
    (data: any) => {
      try {
        ActivityRecorderService.addSensorData(data);
        updateFromService();
      } catch (error) {
        console.error("Failed to add sensor data:", error);
        setLastError(error instanceof Error ? error.message : String(error));
      }
    },
    [updateFromService],
  );

  // ===== RECOVERY METHODS (delegated to service) =====
  const attemptRecovery = useCallback(async (): Promise<boolean> => {
    try {
      setIsRecovering(true);
      // Recovery is handled automatically by the service during initialization
      await ActivityRecorderService.initialize();
      updateFromService();
      return true;
    } catch (error) {
      console.error("Recovery attempt failed:", error);
      setLastError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setIsRecovering(false);
    }
  }, [updateFromService]);

  const clearRecoveryData = useCallback(async () => {
    try {
      await ActivityRecorderService.clearRecoveryData();
      updateFromService();
    } catch (error) {
      console.error("Failed to clear recovery data:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [updateFromService]);

  const createCheckpoint = useCallback(async () => {
    try {
      await ActivityRecorderService.createCheckpoint();
      updateFromService();
    } catch (error) {
      console.error("Failed to create checkpoint:", error);
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [updateFromService]);

  // ===== INITIALIZATION AND STATE SYNC =====
  useEffect(() => {
    let mounted = true;

    const initializeService = async () => {
      try {
        await ActivityRecorderService.initialize();
        if (mounted) {
          updateFromService();
        }
      } catch (error) {
        console.error("Service initialization failed:", error);
        if (mounted) {
          setLastError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    initializeService();

    // Set up polling for state updates
    const updateInterval = setInterval(() => {
      if (mounted) {
        updateFromService();
      }
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(updateInterval);
    };
  }, [updateFromService]);

  // ===== APP STATE HANDLING =====
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        isRecording &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        console.log("📱 App going to background - triggering checkpoint");
        createCheckpoint();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [isRecording, createCheckpoint]);

  // ===== RETURN INTERFACE =====
  return {
    // State
    isRecording,
    isPaused,
    metrics,
    currentRecording,
    connectionStatus,
    isRecovering,
    lastError,
    canDismissModal,
    state,

    // Actions
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording: discardRecording,
    addSensorData,

    // Recovery
    attemptRecovery,
    clearRecoveryData,
    createCheckpoint,

    // Legacy compatibility
    errorLog: [] as ErrorLogEntry[],
    checkpoints: [] as ActivityCheckpoint[],

    // Additional helper methods
    updateFromService,
  };
};

// ===== LEGACY EXPORTS FOR BACKWARD COMPATIBILITY =====
export type {
  ActivityCheckpoint,
  ActivityResult,
  ActivityType,
  ConnectionStatus,
  ErrorLogEntry,
  LiveMetrics,
  RecordingSession,
  RecordingState,
};
