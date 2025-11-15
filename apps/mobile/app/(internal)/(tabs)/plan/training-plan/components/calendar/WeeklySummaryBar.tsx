import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  AlertCircle,
  CheckCircle2,
  Target,
  TrendingUp,
} from "lucide-react-native";
import { View } from "react-native";

interface WeeklySummaryBarProps {
  completedTSS: number;
  plannedTSS: number;
  targetTSS: number;
  completedActivities: number;
  totalPlannedActivities: number;
  status: "on_track" | "behind" | "ahead" | "warning";
}

const statusConfig = {
  on_track: {
    label: "On Track",
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  behind: {
    label: "Behind Schedule",
    icon: AlertCircle,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  ahead: {
    label: "Ahead of Schedule",
    icon: TrendingUp,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  warning: {
    label: "At Risk",
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

/**
 * Weekly summary bar showing aggregate metrics for the current week
 * Displays TSS progress, activity completion, and overall status
 */
export function WeeklySummaryBar({
  completedTSS,
  plannedTSS,
  targetTSS,
  completedActivities,
  totalPlannedActivities,
  status,
}: WeeklySummaryBarProps) {
  const statusInfo = statusConfig[status];

  // Calculate progress percentages
  const tssProgress = targetTSS > 0 ? (completedTSS / targetTSS) * 100 : 0;
  const activityProgress =
    totalPlannedActivities > 0
      ? (completedActivities / totalPlannedActivities) * 100
      : 0;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        {/* Status Indicator */}
        <View className={`${statusInfo.bgColor} rounded-lg p-3 mb-4`}>
          <View className="flex-row items-center justify-center gap-2">
            <Icon as={statusInfo.icon} size={18} className={statusInfo.color} />
            <Text className={`font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        {/* Metrics Grid */}
        <View className="flex-row gap-3">
          {/* TSS Progress */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon as={Target} size={14} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground font-medium">
                TSS Progress
              </Text>
            </View>

            {/* Progress Bar */}
            <View className="bg-muted rounded-full h-2 overflow-hidden mb-2">
              <View
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(tssProgress, 100)}%` }}
              />
            </View>

            {/* Numbers */}
            <View className="flex-row items-baseline gap-1">
              <Text className="text-lg font-bold">
                {Math.round(completedTSS)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                / {Math.round(targetTSS)}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {Math.round(tssProgress)}% complete
            </Text>
          </View>

          {/* Divider */}
          <View className="w-px bg-border" />

          {/* Activity Completion */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon
                as={CheckCircle2}
                size={14}
                className="text-muted-foreground"
              />
              <Text className="text-xs text-muted-foreground font-medium">
                Activities
              </Text>
            </View>

            {/* Progress Bar */}
            <View className="bg-muted rounded-full h-2 overflow-hidden mb-2">
              <View
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(activityProgress, 100)}%` }}
              />
            </View>

            {/* Numbers */}
            <View className="flex-row items-baseline gap-1">
              <Text className="text-lg font-bold">{completedActivities}</Text>
              <Text className="text-xs text-muted-foreground">
                / {totalPlannedActivities}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground mt-0.5">
              {totalPlannedActivities > 0 ? Math.round(activityProgress) : 0}%
              complete
            </Text>
          </View>
        </View>

        {/* Additional Info */}
        {plannedTSS > completedTSS && (
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-xs text-muted-foreground text-center">
              {Math.round(plannedTSS - completedTSS)} TSS remaining this week
            </Text>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
