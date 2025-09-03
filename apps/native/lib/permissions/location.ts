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
