import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { Calendar, ChevronRight, Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface UpcomingActivity {
  id: string;
  scheduled_date: string;
  activity_plan: {
    id: string;
    name: string;
    activity_type: string;
    estimated_duration: number;
    estimated_tss: number;
  } | null;
}

interface UpcomingActivitiesCardProps {
  activities: UpcomingActivity[];
}

export function UpcomingActivitiesCard({
  activities,
}: UpcomingActivitiesCardProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset hours for comparison
    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === today.getTime()) {
      return "Today";
    } else if (date.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    } else {
      const daysOfWeek = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayName = daysOfWeek[new Date(dateString).getDay()];
      const month = new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
      });
      const day = new Date(dateString).getDate();
      return `${dayName}, ${month} ${day}`;
    }
  };

  const formatActivityType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleActivityPress = (activityId: string) => {
    router.push({
      pathname:
        "/(internal)/(tabs)/plan/planned_activities/[activity_uuid]" as any,
      params: { activity_uuid: activityId },
    });
  };

  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Activities</CardTitle>
      </CardHeader>
      <CardContent>
        <View className="gap-3">
          {activities.map((activity, index) => {
            if (!activity.activity_plan) return null;

            return (
              <View key={activity.id}>
                <TouchableOpacity
                  onPress={() => handleActivityPress(activity.id)}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <View className="flex-1 mr-3">
                      {/* Date */}
                      <View className="flex-row items-center gap-2 mb-2">
                        <Icon
                          as={Calendar}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-sm text-muted-foreground font-medium">
                          {formatDate(activity.scheduled_date)}
                        </Text>
                      </View>

                      {/* Activity Name */}
                      <Text className="font-semibold text-base mb-1">
                        {activity.activity_plan.name}
                      </Text>

                      {/* Activity Details */}
                      <View className="flex-row items-center gap-3">
                        <View className="flex-row items-center gap-1">
                          <Icon
                            as={Clock}
                            size={12}
                            className="text-muted-foreground"
                          />
                          <Text className="text-xs text-muted-foreground">
                            {activity.activity_plan.estimated_duration} min
                          </Text>
                        </View>

                        {activity.activity_plan.estimated_tss && (
                          <>
                            <Text className="text-xs text-muted-foreground">
                              •
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {Math.round(activity.activity_plan.estimated_tss)}{" "}
                              TSS
                            </Text>
                          </>
                        )}

                        <Text className="text-xs text-muted-foreground">•</Text>
                        <Text className="text-xs text-muted-foreground capitalize">
                          {formatActivityType(
                            activity.activity_plan.activity_type,
                          )}
                        </Text>
                      </View>
                    </View>

                    <Icon
                      as={ChevronRight}
                      size={20}
                      className="text-muted-foreground"
                    />
                  </View>
                </TouchableOpacity>

                {/* Divider between activities (not after last one) */}
                {index < activities.length - 1 && (
                  <View className="h-px bg-border my-1" />
                )}
              </View>
            );
          })}
        </View>
      </CardContent>
    </Card>
  );
}
