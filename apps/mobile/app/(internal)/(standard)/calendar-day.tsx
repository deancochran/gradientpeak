import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import {
  EventAgendaCard,
  GoalAgendaCard,
  PlannedAgendaEventCard,
} from "@/components/calendar/AgendaCards";
import { PlannedDaySummary } from "@/components/calendar/PlannedDaySummary";
import { announcePlannedDaySummaryRetryStatus } from "@/components/calendar/plannedDaySummaryAccessibility";
import { GroupEventCard } from "@/components/groups/GroupEventCards";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { parseDateKey, toDateKeyInTimeZone } from "@/lib/calendar/dateMath";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import type { CalendarGroupEvent } from "@/lib/calendar/groupEventPlans";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { resolvePlanningDayQueryRange } from "@/lib/calendar/planningQueryRange";
import { buildTimelineEvents, buildTimelineEventsByDate } from "@/lib/calendar/timelineEvents";
import { ROUTES } from "@/lib/constants/routes";
import { markEstimated } from "@/lib/estimatedMetrics";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCalendarStore } from "@/lib/stores/calendar-store";

const DORMANT_DATE_KEY = "1970-01-01";

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

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatPlanSuggestion(input: { type?: string; loadDelta?: string; description?: string }) {
  const delta = Number(input.loadDelta);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const absoluteDelta = Math.abs(Math.round(delta));
  const direction = input.type === "reduce_load" || delta < 0 ? "Reduce" : "Add";
  return {
    title: `${direction} about ${markEstimated(`${absoluteDelta} Load`)}`,
    description:
      input.description?.trim() ||
      (direction === "Reduce"
        ? "Review scheduled sessions on this day and reduce total load."
        : "Create or refine a session on this day to close the readiness gap."),
    loadDelta: String(Math.round(delta)),
    type: direction === "Reduce" ? "reduce_load" : "add_load",
    actionLabel: direction === "Reduce" ? "Create adjustment note" : "Create suggested session",
  };
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
  const params = useLocalSearchParams<{
    date?: string;
    trainingPlanId?: string;
    planSuggestionType?: string;
    planSuggestionLoadDelta?: string;
    planSuggestionDescription?: string;
  }>();
  const navigateTo = useAppNavigate();
  const planningTimezone = useAuthStore((state) => state.profile?.planning_timezone ?? null);
  const todayKey = useMemo(() => {
    if (!planningTimezone) return null;
    try {
      return toDateKeyInTimeZone(new Date(), planningTimezone);
    } catch {
      return null;
    }
  }, [planningTimezone]);
  // This is an explicit calendar-day route. Never substitute a device-local day
  // when its parameter is absent or invalid, or queries could target another day.
  const requestedDateKey = readParam(params.date);
  const planningDayReadiness = useMemo(
    () =>
      resolvePlanningDayQueryRange({
        dateKey: requestedDateKey,
        timezone: planningTimezone,
      }),
    [planningTimezone, requestedDateKey],
  );
  const planningDayRange =
    planningDayReadiness.status === "ready" ? planningDayReadiness.value : null;
  const dateKey = planningDayRange?.dateKey ?? null;
  const unavailableMessage =
    planningDayReadiness.status === "unavailable" &&
    planningDayReadiness.reason === "date_unavailable"
      ? "Choose a valid calendar date to view this day."
      : "Set a valid planning timezone in your profile to view calendar days.";
  const planSuggestion = useMemo(() => {
    const type = readParam(params.planSuggestionType);
    const loadDelta = readParam(params.planSuggestionLoadDelta);
    const description = readParam(params.planSuggestionDescription);
    return formatPlanSuggestion({
      ...(type === undefined ? {} : { type }),
      ...(loadDelta === undefined ? {} : { loadDelta }),
      ...(description === undefined ? {} : { description }),
    });
  }, [params.planSuggestionDescription, params.planSuggestionLoadDelta, params.planSuggestionType]);
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );
  const dayQueriesEnabled = eventsQueryEnabled && planningDayReadiness.status === "ready";

  useEffect(() => {
    if (dateKey) setActiveDate(dateKey);
  }, [dateKey, setActiveDate]);

  const { data, isLoading, error, refetch } = api.calendar.day.useQuery(
    { date: dateKey ?? DORMANT_DATE_KEY },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: dayQueriesEnabled,
      placeholderData: keepPreviousData,
    },
  );
  const plannedDaySummaryData =
    data?.plannedLoadSummary?.date === dateKey ? data.plannedLoadSummary : undefined;
  const plannedDaySummaryLoading =
    isLoading || (dayQueriesEnabled && !plannedDaySummaryData && !error);

  const events = useMemo(() => (data?.items ?? []) as CalendarEvent[], [data?.items]);
  const visibleGroupEvents = useMemo(
    () => (data?.selectedGroupEvents?.items ?? []) as CalendarGroupEvent[],
    [data?.selectedGroupEvents?.items],
  );
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const goals = data?.goals?.items ?? [];
  const timelineEvents = useMemo(
    () =>
      buildTimelineEvents({
        calendarEvents: events,
        goals,
        todayKey: todayKey ?? "",
      }),
    [events, goals, todayKey],
  );
  const timelineEventsByDate = useMemo(
    () => buildTimelineEventsByDate(timelineEvents),
    [timelineEvents],
  );
  const visibleEvents = useMemo(
    () =>
      (dateKey ? (eventsByDate.get(dateKey) ?? []) : []).filter(
        (event) => event.event_type !== "rest_day",
      ),
    [dateKey, eventsByDate],
  );
  const visibleTimelineEvents = useMemo(
    () =>
      (dateKey ? (timelineEventsByDate.get(dateKey) ?? []) : []).filter(
        (event) => event.type !== "rest_day",
      ),
    [dateKey, timelineEventsByDate],
  );
  const _plannedEventsOnDate = useMemo(
    () => visibleEvents.filter((event) => event.event_type === "planned" && event.activity_plan),
    [visibleEvents],
  );
  const goalsOnDate = useMemo(
    () => goals.filter((goal) => goal.target_date === dateKey),
    [dateKey, goals],
  );
  const isRestDay =
    visibleGroupEvents.length === 0 &&
    !visibleTimelineEvents.some(
      (event) =>
        event.type === "planned_activity" ||
        event.type === "completed_activity" ||
        event.type === "goal" ||
        event.type === "race",
    );
  const title = useMemo(
    () => (dateKey && todayKey ? formatCalendarDayTitle(dateKey, todayKey) : "Calendar"),
    [dateKey, todayKey],
  );

  const handleOpenEvent = (event: CalendarEvent) => {
    const eventType =
      event.event_type === "planned" ||
      event.event_type === "custom" ||
      event.event_type === "race_target" ||
      event.event_type === "imported" ||
      event.event_type === "rest_day"
        ? event.event_type
        : undefined;
    const route = buildOpenEventRoute({
      id: event.id,
      ...(eventType === undefined ? {} : { event_type: eventType }),
    });

    if (!route) {
      Alert.alert("Open Event", "This event type does not have a detail screen yet.");
      return;
    }

    navigateTo(route as never);
  };

  const handleCreateEvent = () => {
    if (!dateKey) return;
    navigateTo({
      pathname: "/(internal)/(standard)/agenda-create",
      params: {
        date: dateKey,
        ...(typeof params.trainingPlanId === "string"
          ? { trainingPlanId: params.trainingPlanId }
          : {}),
        ...(planSuggestion
          ? {
              planSuggestionType: planSuggestion.type,
              planSuggestionLoadDelta: planSuggestion.loadDelta,
            }
          : {}),
      },
    } as never);
  };

  const handleOpenGoal = () => {
    const primaryGoal = goalsOnDate[0];
    if (!primaryGoal?.id) {
      return;
    }

    navigateTo(ROUTES.PLAN.GOAL_DETAIL(primaryGoal.id) as never);
  };

  const handleOpenGroupEvent = (eventId: string) => {
    navigateTo({ pathname: "/group-event-detail", params: { groupEventId: eventId } } as never);
  };

  const hasAgendaEvents = visibleEvents.length > 0 || visibleGroupEvents.length > 0;
  const agendaEventCount = visibleEvents.length + visibleGroupEvents.length;
  const isAgendaInitiallyLoading = isLoading && !data;
  const hasAgendaInitialError = Boolean(error && !data);
  const [agendaRetryStatus, setAgendaRetryStatus] = useState<string | null>(null);
  const [isRetryingAgenda, setIsRetryingAgenda] = useState(false);

  const announceAgendaRetryStatus = (message: string) => {
    setAgendaRetryStatus(message);
    announcePlannedDaySummaryRetryStatus(message);
  };

  const handleRetryAgenda = async () => {
    if (isRetryingAgenda || !dayQueriesEnabled) return;

    setIsRetryingAgenda(true);
    announceAgendaRetryStatus("Retrying day agenda.");
    try {
      await refetch();
      announceAgendaRetryStatus("Day agenda retry finished.");
    } catch {
      announceAgendaRetryStatus("Day agenda retry failed. The error remains available.");
    } finally {
      setIsRetryingAgenda(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            dateKey ? (
              <TouchableOpacity
                onPress={handleCreateEvent}
                className="mr-2 rounded-full px-2 py-1"
                activeOpacity={0.85}
                testID="calendar-day-create-event-button"
              >
                <Text className="text-sm font-medium text-primary">Create</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />

      {!planningDayRange ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">{unavailableMessage}</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pb-6 pt-4" contentContainerStyle={{ gap: 12 }}>
          {planSuggestion ? (
            <View
              className="rounded-3xl border border-primary/30 bg-primary/10 px-5 py-4"
              testID="calendar-day-plan-suggestion"
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                Plan suggestion
              </Text>
              <Text className="mt-2 text-base font-semibold text-foreground">
                {planSuggestion.title}
              </Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                {planSuggestion.description}
              </Text>
              <TouchableOpacity
                className="mt-3 self-start rounded-full bg-primary px-3 py-1.5"
                activeOpacity={0.85}
                onPress={handleCreateEvent}
                testID="calendar-day-create-from-plan-suggestion"
              >
                <Text className="text-xs font-semibold text-primary-foreground">
                  {planSuggestion.actionLabel}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <PlannedDaySummary
            {...(plannedDaySummaryData === undefined ? {} : { data: plannedDaySummaryData })}
            error={Boolean(error)}
            isLoading={plannedDaySummaryLoading}
            onRetry={() => refetch()}
          />

          {goalsOnDate.length > 0 ? (
            <GoalAgendaCard onPress={handleOpenGoal} title={goalsOnDate[0]?.title ?? "Goal"} />
          ) : null}

          {isAgendaInitiallyLoading ? (
            <View className="rounded-3xl border border-border bg-card px-5 py-5">
              <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
                Loading day agenda...
              </Text>
            </View>
          ) : hasAgendaInitialError ? (
            <View
              accessibilityRole="alert"
              className="rounded-3xl border border-border bg-card px-5 py-5"
            >
              <Text className="text-sm text-foreground">Unable to load this day right now.</Text>
              {agendaRetryStatus ? (
                <Text
                  accessibilityLiveRegion="polite"
                  className="mt-2 text-sm text-muted-foreground"
                >
                  {agendaRetryStatus}
                </Text>
              ) : null}
              <TouchableOpacity
                accessibilityHint="Attempts to load the day agenda again."
                accessibilityLabel="Retry loading day agenda"
                accessibilityRole="button"
                accessibilityState={{ busy: isRetryingAgenda, disabled: isRetryingAgenda }}
                className="mt-3 self-start rounded-full border border-border px-4 py-3"
                disabled={isRetryingAgenda}
                onPress={() => void handleRetryAgenda()}
                testID="calendar-day-agenda-retry"
              >
                <Text className="text-sm font-semibold text-foreground">
                  {isRetryingAgenda ? "Retrying day agenda..." : "Retry day agenda"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
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

              {hasAgendaEvents ? (
                <>
                  <View className="rounded-3xl border border-border bg-card px-4 py-4">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day agenda
                    </Text>
                    <Text className="mt-2 text-2xl font-semibold text-foreground">
                      {agendaEventCount === 1 ? "1 event" : `${agendaEventCount} events`}
                    </Text>
                    <Text className="mt-1 text-sm text-muted-foreground">
                      Events scheduled for this day, in chronological order.
                    </Text>
                  </View>

                  {visibleGroupEvents.map((event) => (
                    <GroupEventCard
                      key={event.id}
                      event={event}
                      onGroupPress={(group) =>
                        navigateTo({
                          pathname: "/group-detail",
                          params: { groupId: group.id },
                        } as never)
                      }
                      onPress={() => handleOpenGroupEvent(event.id)}
                      testID={`calendar-day-group-event-${event.id}`}
                    />
                  ))}

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
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
