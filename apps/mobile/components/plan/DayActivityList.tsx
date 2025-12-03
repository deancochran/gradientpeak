import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { format } from "date-fns";
import { Calendar, Clock, Flame, Plus } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface Activity {
  id: string;
  scheduled_date: string;
  activity_plan?: {
    name?: string;
    estimated_duration?: number;
    activity_category?: string;
  };
  completed_activity_id?: string | null;
}

interface DayActivityListProps {
  selectedDate: Date;
  activities: Activity[];
  isToday: boolean;
  isPast: boolean;
  onActivityPress: (id: string) => void;
  onStartActivity: (activity: Activity) => void;
  onScheduleActivity: () => void;
  getActivityBgClass: (type?: string) => string;
  isActivityCompleted: (activity: Activity) => boolean;
}

export function DayActivityList({
  selectedDate,
  activities,
  isToday,
  isPast,
  onActivityPress,
  onStartActivity,
  onScheduleActivity,
  getActivityBgClass,
  isActivityCompleted,
}: DayActivityListProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground">
          {isToday
            ? "Today's Activity"
            : format(selectedDate, "EEEE, MMM d")}
        </Text>
        {activities.length > 0 && (
          <Text className="text-sm text-muted-foreground">
            {activities.length}{" "}
            {activities.length === 1 ? "activity" : "activities"}
          </Text>
        )}
      </View>

      {activities.length > 0 ? (
        activities.map((activity: Activity) => (
          <TouchableOpacity
            key={activity.id}
            onPress={() => onActivityPress(activity.id)}
            activeOpacity={0.7}
          >
            <Card
              className={`${
                isActivityCompleted(activity)
                  ? "border-green-500/30 bg-green-50/50"
                  : "border-border"
              }`}
            >
              <CardContent className="p-0">
                <View className="flex-row items-center p-4 gap-3">
                  <View
                    className={`w-14 h-14 ${getActivityBgClass(activity.activity_plan?.activity_category)} rounded-xl items-center justify-center`}
                  >
                    <Icon
                      as={Flame}
                      size={28}
                      className="text-primary-foreground"
                    />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-start justify-between mb-1">
                      <Text
                        className={`font-bold text-base flex-1 ${
                          isActivityCompleted(activity)
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {activity.activity_plan?.name || "Activity"}
                      </Text>
                      <View className="bg-yellow-50 px-2 py-1 rounded-full ml-2">
                        <Text className="text-xs font-medium text-yellow-600">
                          Moderate
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-3 mb-3">
                      <View className="flex-row items-center gap-1">
                        <Icon
                          as={Clock}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-sm text-muted-foreground">
                          {activity.activity_plan?.estimated_duration || 0} min
                        </Text>
                      </View>
                      {activity.activity_plan?.activity_category && (
                        <Text className="text-sm text-muted-foreground capitalize">
                          {activity.activity_plan.activity_category.replace(
                            /_/g,
                            " ",
                          )}
                        </Text>
                      )}
                    </View>

                    {isToday && !isActivityCompleted(activity) && (
                      <Button
                        size="sm"
                        onPress={() => onStartActivity(activity)}
                        className="self-start"
                      >
                        <Text className="text-primary-foreground font-semibold">
                          Start Activity
                        </Text>
                      </Button>
                    )}

                    {isActivityCompleted(activity) && (
                      <View className="flex-row items-center gap-1">
                        <View className="w-2 h-2 bg-green-500 rounded-full" />
                        <Text className="text-sm text-green-600 font-medium">
                          Completed
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>
        ))
      ) : (
        <Card className="border-border">
          <CardContent className="p-6 items-center">
            <Icon as={Calendar} size={48} className="text-muted-foreground" />
            <Text className="text-lg font-semibold text-foreground mb-1">
              {isPast ? "Rest Day" : "No Activity Scheduled"}
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-4">
              {isPast
                ? "You rested on this day"
                : isToday
                  ? "No activities scheduled for today"
                  : "No activities scheduled for this date"}
            </Text>
            {!isPast && (
              <Button
                variant="outline"
                size="sm"
                onPress={onScheduleActivity}
              >
                <Icon as={Plus} size={16} className="mr-2" />
                <Text>Schedule Activity</Text>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </View>
  );
}
