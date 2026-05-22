import { formatGoalTypeLabel, getGoalObjectiveSummary, type ProfileGoal } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { differenceInCalendarDays, format } from "date-fns";
import { Target, Users } from "lucide-react-native";
import { memo } from "react";
import { TouchableOpacity, View } from "react-native";
import { parseDateKey } from "@/lib/calendar/dateMath";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";
import {
  formatEstimatedDurationSeconds,
  formatEstimatedIntensityFactor,
  formatEstimatedTss,
} from "@/lib/estimatedMetrics";
import type { CalendarActivity, CalendarScheduleObject, DayRow } from "./CalendarTimelineModel";

type DayHeaderRowProps = {
  row: DayRow;
  onPressDay: (dateKey: string) => void;
  selectedDateKey: string;
  todayKey: string;
};

type ScheduleObjectRowProps = {
  object: CalendarScheduleObject;
  onPressActivity: (activity: CalendarActivity) => void;
  onPressEvent: (event: CalendarEvent) => void;
  onPressGroupEvent: (event: CalendarGroupEvent) => void;
  onPressGoal: (goal: ProfileGoal) => void;
};

export type CalendarScheduleObjectCardProps = {
  object: CalendarScheduleObject;
  onPressActivity?: (activity: CalendarActivity) => void;
  onPressEvent?: (event: CalendarEvent) => void;
  onPressGroupEvent?: (event: CalendarGroupEvent) => void;
  onPressGoal?: (goal: ProfileGoal) => void;
  testIDPrefix?: string;
};

function formatDayDateLabel(dateKey: string) {
  return format(parseDateKey(dateKey), "MMM d");
}

function formatDayRelativeLabel(dateKey: string, todayKey: string) {
  const difference = differenceInCalendarDays(parseDateKey(dateKey), parseDateKey(todayKey));

  if (difference === 0) {
    return "Today";
  }
  if (difference === 1) {
    return "Tomorrow";
  }
  if (difference === -1) {
    return "Yesterday";
  }

  return format(parseDateKey(dateKey), "EEEE");
}

function readMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatDuration(seconds: number | null) {
  if (!seconds) {
    return null;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatDistanceMeters(meters: number | null | undefined) {
  if (!meters || meters <= 0) {
    return null;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function getActivityDerivedMetric(activity: CalendarActivity, key: "tss" | "intensity_factor") {
  return activity.derived?.[key] ?? activity.derived?.stress?.[key] ?? null;
}

function getCompletedActivityMetricLabels(activity: CalendarActivity) {
  const distance = formatDistanceMeters(activity.distance_meters);
  const duration = formatDuration(activity.duration_seconds ?? null);
  const tss = getActivityDerivedMetric(activity, "tss");
  const intensityFactor = getActivityDerivedMetric(activity, "intensity_factor");

  return [
    distance,
    duration,
    formatEstimatedTss(tss) ?? "-- TSS",
    formatEstimatedIntensityFactor(intensityFactor, { includeLabel: true }) ?? "IF --",
  ].filter((label): label is string => Boolean(label));
}

function formatEventTime(event: CalendarEvent) {
  if (event.all_day) {
    return "All day";
  }

  if (!event.starts_at) {
    return "Scheduled";
  }

  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return "Scheduled";
  }

  return format(startsAt, "h:mm a");
}

function formatGroupEventTime(event: CalendarGroupEvent) {
  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return "Scheduled";
  }

  return format(startsAt, "h:mm a");
}

function formatActivityTime(activity: CalendarActivity) {
  if (!activity.started_at) {
    return "Completed";
  }

  const startsAt = new Date(activity.started_at);
  if (Number.isNaN(startsAt.getTime())) {
    return "Completed";
  }

  return format(startsAt, "h:mm a");
}

function formatEventAgendaSubtitle(event: CalendarEvent) {
  if (event.description?.trim()) {
    return event.description.trim();
  }
  if (event.notes?.trim()) {
    return event.notes.trim();
  }
  if (event.event_type === "imported") {
    return "Imported activity";
  }
  if (event.event_type === "rest_day") {
    return "All day";
  }

  return null;
}

function formatEventDuration(event: CalendarEvent) {
  if (event.all_day || !event.starts_at || !event.ends_at) {
    return null;
  }

  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }

  const minutes = Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
  if (minutes === 0) {
    return null;
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getEventBadgeLabel(event: CalendarEvent) {
  if (
    event.completed ||
    event.status === "completed" ||
    event.linked_activity_id ||
    event.event_type === "imported"
  ) {
    return "Completed";
  }

  if (event.event_type === "planned") {
    return "Planned";
  }

  if (event.event_type === "rest_day") {
    return "Rest";
  }

  return "Event";
}

function getActivityPlanMeta(event: CalendarEvent) {
  const metrics = getActivityPlanMetricLabels(event);
  return metrics.length > 0
    ? metrics.join(" · ")
    : (event.activity_plan?.activity_category?.replace(/_/g, " ") ?? null);
}

function getActivityPlanMetricLabels(event: CalendarEvent) {
  const plan = event.activity_plan;
  if (!plan) {
    return [];
  }

  const metrics = plan.authoritative_metrics;
  const duration =
    readMetric(metrics?.estimated_duration) ??
    readMetric((plan as { estimated_duration?: unknown }).estimated_duration);
  const tss =
    readMetric(metrics?.estimated_tss) ??
    readMetric((plan as { estimated_tss?: unknown }).estimated_tss);
  const intensityFactor =
    readMetric(metrics?.intensity_factor) ??
    readMetric((plan as { intensity_factor?: unknown }).intensity_factor);

  return [
    formatEstimatedDurationSeconds(duration),
    formatEstimatedTss(tss),
    formatEstimatedIntensityFactor(intensityFactor, { includeLabel: true }),
  ].filter((label): label is string => Boolean(label));
}

function getGroupEventActivityPlanMetricLabels(event: CalendarGroupEvent) {
  if (!event.selectedActivityPlan) {
    return [];
  }

  return getActivityPlanMetricLabels({
    id: event.id,
    activity_plan: event.selectedActivityPlan,
  });
}

function getActivityPlanConfig(activityCategory: string | null | undefined) {
  if (!activityCategory) {
    return getActivityCategoryConfig("other");
  }

  return activityCategory.includes("_")
    ? getActivityConfig(activityCategory)
    : getActivityCategoryConfig(activityCategory);
}

function getEventPresentation(event: CalendarEvent) {
  if (event.activity_plan) {
    return {
      badgeBgClass: "bg-muted/60",
      badgeTextClass: "text-muted-foreground",
      label: "Activity plan",
      meta: getActivityPlanMeta(event),
      title: event.activity_plan.name?.trim() || event.title?.trim() || "Activity plan",
    };
  }

  if (event.event_type === "rest_day") {
    return {
      badgeBgClass: "bg-muted",
      badgeTextClass: "text-muted-foreground",
      label: "Rest day",
      meta: event.all_day ? "All day" : formatEventTime(event),
      title: event.title?.trim() || "Rest day",
    };
  }

  if (event.completed || event.status === "completed" || event.linked_activity_id) {
    return {
      badgeBgClass: "bg-muted/60",
      badgeTextClass: "text-muted-foreground",
      label: "Completed activity",
      meta: formatEventTime(event),
      title: event.title?.trim() || "Completed activity",
    };
  }

  if (event.event_type === "imported") {
    return {
      badgeBgClass: "bg-muted/60",
      badgeTextClass: "text-muted-foreground",
      label: "Imported activity",
      meta: formatEventTime(event),
      title: event.title?.trim() || "Imported activity",
    };
  }

  return {
    badgeBgClass: "bg-muted",
    badgeTextClass: "text-muted-foreground",
    label: getEventBadgeLabel(event),
    meta: formatEventTime(event),
    title: event.title?.trim() || "Untitled activity",
  };
}

function AgendaEventAccent() {
  return (
    <View
      className="h-14 w-1 rounded-full bg-primary"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const CalendarDayHeaderRow = memo(
  function CalendarDayHeaderRow({ row, onPressDay, selectedDateKey, todayKey }: DayHeaderRowProps) {
    const isSelected = selectedDateKey === row.dateKey;
    const hasEntries = row.itemCount > 0;
    const isRestOnly = row.signals.restCount > 0 && row.itemCount === row.signals.restCount;

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
          {!hasEntries || isRestOnly ? (
            <Text className="text-sm text-muted-foreground">
              {isRestOnly ? "Rest day" : "No scheduled activity"}
            </Text>
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
  onPressActivity,
  onPressEvent,
  onPressGroupEvent,
  onPressGoal,
  testIDPrefix = "calendar",
}: CalendarScheduleObjectCardProps) {
  if (object.type === "activity") {
    const activityConfig = getActivityCategoryConfig(object.activity.type || "other");
    const metrics = getCompletedActivityMetricLabels(object.activity);

    return (
      <TouchableOpacity
        onPress={() => onPressActivity?.(object.activity)}
        className="mx-5 mb-2 flex-row items-center gap-3 rounded-lg bg-muted/30 px-3 py-2"
        activeOpacity={0.85}
        disabled={!onPressActivity}
        testID={`${testIDPrefix}-activity-row-${object.activity.id}`}
        accessible
        accessibilityLabel={`Completed activity, ${object.activity.name ?? "Untitled activity"}`}
      >
        <Icon as={activityConfig.icon} size={13} className="text-muted-foreground" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Done
            </Text>
            <Text className="text-[11px] text-muted-foreground">•</Text>
            <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
              {formatActivityTime(object.activity)}
            </Text>
          </View>
          <View className="mt-0.5 flex-row items-baseline gap-2">
            <Text className="min-w-0 flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
              {object.activity.name?.trim() || "Completed activity"}
            </Text>
            {metrics.length > 0 ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {metrics.join(" · ")}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (object.type === "goal") {
    const objectiveSummary = getGoalObjectiveSummary(object.goal);

    return (
      <TouchableOpacity
        onPress={() => onPressGoal?.(object.goal)}
        className="mx-5 mb-2 flex-row items-center gap-3 rounded-lg bg-muted/30 px-3 py-2"
        activeOpacity={0.85}
        disabled={!onPressGoal}
        testID={`${testIDPrefix}-goal-row-${object.goal.id}`}
        accessible
        accessibilityLabel={`Goal, ${object.goal.title}, ${objectiveSummary}`}
      >
        <View testID={`${testIDPrefix}-entry-type-goal-${object.goal.id}`}>
          <Icon as={Target} size={13} className="text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Goal
            </Text>
            <Text className="text-[11px] text-muted-foreground">•</Text>
            <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
              {formatGoalTypeLabel(object.goal)}
            </Text>
          </View>
          <View className="mt-0.5 flex-row items-baseline gap-2">
            <Text className="min-w-0 flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
              {object.goal.title}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {objectiveSummary}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (object.type === "groupEvent") {
    const metrics = getGroupEventActivityPlanMetricLabels(object.groupEvent);
    const planLabel =
      object.groupEvent.selectedActivityPlanOptionLabel?.trim() ||
      object.groupEvent.selectedActivityPlan?.name?.trim() ||
      (object.groupEvent.activityPlanOptions.length > 0 ? "Activity plan RSVP" : null);
    const subtitle = [object.groupEvent.group?.name, planLabel, metrics.join(" · ")]
      .filter((label): label is string => Boolean(label))
      .join(" · ");

    return (
      <View
        className="px-5 pb-4"
        testID={`${testIDPrefix}-group-event-row-${object.groupEvent.id}`}
        accessible
        accessibilityLabel={`Group event, ${object.groupEvent.title}${subtitle ? `, ${subtitle}` : ""}`}
      >
        <View className="flex-row items-start gap-4">
          <View className="w-20 pt-1">
            <Text className="text-sm font-medium text-muted-foreground" numberOfLines={1}>
              {formatGroupEventTime(object.groupEvent)}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
              Going
            </Text>
          </View>
          <AgendaEventAccent />
          <TouchableOpacity
            onPress={() => onPressGroupEvent?.(object.groupEvent)}
            className="min-h-16 min-w-0 flex-1 justify-center rounded-2xl bg-card/70 px-4 py-3"
            activeOpacity={0.85}
            disabled={!onPressGroupEvent}
            testID={`${testIDPrefix}-group-event-press-${object.groupEvent.id}`}
          >
            <View className="flex-row items-center gap-2">
              <Icon as={Users} size={14} className="text-primary" />
              <Text
                className="min-w-0 flex-1 text-lg font-medium text-foreground"
                numberOfLines={1}
              >
                {object.groupEvent.title}
              </Text>
            </View>
            {subtitle ? (
              <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const presentation = getEventPresentation(object.event);
  const isPlannedActivity = object.event.event_type === "planned" && !!object.event.activity_plan;
  const activityConfig = isPlannedActivity
    ? getActivityPlanConfig(object.event.activity_plan?.activity_category)
    : null;
  const activityPlanMetrics = isPlannedActivity ? getActivityPlanMetricLabels(object.event) : [];
  const subtitle = isPlannedActivity
    ? activityPlanMetrics.join(" · ") || presentation.meta
    : formatEventAgendaSubtitle(object.event);
  const duration = formatEventDuration(object.event) ?? activityPlanMetrics[0] ?? null;

  return (
    <View
      className="px-5 pb-4"
      testID={`${testIDPrefix}-event-row-${object.event.id}`}
      accessible
      accessibilityLabel={`${presentation.label}, ${presentation.title}${
        presentation.meta ? `, ${presentation.meta}` : ""
      }`}
    >
      <View className="flex-row items-start gap-4">
        <View className="w-20 pt-1">
          <Text className="text-sm font-medium text-muted-foreground" numberOfLines={1}>
            {formatEventTime(object.event)}
          </Text>
          {duration ? (
            <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>
              {duration}
            </Text>
          ) : null}
        </View>
        <AgendaEventAccent />
        <TouchableOpacity
          onPress={() => onPressEvent?.(object.event)}
          className="min-h-16 min-w-0 flex-1 justify-center rounded-2xl bg-card/70 px-4 py-3"
          activeOpacity={0.85}
          disabled={!onPressEvent}
          testID={`${testIDPrefix}-event-press-${object.event.id}`}
        >
          <View className="flex-row items-center gap-2">
            {activityConfig ? (
              <Icon as={activityConfig.icon} size={14} className={activityConfig.color} />
            ) : null}
            <Text className="min-w-0 flex-1 text-lg font-medium text-foreground" numberOfLines={1}>
              {presentation.title}
            </Text>
          </View>
          {subtitle ? (
            <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export const CalendarScheduleObjectRow = memo(function CalendarScheduleObjectRow({
  object,
  onPressActivity,
  onPressEvent,
  onPressGroupEvent,
  onPressGoal,
}: ScheduleObjectRowProps) {
  return (
    <CalendarScheduleObjectCard
      object={object}
      onPressActivity={onPressActivity}
      onPressEvent={onPressEvent}
      onPressGroupEvent={onPressGroupEvent}
      onPressGoal={onPressGoal}
    />
  );
});
