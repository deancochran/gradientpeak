import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  Alert,
  BackHandler,
  Linking,
  Platform,
  ScrollView,
  View,
} from "react-native";

import { ChevronLeft, Loader2 } from "lucide-react-native";
import { useStandalonePermissions } from "@/lib/hooks/useStandalonePermissions";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";

export default function PermissionsScreen() {
  const router = useRouter();
  const {
    permissions,
    allGranted,
    isLoading,
    ensurePermission,
    requestAllPermissions,
    checkPermissions,
  } = useStandalonePermissions();

  // Handle close action
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleClose();
        return true; // Prevent default behavior
      },
    );

    return () => backHandler.remove();
  }, [handleClose]);

  const handleOpenSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error("Failed to open settings:", error);
      Alert.alert(
        "Error",
        "Unable to open system settings. Please open Settings manually and navigate to this app.",
      );
    }
  };

  const handleRequestPermission = async (
    type: "bluetooth" | "location" | "location-background",
  ) => {
    const granted = await ensurePermission(type);
    if (!granted) {
      Alert.alert(
        "Permission Denied",
        "This permission is required for the app to function properly. Please enable it in system settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: handleOpenSystemSettings },
        ],
      );
    }
  };

  const handleRequestAllPermissions = async () => {
    const granted = await requestAllPermissions();
    if (granted) {
      Alert.alert("Success", "All permissions have been granted!");
    } else {
      Alert.alert(
        "Permissions Required",
        "Some permissions were not granted. Please enable them in system settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: handleOpenSystemSettings },
        ],
      );
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-border/50">
        <Button
          onPress={handleClose}
          variant="ghost"
          className="p-2 -ml-2 "
          testID="back-button"
        >
          <Icon as={ChevronLeft} size={24} />
        </Button>
        <Text className="text-xl font-semibold text-foreground ml-4">
          Permissions
        </Text>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-6 gap-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-2">
          <Text className="text-muted-foreground text-base">
            Manage app permissions and privacy settings to control how
            GradientPeak accesses your device features.
          </Text>
          {isLoading && (
            <View className="flex-row items-center gap-2 mt-2">
              <Icon
                as={Loader2}
                size={16}
                className="color-muted-foreground animate-spin"
              />
              <Text className="text-muted-foreground text-sm">
                Checking permissions...
              </Text>
            </View>
          )}
          {!isLoading && allGranted && (
            <View className="mt-2 p-3 bg-green-500/10 rounded-lg">
              <Text className="text-green-600 dark:text-green-400 font-medium">
                ✓ All required permissions granted
              </Text>
            </View>
          )}
          {!isLoading && !allGranted && (
            <View className="mt-2 p-3 bg-amber-500/10 rounded-lg">
              <Text className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠ Some permissions are missing
              </Text>
              <Button
                onPress={handleRequestAllPermissions}
                variant="link"
                className="self-start mt-1 p-0"
              >
                <Text className="text-primary">Request All Permissions</Text>
              </Button>
            </View>
          )}
        </View>

        {/* Location Permissions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Location Access
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Required for GPS tracking during outdoor activities
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">
                  Location Services
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Allow access to GPS for activity tracking
                </Text>
              </View>
              <Switch
                checked={permissions.location?.granted ?? false}
                onCheckedChange={() => handleRequestPermission("location")}
                disabled={isLoading}
                testID="location-switch"
              />
            </View>

            <Separator className="bg-border" />

            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">
                  Background Location
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Continue tracking when app is in background
                </Text>
              </View>
              <Switch
                checked={permissions.locationBackground?.granted ?? false}
                onCheckedChange={() =>
                  handleRequestPermission("location-background")
                }
                disabled={isLoading || !permissions.location?.granted}
                testID="background-location-switch"
              />
            </View>
          </CardContent>
        </Card>

        {/* Bluetooth Permissions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Bluetooth Access
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Connect to heart rate monitors, power meters, and other sensors
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">Bluetooth</Text>
                <Text className="text-muted-foreground text-sm">
                  Connect to fitness sensors and devices
                </Text>
              </View>
              <Switch
                checked={permissions.bluetooth?.granted ?? false}
                onCheckedChange={() => handleRequestPermission("bluetooth")}
                disabled={isLoading}
                testID="bluetooth-switch"
              />
            </View>
          </CardContent>
        </Card>

        {/* Notification Permissions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Notifications
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Receive alerts for activities, achievements, and app updates
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">
                  Push Notifications
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Allow the app to send notifications
                </Text>
              </View>
              <Switch
                checked={true}
                onCheckedChange={() => handleOpenSystemSettings()}
                testID="notifications-switch"
              />
            </View>
          </CardContent>
        </Card>

        {/* Camera Permissions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Camera Access
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Take photos for your profile and activity documentation
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">Camera</Text>
                <Text className="text-muted-foreground text-sm">
                  Access camera for photos and profile pictures
                </Text>
              </View>
              <Switch
                checked={false}
                onCheckedChange={() => handleOpenSystemSettings()}
                testID="camera-switch"
              />
            </View>
          </CardContent>
        </Card>

        {/* Storage Permissions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Storage Access
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Save and import activity files, export your data
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-medium">
                  File Storage
                </Text>
                <Text className="text-muted-foreground text-sm">
                  Read and write files to device storage
                </Text>
              </View>
              <Switch
                checked={true}
                onCheckedChange={() => handleOpenSystemSettings()}
                testID="storage-switch"
              />
            </View>
          </CardContent>
        </Card>

        {/* Privacy Information */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-card-foreground">
              Privacy Information
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Learn more about how we handle your data
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-2">
            <Button
              variant="link"
              onPress={() => console.log("View privacy policy")}
              className="self-start"
              testID="privacy-policy-button"
            >
              <Text className="text-primary">View Privacy Policy</Text>
            </Button>
            <Button
              variant="link"
              onPress={() => console.log("View data usage")}
              className="self-start"
              testID="data-usage-button"
            >
              <Text className="text-primary">Data Usage Information</Text>
            </Button>
          </CardContent>
        </Card>

        {/* System Settings Link */}
        <Card className="bg-muted border-border">
          <CardContent className="p-4">
            <View className="items-center gap-3">
              <Text className="text-foreground font-medium text-center">
                Need to change permissions?
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                Some permissions can only be modified in your device&apos;s
                system settings.
              </Text>
              <Button
                variant="outline"
                onPress={handleOpenSystemSettings}
                testID="system-settings-button"
              >
                <Text>Open System Settings</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  );
}
