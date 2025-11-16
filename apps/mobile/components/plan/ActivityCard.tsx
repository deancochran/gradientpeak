import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getActivityConfig } from "@/lib/constants/activities";
import { formatDuration, formatTime } from "@/lib/utils/dates";
import { Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

export interface ActivityCardData {
  id: string;
  name: string;
  activityType: string;
  duration?: number; // in minutes
  tss?: number;
  scheduledDate?: string;
  notes?: string;
  status?: "scheduled" | "completed" | "warning" | "violation";
}

interface ActivityCardProps {
  activity: ActivityCardData;
  onPress?: (id: string) => void;
  onLongPress?: (id: string, status: ActivityCardData["status"]) => void;
  showDate?: boolean;
  compact?: boolean;
}

export function ActivityCard({
  activity,
  onPress,
  onLongPress,
  showDate = false,
  compact = false,
}: ActivityCardProps) {
  const config = getActivityConfig(activity.activityType);

  const statusColors = {
    scheduled: "bg-muted/30",
    completed: "bg-green-50 border-green-200",
    warning: "bg-orange-50 border-orange-200",
    violation: "bg-red-50 border-red-200",
  };

  const statusTextColors = {
    scheduled: "text-muted-foreground",
    completed: "text-green-700",
    warning: "text-orange-700",
    violation: "text-red-700",
  };

  const cardBgClass = activity.status
    ? statusColors[activity.status]
    : "bg-muted/30";

  const CardWrapper = onPress || onLongPress ? TouchableOpacity : View;

  return (
    <CardWrapper
      onPress={() => onPress?.(activity.id)}
      onLongPress={() => onLongPress?.(activity.id, activity.status)}
      activeOpacity={onPress || onLongPress ? 0.7 : 1}
    >
      <Card>
        <CardContent className={`p-4 ${compact ? "py-3" : ""}`}>
          <View className="flex-row items-start gap-3">
            {/* Icon */}
            <View
              className={`w-10 h-10 rounded-full ${config.bgColor} items-center justify-center shrink-0 ${compact ? "w-8 h-8" : ""}`}
            >
              <Icon
                as={config.icon}
                size={compact ? 16 : 20}
                className={config.color}
              />
            </View>

            {/* Content */}
            <View className="flex-1 min-w-0">
              {/* Header Row */}
              <View className="flex-row items-start justify-between gap-2 mb-1">
                <Text
                  className={`font-semibold flex-1 ${compact ? "text-sm" : "text-base"}`}
                  numberOfLines={2}
                >
                  {activity.name}
                </Text>

                {activity.status && activity.status !== "scheduled" && (
                  <View
                    className={`px-2 py-0.5 rounded-full ${cardBgClass} border`}
                  >
                    <Text
                      className={`text-xs font-medium ${statusTextColors[activity.status]}`}
                    >
                      {activity.status === "completed"
                        ? "Done"
                        : activity.status === "warning"
                          ? "Warning"
                          : "Conflict"}
                    </Text>
                  </View>
                )}
              </View>

              {/* Activity Type */}
              <Text
                className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"} mb-2`}
              >
                {config.name}
              </Text>

              {/* Date/Time (if applicable) */}
              {showDate && activity.scheduledDate && (
                <Text
                  className={`text-primary font-medium mb-2 ${compact ? "text-xs" : "text-sm"}`}
                >
                  {formatTime(activity.scheduledDate)}
                </Text>
              )}

              {/* Notes (if provided) */}
              {activity.notes && !compact && (
                <Text
                  className="text-sm text-muted-foreground mb-2"
                  numberOfLines={2}
                >
                  {activity.notes}
                </Text>
              )}

              {/* Metadata Row */}
              <View className="flex-row items-center gap-4 flex-wrap">
                {activity.duration !== undefined && activity.duration > 0 && (
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={14}
                      className="text-muted-foreground mr-1"
                    />
                    <Text
                      className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
                    >
                      {formatDuration(activity.duration)}
                    </Text>
                  </View>
                )}

                {activity.tss !== undefined && activity.tss > 0 && (
                  <Text
                    className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
                  >
                    TSS: {Math.round(activity.tss)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
