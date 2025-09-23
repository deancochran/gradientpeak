import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

export function ActivityModeStep({
  onSelectMode,
}: {
  onSelectMode: (mode: "planned" | "unplanned") => void;
}) {
  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        How would you like to start your activity?
      </Text>

      <View className="gap-4">
        <Button
          onPress={() => onSelectMode("planned")}
          className="p-6"
          variant="outline"
        >
          <View className="flex-1">
            <Text className="text-lg font-semibold mb-1">Planned Workout</Text>
            <Text className="text-sm text-muted-foreground">
              Follow your scheduled training plan
            </Text>
          </View>
        </Button>

        <Button
          onPress={() => onSelectMode("unplanned")}
          className="p-6"
          variant="outline"
        >
          <View className="flex-1">
            <Text className="text-lg font-semibold mb-1">Quick Start</Text>
            <Text className="text-sm text-muted-foreground">
              Start an activity right now
            </Text>
          </View>
        </Button>
      </View>
    </View>
  );
}
