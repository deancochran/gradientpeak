import { useAuth } from "@/lib/hooks/useAuth";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { useActivityRecorderStore } from "@/lib/stores/activity-recorder-store";
import { useEffect, useRef, useState } from "react";

/**
 * Hook to initialize and manage the ActivityRecorder service
 * This replaces the old ActivityRecorderProvider with a more efficient approach
 * Now returns the service instance for use with event-based hooks
 */
// Global reference to prevent multiple service instances
let globalServiceInstance: ActivityRecorderService | null = null;
let initializationPromise: Promise<void> | null = null;

export function useActivityRecorderInit() {
  const { profile } = useAuth();
  const serviceRef = useRef<ActivityRecorderService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);
  const { initialize, cleanup } = useActivityRecorderStore();

  useEffect(() => {
    let mounted = true;

    async function initService() {
      // Prevent concurrent initialization
      if (initializingRef.current) {
        return;
      }

      if (!profile?.id) {
        // Clean up if no profile
        if (serviceRef.current || globalServiceInstance) {
          const serviceToCleanup = serviceRef.current || globalServiceInstance;
          cleanup();
          try {
            await serviceToCleanup?.cleanup();
          } catch (error) {
            console.warn("Error during service cleanup:", error);
          }
          serviceRef.current = null;
          globalServiceInstance = null;
        }
        if (mounted) {
          setIsInitialized(false);
        }
        return;
      }

      // Use existing global instance if available and matches profile
      if (globalServiceInstance) {
        serviceRef.current = globalServiceInstance;
        initialize(globalServiceInstance);
        if (mounted) {
          setIsInitialized(true);
        }
        return;
      }

      // Initialize new service if needed
      if (!serviceRef.current && !globalServiceInstance) {
        initializingRef.current = true;
        try {
          // Wait for any existing initialization to complete
          if (initializationPromise) {
            await initializationPromise;
          }

          // Check again after waiting
          if (!globalServiceInstance) {
            initializationPromise = (async () => {
              const newService = new ActivityRecorderService(profile);
              globalServiceInstance = newService;
              serviceRef.current = newService;
              initialize(newService);
            })();

            await initializationPromise;
            initializationPromise = null;
          } else {
            serviceRef.current = globalServiceInstance;
            initialize(globalServiceInstance);
          }

          if (mounted) {
            setIsInitialized(true);
          }
        } catch (error) {
          console.error(
            "Failed to initialize ActivityRecorder service:",
            error,
          );
          if (mounted) {
            setIsInitialized(false);
          }
        } finally {
          initializingRef.current = false;
        }
      } else if (mounted) {
        setIsInitialized(true);
      }
    }

    initService();

    // Cleanup on unmount
    return () => {
      mounted = false;
      // Don't cleanup global service instance on unmount
      // It will be cleaned up when profile changes or app closes
    };
  }, [profile?.id, initialize, cleanup]);

  return {
    isInitialized,
    service: serviceRef.current,
  };
}
