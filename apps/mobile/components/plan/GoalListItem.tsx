import { GoalCard } from "@/components/shared/GoalCard";
import { omitUndefined } from "@/lib/omitUndefined";

type GoalListItemGoal = {
  id: string;
  title: string;
  target_date?: string | null;
  activity_category?: string | null;
};

export function formatGoalTargetDate(value: string | null | undefined) {
  if (!value) return "No target date";
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatActivityCategory(value: string | null | undefined) {
  if (!value) return "Activity";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function GoalListItem({
  goal,
  label,
  status,
  readinessPercent,
  readinessTarget: _readinessTarget,
  onPress,
  testID,
}: {
  goal: GoalListItemGoal;
  label?: string;
  status?: string;
  readinessPercent?: number | null;
  readinessTarget?: number | null;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <GoalCard
      goal={omitUndefined({
        id: goal.id,
        objectiveSummary: label ?? status ?? undefined,
        targetDate: goal.target_date,
        title: goal.title,
        typeLabel: formatActivityCategory(goal.activity_category),
        ...(typeof readinessPercent !== "number"
          ? {}
          : {
              compactSignals: [{ label: "Readiness", value: `${Math.round(readinessPercent)}%` }],
            }),
      })}
      onPress={onPress}
      {...omitUndefined({ testID })}
      variant="compact"
    />
  );
}
