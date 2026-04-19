import type { ActivityPayload } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { CalendarEventCard } from "@/components/calendar/CalendarEventCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { parseDateKey, toDateKey } from "@/lib/calendar/dateMath";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { useCalendarStore } from "@/lib/stores/calendar-store";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";

const CALENDAR_DAY_QUERY_LIMIT = 100;

function formatCalendarDayTitle(dateKey: string, todayKey: string) {
  const date = parseDateKey(dateKey);
  if (dateKey === todayKey) {
    return `Today, ${format(date, "MMMM d")}`;
  }

  return format(date, "EEEE, MMMM d");
}

export default function CalendarDayScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const navigateTo = useAppNavigate();
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const dateKey = typeof params.date === "string" ? params.date : todayKey;
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);

  useEffect(() => {
    setActiveDate(dateKey);
  }, [dateKey, setActiveDate]);

  const { data, isLoading, error, refetch } = api.events.list.useQuery(
    {
      date_from: dateKey,
      date_to: dateKey,
      include_adhoc: true,
      limit: CALENDAR_DAY_QUERY_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      placeholderData: keepPreviousData,
    },
  );

  const events = useMemo(() => (data?.items ?? []) as CalendarEvent[], [data?.items]);
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const visibleEvents = useMemo(
    () => (eventsByDate.get(dateKey) ?? []).filter((event) => event.event_type !== "rest_day"),
    [dateKey, eventsByDate],
  );
  const title = useMemo(() => formatCalendarDayTitle(dateKey, todayKey), [dateKey, todayKey]);

  const getCanStartPlannedEvent = (event: CalendarEvent) => {
    if (event.event_type !== "planned") return false;
    const isCompleted = isActivityCompleted(event);
    return (
      !isCompleted && typeof event.scheduled_date === "string" && event.scheduled_date >= todayKey
    );
  };

  const handleOpenEvent = (event: CalendarEvent) => {
    if (event.event_type === "planned" && event.activity_plan?.id) {
      navigateTo(ROUTES.PLAN.PLAN_DETAIL(event.activity_plan.id) as never);
      return;
    }

    const route = buildOpenEventRoute({
      id: event.id,
      event_type: event.event_type === null ? undefined : (event.event_type as any),
    });

    if (!route) {
      Alert.alert("Open Event", "This event type does not have a detail screen yet.");
      return;
    }

    navigateTo(route as never);
  };

  const handleQuickActionPress = (event: CalendarEvent) => {
    if (!getCanStartPlannedEvent(event) || !event.activity_plan) {
      return;
    }

    const payload: ActivityPayload = {
      category: event.activity_plan.activity_category as ActivityPayload["category"],
      gpsRecordingEnabled: true,
      eventId: event.id,
      plan: event.activity_plan as ActivityPayload["plan"],
    };

    activitySelectionStore.setSelection(payload);
    navigateTo(ROUTES.RECORD);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />

      {isLoading && !data ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-muted-foreground">Loading day agenda...</Text>
        </View>
      ) : error && !data ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Unable to load this day right now.
          </Text>
          <Text className="text-sm font-medium text-foreground" onPress={() => void refetch()}>
            Retry
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pb-6 pt-4" contentContainerStyle={{ gap: 12 }}>
          {visibleEvents.length > 0 ? (
            <>
              <View className="rounded-3xl border border-border bg-card px-4 py-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Agenda
                </Text>
                <Text className="mt-2 text-sm text-muted-foreground">
                  {visibleEvents.length === 1 ? "1 event" : `${visibleEvents.length} events`}
                </Text>
              </View>

              {visibleEvents.map((event) =>
                event.event_type === "planned" && event.activity_plan ? (
                  <View key={event.id} className="gap-2">
                    <ActivityPlanCard
                      plannedActivity={{
                        id: event.id,
                        activity_plan_id: String(event.activity_plan.id),
                        activity_plan: event.activity_plan as any,
                        scheduled_date: event.scheduled_date ?? event.starts_at ?? "",
                        notes: event.notes,
                        completed_activity_id: (event as any).completed_activity_id ?? null,
                      }}
                      onPress={() => handleOpenEvent(event)}
                      showScheduleInfo={true}
                    />
                    {getCanStartPlannedEvent(event) ? (
                      <TouchableOpacity
                        onPress={() => handleQuickActionPress(event)}
                        activeOpacity={0.85}
                        className="self-end rounded-full border border-border bg-background px-3 py-2"
                        testID={`schedule-event-action-${event.id}`}
                      >
                        <Text className="text-xs font-medium text-foreground">Start Activity</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    canStart={getCanStartPlannedEvent(event)}
                    onPress={() => handleOpenEvent(event)}
                    onQuickActionPress={
                      getCanStartPlannedEvent(event) ? () => handleQuickActionPress(event) : null
                    }
                  />
                ),
              )}
            </>
          ) : (
            <View
              className="rounded-3xl border border-border bg-card px-5 py-5"
              testID={`calendar-rest-day-state-${dateKey}`}
            >
              <Text className="text-sm font-semibold text-foreground">Rest day</Text>
              <Text className="mt-1 text-sm text-muted-foreground">Nothing scheduled.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
