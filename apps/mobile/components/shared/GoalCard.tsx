import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Target } from "lucide-react-native";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceMetricsRow,
} from "./ResourceCardPrimitives";

export type MobileGoalCardData = {
  compactReadiness?: { status: "ready" | "watch" | "not_ready"; value: number } | null;
  compactSignals?: ReadonlyArray<{ label: string; value: string }>;
  id: string;
  objectiveSummary?: string | null;
  targetDate?: string | null;
  title: string;
  typeLabel?: string | null;
};

type GoalCardProps = {
  goal: MobileGoalCardData;
  onPress?: () => void;
  testID?: string;
  variant?: "default" | "compact";
};

function formatTargetDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return dateKey;
  }
  return format(date, "MMM d, yyyy");
}

export function GoalCard({ goal, onPress, testID, variant = "default" }: GoalCardProps) {
  const compact = variant === "compact";
  const metrics = [
    ...(compact && goal.compactReadiness !== undefined
      ? [
          {
            label: "Readiness",
            value:
              goal.compactReadiness === null ? "—" : `${Math.round(goal.compactReadiness.value)}%`,
          },
        ]
      : []),
    ...(compact ? (goal.compactSignals ?? []) : []),
    goal.typeLabel ? { label: "Goal type", value: goal.typeLabel } : null,
    goal.targetDate ? { label: "Target date", value: formatTargetDate(goal.targetDate) } : null,
  ].filter((metric): metric is { label: string; value: string } => metric !== null);

  return (
    <ResourceCardShell
      {...(onPress ? { accessibilityLabel: `Open goal ${goal.title}`, onPress } : {})}
      compact={compact}
      contentClassName={compact ? "gap-3 px-2" : "gap-3 px-3"}
      testID={testID ?? `goal-card-${goal.id}`}
    >
      <ResourceCardHeader
        compact={compact}
        {...(goal.objectiveSummary !== undefined ? { description: goal.objectiveSummary } : {})}
        descriptionFallback="A target on your training timeline."
        {...(compact ? { descriptionNumberOfLines: 2 } : {})}
        icon={Target}
        iconClassName="text-amber-600"
        iconContainerClassName="bg-amber-500/15"
        title={goal.title}
        titleFallback="Untitled goal"
      />
      {metrics.length > 0 ? (
        <ResourceMetricsRow
          compact={compact}
          maxItems={compact ? 4 : 2}
          metrics={metrics}
          testID="goal-card-metrics"
        />
      ) : (
        <Text className="text-xs text-muted-foreground">Goal</Text>
      )}
    </ResourceCardShell>
  );
}
