import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Calendar, Heart, TrendingUp } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface QuickActionsProps {
  onPlanPress: () => void;
  onTrendsPress: () => void;
  onRecordPress: () => void;
}

export function QuickActions({
  onPlanPress,
  onTrendsPress,
  onRecordPress,
}: QuickActionsProps) {
  return (
    <View className="flex-row gap-3 mb-4">
      <TouchableOpacity
        onPress={onPlanPress}
        className="flex-1 bg-card border border-border rounded-lg p-4 items-center"
      >
        <Icon as={Calendar} size={24} className="text-muted-foreground mb-2" />
        <Text className="text-card-foreground text-sm font-medium">Plan</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onTrendsPress}
        className="flex-1 bg-card border border-border rounded-lg p-4 items-center"
      >
        <Icon
          as={TrendingUp}
          size={24}
          className="text-muted-foreground mb-2"
        />
        <Text className="text-card-foreground text-sm font-medium">
          Trends
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onRecordPress}
        className="flex-1 bg-card border border-border rounded-lg p-4 items-center"
      >
        <Icon as={Heart} size={24} className="text-muted-foreground mb-2" />
        <Text className="text-card-foreground text-sm font-medium">
          Record
        </Text>
      </TouchableOpacity>
    </View>
  );
}
