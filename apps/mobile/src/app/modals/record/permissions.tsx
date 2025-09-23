import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useEnhancedActivityRecording } from "@/lib/hooks/useEnhancedActivityRecording";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Info,
  MapPin,
  Navigation,
  Settings,
  Smartphone,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Linking, Platform, ScrollView, View } from "react-native";

// ===== PERMISSION TYPES =====
interface PermissionStatus {
  location: boolean;
  backgroundLocation: boolean;
  preciseLocation: boolean;
  locationServicesEnabled: boolean;
}

export default function PermissionsModal() {
  const { connectionStatus } = useEnhancedActivityRecording();
  const [permissions, setPermissions] = useState<PermissionStatus>({
    location: false,
    backgroundLocation: false,
    preciseLocation: false,
    locationServicesEnabled: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check current permission status
  const checkPermissions = async () => {
    try {
      setIsLoading(true);

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();

      setPermissions({
        location: foregroundStatus.status === "granted",
        backgroundLocation: backgroundStatus.status === "granted",
        preciseLocation:
          foregroundStatus.status === "granted" &&
          (foregroundStatus.accuracy === Location.Accuracy.BestForNavigation ||
            foregroundStatus.accuracy === Location.Accuracy.Highest),
        locationServicesEnabled: servicesEnabled,
      });
    } catch (error) {
      console.error("Error checking permissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Request location permissions
  const requestLocationPermission = async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();

      if (result.status === "granted") {
        Alert.alert(
          "Permission Granted",
          "Location permission has been granted successfully!",
        );
      } else if (result.canAskAgain === false) {
        Alert.alert(
          "Permission Denied",
          "Location permission was permanently denied. Please enable it in device settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      } else {
        Alert.alert(
          "Permission Required",
          "Location permission is required for GPS tracking during activities.",
        );
      }

      await checkPermissions();
    } catch (error) {
      console.error("Error requesting location permission:", error);
      Alert.alert("Error", "Failed to request location permission");
    }
  };

  // Request background location permission
  const requestBackgroundPermission = async () => {
    if (!permissions.location) {
      Alert.alert(
        "Foreground Permission Required",
        "Please grant location permission first before enabling background location.",
      );
      return;
    }

    try {
      const result = await Location.requestBackgroundPermissionsAsync();

      if (result.status === "granted") {
        Alert.alert(
          "Background Permission Granted",
          "Background location has been enabled. Your activities will continue to be tracked when the app is in the background.",
        );
      } else {
        Alert.alert(
          "Background Permission Denied",
          Platform.OS === "ios"
            ? "Background location was denied. This can be enabled later in Settings > Privacy & Security > Location Services."
            : "Background location permission is helpful for continuous tracking during activities.",
        );
      }

      await checkPermissions();
    } catch (error) {
      console.error("Error requesting background permission:", error);
      Alert.alert("Error", "Failed to request background permission");
    }
  };

  // Open device settings
  const openDeviceSettings = () => {
    Alert.alert(
      "Open Device Settings",
      "You'll be taken to your device settings where you can manage location permissions.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  };

  useEffect(() => {
    checkPermissions();

    // Set up periodic permission checking
    const interval = setInterval(checkPermissions, 5000);
    return () => clearInterval(interval);
  }, []);

  const getOverallStatus = (): "ready" | "partial" | "denied" => {
    if (!permissions.locationServicesEnabled || !permissions.location) {
      return "denied";
    }
    if (!permissions.backgroundLocation) {
      return "partial";
    }
    return "ready";
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
          Location Permissions
        </Text>
        <Button
          size="icon"
          variant="ghost"
          onPress={checkPermissions}
          disabled={isLoading}
        >
          <Icon as={Settings} size={20} />
        </Button>
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
                    "Basic permissions granted, background recommended"}
                  {overallStatus === "denied" &&
                    "Location permissions required for GPS tracking"}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Location Services Status */}
        <Card
          className={`mb-4 ${
            permissions.locationServicesEnabled
              ? "border-green-500/20 bg-green-500/5"
              : "border-red-500/20 bg-red-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Icon
                  as={Smartphone}
                  size={24}
                  className={
                    permissions.locationServicesEnabled
                      ? "text-green-500"
                      : "text-red-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Location Services</Text>
                  <Text className="text-sm text-muted-foreground">
                    System-wide location functionality
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  permissions.locationServicesEnabled
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {permissions.locationServicesEnabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
            </View>

            {!permissions.locationServicesEnabled && (
              <View className="mt-3 p-3 bg-red-50 rounded-lg">
                <Text className="text-red-700 text-sm">
                  Location Services are disabled system-wide. Enable in device
                  settings to use GPS tracking.
                </Text>
              </View>
            )}
          </CardContent>
        </Card>

        {/* App Location Permission */}
        <Card
          className={`mb-4 ${
            permissions.location
              ? "border-green-500/20 bg-green-500/5"
              : "border-orange-500/20 bg-orange-500/5"
          }`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <Icon
                  as={MapPin}
                  size={24}
                  className={
                    permissions.location ? "text-green-500" : "text-orange-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Location Access</Text>
                  <Text className="text-sm text-muted-foreground">
                    For GPS tracking and route mapping
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  permissions.location ? "bg-green-500" : "bg-orange-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {permissions.location ? "Granted" : "Required"}
                </Text>
              </View>
            </View>

            {!permissions.location && (
              <Button onPress={requestLocationPermission} className="w-full">
                <Text className="font-semibold">Grant Location Permission</Text>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Background Location Permission */}
        <Card
          className={`mb-4 ${
            permissions.backgroundLocation
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
                    permissions.backgroundLocation
                      ? "text-green-500"
                      : "text-yellow-500"
                  }
                />
                <View>
                  <Text className="font-semibold">Background Location</Text>
                  <Text className="text-sm text-muted-foreground">
                    Continue tracking when app is backgrounded
                  </Text>
                </View>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  permissions.backgroundLocation
                    ? "bg-green-500"
                    : "bg-yellow-500"
                }`}
              >
                <Text className="text-white text-xs font-medium">
                  {permissions.backgroundLocation ? "Granted" : "Recommended"}
                </Text>
              </View>
            </View>

            {permissions.location && !permissions.backgroundLocation && (
              <Button
                onPress={requestBackgroundPermission}
                className="w-full"
                variant="outline"
              >
                <Text className="font-semibold">
                  Enable Background Tracking
                </Text>
              </Button>
            )}

            {!permissions.location && (
              <Text className="text-sm text-muted-foreground italic">
                Grant location permission first to enable background tracking
              </Text>
            )}
          </CardContent>
        </Card>

        {/* Current GPS Status */}
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <View className="flex-row items-start gap-3">
              <Icon as={Info} size={20} className="text-blue-500 mt-0.5" />
              <View className="flex-1">
                <Text className="font-semibold text-blue-700 mb-2">
                  Current GPS Status
                </Text>
                <Text className="text-sm text-blue-600 mb-2">
                  Connection:{" "}
                  {connectionStatus.gps === "connected"
                    ? "🟢 Connected"
                    : connectionStatus.gps === "connecting"
                      ? "🟡 Connecting"
                      : connectionStatus.gps === "error"
                        ? "🔴 Error"
                        : "⚪ Disabled"}
                </Text>
                <Text className="text-xs text-blue-600">
                  GPS functionality depends on these permissions and will be
                  automatically enabled when you start recording an activity.
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
                <Text className="text-green-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Location Access:</Text>{" "}
                  Essential for GPS tracking, distance measurement, speed
                  calculation, and route mapping during activities
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-blue-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Background Location:</Text>{" "}
                  Maintains accurate tracking when you switch apps, receive
                  calls, or lock your device during recording
                </Text>
              </View>
              <View className="flex-row items-start gap-2">
                <Text className="text-purple-600 font-bold">•</Text>
                <Text className="text-sm flex-1">
                  <Text className="font-medium">Precise Location:</Text>{" "}
                  Provides the highest accuracy GPS data for detailed route
                  tracking and performance analysis
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
          <Icon as={Settings} size={16} />
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
                Ready for GPS tracking
              </Text>
            </>
          ) : overallStatus === "partial" ? (
            <>
              <Icon as={AlertCircle} size={16} className="text-yellow-500" />
              <Text className="text-sm text-yellow-600 font-medium">
                Basic permissions granted - background recommended
              </Text>
            </>
          ) : (
            <>
              <Icon as={AlertCircle} size={16} className="text-red-500" />
              <Text className="text-sm text-red-600 font-medium">
                Location permissions required for GPS tracking
              </Text>
            </>
          )}
        </View>

        <Text className="text-xs text-center text-muted-foreground mt-2">
          Last checked: {isLoading ? "Checking..." : "Just now"}
        </Text>
      </View>
    </View>
  );
}
