import { useEffect, useSyncExternalStore } from "react";
import { AppState, AppStateStatus } from "react-native";
import { ActivityRecorderService } from "../services/ActivityRecorder";
import { useRequireAuth } from "./useAuth";

// Singleton service instance
let serviceInstance: ActivityRecorderService | null = null;

const getService = (profileId: string): ActivityRecorderService => {
  if (!serviceInstance) {
    serviceInstance = new ActivityRecorderService({ id: profileId } as any);
    console.log("🎯 Service created");
  }
  return serviceInstance;
};

const cleanupService = async (): Promise<void> => {
  if (serviceInstance) {
    await serviceInstance.cleanup();
    serviceInstance = null;
    console.log("🧹 Service cleaned up");
  }
};

/**
 * Direct access to ActivityRecorderService with automatic re-renders
 *
 * The service is fully reactive - any state changes will trigger component updates.
 * Access all properties and methods directly on the returned service.
 *
 * @example
 * ```tsx
 * const service = useActivityRecorder();
 *
 * // State and lifecycle
 * console.log(service.state); // "idle" | "recording" | "paused" | "finished"
 * await service.startRecording();
 * await service.pauseRecording();
 * await service.resumeRecording();
 * await service.finishRecording();
 *
 * // Live metrics (updates every sensor reading)
 * const heartRate = service.liveMetrics.get("heart_rate");
 * const speed = service.liveMetrics.get("speed");
 * const distance = service.liveMetrics.get("distance");
 *
 * // Plan progress
 * if (service.planProgress) {
 *   console.log(service.planProgress.currentStepIndex);
 *   console.log(service.planProgress.elapsedInStep);
 * }
 *
 * // Device management
 * const devices = await service.scanForDevices();
 * await service.connectToDevice(deviceId);
 *
 * // Activity planning
 * service.selectPlannedActivity(plan);
 * service.advanceStep();
 * ```
 */
export const useActivityRecorder = () => {
  const { profile } = useRequireAuth();

  if (!profile) {
    throw new Error("useActivityRecorder requires authentication");
  }

  const service = getService(profile.id);

  // Subscribe to service changes - React will re-render automatically
  useSyncExternalStore(
    (callback) => service.subscribe(callback),
    () => service, // Return service as snapshot
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupService().catch(console.error);
    };
  }, []);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (service.state === "recording") {
        if (nextAppState === "background") {
          console.log("📱 App backgrounded - recording continues");
          // Ensure background task is running
          // Keep Bluetooth connections alive
        } else if (nextAppState === "active") {
          console.log("📱 App resumed - syncing state");
          // Verify recording is still active
          // Refresh UI with latest metrics
          // Reconnect any dropped sensors
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [service]);

  return service;
};
