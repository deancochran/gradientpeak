import * as Location from "expo-location";

interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

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
