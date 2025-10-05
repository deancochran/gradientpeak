import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { serviceManager } from "@/lib/services/ActivityRecorderServiceManager";
import type { PublicProfilesRow } from "@supabase/supazod/schemas.types";

/**
 * Hook to manage ActivityRecorder service lifecycle using singleton manager
 * Ensures all components share the same service instance
 */
export function useActivityRecorderInit() {
  const { profile } = useAuth();

  // Subscribe to service manager changes
  const service = useSyncExternalStore(
    (callback) => serviceManager.subscribe(callback),
    () => serviceManager.getService(),
    () => serviceManager.getService(),
  );

  const serviceState = useSyncExternalStore(
    (callback) => serviceManager.subscribe(callback),
    () => serviceManager.getState(),
    () => serviceManager.getState(),
  );

  const isReady = useSyncExternalStore(
    (callback) => serviceManager.subscribe(callback),
    () => serviceManager.isReady(),
    () => serviceManager.isReady(),
  );

  // Create new service instance
  const createNewService = useCallback(
    async (profileData: PublicProfilesRow) => {
      return await serviceManager.createService(profileData);
    },
    [],
  );

  // Mark service as completed (ready for cleanup)
  const markServiceCompleted = useCallback(() => {
    serviceManager.markCompleted();
  }, []);

  // Cleanup and prepare for next session
  const cleanupService = useCallback(async () => {
    await serviceManager.cleanup();
  }, []);

  // Auto-cleanup when profile changes or component unmounts
  useEffect(() => {
    return () => {
      // Note: We don't auto-cleanup on unmount anymore since the service
      // is shared. Cleanup should be explicit via cleanupService()
    };
  }, [profile?.id]);

  // Reset state when profile is lost
  useEffect(() => {
    if (!profile?.id && service) {
      console.log("[ServiceLifecycle] Profile lost, cleaning up service");
      cleanupService();
    }
  }, [profile?.id, service, cleanupService]);

  return {
    service,
    serviceState,
    createNewService,
    markServiceCompleted,
    cleanupService,
    isReady,
    isUninitialized: serviceState === "uninitialized",
    isCompleted: serviceState === "completed",
    isCleaningUp: serviceState === "cleanup",
  };
}
