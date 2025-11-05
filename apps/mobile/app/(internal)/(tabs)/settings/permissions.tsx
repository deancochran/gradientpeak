import { useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { Alert, BackHandler, ScrollView, View } from "react-native";

import { ChevronLeft } from "lucide-react-native";

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

  const handleOpenSystemSettings = () => {
    Alert.alert(
      "System Settings",
      "To modify app permissions, please go to your device settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open Settings",
          onPress: () => console.log("Open system settings"),
        },
      ],
    );
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
                checked={true}
                onCheckedChange={() => handleOpenSystemSettings()}
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
                checked={true}
                onCheckedChange={() => handleOpenSystemSettings()}
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
                checked={true}
                onCheckedChange={() => handleOpenSystemSettings()}
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
              Receive alerts for workouts, achievements, and app updates
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
