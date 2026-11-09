/**
 * Standalone Permissions Check Service
 *
 * This service provides permission checking functionality independent of
 * the ActivityRecorderService, allowing permission status to be checked
 * from anywhere in the app without requiring an active recording context.
 */

import { PermissionsAndroid, Platform } from "react-native";

export type PermissionStatus = {
  granted: boolean;
  canAskAgain: boolean;
};

export type PermissionType = "bluetooth";

export type AllPermissionsStatus = {
  bluetooth: PermissionStatus | null;
};

class StandalonePermissionsManager {
  // Cache to prevent excessive checks
  private cache: {
    status: AllPermissionsStatus | null;
    timestamp: number;
  } = {
    status: null,
    timestamp: 0,
  };
  private readonly CACHE_DURATION_MS = 2000; // 2 seconds

  /**
   * Check all permissions and return their current status
   * Uses caching to prevent excessive permission checks
   */
  async checkAllPermissions(forceRefresh = false): Promise<AllPermissionsStatus> {
    const now = Date.now();

    // Return cached result if still valid and not forcing refresh
    if (!forceRefresh && this.cache.status && now - this.cache.timestamp < this.CACHE_DURATION_MS) {
      console.log("[PermissionsManager] Returning cached permissions");
      return this.cache.status;
    }

    console.log("[PermissionsManager] Checking permissions (cache miss or expired)");

    const status = { bluetooth: await this.checkBluetoothPermission() };

    // Update cache
    this.cache = {
      status,
      timestamp: now,
    };

    return status;
  }

  /**
   * Clear the permission cache
   * Useful when permissions are requested or changed
   */
  clearCache(): void {
    console.log("[PermissionsManager] Clearing cache");
    this.cache = {
      status: null,
      timestamp: 0,
    };
  }

  /**
   * Check if all required permissions are granted
   */
  async areAllPermissionsGranted(): Promise<boolean> {
    const permissions = await this.checkAllPermissions();

    const allGranted = permissions.bluetooth?.granted === true;

    // Only log if not all granted (to reduce noise)
    if (!allGranted) {
      console.log("[PermissionsManager] areAllPermissionsGranted check:", {
        bluetooth: permissions.bluetooth?.granted,
        allGranted,
      });
    }

    return allGranted;
  }

  async areRecordingPermissionsGranted(): Promise<boolean> {
    // Timer/manual recording has no operating-system permission prerequisite.
    // Bluetooth authorization is requested only when a user opens sensor setup.
    return true;
  }

  /**
   * Check bluetooth permission status
   */
  private async checkBluetoothPermission(): Promise<PermissionStatus | null> {
    if (Platform.OS === "web") return null;

    try {
      if (Platform.OS === "android") {
        const apiLevel = Platform.Version;

        if (apiLevel >= 31) {
          // Android 12+ requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
          const scanResult = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          );
          const connectResult = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          );

          const granted = scanResult && connectResult;

          // Only log if not granted
          if (!granted) {
            console.log("[PermissionsManager] Bluetooth check (Android 12+):", {
              apiLevel,
              scanResult,
              connectResult,
              granted,
            });
          }

          // We assume we can ask again unless explicitly denied
          // Note: There's no reliable way to check NEVER_ASK_AGAIN without requesting
          return {
            granted,
            canAskAgain: !granted, // Can ask if not already granted
          };
        } else {
          // Android 11 and older couple BLE scanning to location authorization.
          // GradientPeak's location-free policy deliberately does not request it.
          return { granted: false, canAskAgain: false };
        }
      } else if (Platform.OS === "ios") {
        // iOS handles Bluetooth permissions automatically
        // We can't check the actual status without BleManager, so we assume it's granted
        // The actual permission prompt will appear when trying to use Bluetooth
        return {
          granted: true,
          canAskAgain: true,
        };
      }

      return null;
    } catch (error) {
      console.error("Error checking Bluetooth permission:", error);
      return null;
    }
  }

  /**
   * Request a specific permission
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    // Clear cache before requesting
    this.clearCache();

    let result: boolean;
    switch (type) {
      case "bluetooth":
        result = await this.requestBluetoothPermission();
        break;
      default:
        result = false;
    }

    // Clear cache after requesting to force re-check
    this.clearCache();

    return result;
  }

  /**
   * Request bluetooth permission
   */
  private async requestBluetoothPermission(): Promise<boolean> {
    if (Platform.OS === "web") return false;

    try {
      if (Platform.OS === "android") {
        const apiLevel = Platform.Version;

        if (apiLevel >= 31) {
          // Android 12+ requires multiple permissions
          const permissions = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ];

          const results = await PermissionsAndroid.requestMultiple(permissions);

          return permissions.every(
            (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED,
          );
        } else {
          // Do not turn location authorization into a recording or sensor prerequisite.
          return false;
        }
      } else if (Platform.OS === "ios") {
        // iOS handles Bluetooth permissions automatically
        // The permission prompt will appear when actually trying to use Bluetooth
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error requesting Bluetooth permission:", error);
      return false;
    }
  }
}

// Export a singleton instance
export const permissionsChecker = new StandalonePermissionsManager();

// Export convenience functions
export async function checkAllPermissions(forceRefresh = false): Promise<AllPermissionsStatus> {
  return permissionsChecker.checkAllPermissions(forceRefresh);
}

export async function areAllPermissionsGranted(): Promise<boolean> {
  return permissionsChecker.areAllPermissionsGranted();
}

export async function areRecordingPermissionsGranted(): Promise<boolean> {
  return permissionsChecker.areRecordingPermissionsGranted();
}

export async function requestPermission(type: PermissionType): Promise<boolean> {
  return permissionsChecker.requestPermission(type);
}

export function clearPermissionsCache(): void {
  permissionsChecker.clearCache();
}
