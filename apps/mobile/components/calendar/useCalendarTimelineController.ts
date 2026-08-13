import type { CalendarProjectionItem } from "@repo/core";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { addDaysToDateKey } from "@/lib/calendar/dateMath";
import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";
import { ROUTES } from "@/lib/constants/routes";
import { useLocalTodayKey } from "@/lib/hooks/useLocalTodayKey";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCalendarStore } from "@/lib/stores/calendar-store";
import type { CalendarDayListProps } from "./CalendarDayList";
import type { CalendarWeekDayIndicators } from "./CalendarWeekStrip";

export const CALENDAR_PROJECTION_LIMIT = 500;
export const DAY_RANGE_BACKWARD = 21;
export const DAY_RANGE_FORWARD = 119;
export const DAY_RANGE_EXTENSION = 30;

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

function buildItemsByDate(items: CalendarProjectionItem[]) {
  const map = new Map<string, CalendarProjectionItem[]>();
  for (const item of items) {
    const dayItems = map.get(item.calendarDate) ?? [];
    dayItems.push(item);
    map.set(item.calendarDate, dayItems);
  }
  return map;
}

function buildWeekDayIndicators(itemsByDate: Map<string, CalendarProjectionItem[]>) {
  const indicators = new Map<string, CalendarWeekDayIndicators>();
  for (const [dateKey, items] of itemsByDate.entries()) {
    indicators.set(dateKey, {
      activityCount: items.filter((item) => item.kind === "completed_activity").length,
      eventCount: items.filter(
        (item) =>
          item.kind === "planned_activity" || item.kind === "event" || item.kind === "group_event",
      ).length,
      goalCount: items.filter((item) => item.kind === "goal").length,
    });
  }

  return indicators;
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

  const eventsQuery = api.calendar.range.useQuery(
    {
      startDate: rangeStart,
      endDateExclusive: addDaysToDateKey(rangeEnd, 1),
      includeAdhoc: true,
      limit: CALENDAR_PROJECTION_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      placeholderData: keepPreviousData,
    },
  );

  const projectionItems = eventsQuery.data?.items ?? [];
  const itemsByDate = useMemo(() => buildItemsByDate(projectionItems), [projectionItems]);
  const weekDayIndicators = useMemo(() => buildWeekDayIndicators(itemsByDate), [itemsByDate]);

  const extendDayRangeBackward = useCallback(() => {
    setRangeStart((currentStart) => addDaysToDateKey(currentStart, -DAY_RANGE_EXTENSION));
  }, []);

  const extendDayRangeForward = useCallback(() => {
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

  const handleOpenItem = useCallback(
    (item: CalendarProjectionItem) => {
      if (item.kind === "completed_activity") {
        navigateTo(`/activity-detail?id=${item.id}` as never);
        return;
      }
      if (item.kind === "goal") {
        navigateTo({ pathname: "/goal-detail", params: { id: item.id } } as never);
        return;
      }
      if (item.kind === "group_event") {
        navigateTo({ pathname: "/group-event-detail", params: { groupEventId: item.id } } as never);
        return;
      }
      const route = buildOpenEventRoute({
        id: item.id,
        event_type: item.event?.type,
      });
      if (route) {
        navigateTo(route as never);
      }
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
      itemsByDate,
      onReachStart: extendDayRangeBackward,
      onReachEnd: extendDayRangeForward,
      onVisibleDayChange: handleVisibleDayChange,
      onVisibleDaySettled: handleVisibleDaySettled,
      onPressDay: handleDayPress,
      onPressItem: handleOpenItem,
    }),
    [
      activeDate,
      itemsByDate,
      extendDayRangeBackward,
      extendDayRangeForward,
      handleDayPress,
      handleVisibleDayChange,
      handleVisibleDaySettled,
      handleOpenItem,
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
  const hasPartialError = eventsQuery.isError;

  return {
    dayListProps,
    headerTitle,
    hydrated,
    weekDayIndicators,
    selectedDateKey: visibleDateKey,
    todayKey,
    loadingEvents: !authReady || eventsQuery.isLoading,
    hasActivitiesData: Boolean(eventsQuery.data),
    hasPartialError,
    onCreateEvent: handleCreateEvent,
    onJumpToday: handleJumpToday,
    onSelectWeekDate: handleSelectWeekDate,
    retryActivities: async () => {
      await eventsQuery.refetch();
    },
  };
}
