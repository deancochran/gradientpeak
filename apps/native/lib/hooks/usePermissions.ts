import { useCallback, useEffect, useRef, useState } from "react";
// Import your permission strategies
import {
  checkBackgroundLocationPermission,
  checkBluetoothPermission,
  checkLocationPermission,
  checkMotionPermission,
  requestBackgroundLocationPermission,
  requestBluetoothPermission,
  requestLocationPermission,
  requestMotionPermission,
} from "@lib/permissions";
import { Alert, Linking } from "react-native"; // For rationale

export type PermissionType =
  | "bluetooth"
  | "location"
  | "motion"
  | "location-background";

interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
  name: string;
  description: string;
  required?: boolean; // Optional, might be useful for some consumers
}

type PermissionsStatus = Record<PermissionType, PermissionState>;

// Map permission types to their checking/requesting functions and display info
const permissionStrategies = {
  bluetooth: {
    check: checkBluetoothPermission,
    request: requestBluetoothPermission,
    name: "Bluetooth",
    description: "Connect to heart rate monitors and cycling sensors",
  },
  location: {
    check: checkLocationPermission,
    request: requestLocationPermission,
    name: "Location",
    description: "Track your route and calculate distance",
  },
  motion: {
    check: checkMotionPermission,
    request: requestMotionPermission,
    name: "Motion & Fitness",
    description: "Detect movement and calculate calories",
  },
  "location-background": {
    check: checkBackgroundLocationPermission,
    request: requestBackgroundLocationPermission,
    name: "Background Location",
    description: "Continue tracking your route when app is in background",
  },
  // Add other permission types here as needed
};

// Helper for showing a rationale when permission is permanently denied
const showPermissionRationaleAlert = (
  permissionName: string,
  permissionDescription: string,
) => {
  Alert.alert(
    `${permissionName} Permission Required`,
    `This app needs ${permissionName.toLowerCase()} access to ${permissionDescription.toLowerCase()}. Without this permission, some features may not work properly.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ],
  );
};

export const usePermissions = (requiredTypes: PermissionType[] = []) => {
  const [permissions, setPermissions] = useState<PermissionsStatus>(() => {
    const initialState: Partial<PermissionsStatus> = {};
    requiredTypes.forEach((type) => {
      const strategy = permissionStrategies[type];
      if (strategy) {
        initialState[type] = {
          granted: false,
          canAskAgain: true,
          loading: true, // Start in loading state until initial check is done
          name: strategy.name,
          description: strategy.description,
          required: true,
        };
      }
    });
    return initialState as PermissionsStatus;
  });

  const checkedOnceRef = useRef(false);

  const checkSinglePermission = useCallback(async (type: PermissionType) => {
    const strategy = permissionStrategies[type];
    if (!strategy) {
      console.warn(`No strategy found for permission type: ${type}`);
      return { granted: false, canAskAgain: true };
    }

    setPermissions((prev) => ({
      ...prev,
      [type]: { ...prev[type], loading: true },
    }));

    try {
      const result = await strategy.check();
      setPermissions((prev) => ({
        ...prev,
        [type]: { ...prev[type], ...result, loading: false },
      }));
      return result;
    } catch (error) {
      console.error(`Error checking ${type} permission:`, error);
      setPermissions((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: false },
      }));
      return { granted: false, canAskAgain: true };
    }
  }, []);

  const requestSinglePermission = useCallback(
    async (type: PermissionType) => {
      const strategy = permissionStrategies[type];
      if (!strategy) {
        console.warn(`No strategy found for permission type: ${type}`);
        return { granted: false, canAskAgain: true };
      }

      const currentPermission = permissions[type];
      if (currentPermission && !currentPermission.canAskAgain) {
        showPermissionRationaleAlert(strategy.name, strategy.description);
        return { granted: false, canAskAgain: false };
      }

      setPermissions((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: true },
      }));

      try {
        const result = await strategy.request();
        setPermissions((prev) => ({
          ...prev,
          [type]: { ...prev[type], ...result, loading: false },
        }));
        return result;
      } catch (error) {
        console.error(`Error requesting ${type} permission:`, error);
        setPermissions((prev) => ({
          ...prev,
          [type]: { ...prev[type], loading: false },
        }));
        return { granted: false, canAskAgain: true };
      }
    },
    [permissions],
  );

  const checkAllRequiredPermissions = useCallback(async () => {
    if (checkedOnceRef.current) return;

    await Promise.all(requiredTypes.map((type) => checkSinglePermission(type)));
    checkedOnceRef.current = true;
  }, [requiredTypes, checkSinglePermission]);

  const forceCheckPermissions = useCallback(async () => {
    await Promise.all(requiredTypes.map((type) => checkSinglePermission(type)));
  }, [requiredTypes, checkSinglePermission]);

  const requestAllRequiredPermissions = useCallback(async () => {
    const results = await Promise.all(
      requiredTypes.map((type) => requestSinglePermission(type)),
    );

    const allGranted = results.every((result) => result.granted);

    const permanentlyDenied = requiredTypes.filter(
      (type, index) => !results[index].canAskAgain,
    );

    if (permanentlyDenied.length > 0) {
      const names = permanentlyDenied.map(
        (type) => permissionStrategies[type]?.name || type,
      );
      Alert.alert(
        "Permissions Required",
        `${names.join(" and ")} ${names.length === 1 ? "permission is" : "permissions are"} required. Please enable ${names.length === 1 ? "it" : "them"} in Settings.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
    }

    return allGranted;
  }, [requiredTypes, requestSinglePermission]);

  useEffect(() => {
    checkAllRequiredPermissions();
  }, [checkAllRequiredPermissions]);

  const hasAllRequiredPermissions = requiredTypes.every(
    (type) => permissions[type]?.granted,
  );

  const isLoading = Object.values(permissions).some((p) => p.loading);

  return {
    permissions,
    hasAllRequiredPermissions,
    isLoading,
    checkedOnce: checkedOnceRef.current,
    checkAllRequiredPermissions,
    requestAllRequiredPermissions,
    checkSinglePermission,
    requestSinglePermission,
    forceCheckPermissions,
  };
};
