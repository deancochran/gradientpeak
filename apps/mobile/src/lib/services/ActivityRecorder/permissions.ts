// services/permissions.ts

import * as Location from "expo-location";
import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";

export type PermissionType = "bluetooth" | "location" | "location-background";
/** Permission state for UI display */
export interface PermissionState {
  granted: boolean;
  canAskAgain: boolean;
  loading: boolean;
  name: string;
  description: string;
  required?: boolean;
}

/** Centralized permission manager */
export class PermissionsManager {
  permissions: Record<PermissionType, PermissionState> = {} as Record<
    PermissionType,
    PermissionState
  >;

  /** Ensure a permission is granted (requests if possible) */
  async ensure(type: PermissionType): Promise<boolean> {
    let result: { granted: boolean; canAskAgain: boolean };

    switch (type) {
      case "bluetooth":
        result = await PermissionsManager.checkBluetooth();
        if (!result.granted && result.canAskAgain) {
          result = await PermissionsManager.requestBluetooth();
        }
        break;

      case "location":
        result = await PermissionsManager.ensureLocationForeground();
        break;

      case "location-background":
        result = await PermissionsManager.ensureLocationBackground();
        break;

      default:
        return false;
    }

    if (!result.granted && !result.canAskAgain) {
      PermissionsManager.showPermissionAlert(type);
    }

    this.permissions[type] = {
      ...result,
      name: PermissionsManager.permissionNames[type],
      description: PermissionsManager.permissionDescriptions[type],
      loading: false,
    };

    return result.granted;
  }

  /** Check + request location (foreground) */
  private static async ensureLocationForeground() {
    const status = await Location.getForegroundPermissionsAsync();
    if (status.status === "granted") {
      return { granted: true, canAskAgain: status.canAskAgain };
    }

    const request = await Location.requestForegroundPermissionsAsync();
    return {
      granted: request.status === "granted",
      canAskAgain: request.canAskAgain,
    };
  }

  /** Check + request location (background) */
  private static async ensureLocationBackground() {
    const status = await Location.getBackgroundPermissionsAsync();
    if (status.status === "granted") {
      return { granted: true, canAskAgain: status.canAskAgain };
    }

    const request = await Location.requestBackgroundPermissionsAsync();
    return {
      granted: request.status === "granted",
      canAskAgain: request.canAskAgain,
    };
  }

  /** Bluetooth permissions (Android-specific) */
  private static async checkBluetooth() {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const scan = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );
        const connect = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
        return { granted: scan && connect, canAskAgain: true };
      } else {
        const location = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        );
        return { granted: location, canAskAgain: true };
      }
    } catch (error) {
      console.error("Error checking BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  private static async requestBluetooth() {
    if (Platform.OS !== "android") return { granted: true, canAskAgain: true };

    const apiLevel = Platform.constants?.Version ?? 0;
    try {
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        const granted = Object.values(results).every(
          (r) => r === PermissionsAndroid.RESULTS.GRANTED,
        );
        const denied = Object.values(results).some(
          (r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );
        return { granted, canAskAgain: !denied };
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          {
            title: "Location Permission for Bluetooth",
            message:
              "This app needs location access to scan for Bluetooth devices.",
            buttonPositive: "OK",
          },
        );
        return {
          granted: result === PermissionsAndroid.RESULTS.GRANTED,
          canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        };
      }
    } catch (error) {
      console.error("Error requesting BLE permissions:", error);
      return { granted: false, canAskAgain: true };
    }
  }

  /** Convenience helpers */
  get(type: PermissionType): PermissionState | null {
    return this.permissions[type] || null;
  }

  async checkAll() {
    const types: PermissionType[] = [
      "bluetooth",
      "location",
      "location-background",
    ];
    for (const t of types) {
      await this.ensure(t);
    }
  }

  static showPermissionAlert(type: PermissionType) {
    Alert.alert(
      `${this.permissionNames[type]} Permission Required`,
      `Please enable ${this.permissionNames[type]} in settings to use this feature.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  }

  static permissionNames: Record<PermissionType, string> = {
    bluetooth: "Bluetooth",
    location: "Location",
    "location-background": "Background Location",
  };

  static permissionDescriptions: Record<PermissionType, string> = {
    bluetooth: "Connect to heart rate monitors and cycling sensors",
    location: "Track your route and calculate distance",
    "location-background": "Continue tracking your route in background",
  };
}
