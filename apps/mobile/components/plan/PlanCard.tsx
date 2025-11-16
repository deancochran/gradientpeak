import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getActivityConfig } from "@/lib/constants/activities";
import { formatDuration } from "@/lib/utils/dates";
import { Clock } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

export interface PlanCardData {
  id: string;
  name: string;
  description?: string | null;
  activityType: string;
  estimatedDuration?: number | null; // in minutes
  estimatedTss?: number | null;
  stepCount?: number;
  profileId?: string | null;
  isOwned?: boolean;
}

interface PlanCardProps {
  plan: PlanCardData;
  onPress?: (id: string) => void;
  onSchedule?: (id: string) => void;
  showScheduleButton?: boolean;
  compact?: boolean;
}

export function PlanCard({
  plan,
  onPress,
  onSchedule,
  showScheduleButton = false,
  compact = false,
}: PlanCardProps) {
  const config = getActivityConfig(plan.activityType);
  const isUserPlan = plan.isOwned ?? !!plan.profileId;

  return (
    <TouchableOpacity
      onPress={() => onPress?.(plan.id)}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <Card>
        <CardContent className={`p-4 ${compact ? "py-3" : ""}`}>
          <View className="flex-row items-start gap-3">
            {/* Icon */}
            <View
              className={`w-11 h-11 rounded-full ${config.bgColor} items-center justify-center shrink-0 ${compact ? "w-9 h-9" : ""}`}
            >
              <Icon
                as={config.icon}
                size={compact ? 18 : 20}
                className={config.color}
              />
            </View>

            {/* Content */}
            <View className="flex-1 min-w-0">
              {/* Title Row */}
              <View className="flex-row items-start justify-between gap-2 mb-1">
                <Text
                  className={`font-semibold flex-1 ${compact ? "text-sm" : "text-base"}`}
                  numberOfLines={2}
                >
                  {plan.name}
                </Text>
                {isUserPlan && (
                  <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                    <Text className="text-xs text-primary font-medium">
                      Yours
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

              {/* Description */}
              {plan.description && !compact && (
                <Text
                  className="text-sm text-muted-foreground mb-3"
                  numberOfLines={2}
                >
                  {plan.description}
                </Text>
              )}

              {/* Metadata Row */}
              <View className="flex-row items-center gap-3 flex-wrap">
                {plan.estimatedDuration && (
                  <View className="flex-row items-center">
                    <Icon
                      as={Clock}
                      size={14}
                      className="text-muted-foreground mr-1"
                    />
                    <Text
                      className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
                    >
                      {formatDuration(plan.estimatedDuration)}
                    </Text>
                  </View>
                )}

                {plan.estimatedTss && (
                  <Text
                    className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
                  >
                    TSS {Math.round(plan.estimatedTss)}
                  </Text>
                )}

                {plan.stepCount !== undefined && plan.stepCount > 0 && (
                  <Text
                    className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
                  >
                    {plan.stepCount} {plan.stepCount === 1 ? "step" : "steps"}
                  </Text>
                )}
              </View>

              {/* Schedule Button */}
              {showScheduleButton && onSchedule && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onSchedule(plan.id);
                  }}
                  className="mt-3 bg-primary px-4 py-2 rounded-lg self-start"
                  activeOpacity={0.7}
                >
                  <Text className="text-primary-foreground font-medium text-sm">
                    Schedule
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
