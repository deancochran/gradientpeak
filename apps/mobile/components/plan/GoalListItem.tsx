import { Text } from "@repo/ui/components/text";
import { Activity, Bike, Dumbbell, Footprints, Waves } from "lucide-react-native";
import { View } from "react-native";
import { ResourceCardHeader, ResourceCardShell } from "@/components/shared/ResourceCardPrimitives";
import { GoalReadinessRing } from "./GoalReadinessRing";

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

export function getActivityCategoryIcon(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("run")) return Footprints;
  if (normalized.includes("bike") || normalized.includes("cycling")) return Bike;
  if (normalized.includes("swim")) return Waves;
  if (normalized.includes("strength")) return Dumbbell;
  return Activity;
}

export function GoalListItem({
  goal,
  label,
  status,
  readinessPercent,
  readinessTarget,
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
  const ActivityIcon = getActivityCategoryIcon(goal.activity_category);
  const categoryLabel = formatActivityCategory(goal.activity_category);
  const meta = [formatGoalTargetDate(goal.target_date), status].filter(Boolean).join(" · ");

  return (
    <ResourceCardShell compact onPress={onPress} testID={testID}>
      <ResourceCardHeader
        compact
        accessory={
          readinessPercent !== undefined ? (
            <GoalReadinessRing value={readinessPercent} target={readinessTarget} />
          ) : null
        }
        icon={ActivityIcon}
        iconClassName="text-muted-foreground"
        iconContainerClassName="bg-muted"
        meta={
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              {label ? (
                <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </Text>
              ) : null}
              <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
                {categoryLabel}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {meta}
            </Text>
          </View>
        }
        title={goal.title}
        titleClassName="text-base font-semibold text-foreground"
        titleFallback="Untitled goal"
        titleNumberOfLines={1}
      />
    </ResourceCardShell>
  );
}
