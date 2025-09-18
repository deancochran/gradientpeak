import Location from "expo-location";
import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";
import { create } from "zustand";

interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}
export const checkBluetoothPermission = async (): Promise<PermissionResult> => {
  if (Platform.OS !== "android") {
    // For iOS/web, assume Bluetooth is handled differently or always granted for basic use
    return { granted: true, canAskAgain: true };
  }

  const apiLevel = Platform.constants?.Version ?? 0;

  try {
    if (apiLevel >= 31) {
      // Android 12+ (SDK 31+) requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
      const scan = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      );
      const connect = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      return { granted: scan && connect, canAskAgain: true };
    } else {
      // Android 11 and below requires ACCESS_COARSE_LOCATION for BLE scanning
      const location = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      );
      return { granted: location, canAskAgain: true };
    }
  } catch (error) {
    console.error("Error checking Android BLE permissions:", error);
    return { granted: false, canAskAgain: true };
  }
};

export const requestBluetoothPermission =
  async (): Promise<PermissionResult> => {
    if (Platform.OS !== "android") {
      return { granted: true, canAskAgain: true };
    }

    const apiLevel = Platform.constants?.Version ?? 0;

    try {
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        const granted =
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED;

        const denied = Object.values(results).some(
          (result) => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );

        return { granted, canAskAgain: !denied };
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {
            title: "Location Permission for Bluetooth",
            message:
              "This app needs location access to scan for Bluetooth fitness devices like heart rate monitors.",
            buttonPositive: "OK",
          },
        );

        return {
          granted: result === PermissionsAndroid.RESULTS.GRANTED,
          canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        };
      }
    } catch (error) {
      console.error("Error requesting Android BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  };

export const checkLocationPermission = async (): Promise<PermissionResult> => {
  const { status, canAskAgain } =
    await Location.getForegroundPermissionsAsync();
  return { granted: status === "granted", canAskAgain };
};

export const requestLocationPermission =
  async (): Promise<PermissionResult> => {
    const { status, canAskAgain } =
      await Location.requestForegroundPermissionsAsync();
    return { granted: status === "granted", canAskAgain };
  };

export const checkBackgroundLocationPermission =
  async (): Promise<PermissionResult> => {
    const { status, canAskAgain } =
      await Location.getBackgroundPermissionsAsync();
    return { granted: status === "granted", canAskAgain };
  };

export const requestBackgroundLocationPermission =
  async (): Promise<PermissionResult> => {
    const { status, canAskAgain } =
      await Location.requestBackgroundPermissionsAsync();
    return { granted: status === "granted", canAskAgain };
  };

export type PermissionType = "bluetooth" | "location" | "location-background";

export type PermissionsStatus = Record<PermissionType, PermissionState>;

export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
  name: string;
  description: string;
  required?: boolean;
}

interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}
export interface PermissionStrategy {
  check: () => Promise<PermissionResult>;
  request: () => Promise<PermissionResult>;
  name: string;
  description: string;
  required?: boolean;
}
// Map permission types to their checking/requesting functions and display info
export const permissionStrategies: Record<PermissionType, PermissionStrategy> =
  {
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
    "location-background": {
      check: checkBackgroundLocationPermission,
      request: requestBackgroundLocationPermission,
      name: "Background Location",
      description: "Continue tracking your route when app is in background",
    },
    // Add other permission types here as needed
  };

interface PermissionsStore {
  permissions: Record<PermissionType, PermissionState>;
  checkedOnce: boolean;
  checkPermission: (type: PermissionType) => Promise<PermissionState>;
  requestPermission: (type: PermissionType) => Promise<PermissionState>;
  requestAllPermissions: (requiredTypes: PermissionType[]) => Promise<boolean>;
}

export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  permissions: {} as Record<PermissionType, PermissionState>,
  checkedOnce: false,
  checkPermission: async (type) => {
    const strategy = permissionStrategies[type];
    if (!strategy)
      return { granted: false, canAskAgain: true } as PermissionState;

    set((state) => ({
      permissions: {
        ...state.permissions,
        [type]: { ...state.permissions[type], loading: true },
      },
    }));

    try {
      const result = await strategy.check();
      const updated = {
        ...result,
        name: strategy.name,
        description: strategy.description,
        loading: false,
      };
      set((state) => ({
        permissions: { ...state.permissions, [type]: updated },
      }));
      return updated;
    } catch {
      set((state) => ({
        permissions: {
          ...state.permissions,
          [type]: { ...state.permissions[type], loading: false },
        },
      }));
      return { granted: false, canAskAgain: true } as PermissionState;
    }
  },

  requestPermission: async (type) => {
    const strategy = permissionStrategies[type];
    if (!strategy)
      return { granted: false, canAskAgain: true } as PermissionState;

    const current = get().permissions[type];
    if (current && !current.canAskAgain) {
      Alert.alert(
        `${strategy.name} Permission Required`,
        `Enable ${strategy.name} in settings to use this feature.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return { granted: false, canAskAgain: false } as PermissionState;
    }

    set((state) => ({
      permissions: {
        ...state.permissions,
        [type]: { ...state.permissions[type], loading: true },
      },
    }));

    try {
      const result = await strategy.request();
      const updated = {
        ...result,
        name: strategy.name,
        description: strategy.description,
        loading: false,
      };
      set((state) => ({
        permissions: { ...state.permissions, [type]: updated },
      }));
      return updated;
    } catch {
      set((state) => ({
        permissions: {
          ...state.permissions,
          [type]: { ...state.permissions[type], loading: false },
        },
      }));
      return { granted: false, canAskAgain: true } as PermissionState;
    }
  },

  requestAllPermissions: async (requiredTypes) => {
    const results = [];
    for (const type of requiredTypes) {
      const result = await get().requestPermission(type);
      results.push(result);
    }
    return results.every((r) => r.granted);
  },
}));
