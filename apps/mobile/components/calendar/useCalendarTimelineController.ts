import type { ProfileGoal } from "@repo/core";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { addDaysToDateKey, toDateKey, toLocalDayStartIso } from "@/lib/calendar/dateMath";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import {
  attachSelectedGroupEventActivityPlans,
  buildGroupEventsByDate,
  type CalendarGroupEvent,
  getSelectedGroupEventActivityPlanIds,
} from "@/lib/calendar/groupEventPlans";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { ROUTES } from "@/lib/constants/routes";
import { useAutoPaginateInfiniteQuery } from "@/lib/hooks/useAutoPaginateInfiniteQuery";
import { useLocalTodayKey } from "@/lib/hooks/useLocalTodayKey";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCalendarStore } from "@/lib/stores/calendar-store";
import type { CalendarDayListProps } from "./CalendarDayList";
import type { CalendarActivity } from "./CalendarTimelineModel";
import type { CalendarWeekDayIndicators } from "./CalendarWeekStrip";

export const CALENDAR_EVENT_QUERY_LIMIT = 50;
export const GROUP_CALENDAR_EVENT_QUERY_LIMIT = 50;
export const DAY_RANGE_BACKWARD = 21;
export const DAY_RANGE_FORWARD = 119;
export const DAY_RANGE_EXTENSION = 30;
const ROUTABLE_EVENT_TYPES = new Set(["planned", "rest_day", "race_target", "custom", "imported"]);

export function buildDayQueryWindow(anchorDate: string) {
  return {
    rangeStart: addDaysToDateKey(anchorDate, -DAY_RANGE_BACKWARD),
    rangeEnd: addDaysToDateKey(anchorDate, DAY_RANGE_FORWARD),
  };
}

export function ensureDayQueryWindowCovers(input: {
  rangeStart: string;
  rangeEnd: string;
  anchorDate: string;
}) {
  if (input.anchorDate < input.rangeStart || input.anchorDate > input.rangeEnd) {
    return buildDayQueryWindow(input.anchorDate);
  }

  return { rangeStart: input.rangeStart, rangeEnd: input.rangeEnd };
}

function buildGoalsByDate(goals: ProfileGoal[]) {
  const map = new Map<string, ProfileGoal[]>();

  for (const goal of goals) {
    const items = map.get(goal.target_date) ?? [];
    items.push(goal);
    map.set(goal.target_date, items);
  }

  return map;
}

function toCalendarQueryDateTime(dateKey: string) {
  return toLocalDayStartIso(dateKey);
}

function buildActivitiesByDate(activities: CalendarActivity[], linkedActivityIds: Set<string>) {
  const map = new Map<string, CalendarActivity[]>();

  for (const activity of activities) {
    if (linkedActivityIds.has(activity.id) || !activity.started_at) {
      continue;
    }

    const startedAt = new Date(activity.started_at);
    if (Number.isNaN(startedAt.getTime())) {
      continue;
    }

    const dateKey = toDateKey(startedAt);
    const items = map.get(dateKey) ?? [];
    items.push(activity);
    map.set(dateKey, items);
  }

  for (const [dateKey, dayActivities] of map.entries()) {
    map.set(
      dateKey,
      [...dayActivities].sort(
        (left, right) =>
          new Date(left.started_at ?? 0).getTime() - new Date(right.started_at ?? 0).getTime(),
      ),
    );
  }

  return map;
}

function buildWeekDayIndicators({
  activitiesByDate,
  eventsByDate,
  goalsByDate,
  groupEventsByDate,
}: {
  activitiesByDate: Map<string, CalendarActivity[]>;
  eventsByDate: Map<string, CalendarEvent[]>;
  goalsByDate: Map<string, ProfileGoal[]>;
  groupEventsByDate: Map<string, CalendarGroupEvent[]>;
}) {
  const indicators = new Map<string, CalendarWeekDayIndicators>();
  const dateKeys = new Set([
    ...activitiesByDate.keys(),
    ...eventsByDate.keys(),
    ...goalsByDate.keys(),
    ...groupEventsByDate.keys(),
  ]);

  for (const dateKey of dateKeys) {
    indicators.set(dateKey, {
      activityCount: activitiesByDate.get(dateKey)?.length ?? 0,
      eventCount:
        (eventsByDate.get(dateKey)?.length ?? 0) + (groupEventsByDate.get(dateKey)?.length ?? 0),
      goalCount: goalsByDate.get(dateKey)?.length ?? 0,
    });
  }

  return indicators;
}

function toRoutableEventType(eventType: CalendarEvent["event_type"]) {
  if (!eventType || !ROUTABLE_EVENT_TYPES.has(eventType)) {
    return undefined;
  }

  return eventType as "planned" | "rest_day" | "race_target" | "custom" | "imported";
}

export function useCalendarTimelineController() {
  const navigateTo = useAppNavigate();

  const todayKey = useLocalTodayKey();

  const hydrated = useCalendarStore((state) => state.hydrated);
  const persistedActiveDate = useCalendarStore((state) => state.activeDate);
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);
  const authReady = useAuthStore((state) => state.ready);
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );

  const [initializedToday, setInitializedToday] = useState(false);
  const activeDate = initializedToday ? (persistedActiveDate ?? todayKey) : todayKey;
  const initialWindow = useMemo(() => buildDayQueryWindow(activeDate), [activeDate]);
  const [rangeStart, setRangeStart] = useState(initialWindow.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialWindow.rangeEnd);
  const [visibleDateKey, setVisibleDateKey] = useState(activeDate);
  const [scrollTarget, setScrollTarget] = useState<{ dateKey: string; version: number } | null>(
    null,
  );
  const reconciledActiveDateRef = useRef(activeDate);
  useEffect(() => {
    if (!hydrated || initializedToday) {
      return;
    }

    setActiveDate(todayKey);
    setInitializedToday(true);
  }, [hydrated, initializedToday, setActiveDate, todayKey]);

  const eventsQuery = api.events.list.useInfiniteQuery(
    {
      date_from: toCalendarQueryDateTime(rangeStart),
      date_to: toCalendarQueryDateTime(addDaysToDateKey(rangeEnd, 1)),
      include_adhoc: true,
      limit: CALENDAR_EVENT_QUERY_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  useAutoPaginateInfiniteQuery({
    enabled: eventsQueryEnabled,
    hasNextPage: eventsQuery.hasNextPage,
    isFetchingNextPage: eventsQuery.isFetchingNextPage,
    fetchNextPage: eventsQuery.fetchNextPage,
  });

  const events = useMemo(
    () => (eventsQuery.data?.pages.flatMap((page) => page.items) ?? []) as CalendarEvent[],
    [eventsQuery.data?.pages],
  );
  const linkedActivityIds = useMemo(
    () =>
      new Set(events.map((event) => event.linked_activity_id).filter((id): id is string => !!id)),
    [events],
  );
  const completedActivitiesQuery = api.activities.listPaginated.useInfiniteQuery(
    {
      date_from: toCalendarQueryDateTime(rangeStart),
      date_to: toCalendarQueryDateTime(addDaysToDateKey(rangeEnd, 1)),
      limit: 50,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  const { data: completedActivitiesData } = completedActivitiesQuery;
  const completedActivities = useMemo(
    () =>
      (completedActivitiesData?.pages.flatMap((page) => page.items) ?? []) as CalendarActivity[],
    [completedActivitiesData?.pages],
  );

  useAutoPaginateInfiniteQuery({
    enabled: eventsQueryEnabled,
    hasNextPage: completedActivitiesQuery.hasNextPage,
    isFetchingNextPage: completedActivitiesQuery.isFetchingNextPage,
    fetchNextPage: completedActivitiesQuery.fetchNextPage,
  });
  const activitiesByDate = useMemo(
    () => buildActivitiesByDate(completedActivities, linkedActivityIds),
    [completedActivities, linkedActivityIds],
  );
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const groupEventsQuery = api.groups.events.myCalendarGroupEvents.useInfiniteQuery(
    {
      includeCancelled: false,
      startsAfter: toCalendarQueryDateTime(rangeStart),
      startsBefore: toCalendarQueryDateTime(addDaysToDateKey(rangeEnd, 1)),
      limit: GROUP_CALENDAR_EVENT_QUERY_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );
  useAutoPaginateInfiniteQuery({
    enabled: eventsQueryEnabled,
    hasNextPage: groupEventsQuery.hasNextPage,
    isFetchingNextPage: groupEventsQuery.isFetchingNextPage,
    fetchNextPage: groupEventsQuery.fetchNextPage,
  });
  const groupEvents = useMemo(
    () => groupEventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [groupEventsQuery.data?.pages],
  );
  const selectedGroupActivityPlanIds = useMemo(
    () => getSelectedGroupEventActivityPlanIds(groupEvents),
    [groupEvents],
  );
  const groupActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: selectedGroupActivityPlanIds },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled && selectedGroupActivityPlanIds.length > 0,
      placeholderData: keepPreviousData,
    },
  );
  const calendarGroupEvents = useMemo(
    () =>
      attachSelectedGroupEventActivityPlans(groupEvents, groupActivityPlansQuery.data?.items ?? []),
    [groupActivityPlansQuery.data?.items, groupEvents],
  );
  const groupEventsByDate = useMemo(
    () => buildGroupEventsByDate(calendarGroupEvents),
    [calendarGroupEvents],
  );
  const profileGoals = useProfileGoals({ loadAllPages: true });
  const goalsByDate = useMemo(() => buildGoalsByDate(profileGoals.goals), [profileGoals.goals]);
  const weekDayIndicators = useMemo(
    () =>
      buildWeekDayIndicators({ activitiesByDate, eventsByDate, goalsByDate, groupEventsByDate }),
    [activitiesByDate, eventsByDate, goalsByDate, groupEventsByDate],
  );

  const extendDayRangeBackward = useCallback(() => {
    setRangeStart((currentStart) => addDaysToDateKey(currentStart, -DAY_RANGE_EXTENSION));
    setRangeEnd((currentEnd) => addDaysToDateKey(currentEnd, -DAY_RANGE_EXTENSION));
  }, []);

  const extendDayRangeForward = useCallback(() => {
    setRangeStart((currentStart) => addDaysToDateKey(currentStart, DAY_RANGE_EXTENSION));
    setRangeEnd((currentEnd) => addDaysToDateKey(currentEnd, DAY_RANGE_EXTENSION));
  }, []);

  const selectDate = useCallback(
    (dateKey: string) => {
      setActiveDate(dateKey);

      const nextWindow =
        dateKey < rangeStart || dateKey > rangeEnd
          ? buildDayQueryWindow(dateKey)
          : ensureDayQueryWindowCovers({
              rangeStart,
              rangeEnd,
              anchorDate: dateKey,
            });

      if (nextWindow.rangeStart !== rangeStart) {
        setRangeStart(nextWindow.rangeStart);
      }
      if (nextWindow.rangeEnd !== rangeEnd) {
        setRangeEnd(nextWindow.rangeEnd);
      }
    },
    [rangeEnd, rangeStart, setActiveDate],
  );

  const handleDayPress = useCallback(
    (dateKey: string) => {
      selectDate(dateKey);
      navigateTo(ROUTES.PLAN.CALENDAR_DAY(dateKey));
    },
    [navigateTo, selectDate],
  );

  const handleVisibleDayChange = useCallback((dateKey: string) => {
    setVisibleDateKey(dateKey);
  }, []);

  const handleVisibleDaySettled = useCallback(() => undefined, []);

  const handleSelectWeekDate = useCallback(
    (dateKey: string) => {
      reconciledActiveDateRef.current = dateKey;
      selectDate(dateKey);
      setVisibleDateKey(dateKey);
      setScrollTarget((current) => ({ dateKey, version: (current?.version ?? 0) + 1 }));
    },
    [selectDate],
  );

  useEffect(() => {
    if (!initializedToday || reconciledActiveDateRef.current === activeDate) {
      return;
    }

    reconciledActiveDateRef.current = activeDate;
    const nextWindow = ensureDayQueryWindowCovers({ rangeStart, rangeEnd, anchorDate: activeDate });
    if (nextWindow.rangeStart !== rangeStart) {
      setRangeStart(nextWindow.rangeStart);
    }
    if (nextWindow.rangeEnd !== rangeEnd) {
      setRangeEnd(nextWindow.rangeEnd);
    }
    setVisibleDateKey(activeDate);
    setScrollTarget((current) => ({
      dateKey: activeDate,
      version: (current?.version ?? 0) + 1,
    }));
  }, [activeDate, initializedToday, rangeEnd, rangeStart]);

  const handleJumpToday = useCallback(() => {
    handleSelectWeekDate(todayKey);
  }, [handleSelectWeekDate, todayKey]);

  const handleCreateEvent = useCallback(() => {
    navigateTo({
      pathname: "/(internal)/(standard)/agenda-create",
      params: {
        date: visibleDateKey,
      },
    } as never);
  }, [navigateTo, visibleDateKey]);

  const handleOpenEvent = useCallback(
    (event: CalendarEvent) => {
      const route = buildOpenEventRoute({
        id: event.id,
        event_type: toRoutableEventType(event.event_type),
      });

      if (route) {
        navigateTo(route as never);
      }
    },
    [navigateTo],
  );

  const handleOpenGoal = useCallback(
    (goal: ProfileGoal) => {
      navigateTo({ pathname: "/goal-detail", params: { id: goal.id } } as never);
    },
    [navigateTo],
  );

  const handleOpenActivity = useCallback(
    (activity: CalendarActivity) => {
      navigateTo(`/activity-detail?id=${activity.id}` as never);
    },
    [navigateTo],
  );

  const handleOpenGroupEvent = useCallback(
    (event: CalendarGroupEvent) => {
      navigateTo({ pathname: "/group-event-detail", params: { groupEventId: event.id } } as never);
    },
    [navigateTo],
  );

  const dayListProps = useMemo<CalendarDayListProps>(
    () => ({
      rangeStart,
      rangeEnd,
      visibleDayKey: activeDate,
      selectedDateKey: visibleDateKey,
      todayKey,
      scrollTargetDateKey: scrollTarget?.dateKey ?? null,
      scrollTargetVersion: scrollTarget?.version ?? 0,
      activitiesByDate,
      eventsByDate,
      groupEventsByDate,
      goalsByDate,
      onReachStart: extendDayRangeBackward,
      onReachEnd: extendDayRangeForward,
      onVisibleDayChange: handleVisibleDayChange,
      onVisibleDaySettled: handleVisibleDaySettled,
      onPressDay: handleDayPress,
      onPressActivity: handleOpenActivity,
      onPressEvent: handleOpenEvent,
      onPressGroupEvent: handleOpenGroupEvent,
      onPressGoal: handleOpenGoal,
    }),
    [
      activeDate,
      activitiesByDate,
      eventsByDate,
      extendDayRangeBackward,
      extendDayRangeForward,
      goalsByDate,
      groupEventsByDate,
      handleDayPress,
      handleVisibleDayChange,
      handleVisibleDaySettled,
      handleOpenActivity,
      handleOpenEvent,
      handleOpenGroupEvent,
      handleOpenGoal,
      rangeEnd,
      rangeStart,
      scrollTarget,
      todayKey,
      visibleDateKey,
    ],
  );

  const headerTitle = useMemo(
    () => format(new Date(`${visibleDateKey}T12:00:00`), "MMMM yyyy"),
    [visibleDateKey],
  );
  const hasPartialError =
    eventsQuery.isError ||
    completedActivitiesQuery.isError ||
    groupEventsQuery.isError ||
    groupActivityPlansQuery.isError ||
    profileGoals.isError;

  return {
    dayListProps,
    headerTitle,
    hydrated,
    weekDayIndicators,
    selectedDateKey: visibleDateKey,
    todayKey,
    loadingEvents:
      !authReady ||
      eventsQuery.isLoading ||
      completedActivitiesQuery.isLoading ||
      groupEventsQuery.isLoading,
    hasActivitiesData:
      Boolean(eventsQuery.data) ||
      Boolean(completedActivitiesData) ||
      Boolean(groupEventsQuery.data),
    hasPartialError,
    onCreateEvent: handleCreateEvent,
    onJumpToday: handleJumpToday,
    onSelectWeekDate: handleSelectWeekDate,
    retryActivities: async () => {
      await Promise.all([
        eventsQuery.refetch(),
        completedActivitiesQuery.refetch(),
        groupEventsQuery.refetch(),
        groupActivityPlansQuery.refetch(),
        profileGoals.refetch(),
      ]);
    },
  };
}
