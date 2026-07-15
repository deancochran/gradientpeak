import { Text } from "@repo/ui/components/text";
import { Bike, Footprints, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export function FeedEmptyState() {
  const navigateTo = useAppNavigate();

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record an activity"
          accessibilityHint="Opens activity recording"
          className="items-center rounded-xl p-3"
          onPress={() => navigateTo(ROUTES.RECORD)}
          testID="feed-empty-record"
        >
          <Footprints size={24} className="text-muted-foreground mb-2" />
          <Text className="text-xs text-muted-foreground">Record Activities</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find athletes to follow"
          accessibilityHint="Opens athlete search"
          className="items-center rounded-xl p-3"
          onPress={() => navigateTo(ROUTES.DISCOVER)}
          testID="feed-empty-find-athletes"
        >
          <Bike size={24} className="text-muted-foreground mb-2" />
          <Text className="text-xs text-muted-foreground">Follow Athletes</Text>
        </Pressable>
      </View>
    </View>
  );
}
