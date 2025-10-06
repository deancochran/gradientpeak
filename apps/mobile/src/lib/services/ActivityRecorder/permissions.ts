// services/permissions.ts

import { PublicActivityType } from "@repo/core";
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
}

/** Result of activity-specific permission check */
export interface ActivityPermissionCheckResult {
  allGranted: boolean;
  missing: PermissionType[];
  denied: PermissionType[];
}

/** Centralized permission manager */
export class PermissionsManager {
  permissions: Record<PermissionType, PermissionState> = {} as Record<
    PermissionType,
    PermissionState
  >;

  /** Get required permissions - ALL permissions are now required for all activities */
  static getRequiredPermissions(
    activityType?: PublicActivityType,
  ): PermissionType[] {
    return ["bluetooth", "location", "location-background"];
  }

  /** Check if activity type requires GPS - all activities now require GPS */
  static requiresGPS(activityType?: PublicActivityType): boolean {
    return true;
  }

  /** Check permissions for a specific activity type */
  async checkForActivity(
    activityType: PublicActivityType,
  ): Promise<ActivityPermissionCheckResult> {
    const required = PermissionsManager.getRequiredPermissions(activityType);
    const missing: PermissionType[] = [];
    const denied: PermissionType[] = [];

    for (const type of required) {
      const result = await this.check(type);
      if (!result.granted) {
        missing.push(type);
        if (!result.canAskAgain) {
          denied.push(type);
        }
      }
    }

    return {
      allGranted: missing.length === 0,
      missing,
      denied,
    };
  }

  /** Request all permissions for a specific activity type */
  async requestForActivity(
    activityType: PublicActivityType,
  ): Promise<ActivityPermissionCheckResult> {
    const required = PermissionsManager.getRequiredPermissions(activityType);
    for (const type of required) {
      await this.ensure(type);
    }
    return this.checkForActivity(activityType);
  }

  /** Get user-friendly message for missing permissions */
  getMissingPermissionsMessage(
    activityType: PublicActivityType,
    missing: PermissionType[],
  ): string {
    const names = missing
      .map((t) => PermissionsManager.permissionNames[t])
      .join(", ");
    return `Recording activities requires ${names}. Please grant permissions to continue.`;
  }

  /** Get user-friendly message for denied permissions */
  getDeniedPermissionsMessage(
    activityType: PublicActivityType,
    denied: PermissionType[],
  ): string {
    const names = denied
      .map((t) => PermissionsManager.permissionNames[t])
      .join(", ");
    return `${names} permission${denied.length > 1 ? "s" : ""} must be enabled in Settings to record activities.`;
  }

  /** Check permission status without requesting */
  async check(
    type: PermissionType,
  ): Promise<{ granted: boolean; canAskAgain: boolean }> {
    switch (type) {
      case "bluetooth":
        return PermissionsManager.checkBluetooth();
      case "location":
        return PermissionsManager.checkLocationForeground();
      case "location-background":
        return PermissionsManager.checkLocationBackground();
      default:
        return { granted: false, canAskAgain: false };
    }
  }

  /** Check location foreground permission */
  private static async checkLocationForeground() {
    const status = await Location.getForegroundPermissionsAsync();
    return {
      granted: status.status === "granted",
      canAskAgain: status.canAskAgain,
    };
  }

  /** Check location background permission */
  private static async checkLocationBackground() {
    const status = await Location.getBackgroundPermissionsAsync();
    return {
      granted: status.status === "granted",
      canAskAgain: status.canAskAgain,
    };
  }

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
      const result = await this.check(t);
      this.permissions[t] = {
        ...result,
        name: PermissionsManager.permissionNames[t],
        description: PermissionsManager.permissionDescriptions[t],
        loading: false,
      };
    }
  }

  static showPermissionAlert(type: PermissionType) {
    Alert.alert(
      `${this.permissionNames[type]} Required`,
      `${this.permissionNames[type]} is required for activity recording. Please enable it in settings.`,
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
    bluetooth:
      "Connect to heart rate monitors, power meters, and other fitness sensors",
    location: "Track your route, measure distance, and record GPS data",
    "location-background":
      "Continue tracking your activity when the app is in the background",
  };
}
