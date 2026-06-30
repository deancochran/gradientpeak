import type { PlanningGoal } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Flag, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

type PlanningGoalCardProps = {
  goal: Pick<
    PlanningGoal,
    "activityCategory" | "objective" | "priority" | "targetDate" | "targetOffsetDays" | "title"
  >;
  onPress?: () => void;
  onRemove?: () => void;
  testID?: string;
  variant?: "default" | "compact";
};

export function PlanningGoalCard({
  goal,
  onPress,
  onRemove,
  testID,
  variant = "default",
}: PlanningGoalCardProps) {
  const compact = variant === "compact";
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      className={`${compact ? "rounded-xl px-3 py-3" : "rounded-2xl px-4 py-4"} border border-border bg-card`}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Flag size={14} className="text-primary" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
            {goal.title || "Untitled goal"}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {formatGoalMeta(goal)}
          </Text>
        </View>
        {onRemove ? (
          <Button
            accessibilityLabel="Remove training plan goal"
            className="h-8 w-8 p-0"
            size="sm"
            variant="ghost"
            onPress={onRemove}
          >
            <X size={14} className="text-muted-foreground" />
          </Button>
        ) : null}
      </View>
    </Pressable>
  );
}

function formatGoalMeta(goal: PlanningGoalCardProps["goal"]) {
  const parts = [
    goal.activityCategory ? formatCategory(goal.activityCategory) : "Any sport",
    goal.targetDate ??
      (goal.targetOffsetDays !== null && goal.targetOffsetDays !== undefined
        ? `Week ${Math.floor(goal.targetOffsetDays / 7) + 1}`
        : null),
    goal.objective?.type ? formatObjective(goal.objective.type) : null,
    `Priority ${goal.priority}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function formatCategory(category: string) {
  if (category === "run") return "Run";
  if (category === "bike") return "Bike";
  if (category === "swim") return "Swim";
  return "Other";
}

function formatObjective(objective: string) {
  if (objective === "event_performance") return "Performance";
  if (objective === "completion") return "Completion";
  if (objective === "threshold") return "Threshold";
  if (objective === "consistency") return "Consistency";
  return objective;
}
