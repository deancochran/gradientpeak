import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { format } from "date-fns";
import {
  Activity,
  Bike,
  CheckCircle2,
  Clock,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { getActivityColor } from "../utils/colors";
import { isActivityCompleted } from "../utils/dateGrouping";

interface PlannedActivityCardProps {
  activity: {
    id: string;
    scheduled_date: string;
    notes?: string;
    completed?: boolean;
    status?: string;
    activity_plan?: {
      id: string;
      name: string;
      activity_type: string;
      estimated_duration?: number;
      estimated_tss?: number;
      description?: string;
    };
  };
  onPress: (activityId: string) => void;
  compact?: boolean;
  showDate?: boolean;
}

const ACTIVITY_ICONS = {
  outdoor_run: Footprints,
  outdoor_bike: Bike,
  indoor_treadmill: Footprints,
  indoor_bike_trainer: Bike,
  indoor_strength: Dumbbell,
  indoor_swim: Waves,
  other: Activity,
};

/**
 * Format scheduled date to human-readable string
 */
function formatScheduledDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activityDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const diffDays = Math.floor(
    (activityDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return format(date, "EEEE"); // Day name
  }

  return format(date, "MMM d"); // "Jan 1"
}

/**
 * Format time from date string
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return format(date, "h:mm a"); // "2:30 PM"
}

/**
 * Get icon component for activity type
 */
function getActivityIcon(activityType: string | undefined) {
  if (!activityType) return Activity;
  return (
    ACTIVITY_ICONS[activityType as keyof typeof ACTIVITY_ICONS] || Activity
  );
}

/**
 * PlannedActivityCard Component
 * Displays a planned activity with details
 * Supports compact mode for dense layouts
 */
export function PlannedActivityCard({
  activity,
  onPress,
  compact = false,
  showDate = true,
}: PlannedActivityCardProps) {
  const activityType = activity.activity_plan?.activity_type || "other";
  const colorConfig = getActivityColor(activityType);
  const IconComponent = getActivityIcon(activityType);
  const completed = isActivityCompleted(activity);

  // Compact mode - minimal design
  if (compact) {
    return (
      <TouchableOpacity
        onPress={() => onPress(activity.id)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center p-3 bg-card rounded-lg border border-border">
          {/* Icon */}
          <View
            className={`w-8 h-8 ${colorConfig.iconBg} rounded-lg items-center justify-center mr-3`}
          >
            <Icon as={IconComponent} size={16} className="text-white" />
          </View>

          {/* Content */}
          <View className="flex-1">
            <Text className="font-medium text-sm" numberOfLines={1}>
              {activity.activity_plan?.name || "Unnamed Activity"}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              {activity.activity_plan?.estimated_duration && (
                <Text className="text-xs text-muted-foreground">
                  {activity.activity_plan.estimated_duration} min
                </Text>
              )}
              {showDate && (
                <Text className="text-xs text-muted-foreground">
                  • {formatScheduledDate(activity.scheduled_date)}
                </Text>
              )}
            </View>
          </View>

          {/* Status indicator */}
          {completed && (
            <Icon as={CheckCircle2} size={18} className="text-green-600 ml-2" />
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // Standard mode - full details
  return (
    <TouchableOpacity onPress={() => onPress(activity.id)} activeOpacity={0.7}>
      <Card className={completed ? "opacity-75" : ""}>
        <CardContent className="p-4">
          <View className="flex-row items-start">
            {/* Icon */}
            <View className="mr-3 mt-1">
              <View
                className={`w-10 h-10 ${colorConfig.iconBg} rounded-xl items-center justify-center`}
              >
                <Icon as={IconComponent} size={20} className="text-white" />
              </View>
            </View>

            {/* Content */}
            <View className="flex-1">
              {/* Header */}
              <View className="flex-row items-start justify-between mb-1">
                <Text
                  className={`text-base font-semibold flex-1 ${completed ? "line-through text-muted-foreground" : ""}`}
                  numberOfLines={2}
                >
                  {activity.activity_plan?.name || "Unnamed Activity"}
                </Text>
                {showDate && (
                  <View className="ml-2">
                    <Text className="text-sm font-medium text-primary">
                      {formatScheduledDate(activity.scheduled_date)}
                    </Text>
                    <Text className="text-xs text-muted-foreground text-right">
                      {formatTime(activity.scheduled_date)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Activity Type */}
              <Text
                className={`text-sm ${colorConfig.text} mb-2 capitalize`}
                numberOfLines={1}
              >
                {colorConfig.name}
              </Text>

              {/* Description */}
              {activity.activity_plan?.description && !activity.notes && (
                <Text
                  className="text-sm text-muted-foreground mb-2"
                  numberOfLines={2}
                >
                  {activity.activity_plan.description}
                </Text>
              )}

              {/* Notes */}
              {activity.notes && (
                <View className="bg-muted/50 p-2 rounded-lg mb-2">
                  <Text
                    className="text-sm text-muted-foreground italic"
                    numberOfLines={2}
                  >
                    {activity.notes}
                  </Text>
                </View>
              )}

              {/* Metadata */}
              <View className="flex-row items-center gap-4 flex-wrap">
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
                  <View className="bg-primary/10 px-2 py-0.5 rounded">
                    <Text className="text-xs text-primary font-medium">
                      {activity.activity_plan.estimated_tss} TSS
                    </Text>
                  </View>
                )}

                {completed && (
                  <View className="flex-row items-center">
                    <Icon
                      as={CheckCircle2}
                      size={14}
                      className="text-green-600 mr-1"
                    />
                    <Text className="text-xs text-green-600 font-medium">
                      Completed
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
