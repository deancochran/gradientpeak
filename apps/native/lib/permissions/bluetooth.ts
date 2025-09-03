import { PermissionsAndroid, Platform } from "react-native";

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
