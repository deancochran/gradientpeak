import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { type PublicActivityType } from "@repo/core";
import { ScrollView, View } from "react-native";

// Simple activity type display names
const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: 'Outdoor Run',
  outdoor_bike: 'Road Cycling',
  indoor_treadmill: 'Treadmill Run',
  indoor_strength: 'Strength Training',
  indoor_swim: 'Pool Swimming',
  other: 'Other Activity',
};

export function UnplannedActivityStep({
  onSelectActivity,
}: {
  onSelectActivity: (activityType: PublicActivityType) => void;
}) {
  const activityTypes = Object.entries(ACTIVITY_NAMES) as [PublicActivityType, string][];

  return (
    <ScrollView className="flex-1 px-6 py-4">
      <Text className="text-center text-muted-foreground mb-6">
        Choose your activity type
      </Text>

      <View className="gap-3">
        {activityTypes.map(([activityType, name]) => (
          <Button
            key={activityType}
            onPress={() => onSelectActivity(activityType)}
            className="p-4"
            variant="outline"
          >
            <Text className="text-base font-semibold">{name}</Text>
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}
