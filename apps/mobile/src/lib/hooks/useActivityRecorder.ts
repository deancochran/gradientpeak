import { useEffect, useRef, useSyncExternalStore } from "react";
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

  // Track if component is mounted to prevent cleanup on every render
  const isMounted = useRef(true);

  // Cleanup on unmount only
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Only cleanup if not recording
      if (service.state === "pending" || service.state === "finished") {
        cleanupService().catch(console.error);
      } else {
        console.log("⚠️ Service still active - skipping cleanup");
      }
    };
  }, [service.state]);

  // Handle app state changes with enhanced reconnection logic
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "background") {
        console.log("📱 App backgrounded");
        if (service.state === "recording") {
          console.log("  ℹ️ Recording continues in background");
          // Services continue running
        }
      } else if (nextAppState === "active") {
        console.log("📱 App foregrounded");
        if (service.state === "recording" || service.state === "paused") {
          console.log("  🔄 Reconnecting disconnected sensors...");
          try {
            // Trigger reconnection for any disconnected sensors
            const sensors = service.getConnectedSensors();
            for (const sensor of sensors) {
              if (sensor.connectionState === "disconnected") {
                console.log(`  📡 Reconnecting ${sensor.name}`);
                await service.connectToDevice(sensor.id).catch((err) => {
                  console.warn(`  ⚠️ Failed to reconnect ${sensor.name}:`, err);
                });
              }
            }
          } catch (error) {
            console.error("  ❌ Error during reconnection:", error);
          }
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
