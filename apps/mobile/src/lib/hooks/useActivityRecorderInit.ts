import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type { PublicProfilesRow } from "@supabase/supazod/schemas.types";

// Service lifecycle states
type ServiceLifecycle = "uninitialized" | "active" | "completed" | "cleanup";

/**
 * Hook to manage ActivityRecorder service lifecycle
 * Each recording session gets a fresh service instance for clean state
 */
export function useActivityRecorderInit() {
  const { profile } = useAuth();
  const [serviceState, setServiceState] =
    useState<ServiceLifecycle>("uninitialized");
  const [currentService, setCurrentService] =
    useState<ActivityRecorderService | null>(null);

  // Create new service instance
  const createNewService = useCallback(
    async (profileData: PublicProfilesRow) => {
      const startTime = Date.now();
      console.log(
        "[ServiceLifecycle] Creating new ActivityRecorderService instance",
        { profileId: profileData.id },
      );

      // Cleanup existing service if any
      if (currentService) {
        console.log(
          "[ServiceLifecycle] Cleaning up existing service before creating new one",
        );
        setServiceState("cleanup");
        try {
          const cleanupStart = Date.now();
          await currentService.cleanup();
          console.log("[ServiceLifecycle] Existing service cleanup completed", {
            duration: `${Date.now() - cleanupStart}ms`,
          });
        } catch (error) {
          console.warn(
            "[ServiceLifecycle] Error cleaning up existing service:",
            error,
          );
        }
        setCurrentService(null);
      }

      // Create fresh instance
      try {
        const creationStart = Date.now();
        const newService = new ActivityRecorderService(profileData);
        setCurrentService(newService);
        setServiceState("active");

        console.log(
          "[ServiceLifecycle] New ActivityRecorderService instance created successfully",
          {
            profileId: profileData.id,
            creationTime: `${Date.now() - creationStart}ms`,
            totalTime: `${Date.now() - startTime}ms`,
          },
        );
        return newService;
      } catch (error) {
        console.error(
          "[ServiceLifecycle] Failed to create new service instance:",
          error,
        );
        setServiceState("uninitialized");
        throw error;
      }
    },
    [currentService],
  );

  // Mark service as completed (ready for cleanup)
  const markServiceCompleted = useCallback(() => {
    console.log(
      "[ServiceLifecycle] Marking service as completed (ready for cleanup)",
    );
    setServiceState("completed");
  }, []);

  // Cleanup and prepare for next session
  const cleanupService = useCallback(async () => {
    if (currentService) {
      const startTime = Date.now();
      console.log(
        "[ServiceLifecycle] Cleaning up service and preparing for next session",
      );
      setServiceState("cleanup");

      try {
        await currentService.cleanup();
        console.log(
          "[ServiceLifecycle] Service cleanup completed successfully",
          { duration: `${Date.now() - startTime}ms` },
        );
      } catch (error) {
        console.error(
          "[ServiceLifecycle] Error during service cleanup:",
          error,
        );
        // Continue with cleanup even if error occurs
      } finally {
        setCurrentService(null);
        setServiceState("uninitialized");
        console.log(
          "[ServiceLifecycle] Service instance deallocated and state reset",
        );
      }
    }
  }, [currentService]);

  // Auto-cleanup when profile changes or component unmounts
  useEffect(() => {
    return () => {
      if (currentService && serviceState !== "cleanup") {
        console.log(
          "[ServiceLifecycle] Auto-cleanup on unmount or profile change",
        );
        // Don't await here to avoid blocking unmount
        currentService
          .cleanup()
          .catch((error) =>
            console.warn("[ServiceLifecycle] Error in auto-cleanup:", error),
          );
      }
    };
  }, [currentService, serviceState, profile?.id]);

  // Reset state when profile is lost
  useEffect(() => {
    if (!profile?.id && currentService) {
      console.log("[ServiceLifecycle] Profile lost, cleaning up service");
      cleanupService();
    }
  }, [profile?.id, currentService, cleanupService]);

  return {
    service: currentService,
    serviceState,
    createNewService,
    markServiceCompleted,
    cleanupService,
    isReady: serviceState === "active" && currentService !== null,
    isUninitialized: serviceState === "uninitialized",
    isCompleted: serviceState === "completed",
    isCleaningUp: serviceState === "cleanup",
  };
}
