import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { parseDateKey, toDateKey } from "@/lib/calendar/dateMath";
import { getEventStatusLabel, getEventTitle } from "@/lib/calendar/eventPresentation";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
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

function EventStatusPill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/60 bg-muted/60 px-2 py-1">
      <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
    </View>
  );
}

function PlannedAgendaEventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const eventNote = event.notes?.trim() || event.description?.trim() || null;
  const statusLabel = getEventStatusLabel(event);

  return (
    <View
      className="rounded-3xl border border-border bg-card p-4"
      testID={`schedule-event-${event.id}`}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatTimeRange(event)}
          </Text>
          <EventStatusPill label="Planned" />
          {statusLabel ? <EventStatusPill label={statusLabel} /> : null}
        </View>
        <Text className="text-xl font-semibold text-foreground">{getEventTitle(event)}</Text>
        {eventNote ? (
          <Text className="text-sm leading-5 text-muted-foreground">{eventNote}</Text>
        ) : null}

        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Linked plan
        </Text>
        <ActivityPlanCard activityPlan={event.activity_plan as any} variant="compact" />
      </TouchableOpacity>
    </View>
  );
}

function SimpleAgendaEventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const place = readEventPlace(event);
  const statusLabel = getEventStatusLabel(event);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-3xl border border-border bg-card px-4 py-4"
      testID={`schedule-event-${event.id}`}
    >
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatTimeRange(event)}
          </Text>
          {statusLabel ? <EventStatusPill label={statusLabel} /> : null}
        </View>
        <Text className="text-xl font-semibold text-foreground">
          {event.title || "Scheduled event"}
        </Text>
        {event.description || event.notes ? (
          <Text className="text-sm leading-5 text-muted-foreground">
            {event.description || event.notes}
          </Text>
        ) : null}
        {place ? <Text className="text-xs text-muted-foreground">{place}</Text> : null}
      </View>
    </TouchableOpacity>
  );
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
                  />
                ) : (
                  <SimpleAgendaEventCard
                    key={event.id}
                    event={event}
                    onPress={() => handleOpenEvent(event)}
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
