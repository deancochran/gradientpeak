import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Activity,
  Calendar,
  Coffee,
  Play,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import { View } from "react-native";

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
}

export function TodaysFocusCard({
  todaysActivity,
  onStartActivity,
  onViewPlan,
}: TodaysFocusCardProps) {
  // Check if it's a rest day (activity type is "Rest" or similar)
  const isRestDay =
    todaysActivity?.type?.toLowerCase().includes("rest") ||
    todaysActivity?.title?.toLowerCase().includes("rest");

  if (!todaysActivity) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 items-center">
          <Icon
            as={Calendar}
            size={32}
            className="text-muted-foreground mb-2"
          />
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

  // Rest day variant - uses card theme instead of gradient
  if (isRestDay) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">
                Today's Focus
              </Text>
              <Text className="text-foreground text-2xl font-bold">
                {todaysActivity.title}
              </Text>
            </View>
            <View className="bg-primary/10 rounded-full p-3">
              <Icon as={Coffee} size={24} className="text-primary" />
            </View>
          </View>
        </CardHeader>
        <CardContent className="pt-0">
          {todaysActivity.description && (
            <Text className="text-muted-foreground text-sm mb-4">
              {todaysActivity.description}
            </Text>
          )}
          <Text className="text-foreground text-sm mb-4">
            Recovery is just as important as training. Take time to rest and let
            your body adapt.
          </Text>
          <Button variant="outline" onPress={onViewPlan} className="w-full">
            <Text>View Full Week</Text>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 border-0 overflow-hidden">
      <CardHeader className="pb-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">
              Today's Focus
            </Text>
            <Text className="text-white text-2xl font-bold">
              {todaysActivity.title}
            </Text>
          </View>
          <View className="bg-white/20 rounded-full p-3">
            <Activity size={24} color="#ffffff" />
          </View>
        </View>
      </CardHeader>
      <CardContent className="pt-0">
        <View className="flex-row items-center mb-4 gap-4">
          {todaysActivity.intensity && (
            <View className="flex-row items-center">
              <Zap size={16} color="#e0e7ff" />
              <Text className="text-indigo-100 text-sm ml-1">
                {todaysActivity.intensity}
              </Text>
            </View>
          )}
          {todaysActivity.duration > 0 && (
            <View className="flex-row items-center">
              <Target size={16} color="#e0e7ff" />
              <Text className="text-indigo-100 text-sm ml-1">
                {todaysActivity.duration} min
              </Text>
            </View>
          )}
          {todaysActivity.distance > 0 && (
            <View className="flex-row items-center">
              <TrendingUp size={16} color="#e0e7ff" />
              <Text className="text-indigo-100 text-sm ml-1">
                {todaysActivity.distance} km
              </Text>
            </View>
          )}
        </View>
        {todaysActivity.description && (
          <Text className="text-indigo-100 text-sm mb-4">
            {todaysActivity.description}
          </Text>
        )}
        <Button className="bg-white w-full" onPress={onStartActivity}>
          <View className="flex-row items-center justify-center">
            <Play size={20} color="#4f46e5" fill="#4f46e5" />
            <Text className="text-indigo-600 font-bold text-base ml-2">
              Start Activity
            </Text>
          </View>
        </Button>
      </CardContent>
    </Card>
  );
}
