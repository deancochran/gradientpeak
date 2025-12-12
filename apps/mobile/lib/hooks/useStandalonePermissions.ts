/**
 * useStandalonePermissions - React hook for standalone permission checking
 *
 * This hook provides permission checking functionality independent of
 * the ActivityRecorderService, allowing permission status to be checked
 * and monitored from anywhere in the app.
 */

import {
  AllPermissionsStatus,
  PermissionType,
  areAllPermissionsGranted,
  checkAllPermissions,
  requestPermission,
} from "@/lib/services/permissions-check";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

export function useStandalonePermissions() {
  const [permissions, setPermissions] = useState<AllPermissionsStatus>({
    bluetooth: null,
    location: null,
    locationBackground: null,
  });
  const [allGranted, setAllGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check permissions on mount and when returning from settings
  const checkPermissions = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      const status = await checkAllPermissions(forceRefresh);
      setPermissions(status);

      const granted = await areAllPermissionsGranted();
      setAllGranted(granted);
    } catch (error) {
      console.error("Error checking permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial check
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  // Listen for app state changes (returning from settings)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        // Force refresh permissions when app becomes active (user may have changed them in settings)
        console.log(
          "[useStandalonePermissions] App became active, force refreshing permissions",
        );
        checkPermissions(true);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [checkPermissions]);

  // Request a specific permission
  const ensurePermission = useCallback(
    async (type: PermissionType): Promise<boolean> => {
      try {
        const granted = await requestPermission(type);
        // Re-check all permissions after requesting
        await checkPermissions();
        return granted;
      } catch (error) {
        console.error(`Error requesting ${type} permission:`, error);
        return false;
      }
    },
    [checkPermissions],
  );

  // Request all permissions
  const requestAllPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);

      // Request in order: bluetooth, location, then background location
      await requestPermission("bluetooth");
      await requestPermission("location");

      // Only request background location if foreground location is granted
      const currentStatus = await checkAllPermissions();
      if (currentStatus.location?.granted) {
        await requestPermission("location-background");
      }

      // Check final status
      const granted = await areAllPermissionsGranted();
      setAllGranted(granted);

      return granted;
    } catch (error) {
      console.error("Error requesting all permissions:", error);
      return false;
    } finally {
      setIsLoading(false);
      await checkPermissions();
    }
  }, [checkPermissions]);

  return {
    permissions,
    allGranted,
    isLoading,
    checkPermissions,
    ensurePermission,
    requestAllPermissions,
  };
}

// Export a hook specifically for checking if all permissions are granted
export function useAllPermissionsGranted() {
  const [allGranted, setAllGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const check = async (forceRefresh = false) => {
      try {
        if (mounted) {
          setIsLoading(true);
        }

        // Check permissions with optional force refresh
        const granted = await areAllPermissionsGranted();

        if (mounted) {
          setAllGranted(granted);
          console.log(
            "[useAllPermissionsGranted] Permissions check result:",
            granted,
          );
        }
      } catch (error) {
        console.error(
          "[useAllPermissionsGranted] Error checking permissions:",
          error,
        );

        // Retry logic for transient errors
        if (mounted && retryCount < 3) {
          console.log(
            `[useAllPermissionsGranted] Retrying... (${retryCount + 1}/3)`,
          );
          setTimeout(() => {
            if (mounted) {
              setRetryCount((prev) => prev + 1);
            }
          }, 1000);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    check();

    // Re-check when app becomes active (force refresh to bypass cache)
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && mounted) {
        console.log(
          "[useAllPermissionsGranted] App became active, force refreshing",
        );
        check(true);
      }
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [retryCount]);

  return { allGranted, isLoading };
}
