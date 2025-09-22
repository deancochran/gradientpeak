import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { type PublicActivityType } from "@repo/core";
import { View } from "react-native";

// Simple activity type display names
const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: 'Outdoor Run',
  outdoor_bike: 'Road Cycling',
  indoor_treadmill: 'Treadmill Run',
  indoor_strength: 'Strength Training',
  indoor_swim: 'Pool Swimming',
  other: 'Other Activity',
};

interface PermissionsStepProps {
  activityType: PublicActivityType | null;
  onOpenPermissions: () => void;
  onComplete: () => void;
  permissions: {
    location: boolean;
    backgroundLocation: boolean;
    bluetooth: boolean;
  };
}

export function PermissionsStep({
  activityType,
  onOpenPermissions,
  onComplete,
  permissions,
}: PermissionsStepProps) {
  const activityName = activityType ? ACTIVITY_NAMES[activityType] : 'Activity';

  // Check if we need permissions for this activity type
  const needsLocation = activityType === 'outdoor_run' || activityType === 'outdoor_bike';
  const needsBluetooth = activityType !== 'other'; // Most activities benefit from bluetooth

  const hasRequiredPermissions =
    (!needsLocation || permissions.location) &&
    (!needsBluetooth || permissions.bluetooth);

  if (hasRequiredPermissions) {
    onComplete();
    return null;
  }

  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        {activityName} needs some permissions to track your activity accurately
      </Text>

      <View className="gap-4 mb-8">
        {needsLocation && (
          <Card className={permissions.location ? "border-success bg-success/10" : "border-border"}>
            <CardContent className="p-4">
              <View className="flex-row items-center mb-2">
                <Text className="text-base font-semibold">Location Access</Text>
                {permissions.location && (
                  <Text className="ml-auto text-sm text-success font-medium">✓ Granted</Text>
                )}
              </View>
              <Text className="text-sm text-muted-foreground">
                For GPS tracking and route mapping
              </Text>
            </CardContent>
          </Card>
        )}

        {needsBluetooth && (
          <Card className={permissions.bluetooth ? "border-success bg-success/10" : "border-border"}>
            <CardContent className="p-4">
              <View className="flex-row items-center mb-2">
                <Text className="text-base font-semibold">Bluetooth Access</Text>
                {permissions.bluetooth && (
                  <Text className="ml-auto text-sm text-success font-medium">✓ Granted</Text>
                )}
              </View>
              <Text className="text-sm text-muted-foreground">
                For heart rate monitors and sensors
              </Text>
            </CardContent>
          </Card>
        )}
      </View>

      <Button onPress={onOpenPermissions} className="w-full">
        <Text className="font-semibold">Setup Permissions</Text>
      </Button>
    </View>
  );
}
