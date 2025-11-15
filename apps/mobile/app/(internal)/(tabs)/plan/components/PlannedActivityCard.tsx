import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Activity,
  Bike,
  Clock,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

interface PlannedActivityCardProps {
  activity: {
    id: string;
    scheduled_date: string;
    notes?: string;
    activity_plan?: {
      id: string;
      name: string;
      activity_type: string;
      estimated_duration?: number;
      estimated_tss?: number;
    };
  };
  onPress: (activityId: string) => void;
}

const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength Training",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other Activity", icon: Activity, color: "text-gray-600" },
};

export function PlannedActivityCard({
  activity,
  onPress,
}: PlannedActivityCardProps) {
  const config =
    ACTIVITY_CONFIGS[
      activity.activity_plan?.activity_type as keyof typeof ACTIVITY_CONFIGS
    ] || ACTIVITY_CONFIGS.other;

  // Format the scheduled date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow =
      date.toDateString() ===
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();

    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(activity.id)}
      className="active:opacity-70"
    >
      <Card>
        <CardContent className="p-4">
          <View className="flex-row items-start">
            {/* Icon */}
            <View className="mr-3 mt-1">
              <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                <Icon as={config.icon} size={20} className={config.color} />
              </View>
            </View>

            {/* Content */}
            <View className="flex-1">
              {/* Header */}
              <View className="flex-row items-start justify-between mb-1">
                <Text className="text-lg font-semibold flex-1">
                  {activity.activity_plan?.name || "Unnamed Activity"}
                </Text>
                <Text className="text-sm font-medium text-primary">
                  {formatDate(activity.scheduled_date)}
                </Text>
              </View>

              {/* Time */}
              <Text className="text-sm text-muted-foreground mb-2">
                {formatTime(activity.scheduled_date)}
              </Text>

              {/* Activity Type */}
              <Text className="text-sm text-muted-foreground mb-2">
                {config.name}
              </Text>

              {/* Notes */}
              {activity.notes && (
                <Text
                  className="text-sm text-muted-foreground mb-2"
                  numberOfLines={2}
                >
                  {activity.notes}
                </Text>
              )}

              {/* Metadata */}
              <View className="flex-row items-center gap-4">
                {activity.activity_plan?.estimated_duration && (
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={14}
                      className="text-muted-foreground mr-1"
                    />
                    <Text className="text-xs text-muted-foreground">
                      {activity.activity_plan.estimated_duration} min
                    </Text>
                  </View>
                )}

                {activity.activity_plan?.estimated_tss && (
                  <Text className="text-xs text-muted-foreground">
                    TSS: {activity.activity_plan.estimated_tss}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
