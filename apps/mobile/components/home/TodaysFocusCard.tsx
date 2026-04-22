import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Activity, Calendar, Play } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface TodaysActivity {
  id: string;
  type: any;
  title: any;
  duration: any;
  distance: number;
  zone: any;
  scheduledTime: string;
  description: any;
  intensity?: string;
}

interface TodaysFocusCardProps {
  todaysActivity: TodaysActivity | null;
  onStartActivity: () => void;
  onViewPlan: () => void;
  onPress: () => void;
}

export function TodaysFocusCard({
  todaysActivity,
  onStartActivity,
  onViewPlan,
  onPress,
}: TodaysFocusCardProps) {
  if (!todaysActivity) {
    return (
      <View className="items-center rounded-xl border border-border bg-card p-6">
        <Calendar size={32} className="mb-2 text-muted-foreground" />
        <Text className="text-card-foreground text-center font-medium mb-1">
          No activity scheduled today
        </Text>
        <Text className="text-muted-foreground text-sm text-center mb-4">
          Rest day or time to plan your next activity
        </Text>
        <Button variant="outline" onPress={onViewPlan}>
          <Text className="text-muted-foreground">View Plan</Text>
        </Button>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onPress}>
      <View className="rounded-xl bg-card p-4">
        <View className="flex-row items-center justify-between">
          <View>
            <View className="flex-row items-center gap-2">
              <Activity size={20} />
              <Text className="text-lg font-bold">{todaysActivity.title}</Text>
              <Text className="text-xs font-semibold">Today</Text>
            </View>
            <Text className="mt-1 text-sm">
              {todaysActivity.scheduledTime}
              {todaysActivity.duration > 0 && ` • ${todaysActivity.duration} min`}
              {todaysActivity.distance > 0 && ` • ${todaysActivity.distance} km`}
            </Text>
          </View>
          <Button variant="secondary" className="px-4 py-2" onPress={onStartActivity}>
            <Play size={18} />
            <Text className="ml-2 text-sm font-bold">Start</Text>
          </Button>
        </View>
      </View>
    </TouchableOpacity>
  );
}
