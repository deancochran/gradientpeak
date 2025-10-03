import { useRouter } from "expo-router";
import {
  Bluetooth,
  CheckCircle,
  ChevronLeft,
  MapPin,
  Navigation,
  XCircle,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useActivityRecorder } from "@/lib/hooks/useActivityRecorder";
import { PublicActivityType } from "@repo/core";

type PermissionType = "bluetooth" | "location" | "location-background";

const isOutdoorActivity = (type: PublicActivityType): boolean => {
  return ["outdoor_run", "outdoor_bike", "outdoor_walk"].includes(type);
};

export default function PermissionsModal() {
  const service = useActivityRecorder();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const bluetoothPermission = service.getPermissionState("bluetooth");
  const locationPermission = service.getPermissionState("location");
  const backgroundPermission = service.getPermissionState(
    "location-background",
  );
  const needsGPS = isOutdoorActivity(service.selectedActivityType);

  const handleRequestPermission = useCallback(
    async (type: PermissionType) => {
      try {
        const granted = await service.ensurePermission(type);
        if (!granted) {
          Alert.alert(
            "Permission Denied",
            "Enable this permission in Settings to use this feature.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        }
      } catch (error) {
        console.error(`Error requesting ${type} permission:`, error);
      }
    },
    [service],
  );

  const handleRequestAllPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        service.ensurePermission("bluetooth"),
        service.ensurePermission("location"),
        service.ensurePermission("location-background"),
      ]);
    } catch (error) {
      console.error("Error requesting permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const allGranted =
    bluetoothPermission?.granted && locationPermission?.granted;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">Permissions</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1">
        <View className="p-4 gap-4">
          {/* Quick Action */}
          {!allGranted && (
            <Button
              onPress={handleRequestAllPermissions}
              disabled={isLoading}
              className="w-full"
            >
              <Text className="font-semibold">
                {isLoading ? "Requesting..." : "Grant All Permissions"}
              </Text>
            </Button>
          )}

          {/* Bluetooth */}
          <View className="border border-border rounded-lg p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-3">
                <Icon as={Bluetooth} size={20} className="text-foreground" />
                <Text className="font-medium">Bluetooth</Text>
              </View>
              <Icon
                as={bluetoothPermission?.granted ? CheckCircle : XCircle}
                size={20}
                className={
                  bluetoothPermission?.granted
                    ? "text-green-600"
                    : "text-muted-foreground"
                }
              />
            </View>
            <Text className="text-sm text-muted-foreground mb-3">
              Connect to heart rate monitors and fitness sensors
            </Text>
            {!bluetoothPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("bluetooth")}
                size="sm"
                variant="outline"
              >
                <Text>Enable</Text>
              </Button>
            )}
          </View>

          {/* Location */}
          <View className="border border-border rounded-lg p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-3">
                <Icon as={MapPin} size={20} className="text-foreground" />
                <Text className="font-medium">Location</Text>
              </View>
              <Icon
                as={locationPermission?.granted ? CheckCircle : XCircle}
                size={20}
                className={
                  locationPermission?.granted
                    ? "text-green-600"
                    : needsGPS
                      ? "text-orange-600"
                      : "text-muted-foreground"
                }
              />
            </View>
            <Text className="text-sm text-muted-foreground mb-3">
              Track GPS routes and measure distance
              {needsGPS && " (required for outdoor activities)"}
            </Text>
            {!locationPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("location")}
                size="sm"
                variant="outline"
              >
                <Text>Enable</Text>
              </Button>
            )}
          </View>

          {/* Background Location */}
          <View className="border border-border rounded-lg p-4">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center gap-3">
                <Icon as={Navigation} size={20} className="text-foreground" />
                <Text className="font-medium">Background Location</Text>
              </View>
              <Icon
                as={backgroundPermission?.granted ? CheckCircle : XCircle}
                size={20}
                className={
                  backgroundPermission?.granted
                    ? "text-green-600"
                    : "text-muted-foreground"
                }
              />
            </View>
            <Text className="text-sm text-muted-foreground mb-3">
              Continue tracking when app is in background
            </Text>
            {locationPermission?.granted && !backgroundPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("location-background")}
                size="sm"
                variant="outline"
              >
                <Text>Enable</Text>
              </Button>
            )}
            {!locationPermission?.granted && (
              <Text className="text-xs text-muted-foreground italic">
                Enable Location first
              </Text>
            )}
          </View>

          {/* Info */}
          <View className="mt-2">
            <Text className="text-xs text-muted-foreground text-center">
              Permissions can be managed in device settings at any time
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
