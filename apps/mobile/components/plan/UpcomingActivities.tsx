import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface UpcomingActivity {
  id: string;
  title: string;
  type: string;
  duration: string;
  intensity: string;
  date: string;
}

interface UpcomingActivitiesProps {
  activities: UpcomingActivity[];
  onActivityPress: (id: string) => void;
  onViewAll: () => void;
  getActivityBgClass: (type: string) => string;
  getIntensityColor: (intensity: string) => { bg: string; text: string };
}

export function UpcomingActivities({
  activities,
  onActivityPress,
  onViewAll,
  getActivityBgClass,
  getIntensityColor,
}: UpcomingActivitiesProps) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground">Coming Up</Text>
        <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
          <Text className="text-sm text-primary font-medium">View All</Text>
        </TouchableOpacity>
      </View>

      {activities.map((activity) => (
        <TouchableOpacity
          key={activity.id}
          onPress={() => onActivityPress(activity.id)}
          activeOpacity={0.7}
        >
          <Card className="border-border">
            <CardContent className="p-4">
              <View className="flex-row items-start gap-3">
                <View
                  className={`w-12 h-12 ${getActivityBgClass(activity.type)} rounded-xl items-center justify-center`}
                >
                  <Icon
                    as={Clock}
                    size={24}
                    className="text-primary-foreground"
                  />
                </View>

                <View className="flex-1">
                  <View className="flex-row items-start justify-between mb-1">
                    <Text className="font-semibold text-foreground flex-1">
                      {activity.title}
                    </Text>
                    <View
                      className={`px-2 py-1 rounded-full ml-2 ${getIntensityColor(activity.intensity).bg}`}
                    >
                      <Text
                        className={`text-xs font-medium ${getIntensityColor(activity.intensity).text}`}
                      >
                        {activity.intensity}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-3 mb-2">
                    <Text className="text-sm text-muted-foreground">
                      {activity.duration}
                    </Text>
                  </View>

                  <Text className="text-xs text-muted-foreground">
                    {activity.date}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </TouchableOpacity>
      ))}
    </View>
  );
}
