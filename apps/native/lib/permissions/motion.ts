// NOTE: As of SDK 51, expo-sensors does not require explicit permissions for motion data.
// These functions are placeholders to fit the permissions strategy pattern.
// They will always return a "granted" status.

// NOTE: As of SDK 51, expo-sensors does not require explicit permissions for motion data.
// These functions are placeholders to fit the permissions strategy pattern.
// They will always return a "granted" status.

interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export const checkMotionPermission = async (): Promise<PermissionResult> => {
  return Promise.resolve({ granted: true, canAskAgain: true });
};

export const requestMotionPermission = async (): Promise<PermissionResult> => {
  return Promise.resolve({ granted: true, canAskAgain: true });
};
