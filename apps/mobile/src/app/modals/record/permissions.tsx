import { useRouter } from "expo-router";
import {
  AlertCircle,
  Bluetooth,
  CheckCircle,
  ChevronLeft,
  Info,
  MapPin,
  Navigation,
  Shield,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Get permission states directly from service
  const bluetoothPermission = service.getPermissionState("bluetooth");
  const locationPermission = service.getPermissionState("location");
  const backgroundPermission = service.getPermissionState(
    "location-background",
  );

  // Derive connection status
  const connectedSensors = service.getConnectedSensors();
  const isRecording = service.state === "recording";
  const needsGPS = isOutdoorActivity(service.selectedActivityType);

  // Request single permission
  const handleRequestPermission = useCallback(
    async (type: PermissionType) => {
      try {
        const granted = await service.ensurePermission(type);
        if (granted) {
          Alert.alert(
            "Permission Granted",
            `${type.replace("-", " ")} permission has been granted successfully!`,
          );
        } else {
          Alert.alert(
            "Permission Denied",
            `${type.replace("-", " ")} permission was denied. You can enable it in device settings.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        }
      } catch (error) {
        console.error(`Error requesting ${type} permission:`, error);
        Alert.alert("Error", `Failed to request ${type} permission`);
      }
    },
    [service],
  );

  // Request all permissions
  const handleRequestAllPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.all([
        service.ensurePermission("bluetooth"),
        service.ensurePermission("location"),
        service.ensurePermission("location-background"),
      ]);

      const allGranted = results.every(Boolean);
      if (allGranted) {
        Alert.alert("Success", "All permissions have been granted!");
      } else {
        Alert.alert(
          "Some Permissions Denied",
          "Some permissions were not granted. You can enable them individually below or in device settings.",
        );
      }
    } catch (error) {
      console.error("Error requesting permissions:", error);
      Alert.alert("Error", "Failed to request permissions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  // Open device settings
  const openDeviceSettings = useCallback(() => {
    Alert.alert(
      "Open Device Settings",
      "You'll be taken to your device settings where you can manage app permissions.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  }, []);

  // Determine overall status
  const getOverallStatus = (): "ready" | "partial" | "denied" => {
    const hasBluetooth = bluetoothPermission?.granted || false;
    const hasLocation = locationPermission?.granted || false;
    const hasBackground = backgroundPermission?.granted || false;

    if (hasLocation && hasBluetooth) {
      return hasBackground ? "ready" : "partial";
    }
    return "denied";
  };

  const overallStatus = getOverallStatus();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" variant="ghost" onPress={() => router.back()}>
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          App Permissions
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Overall Status Banner */}
        <Card
          className={`mb-6 ${
            overallStatus === "ready"
              ? "border-green-500/20 bg-green-500/5"
              : overallStatus === "partial"
                ? "border-yellow-500/20 bg-yellow-500/5"
                : "border-red-500/20 bg-red-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center gap-3">
              <Icon
                as={overallStatus === "ready" ? CheckCircle : AlertCircle}
                size={24}
                className={
                  overallStatus === "ready"
                    ? "text-green-500"
                    : overallStatus === "partial"
                      ? "text-yellow-500"
                      : "text-red-500"
                }
              />
              <View className="flex-1">
                <Text className="font-semibold">
                  {overallStatus === "ready" && "Ready for Recording"}
                  {overallStatus === "partial" && "Partially Configured"}
                  {overallStatus === "denied" && "Setup Required"}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {overallStatus === "ready" &&
                    "All permissions configured correctly"}
                  {overallStatus === "partial" &&
                    "Core permissions granted, background recommended"}
                  {overallStatus === "denied" &&
                    "Essential permissions required for full functionality"}
                </Text>
              </View>
            </View>

            {overallStatus !== "ready" && (
              <Button
                onPress={handleRequestAllPermissions}
                className="w-full mt-4"
                disabled={isLoading}
              >
                <Text className="font-semibold">
                  {isLoading
                    ? "Requesting Permissions..."
                    : "Grant All Permissions"}
                </Text>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Bluetooth Permission */}
        <Card
          className={`mb-4 ${
            bluetoothPermission?.granted
              ? "border-green-500/20 bg-green-500/5"
              : "border-orange-500/20 bg-orange-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Icon
                  as={Bluetooth}
                  size={24}
                  className={
                    bluetoothPermission?.granted
                      ? "text-green-500"
                      : "text-orange-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Bluetooth Access</Text>
                  <Text className="text-sm text-muted-foreground">
                    {bluetoothPermission?.description ||
                      "Connect to fitness sensors"}
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  bluetoothPermission?.granted
                    ? "bg-green-500"
                    : "bg-orange-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {bluetoothPermission?.granted ? "Granted" : "Required"}
                </Text>
              </View>
            </View>

            {!bluetoothPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("bluetooth")}
                className="w-full"
              >
                <Text className="font-semibold">
                  Grant Bluetooth Permission
                </Text>
              </Button>
            )}

            {bluetoothPermission?.granted === false &&
              !bluetoothPermission?.canAskAgain && (
                <View className="mt-3 p-3 bg-orange-50 rounded-lg">
                  <Text className="text-orange-700 text-sm">
                    Bluetooth permission was permanently denied. Please enable
                    it in device settings.
                  </Text>
                </View>
              )}
          </CardContent>
        </Card>

        {/* Location Permission */}
        <Card
          className={`mb-4 ${
            locationPermission?.granted
              ? "border-green-500/20 bg-green-500/5"
              : needsGPS
                ? "border-orange-500/20 bg-orange-500/5"
                : "border-yellow-500/20 bg-yellow-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Icon
                  as={MapPin}
                  size={24}
                  className={
                    locationPermission?.granted
                      ? "text-green-500"
                      : needsGPS
                        ? "text-orange-500"
                        : "text-yellow-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Location Access</Text>
                  <Text className="text-sm text-muted-foreground">
                    {locationPermission?.description ||
                      "GPS tracking and route mapping"}
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  locationPermission?.granted
                    ? "bg-green-500"
                    : needsGPS
                      ? "bg-orange-500"
                      : "bg-yellow-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {locationPermission?.granted
                    ? "Granted"
                    : needsGPS
                      ? "Required"
                      : "Recommended"}
                </Text>
              </View>
            </View>

            {!locationPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("location")}
                className="w-full"
              >
                <Text className="font-semibold">Grant Location Permission</Text>
              </Button>
            )}

            {locationPermission?.granted === false &&
              !locationPermission?.canAskAgain && (
                <View className="mt-3 p-3 bg-orange-50 rounded-lg">
                  <Text className="text-orange-700 text-sm">
                    Location permission was permanently denied. Please enable it
                    in device settings.
                  </Text>
                </View>
              )}
          </CardContent>
        </Card>

        {/* Background Location Permission */}
        <Card
          className={`mb-4 ${
            backgroundPermission?.granted
              ? "border-green-500/20 bg-green-500/5"
              : "border-yellow-500/20 bg-yellow-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Icon
                  as={Navigation}
                  size={24}
                  className={
                    backgroundPermission?.granted
                      ? "text-green-500"
                      : "text-yellow-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Background Location</Text>
                  <Text className="text-sm text-muted-foreground">
                    {backgroundPermission?.description ||
                      "Continue tracking in background"}
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  backgroundPermission?.granted
                    ? "bg-green-500"
                    : "bg-yellow-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {backgroundPermission?.granted ? "Granted" : "Recommended"}
                </Text>
              </View>
            </View>

            {locationPermission?.granted && !backgroundPermission?.granted && (
              <Button
                onPress={() => handleRequestPermission("location-background")}
                className="w-full"
                variant="outline"
              >
                <Text className="font-semibold">
                  Enable Background Tracking
                </Text>
              </Button>
            )}

            {!locationPermission?.granted && (
              <Text className="text-sm text-muted-foreground italic">
                Grant location permission first to enable background tracking
              </Text>
            )}

            {backgroundPermission?.granted === false &&
              !backgroundPermission?.canAskAgain && (
                <View className="mt-3 p-3 bg-yellow-50 rounded-lg">
                  <Text className="text-yellow-700 text-sm">
                    Background location was denied. Enable it in device settings
                    for continuous tracking.
                  </Text>
                </View>
              )}
          </CardContent>
        </Card>

        {/* Current Status Display */}
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <View className="flex-row items-start gap-3">
              <Icon as={Info} size={20} className="text-blue-500 mt-0.5" />
              <View className="flex-1">
                <Text className="font-semibold text-blue-700 mb-2">
                  Current Status
                </Text>
                <View className="gap-1">
                  <Text className="text-sm text-blue-600">
                    GPS:{" "}
                    {isRecording && needsGPS
                      ? "🟢 Active"
                      : locationPermission?.granted
                        ? "🟡 Ready"
                        : "🔴 Not Available"}
                  </Text>
                  <Text className="text-sm text-blue-600">
                    Bluetooth:{" "}
                    {connectedSensors.length > 0
                      ? `🟢 ${connectedSensors.length} Connected`
                      : bluetoothPermission?.granted
                        ? "🟡 Ready"
                        : "🔴 Not Available"}
                  </Text>
                </View>
                <Text className="text-xs text-blue-600 mt-2">
                  Services are automatically enabled based on granted
                  permissions and will activate when you start recording.
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Permission Guide */}
        <Card className="border-muted">
          <CardContent className="p-4">
            <Text className="font-semibold mb-3">Why These Permissions?</Text>
            <View className="gap-3">
              <View className="flex-row items-start gap-2">
                <Text className="text-blue-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Bluetooth Access:</Text> Connect
                  to heart rate monitors, power meters, and other fitness
                  sensors to capture detailed workout data
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-green-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Location Access:</Text>{" "}
                  Essential for GPS tracking, distance measurement, speed
                  calculation, and route mapping during outdoor activities
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-yellow-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Background Location:</Text>{" "}
                  Maintains accurate tracking when you switch apps, receive
                  calls, or lock your device during recording
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Manual Settings Link */}
        <Button
          onPress={openDeviceSettings}
          variant="outline"
          className="mt-6 mb-4"
        >
          <Icon as={Shield} size={16} />
          <Text className="ml-2">Open Device Settings</Text>
        </Button>
      </ScrollView>

      {/* Footer Status */}
      <View className="border-t border-border p-4 bg-muted/50">
        <View className="flex-row items-center justify-center gap-2">
          {overallStatus === "ready" ? (
            <>
              <Icon as={CheckCircle} size={16} className="text-green-500" />
              <Text className="text-sm text-green-600 font-medium">
                All permissions granted - ready to record
              </Text>
            </>
          ) : overallStatus === "partial" ? (
            <>
              <Icon as={AlertCircle} size={16} className="text-yellow-500" />
              <Text className="text-sm text-yellow-600 font-medium">
                Core permissions granted - background recommended
              </Text>
            </>
          ) : (
            <>
              <Icon as={AlertCircle} size={16} className="text-red-500" />
              <Text className="text-sm text-red-600 font-medium">
                Essential permissions required
              </Text>
            </>
          )}
        </View>

        <Text className="text-xs text-center text-muted-foreground mt-2">
          Permissions are monitored automatically by the app
        </Text>
      </View>
    </View>
  );
}
