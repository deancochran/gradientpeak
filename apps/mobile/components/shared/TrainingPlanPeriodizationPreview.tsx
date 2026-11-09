import type { TrainingPlanScheduleVisualModel } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

type TrainingPlanPeriodizationPreviewProps = {
  compact?: boolean;
  model: TrainingPlanScheduleVisualModel;
  testID?: string;
};

function formatSessionCount(count: number) {
  return `${count} scheduled session${count === 1 ? "" : "s"}`;
}

export function TrainingPlanPeriodizationPreview({
  compact = false,
  model,
  testID,
}: TrainingPlanPeriodizationPreviewProps) {
  const summary = `${formatSessionCount(model.totalSessions)} · ${model.totalWeeks} week${model.totalWeeks === 1 ? "" : "s"}`;
  const accessibilityLabel = `Plan schedule. ${formatSessionCount(model.totalSessions)} across ${model.totalWeeks} weeks. Bar height shows scheduled sessions per week; empty weeks have a baseline only. This is not athlete-specific training load.`;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      className={`overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 ${compact ? "gap-1.5 px-2.5 py-2" : "gap-2 px-3 py-3"}`}
      testID={testID ?? "training-plan-periodization-preview"}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-medium text-foreground">Plan schedule</Text>
        <Text className="text-xs text-muted-foreground">{summary}</Text>
      </View>

      <View
        className={`flex-row items-end ${model.totalWeeks > 20 ? "gap-0" : "gap-1"} ${compact ? "h-20" : "h-28"}`}
      >
        {model.weeks.map((week) => {
          const isEmpty = week.plannedSessionCount === 0;

          return (
            <View
              className="flex-1 items-center justify-end"
              key={`training-plan-week-${week.weekIndex}`}
              testID={`training-plan-visual-week-${week.weekIndex}`}
            >
              {week.hasAuthoredGoal ? (
                <View
                  className="mb-1 h-2 w-2 rounded-full bg-amber-400"
                  testID={`training-plan-visual-goal-${week.weekIndex}`}
                />
              ) : (
                <View className="mb-1 h-2 w-0.5 opacity-0" />
              )}
              <View className="w-full flex-1 items-center justify-end">
                {isEmpty ? (
                  <View
                    className="h-0.5 w-full rounded-full bg-border/70"
                    testID={`training-plan-visual-empty-${week.weekIndex}`}
                  />
                ) : (
                  <View
                    className="w-full overflow-hidden rounded-t-lg border-x border-t border-primary/30 bg-primary/20"
                    style={{ height: `${(compact ? 12 : 10) + week.relativeSessionVolume * 82}%` }}
                    testID={`training-plan-visual-bar-${week.weekIndex}`}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {compact ? null : (
        <Text className="text-xs text-muted-foreground">
          Bars show scheduled sessions per week. Empty weeks use a baseline only; this is not
          personalized training load.
        </Text>
      )}
    </View>
  );
}
