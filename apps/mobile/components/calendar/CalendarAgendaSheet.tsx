import type { CalendarProjectionItem } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { TouchableOpacity, View } from "react-native";
import { PlanningLedgerPerformanceInsights } from "@/components/plan/ledger/PlanningLedgerView";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { GoalCard } from "@/components/shared/GoalCard";
import { PlannedActivityCard } from "@/components/shared/PlannedActivityCard";
import { PointInTimeDetailsSheet } from "@/components/shared/PointInTimeDetailsSheet";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { parseDateKey } from "@/lib/calendar/dateMath";
import { CalendarScheduleObjectCard } from "./CalendarTimelineRows";

type CalendarAgendaSheetProps = {
  dateKey: string;
  onClose: () => void;
  onCreateEvent: () => void;
  onOpenItem: (item: CalendarProjectionItem) => void;
  visible: boolean;
};

function CalendarAgendaItemCard({
  item,
  onOpenItem,
}: {
  item: CalendarProjectionItem;
  onOpenItem: (item: CalendarProjectionItem) => void;
}) {
  if (item.activity) {
    return (
      <ActivityCard
        activity={item.activity}
        onPress={() => onOpenItem(item)}
        testID={`calendar-agenda-activity-card-${item.id}`}
      />
    );
  }

  if (item.kind === "planned_activity") {
    return (
      <PlannedActivityCard
        onPress={() => onOpenItem(item)}
        plannedActivity={item}
        testID={`calendar-agenda-planned-activity-card-${item.id}`}
      />
    );
  }

  if (item.kind === "goal") {
    return (
      <GoalCard
        goal={{
          id: item.id,
          objectiveSummary: item.goal?.objectiveSummary,
          targetDate: item.calendarDate,
          title: item.title,
          typeLabel: item.goal?.typeLabel,
        }}
        onPress={() => onOpenItem(item)}
        testID={`calendar-agenda-goal-card-${item.id}`}
      />
    );
  }

  return (
    <CalendarScheduleObjectCard
      inset={false}
      object={item}
      onPress={onOpenItem}
      testIDPrefix="calendar-agenda"
    />
  );
}

export function CalendarAgendaSheet({
  dateKey,
  onClose,
  onCreateEvent,
  onOpenItem,
  visible,
}: CalendarAgendaSheetProps) {
  const query = api.calendar.day.useQuery(
    { date: dateKey },
    { ...scheduleAwareReadQueryOptions, enabled: visible },
  );
  const ledgerQuery = api.trainingPlans.getPlanningLedger.useQuery(
    { anchorDate: dateKey, period: "day" },
    { enabled: visible },
  );
  const items = query.data?.projection.items ?? [];
  const itemCount = items.length;
  const footer =
    !query.isLoading && !query.isError && itemCount === 0 ? (
      <TouchableOpacity
        accessibilityLabel="Add an activity to this day"
        accessibilityRole="button"
        className="items-center rounded-xl bg-primary px-4 py-3"
        onPress={onCreateEvent}
        testID="calendar-agenda-add"
      >
        <Text className="text-sm font-semibold text-primary-foreground">Add activity</Text>
      </TouchableOpacity>
    ) : undefined;

  return (
    <PointInTimeDetailsSheet
      contentKey={dateKey}
      description={
        query.isLoading
          ? "Loading schedule"
          : query.isError
            ? "Schedule unavailable"
            : itemCount === 0
              ? "Nothing scheduled"
              : `${itemCount} scheduled`
      }
      footer={footer}
      onClose={onClose}
      portalName="calendar-agenda-sheet"
      testID="calendar-agenda-sheet"
      title={format(parseDateKey(dateKey), "EEEE, MMM d")}
      visible={visible}
    >
      {ledgerQuery.isLoading ? (
        <View className="rounded-xl bg-muted/20 px-4 py-4">
          <Text className="text-sm text-muted-foreground">Loading performance insights…</Text>
        </View>
      ) : ledgerQuery.isError ? (
        <View
          accessibilityRole="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          testID="calendar-day-insights-error"
        >
          <Text className="text-sm text-foreground">Performance insights are unavailable.</Text>
          <TouchableOpacity
            accessibilityRole="button"
            className="mt-3 self-start rounded-xl border border-border px-4 py-3"
            onPress={() => void ledgerQuery.refetch()}
            testID="calendar-day-insights-retry"
          >
            <Text className="text-sm font-semibold text-foreground">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : ledgerQuery.data ? (
        <PlanningLedgerPerformanceInsights ledger={ledgerQuery.data} />
      ) : null}

      <View className="mt-5 border-t border-border pt-4">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          Schedule
        </Text>
      </View>

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground">Loading day details…</Text>
        </View>
      ) : query.isError ? (
        <View
          accessibilityRole="alert"
          className="flex-1 items-center justify-center px-6"
          testID="calendar-agenda-error"
        >
          <Text className="text-center text-sm text-muted-foreground">
            Day details could not be loaded.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            className="mt-3 rounded-xl border border-border px-4 py-3"
            onPress={() => void query.refetch()}
            testID="calendar-agenda-retry"
          >
            <Text className="text-sm font-semibold text-foreground">Try again</Text>
          </TouchableOpacity>
        </View>
      ) : itemCount === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base font-semibold text-foreground">Rest day</Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Nothing is scheduled for this day.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {items.map((item) => (
            <CalendarAgendaItemCard
              key={`${item.kind}:${item.id}`}
              item={item}
              onOpenItem={onOpenItem}
            />
          ))}
        </View>
      )}
    </PointInTimeDetailsSheet>
  );
}
