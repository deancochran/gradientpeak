import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Info,
  MapPin,
  Navigation,
  Settings,
} from "lucide-react-native";
import { Linking, Platform, ScrollView, View } from "react-native";
export default function PermissionsModal() {
  const { permissions, requestPermissions } = usePermissions();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-background border-b border-border px-4 py-3 flex-row items-center">
        <Button size="icon" onPress={() => router.back()}>
          <ChevronLeft size={24} />
        </Button>
        <Text className="flex-1 text-center font-semibold">
          Location Permissions
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-4 py-6">
        {/* Permission Status Cards */}
        <Card
          className={`mb-4 ${permissions.location ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5"}`}
        >
          <CardContent className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-3">
                <MapPin
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
                className={`px-3 py-1 rounded-full ${permissions.location ? "bg-green-500" : "bg-orange-500"}`}
              >
                <Text className="text-white text-xs font-medium">
                  {permissions.location ? "Granted" : "Required"}
                </Text>
              </View>
            </View>

            {!permissions.location && (
              <Button
                onPress={() => requestPermissions(["location"])}
                className="w-full"
              >
                <Text className="font-semibold">Grant Location Permission</Text>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card
          className={`mb-4 ${permissions.backgroundLocation ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5"}`}
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
                      : "text-orange-500"
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
                className={`px-3 py-1 rounded-full ${permissions.backgroundLocation ? "bg-green-500" : "bg-orange-500"}`}
              >
                <Text className="text-white text-xs font-medium">
                  {permissions.backgroundLocation ? "Granted" : "Needed"}
                </Text>
              </View>
            </View>

            {permissions.location && !permissions.backgroundLocation && (
              <Button
                onPress={() => requestPermissions(["backgroundLocation"])}
                className="w-full"
                variant="outline"
              >
                <Text className="font-semibold">
                  Enable Background Tracking
                </Text>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Permission Guide */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <View className="flex-row items-start gap-3">
              <Icon as={Info} size={20} className="text-blue-500 mt-0.5" />
              <View className="flex-1">
                <Text className="font-semibold text-blue-700 mb-2">
                  Why These Permissions?
                </Text>
                <View className="gap-2">
                  <Text className="text-sm text-blue-600">
                    • <Text className="font-medium">Location:</Text> Essential
                    for GPS tracking, distance, and speed measurements
                  </Text>
                  <Text className="text-sm text-blue-600">
                    • <Text className="font-medium">Background:</Text> Keeps
                    recording active when you switch apps or lock your phone
                  </Text>
                </View>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Device Settings Link */}
        {Platform.OS === "ios" && (
          <Button
            onPress={() => Linking.openSettings()}
            variant="outline"
            className="mt-4"
          >
            <Icon as={Settings} size={16} />
            <Text className="ml-2">Open Device Settings</Text>
          </Button>
        )}
      </ScrollView>

      {/* Footer Status */}
      <View className="border-t border-border p-4 bg-muted/50">
        <View className="flex-row items-center justify-center gap-2">
          {permissions.location && permissions.backgroundLocation ? (
            <>
              <Icon as={CheckCircle} size={16} className="text-green-500" />
              <Text className="text-sm text-green-600 font-medium">
                All permissions ready
              </Text>
            </>
          ) : (
            <>
              <Icon as={AlertCircle} size={16} className="text-orange-500" />
              <Text className="text-sm text-orange-600 font-medium">
                {permissions.location
                  ? "Background permission recommended"
                  : "Location permission required"}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
