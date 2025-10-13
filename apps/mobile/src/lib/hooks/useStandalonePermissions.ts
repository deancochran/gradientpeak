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
  const checkPermissions = useCallback(async () => {
    try {
      const status = await checkAllPermissions();
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
        // Re-check permissions when app becomes active
        checkPermissions();
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

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const granted = await areAllPermissionsGranted();
        if (mounted) {
          setAllGranted(granted);
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    check();

    // Re-check when app becomes active
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && mounted) {
        check();
      }
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return { allGranted, isLoading };
}
