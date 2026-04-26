import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import {
  EventAgendaCard,
  GoalAgendaCard,
  PlannedAgendaEventCard,
} from "@/components/calendar/AgendaCards";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { parseDateKey, toDateKey } from "@/lib/calendar/dateMath";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useCalendarStore } from "@/lib/stores/calendar-store";

const CALENDAR_DAY_QUERY_LIMIT = 100;

function formatCalendarDayTitle(dateKey: string, todayKey: string) {
  const date = parseDateKey(dateKey);
  if (dateKey === todayKey) {
    return `Today, ${format(date, "MMMM d")}`;
  }

  return format(date, "EEEE, MMMM d");
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.all_day) {
    return "All day";
  }

  if (!event.starts_at) {
    return "Scheduled";
  }

  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) {
    return "Scheduled";
  }

  if (!event.ends_at) {
    return format(start, "h:mm a");
  }

  const end = new Date(event.ends_at);
  if (Number.isNaN(end.getTime())) {
    return format(start, "h:mm a");
  }

  return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

function readEventPlace(event: CalendarEvent): string | null {
  const source = event as CalendarEvent & {
    location?: string | null;
    place?: string | null;
    venue?: string | null;
  };

  const value = source.location ?? source.place ?? source.venue ?? null;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
  const profileGoals = useProfileGoals();
  const visibleEvents = useMemo(
    () => (eventsByDate.get(dateKey) ?? []).filter((event) => event.event_type !== "rest_day"),
    [dateKey, eventsByDate],
  );
  const plannedEventsOnDate = useMemo(
    () => visibleEvents.filter((event) => event.event_type === "planned" && event.activity_plan),
    [visibleEvents],
  );
  const goalsOnDate = useMemo(
    () => profileGoals.goals.filter((goal) => goal.target_date === dateKey),
    [dateKey, profileGoals.goals],
  );
  const isRestDay = plannedEventsOnDate.length === 0 && goalsOnDate.length === 0;
  const title = useMemo(() => formatCalendarDayTitle(dateKey, todayKey), [dateKey, todayKey]);

  const handleOpenEvent = (event: CalendarEvent) => {
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

  const handleCreateEvent = () => {
    navigateTo({
      pathname: "/(internal)/(standard)/event-detail",
      params: { mode: "create", date: dateKey },
    } as never);
  };

  const handleOpenGoal = () => {
    const primaryGoal = goalsOnDate[0];
    if (!primaryGoal?.id) {
      return;
    }

    navigateTo(ROUTES.PLAN.GOAL_DETAIL(primaryGoal.id) as never);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleCreateEvent}
              className="mr-2 rounded-full px-2 py-1"
              activeOpacity={0.85}
              testID="calendar-day-create-event-button"
            >
              <Text className="text-sm font-medium text-primary">Create</Text>
            </TouchableOpacity>
          ),
        }}
      />

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
          {isRestDay ? (
            <View
              className="rounded-3xl border border-border bg-card px-5 py-5"
              testID={`calendar-rest-day-state-${dateKey}`}
            >
              <Text className="text-sm font-semibold text-foreground">Rest day</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                {visibleEvents.length > 0
                  ? "No activity plan or goal is scheduled for this day, even if other events are on your calendar."
                  : "Nothing scheduled."}
              </Text>
            </View>
          ) : null}

          {goalsOnDate.length > 0 ? (
            <GoalAgendaCard onPress={handleOpenGoal} title={goalsOnDate[0]?.title ?? "Goal"} />
          ) : null}

          {visibleEvents.length > 0 ? (
            <>
              <View className="rounded-3xl border border-border bg-card px-4 py-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Day agenda
                </Text>
                <Text className="mt-2 text-2xl font-semibold text-foreground">
                  {visibleEvents.length === 1 ? "1 event" : `${visibleEvents.length} events`}
                </Text>
                <Text className="mt-1 text-sm text-muted-foreground">
                  Events scheduled for this day, in chronological order.
                </Text>
              </View>

              {visibleEvents.map((event) =>
                event.event_type === "planned" && event.activity_plan ? (
                  <PlannedAgendaEventCard
                    key={event.id}
                    event={event}
                    onPress={() => handleOpenEvent(event)}
                    scheduleLabel={formatTimeRange(event)}
                  />
                ) : (
                  <EventAgendaCard
                    key={event.id}
                    event={event}
                    onPress={() => handleOpenEvent(event)}
                    place={readEventPlace(event)}
                    scheduleLabel={formatTimeRange(event)}
                  />
                ),
              )}
            </>
          ) : !isRestDay ? (
            <View
              className="rounded-3xl border border-border bg-card px-5 py-5"
              testID={`calendar-no-events-state-${dateKey}`}
            >
              <Text className="text-sm font-semibold text-foreground">No events scheduled</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                Your goal target is marked above, but there are no calendar events on this date.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
