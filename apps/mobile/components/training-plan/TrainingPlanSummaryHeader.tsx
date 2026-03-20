import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import React from "react";
import { View } from "react-native";

type TrainingPlanSummaryVariant = "compact" | "default";

interface TrainingPlanSummaryHeaderProps {
  title: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  activeLabel?: string;
  inactiveLabel?: string;
  variant?: TrainingPlanSummaryVariant;
  showStatusDot?: boolean;
  rightAccessory?: React.ReactNode;
  formatStartedDate?: (date: Date) => string;
}

const titleClassByVariant: Record<TrainingPlanSummaryVariant, string> = {
  compact: "font-semibold text-lg mb-1",
  default: "text-2xl font-bold mb-2",
};

const descriptionClassByVariant: Record<TrainingPlanSummaryVariant, string> = {
  compact: "text-sm text-muted-foreground mb-2",
  default: "text-base text-muted-foreground mb-3",
};

export function TrainingPlanSummaryHeader({
  title,
  description,
  isActive,
  createdAt,
  activeLabel = "Active",
  inactiveLabel = "Paused",
  variant = "default",
  showStatusDot = false,
  rightAccessory,
  formatStartedDate,
}: TrainingPlanSummaryHeaderProps) {
  const startedAt = new Date(createdAt);
  const startedDate = formatStartedDate
    ? formatStartedDate(startedAt)
    : startedAt.toLocaleDateString();
  const statusLabel = isActive ? activeLabel : inactiveLabel;

  return (
    <View className="flex-row items-start justify-between mb-3">
      <View className="flex-1">
        <Text className={titleClassByVariant[variant]}>{title}</Text>
        {description ? (
          <Text className={descriptionClassByVariant[variant]}>
            {description}
          </Text>
        ) : null}

        {showStatusDot ? (
          <View className="flex-row items-center gap-4 mb-2">
            <View className="flex-row items-center gap-1.5">
              <View
                className={cn(
                  "w-2 h-2 rounded-full",
                  isActive ? "bg-green-500" : "bg-orange-500",
                )}
              />
              <Text className="text-sm text-muted-foreground">
                {statusLabel}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              Started {startedDate}
            </Text>
          </View>
        ) : (
          <Text className="text-xs text-muted-foreground">
            {statusLabel} • Started {startedDate}
          </Text>
        )}
      </View>

      {rightAccessory}
    </View>
  );
}
