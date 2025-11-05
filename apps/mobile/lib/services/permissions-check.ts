/**
 * Standalone Permissions Check Service
 *
 * This service provides permission checking functionality independent of
 * the ActivityRecorderService, allowing permission status to be checked
 * from anywhere in the app without requiring an active recording context.
 */

import * as Location from "expo-location";
import { PermissionsAndroid, Platform } from "react-native";

export type PermissionStatus = {
  granted: boolean;
  canAskAgain: boolean;
};

export type PermissionType = "bluetooth" | "location" | "location-background";

export type AllPermissionsStatus = {
  bluetooth: PermissionStatus | null;
  location: PermissionStatus | null;
  locationBackground: PermissionStatus | null;
};

class StandalonePermissionsManager {
  /**
   * Check all permissions and return their current status
   */
  async checkAllPermissions(): Promise<AllPermissionsStatus> {
    const [bluetooth, location, locationBackground] = await Promise.all([
      this.checkBluetoothPermission(),
      this.checkLocationPermission(),
      this.checkBackgroundLocationPermission(),
    ]);

    return {
      bluetooth,
      location,
      locationBackground,
    };
  }

  /**
   * Check if all required permissions are granted
   */
  async areAllPermissionsGranted(): Promise<boolean> {
    const permissions = await this.checkAllPermissions();

    return (
      permissions.bluetooth?.granted === true &&
      permissions.location?.granted === true &&
      permissions.locationBackground?.granted === true
    );
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

          // Check if we can ask again
          const scanCanAsk = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            {
              title: "Bluetooth Permission",
              message: "This app needs Bluetooth access to connect to sensors",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK",
            },
          );

          return {
            granted,
            canAskAgain:
              scanCanAsk !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          };
        } else {
          // Older Android versions
          const result = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );

          return {
            granted: result,
            canAskAgain: true, // Older versions typically allow re-asking
          };
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
   * Check location permission status
   */
  private async checkLocationPermission(): Promise<PermissionStatus | null> {
    if (Platform.OS === "web") return null;

    try {
      const { status, canAskAgain } =
        await Location.getForegroundPermissionsAsync();

      return {
        granted: status === "granted",
        canAskAgain: canAskAgain ?? status !== "denied",
      };
    } catch (error) {
      console.error("Error checking location permission:", error);
      return null;
    }
  }

  /**
   * Check background location permission status
   */
  private async checkBackgroundLocationPermission(): Promise<PermissionStatus | null> {
    if (Platform.OS === "web") return null;

    try {
      const { status, canAskAgain } =
        await Location.getBackgroundPermissionsAsync();

      return {
        granted: status === "granted",
        canAskAgain: canAskAgain ?? status !== "denied",
      };
    } catch (error) {
      console.error("Error checking background location permission:", error);
      return null;
    }
  }

  /**
   * Request a specific permission
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    switch (type) {
      case "bluetooth":
        return await this.requestBluetoothPermission();
      case "location":
        return await this.requestLocationPermission();
      case "location-background":
        return await this.requestBackgroundLocationPermission();
      default:
        return false;
    }
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
            (permission) =>
              results[permission] === PermissionsAndroid.RESULTS.GRANTED,
          );
        } else {
          // Older Android versions need location permission for BLE
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message:
                "This app needs location access to scan for Bluetooth devices",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK",
            },
          );

          return result === PermissionsAndroid.RESULTS.GRANTED;
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

  /**
   * Request location permission
   */
  private async requestLocationPermission(): Promise<boolean> {
    if (Platform.OS === "web") return false;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === "granted";
    } catch (error) {
      console.error("Error requesting location permission:", error);
      return false;
    }
  }

  /**
   * Request background location permission
   */
  private async requestBackgroundLocationPermission(): Promise<boolean> {
    if (Platform.OS === "web") return false;

    try {
      // First check if foreground permission is granted
      const { status: foregroundStatus } =
        await Location.getForegroundPermissionsAsync();

      if (foregroundStatus !== "granted") {
        console.warn(
          "Cannot request background location without foreground permission",
        );
        return false;
      }

      const { status } = await Location.requestBackgroundPermissionsAsync();
      return status === "granted";
    } catch (error) {
      console.error("Error requesting background location permission:", error);
      return false;
    }
  }
}

// Export a singleton instance
export const permissionsChecker = new StandalonePermissionsManager();

// Export convenience functions
export async function checkAllPermissions(): Promise<AllPermissionsStatus> {
  return permissionsChecker.checkAllPermissions();
}

export async function areAllPermissionsGranted(): Promise<boolean> {
  return permissionsChecker.areAllPermissionsGranted();
}

export async function requestPermission(
  type: PermissionType,
): Promise<boolean> {
  return permissionsChecker.requestPermission(type);
}
