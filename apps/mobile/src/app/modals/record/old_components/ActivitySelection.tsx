import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

export function ActivityModeStep({
  onSelectMode,
}: {
  onSelectMode: (mode: "planned" | "unplanned") => void;
}) {
  const handleModeSelect = (mode: "planned" | "unplanned") => {
    console.log("Button pressed for mode:", mode); // Debug: Confirm interaction (remove later)
    onSelectMode(mode);
  };

  return (
    <View className="px-6 py-4">
      <Text className="text-center text-muted-foreground mb-8">
        How would you like to start your activity?
      </Text>

      <View className="gap-4">
        <Pressable
          onPress={() => handleModeSelect("planned")}
          className="p-6 min-h-20 justify-center items-start" // Tailwind: Padding, height, vertical center, left-align text stack
        >
          {/* Direct Text children: Layout classes only - let TextClassContext add colors/sizes (e.g., text-foreground text-sm font-medium) */}
          <Text className="mb-1">
            {" "}
            {/* Tailwind: Margin-bottom only */}
            Planned Workout
          </Text>
          <Text>
            {" "}
            {/* No classes: Full context control for subtitle (e.g., text-muted-foreground via variant) */}
            Follow your scheduled training plan
          </Text>
        </Pressable>

        <Button
          onPress={() => handleModeSelect("unplanned")}
          className="p-6 min-h-20 justify-center items-start"
          variant="outline"
        >
          <Text className="mb-1">Quick Start</Text>
          <Text>Start an activity right now</Text>
        </Button>
      </View>
    </View>
  );
}
