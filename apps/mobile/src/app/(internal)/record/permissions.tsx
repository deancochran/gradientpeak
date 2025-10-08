import { useRouter } from "expo-router";
import {
  AlertCircle,
  Bluetooth,
  CheckCircle,
  ChevronDown,
  MapPin,
  Navigation,
  Shield,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  PermissionsState,
  usePermissions,
  useRecorderActions,
} from "@/lib/hooks/useActivityRecorder";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

type PermissionType = "bluetooth" | "location" | "location-background";

interface PermissionConfig {
  type: PermissionType;
  icon: any;
  title: string;
  description: string;
  canRequest: boolean;
  dependencyMessage?: string;
}

const PERMISSION_CONFIGS: PermissionConfig[] = [
  {
    type: "bluetooth",
    icon: Bluetooth,
    title: "Bluetooth",
    description:
      "Connect to heart rate monitors, power meters, and other fitness sensors",
    canRequest: true,
  },
  {
    type: "location",
    icon: MapPin,
    title: "Location",
    description:
      "Track GPS routes, measure distance, and record your activity path",
    canRequest: true,
  },
  {
    type: "location-background",
    icon: Navigation,
    title: "Background Location",
    description:
      "Continue tracking your activity when the app is in the background or screen is locked",
    canRequest: false, // Will be updated dynamically
    dependencyMessage: "Enable Location permission first",
  },
];

export default function PermissionsModal() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [requestingPermission, setRequestingPermission] =
    useState<PermissionType | null>(null);

  // Use shared service from context (provided by _layout.tsx)
  const service = useSharedActivityRecorder();
  const permissions = usePermissions(service);
  const { checkPermissions, ensurePermission } = useRecorderActions(service);

  // Proactively check permissions when modal mounts
  useEffect(() => {
    if (service) {
      checkPermissions();
    }
  }, [service, checkPermissions]);

  // Subscribe to permission changes - poll every 2 seconds when modal is visible
  useEffect(() => {
    if (!service) return;

    const intervalId = setInterval(() => {
      checkPermissions();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [service, checkPermissions]);

  const handleRequestPermission = useCallback(
    async (type: PermissionType) => {
      setRequestingPermission(type);
      try {
        await ensurePermission(type);

        const permType =
          type === "location-background" ? "locationBackground" : type;
        const permission = permissions[permType as keyof PermissionsState];
        if (!permission?.granted) {
          Alert.alert(
            "Permission Required",
            `${PERMISSION_CONFIGS.find((p) => p.type === type)?.title} permission is required. You can enable it in Settings.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => Linking.openSettings(),
                style: "default",
              },
            ],
          );
        }
      } catch (error) {
        console.error(`Error requesting ${type} permission:`, error);
        Alert.alert("Error", "Failed to request permission. Please try again.");
      } finally {
        setRequestingPermission(null);
      }
    },
    [permissions, ensurePermission],
  );

  const handleRequestAllPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      await ensurePermission("bluetooth");
      await ensurePermission("location");
      if (permissions.location?.granted) {
        await ensurePermission("location-background");
      }

      const allGranted =
        permissions.bluetooth?.granted &&
        permissions.location?.granted &&
        permissions.locationBackground?.granted;

      if (!allGranted) {
        Alert.alert(
          "Permissions Required",
          "All permissions are required for activity tracking. Please enable them in Settings.",
          [
            { text: "OK", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch (error) {
      console.error("Error requesting permissions:", error);
      Alert.alert("Error", "Failed to request permissions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [permissions, ensurePermission]);

  const getPermissionStatus = (type: PermissionType) => {
    const permType =
      type === "location-background" ? "locationBackground" : type;
    const permission = permissions[permType as keyof PermissionsState];
    if (!permission) return "unknown";
    if (permission.granted) return "granted";
    if (permission.canAskAgain === false) return "denied";
    return "not-requested";
  };

  const renderPermissionCard = (config: PermissionConfig) => {
    const status = getPermissionStatus(config.type);
    const canRequest =
      config.type === "location-background"
        ? permissions.location?.granted === true
        : config.canRequest;
    const isRequesting = requestingPermission === config.type;

    const statusColor =
      status === "granted"
        ? "text-green-600"
        : status === "denied"
          ? "text-red-600"
          : "text-orange-600";

    const StatusIcon =
      status === "granted"
        ? CheckCircle
        : status === "denied"
          ? AlertCircle
          : XCircle;

    return (
      <View
        key={config.type}
        className="border border-border rounded-xl p-4 bg-card"
      >
        <View className="flex-row items-start justify-between mb-3">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
              <Icon as={config.icon} size={20} className="text-foreground" />
            </View>
            <Text className="font-semibold text-base flex-1">
              {config.title}
            </Text>
          </View>
          <Icon as={StatusIcon} size={22} className={statusColor} />
        </View>

        <Text className="text-sm text-muted-foreground leading-5 mb-4">
          {config.description}
        </Text>

        {status === "granted" ? (
          <View className="flex-row items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <Icon as={CheckCircle} size={14} className="text-green-600" />
            <Text className="text-sm text-green-700 dark:text-green-400 font-medium">
              Permission granted
            </Text>
          </View>
        ) : status === "denied" ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg mb-2">
              <Icon as={AlertCircle} size={14} className="text-red-600" />
              <Text className="text-sm text-red-700 dark:text-red-400 font-medium">
                Permission denied
              </Text>
            </View>
            <Button
              onPress={() => Linking.openSettings()}
              size="sm"
              variant="outline"
              className="w-full"
            >
              <Text>Open Settings</Text>
            </Button>
          </View>
        ) : canRequest ? (
          <Button
            onPress={() => handleRequestPermission(config.type)}
            size="sm"
            className="w-full"
            disabled={isRequesting}
          >
            <Text>{isRequesting ? "Requesting..." : "Enable Permission"}</Text>
          </Button>
        ) : (
          <View className="px-3 py-2 bg-muted/50 rounded-lg">
            <Text className="text-sm text-muted-foreground italic text-center">
              {config.dependencyMessage || "Not available"}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const allGranted = PERMISSION_CONFIGS.every(
    (config) => getPermissionStatus(config.type) === "granted",
  );

  const hasAnyDenied = PERMISSION_CONFIGS.some(
    (config) => getPermissionStatus(config.type) === "denied",
  );

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-2 py-2 flex-row items-center bg-background">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronDown} size={24} />
        </Button>
        <Text className="flex-1 text-center text-lg font-semibold">
          Permissions
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <View className="mb-4 p-4 bg-muted/50 rounded-xl border border-border">
          <View className="flex-row items-start gap-3">
            <Icon
              as={Shield}
              size={20}
              className="text-muted-foreground mt-0.5"
            />
            <View className="flex-1">
              <Text className="font-medium mb-1">Required Permissions</Text>
              <Text className="text-sm text-muted-foreground leading-5">
                All permissions are required for activity tracking and sensor
                connectivity. Your data remains private and secure.
              </Text>
            </View>
          </View>
        </View>

        {!allGranted && !hasAnyDenied && (
          <Button
            onPress={handleRequestAllPermissions}
            disabled={isLoading}
            className="w-full mb-4"
            size="lg"
          >
            <Text className="font-semibold">
              {isLoading
                ? "Requesting Permissions..."
                : "Grant All Permissions"}
            </Text>
          </Button>
        )}

        <View className="gap-3 mb-4">
          {PERMISSION_CONFIGS.map(renderPermissionCard)}
        </View>

        <View className="mt-2 p-4 bg-muted/30 rounded-lg">
          <Text className="text-xs text-muted-foreground text-center leading-5">
            You can manage these permissions at any time in your device
            settings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
