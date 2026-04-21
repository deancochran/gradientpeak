import type { ActivityPayload } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { ActivityPlanContentPreview } from "@/components/activity-plan/ActivityPlanContentPreview";
import { ActivityPlanSummary } from "@/components/shared/ActivityPlanSummary";
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

function PlannedAgendaEventCard({
  event,
  onPress,
  onStart,
}: {
  event: CalendarEvent;
  onPress: () => void;
  onStart?: (() => void) | null;
}) {
  const estimatedTss = readMetric(event.activity_plan?.estimated_tss);
  const intensityFactor = readMetric(event.activity_plan?.intensity_factor);
  const routeId = event.activity_plan?.route_id;
  const { data: route } = api.routes.get.useQuery({ id: routeId! }, { enabled: !!routeId });
  const eventNote = event.notes?.trim() || event.description?.trim() || null;
  const planDescription =
    event.activity_plan?.notes?.trim() || event.activity_plan?.description?.trim() || null;

  return (
    <View
      className="rounded-3xl border border-primary/10 bg-card p-4"
      testID={`schedule-event-${event.id}`}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="gap-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatTimeRange(event)}
        </Text>
        <Text className="text-base font-semibold text-foreground">
          {event.title || event.activity_plan?.name || "Planned activity"}
        </Text>
        {eventNote ? (
          <Text className="text-sm leading-5 text-muted-foreground">{eventNote}</Text>
        ) : null}

        <ActivityPlanSummary
          activityCategory={event.activity_plan?.activity_category}
          description={null}
          estimatedDuration={readMetric(event.activity_plan?.estimated_duration)}
          estimatedDurationMinutes={readMetric(event.activity_plan?.estimated_duration_minutes)}
          intensityFactor={intensityFactor}
          estimatedTss={estimatedTss}
          routeName={route?.name}
          routeProvided={!!routeId}
          structure={event.activity_plan?.structure}
          subtitle="Attached activity plan"
          testID={`calendar-day-planned-${event.id}`}
          title={event.activity_plan?.name}
          variant="embedded"
        />

        <ActivityPlanContentPreview
          compact
          size="small"
          durationLabel={null}
          intensityFactor={intensityFactor}
          plan={event.activity_plan}
          route={route}
          tss={estimatedTss}
          testIDPrefix={`calendar-day-planned-${event.id}`}
        />
      </TouchableOpacity>

      {onStart ? (
        <TouchableOpacity
          onPress={onStart}
          activeOpacity={0.85}
          className="mt-3 self-end rounded-full border border-border bg-background px-3 py-2"
          testID={`schedule-event-action-${event.id}`}
        >
          <Text className="text-xs font-medium text-foreground">Start Activity</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SimpleAgendaEventCard({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const place = readEventPlace(event);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-3xl border border-border bg-card px-4 py-4"
      testID={`schedule-event-${event.id}`}
    >
      <View className="gap-1.5">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatTimeRange(event)}
        </Text>
        <Text className="text-base font-semibold text-foreground">
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

  const getCanStartPlannedEvent = (event: CalendarEvent) => {
    if (event.event_type !== "planned") return false;
    const isCompleted = isActivityCompleted(event);
    return (
      !isCompleted && typeof event.scheduled_date === "string" && event.scheduled_date >= todayKey
    );
  };

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

  const handleCreateEvent = () => {
    navigateTo(ROUTES.PLAN.EVENT_CREATE(dateKey));
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
                  Agenda
                </Text>
                <Text className="mt-2 text-sm text-muted-foreground">
                  {visibleEvents.length === 1 ? "1 event" : `${visibleEvents.length} events`}
                </Text>
              </View>

              {visibleEvents.map((event) =>
                event.event_type === "planned" && event.activity_plan ? (
                  <PlannedAgendaEventCard
                    key={event.id}
                    event={event}
                    onPress={() => handleOpenEvent(event)}
                    onStart={
                      getCanStartPlannedEvent(event) ? () => handleQuickActionPress(event) : null
                    }
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
