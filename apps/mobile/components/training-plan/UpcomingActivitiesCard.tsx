import { formatDurationSec } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Calendar, ChevronRight, Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

interface UpcomingActivity {
  id: string;
  scheduled_date: string;
  activity_plan: {
    id: string;
    name: string;
    activity_category: string;
    authoritative_metrics?: {
      estimated_duration?: number | null;
      estimated_tss?: number | null;
    } | null;
  } | null;
}

interface UpcomingActivitiesCardProps {
  activities: UpcomingActivity[];
}

export function UpcomingActivitiesCard({ activities }: UpcomingActivitiesCardProps) {
  const navigateTo = useAppNavigate();

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
    navigateTo(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  };

  if (!activities || activities.length === 0) {
    return null;
  }

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="text-base font-semibold text-foreground">Upcoming Activities</Text>
      <View className="gap-3">
        {activities.map((activity, index) => {
          if (!activity.activity_plan) return null;

          const estimatedDuration =
            activity.activity_plan.authoritative_metrics?.estimated_duration;
          const estimatedTss = activity.activity_plan.authoritative_metrics?.estimated_tss;

          return (
            <View key={activity.id}>
              <TouchableOpacity
                onPress={() => handleActivityPress(activity.id)}
                activeOpacity={0.7}
              >
                <View className="flex-row items-center justify-between rounded-lg bg-muted/30 p-3">
                  <View className="mr-3 flex-1">
                    <View className="mb-2 flex-row items-center gap-2">
                      <Icon as={Calendar} size={14} className="text-muted-foreground" />
                      <Text className="text-sm font-medium text-muted-foreground">
                        {formatDate(activity.scheduled_date)}
                      </Text>
                    </View>

                    <Text className="mb-1 text-base font-semibold text-foreground">
                      {activity.activity_plan.name}
                    </Text>

                    <View className="flex-row items-center gap-3">
                      {typeof estimatedDuration === "number" ? (
                        <View className="flex-row items-center gap-1">
                          <Icon as={Clock} size={12} className="text-muted-foreground" />
                          <Text className="text-xs text-muted-foreground">
                            {formatDurationSec(estimatedDuration)}
                          </Text>
                        </View>
                      ) : null}
                      {typeof estimatedTss === "number" && estimatedTss > 0 ? (
                        <Text className="text-xs text-muted-foreground">
                          {Math.round(estimatedTss)} TSS
                        </Text>
                      ) : null}
                      <Text className="text-xs capitalize text-muted-foreground">
                        {formatActivityType(activity.activity_plan.activity_category)}
                      </Text>
                    </View>
                  </View>

                  <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
                </View>
              </TouchableOpacity>

              {index < activities.length - 1 ? <View className="my-1 h-px bg-border" /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
