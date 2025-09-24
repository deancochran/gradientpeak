import { Text } from "@/components/ui/text";
import { View } from "react-native";

export default function ActivitiesScreen() {
  return (
    <View className="flex-1 items-center justify-center p-4">
      <Text className="text-lg font-semibold">Activities</Text>
      <Text className="text-muted-foreground">
        Your activity history will appear here
      </Text>
    </View>
  );
}
