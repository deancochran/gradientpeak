import { Text } from "@repo/ui/components/text";
import { Bike, Footprints, Users } from "lucide-react-native";
import { View } from "react-native";

export function FeedEmptyState() {
  return (
    <View className="flex-1 items-center justify-center p-8 mt-20">
      <View className="bg-muted rounded-full p-6 mb-4">
        <Users size={48} className="text-muted-foreground" />
      </View>
      <Text className="text-xl font-bold text-foreground text-center mb-2">Your feed is empty</Text>
      <Text className="text-sm text-muted-foreground text-center mb-6">
        Follow other athletes to see their activities here, or complete your first activity to get
        started!
      </Text>
      <View className="flex-row gap-4">
        <View className="items-center">
          <Footprints size={24} className="text-muted-foreground mb-2" />
          <Text className="text-xs text-muted-foreground">Record Activities</Text>
        </View>
        <View className="items-center">
          <Bike size={24} className="text-muted-foreground mb-2" />
          <Text className="text-xs text-muted-foreground">Follow Athletes</Text>
        </View>
      </View>
    </View>
  );
}
