import { router } from "expo-router";
import { useCallback } from "react";

import { PermissionsModal } from "@components/modals/PermissionsModal";
import { useGlobalPermissions } from "@lib/contexts/PermissionsContext";

export default function PermissionsModalScreen() {
  const {
    permissions,
    hasAllRequiredPermissions,
    checkAllRequiredPermissions,
    isLoading,
  } = useGlobalPermissions();

  const handleClose = useCallback(() => {
    console.log("🛡️ [DEBUG] Permissions modal closed via navigation");
    router.back();
  }, []);

  const handleRequestPermissions = useCallback(async (): Promise<boolean> => {
    console.log("🛡️ [DEBUG] Requesting permissions from modal screen");
    try {
      await checkAllRequiredPermissions();
      return hasAllRequiredPermissions;
    } catch (error) {
      console.warn("🛡️ [DEBUG] Failed to request permissions:", error);
      return false;
    }
  }, [checkAllRequiredPermissions, hasAllRequiredPermissions]);

  // Format permissions for the modal component
  const formattedPermissions = Object.entries(permissions).reduce(
    (acc, [key, value]) => {
      acc[key] = {
        name: key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase()),
        description: getPermissionDescription(key),
        granted: value.granted,
        canAskAgain: value.canAskAgain,
        icon: getPermissionIcon(key),
        required: isRequiredPermission(key),
      };
      return acc;
    },
    {} as Record<
      string,
      {
        name: string;
        description: string;
        granted: boolean;
        canAskAgain: boolean;
        icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
        required: boolean;
      }
    >,
  );

  return (
    <PermissionsModal
      visible={true}
      onClose={handleClose}
      permissions={formattedPermissions}
      onRequestPermissions={handleRequestPermissions}
      isRequesting={isLoading}
    />
  );
}

function getPermissionDescription(key: string): string {
  switch (key) {
    case "location":
      return "Required for GPS tracking during activities";
    case "backgroundLocation":
      return "Allows continuous GPS tracking when app is minimized";
    case "bluetooth":
      return "Required for connecting to heart rate monitors and other sensors";
    case "motion":
      return "Required for detecting movement and activity patterns";
    case "notifications":
      return "Used for activity alerts and background recording notifications";
    default:
      return "Required for optimal app functionality";
  }
}

function getPermissionIcon(
  key: string,
): keyof typeof import("@expo/vector-icons").Ionicons.glyphMap {
  switch (key) {
    case "location":
    case "backgroundLocation":
      return "location-outline";
    case "bluetooth":
      return "bluetooth-outline";
    case "motion":
      return "fitness-outline";
    case "notifications":
      return "notifications-outline";
    default:
      return "shield-checkmark-outline";
  }
}

function isRequiredPermission(key: string): boolean {
  // Essential permissions for basic recording functionality
  return ["location", "bluetooth", "motion"].includes(key);
}
