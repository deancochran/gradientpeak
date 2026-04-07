import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
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
      <Card className="bg-card border-border">
        <CardContent className="p-6 items-center">
          <Icon as={Calendar} size={32} className="text-muted-foreground mb-2" />
          <Text className="text-card-foreground text-center font-medium mb-1">
            No activity scheduled today
          </Text>
          <Text className="text-muted-foreground text-sm text-center mb-4">
            Rest day or time to plan your next activity
          </Text>
          <Button variant="outline" onPress={onViewPlan}>
            <Text className="text-muted-foreground">View Plan</Text>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <TouchableOpacity onPress={onPress}>
      <Card className="border-0 overflow-hidden">
        <CardContent className="p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <View className="flex-row items-center gap-2">
                <Activity size={20} />
                <Text className="text-lg font-bold">{todaysActivity.title}</Text>
                <View className="px-2 py-1 rounded-full">
                  <Text className="text-xs font-semibold">Today</Text>
                </View>
              </View>
              <Text className="text-sm mt-1">
                {todaysActivity.scheduledTime}
                {todaysActivity.duration > 0 && ` • ${todaysActivity.duration} min`}
                {todaysActivity.distance > 0 && ` • ${todaysActivity.distance} km`}
              </Text>
            </View>
            <Button variant="secondary" className="py-2 px-4" onPress={onStartActivity}>
              <View className="flex-row items-center justify-center">
                <Play size={18} />
                <Text className="font-bold text-sm ml-2">Start</Text>
              </View>
            </Button>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
