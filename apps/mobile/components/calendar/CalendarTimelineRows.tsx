import type { CalendarProjectionItem, SemanticMetric } from "@repo/core";
import type { PreferredUnitSystem } from "@repo/core/units";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarDays, Check, Target, Users } from "lucide-react-native";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { getActivityCategoryConfig } from "@/lib/constants/activities";
import { formatDistanceMeters } from "@/lib/display/formatters";
import { formatEstimatedDurationSeconds } from "@/lib/estimatedMetrics";
import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import type { DayRow } from "./CalendarTimelineModel";

type DayHeaderRowProps = {
  row: DayRow;
  onPressDay: (dateKey: string) => void;
  selectedDateKey: string;
  todayKey: string;
};

export type CalendarScheduleObjectCardProps = {
  object: CalendarProjectionItem;
  onPress?: (item: CalendarProjectionItem) => void;
  testIDPrefix?: string;
};

function formatDayDateLabel(dateKey: string) {
  return format(parseDateKey(dateKey), "MMM d");
}

function formatDayRelativeLabel(dateKey: string, todayKey: string) {
  const difference = differenceInCalendarDays(parseDateKey(dateKey), parseDateKey(todayKey));
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference === -1) return "Yesterday";
  return format(parseDateKey(dateKey), "EEEE");
}

function formatTime(item: CalendarProjectionItem) {
  if (item.timing.allDay) return "All day";
  if (!item.timing.startsAt) return "Scheduled";
  const startsAt = new Date(item.timing.startsAt);
  if (Number.isNaN(startsAt.getTime())) return "Scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: item.timing.timezone,
    }).format(startsAt);
  } catch {
    return format(startsAt, "h:mm a");
  }
}

function formatMetric(
  metric: SemanticMetric,
  preferredUnitSystem: PreferredUnitSystem,
  estimated: boolean,
) {
  if (metric.status === "unavailable") return `${metric.label} unavailable`;
  let value: string;
  if (metric.unit === "meters") {
    value = formatDistanceMeters(metric.value, { preferredUnitSystem, fallback: "" });
  } else if (metric.unit === "seconds") {
    value = estimated
      ? (formatEstimatedDurationSeconds(metric.value) ?? "Unavailable")
      : `${Math.round(metric.value / 60)} min`;
  } else if (metric.unit === "ratio") {
    value = metric.value.toFixed(2);
  } else {
    value = Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1);
  }
  return `${metric.label} ${value}${metric.status === "partial" ? " · Incomplete" : ""}`;
}

function itemLabel(item: CalendarProjectionItem) {
  if (item.kind === "completed_activity") return "Done";
  if (item.kind === "planned_activity") {
    if (item.status === "cancelled") return "Cancelled";
    if (item.status === "expired") return "Unverified";
    return "Activity plan";
  }
  if (item.kind === "group_event") return "Group event";
  if (item.kind === "goal") return "Goal";
  return "Event";
}

function itemIcon(item: CalendarProjectionItem) {
  if (item.kind === "goal") return Target;
  if (item.kind === "group_event") return Users;
  if (item.kind === "completed_activity") return Check;
  if (item.plan) return getActivityCategoryConfig(item.plan.activityCategory).icon;
  return CalendarDays;
}

function itemSubtitle(item: CalendarProjectionItem, preferredUnitSystem: PreferredUnitSystem) {
  const context =
    item.kind === "goal"
      ? item.goal?.objectiveSummary
      : item.kind === "group_event"
        ? item.groupEvent?.group.name
        : item.subtitle;
  const metrics = item.metrics
    .slice(0, 3)
    .map((metric) => formatMetric(metric, preferredUnitSystem, item.estimated));
  return [context, ...metrics].filter((part): part is string => Boolean(part)).join(" · ");
}

export const CalendarDayHeaderRow = memo(
  function CalendarDayHeaderRow({ row, onPressDay, selectedDateKey, todayKey }: DayHeaderRowProps) {
    const isSelected = selectedDateKey === row.dateKey;
    return (
      <TouchableOpacity
        onPress={() => onPressDay(row.dateKey)}
        className="bg-background px-5 pb-3 pt-6"
        activeOpacity={0.85}
        testID={`calendar-day-row-${row.dateKey}`}
        accessibilityRole="button"
        accessibilityLabel={`${formatDayDateLabel(row.dateKey)}, ${formatDayRelativeLabel(row.dateKey, todayKey)}`}
      >
        <View className="gap-4">
          <View className="flex-row items-baseline gap-3">
            <Text
              className={`text-2xl font-bold tracking-tight ${isSelected ? "text-primary" : "text-foreground"}`}
            >
              {formatDayDateLabel(row.dateKey)}
            </Text>
            <Text
              className={`text-xl font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}
            >
              {formatDayRelativeLabel(row.dateKey, todayKey)}
            </Text>
          </View>
          {row.itemCount === 0 ? (
            <Text className="text-sm text-muted-foreground">No scheduled activity</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  },
  (previous, next) =>
    previous.row === next.row &&
    previous.onPressDay === next.onPressDay &&
    previous.todayKey === next.todayKey &&
    (previous.selectedDateKey === previous.row.dateKey) ===
      (next.selectedDateKey === next.row.dateKey),
);

export const CalendarScheduleObjectCard = memo(function CalendarScheduleObjectCard({
  object,
  onPress,
  testIDPrefix = "calendar",
}: CalendarScheduleObjectCardProps) {
  const preferredUnitSystem = usePreferredUnitSystem();
  const subtitle = itemSubtitle(object, preferredUnitSystem);
  const IconComponent = itemIcon(object);
  const testKind =
    object.kind === "completed_activity"
      ? "activity"
      : object.kind === "group_event"
        ? "group-event"
        : object.kind;
  return (
    <TouchableOpacity
      onPress={() => onPress?.(object)}
      className="mx-5 mb-2 flex-row items-center gap-3 rounded-lg bg-muted/30 px-3 py-3"
      activeOpacity={0.85}
      disabled={!onPress}
      testID={`${testIDPrefix}-${testKind}-row-${object.id}`}
      accessible
      accessibilityLabel={`${itemLabel(object)}, ${object.title}${subtitle ? `, ${subtitle}` : ""}`}
    >
      <Icon as={IconComponent} size={14} className="text-muted-foreground" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {itemLabel(object)}
          </Text>
          <Text className="text-[11px] text-muted-foreground">•</Text>
          <Text className="text-[11px] text-muted-foreground">{formatTime(object)}</Text>
        </View>
        <Text className="mt-0.5 text-sm font-medium text-foreground" numberOfLines={1}>
          {object.title}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export const CalendarScheduleObjectRow = memo(function CalendarScheduleObjectRow({
  object,
  onPress,
}: {
  object: CalendarProjectionItem;
  onPress: (item: CalendarProjectionItem) => void;
}) {
  return <CalendarScheduleObjectCard object={object} onPress={onPress} />;
});
