import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { type PublicActivityType } from "@repo/core";
import { View } from "react-native";

// Simple activity type display names
const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Outdoor Run",
  outdoor_bike: "Road Cycling",
  indoor_treadmill: "Treadmill Run",
  indoor_strength: "Strength Training",
  indoor_swim: "Pool Swimming",
  other: "Other Activity",
};

// GPS/BT badges for each type
const ACTIVITY_BADGES: Record<
  PublicActivityType,
  { gps?: boolean; bt?: boolean }
> = {
  outdoor_run: { gps: true, bt: true },
  outdoor_bike: { gps: true, bt: true },
  indoor_treadmill: { gps: false, bt: true },
  indoor_strength: { gps: false, bt: true },
  indoor_swim: { gps: false, bt: false },
  other: { gps: false, bt: false },
};

export function UnplannedActivityStep({
  onSelectActivity,
}: {
  onSelectActivity: (activityType: PublicActivityType) => void;
}) {
  const activityTypes = Object.entries(ACTIVITY_NAMES) as [
    PublicActivityType,
    string,
  ][];

  return (
    <View className="flex-1 px-6 py-4">
      {/* Removed ScrollView - list is short */}
      <Text className="text-center text-muted-foreground mb-6">
        Choose your activity type (6 options)
      </Text>
      <View className="gap-3">
        {activityTypes.map(([activityType, name]) => {
          const badges = ACTIVITY_BADGES[activityType];
          return (
            <Button
              key={activityType}
              onPress={() => onSelectActivity(activityType)}
              className="p-4"
              variant="outline"
            >
              <View className="flex-1">
                <Text className="text-base font-semibold mb-1">{name}</Text>
                <View className="flex-row gap-2">
                  {badges.gps && (
                    <View className="px-2 py-1 bg-blue/10 rounded-full">
                      <Text className="text-xs text-blue-600">GPS</Text>
                    </View>
                  )}
                  {badges.bt && (
                    <View className="px-2 py-1 bg-purple/10 rounded-full">
                      <Text className="text-xs text-purple-600">Sensors</Text>
                    </View>
                  )}
                </View>
              </View>
            </Button>
          );
        })}
      </View>
    </View>
  );
}
