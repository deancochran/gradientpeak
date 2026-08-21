import { type CalendarProjectionItem, compareCalendarProjectionItems } from "@repo/core";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { buildCalendarItemRoute } from "@/lib/calendar/calendarItemRouting";
import {
  addMonthsToDateKey,
  getMonthGridStartKey,
  getStartOfMonthKey,
  parseDateKey,
} from "@/lib/calendar/dateMath";
import { useLocalTodayKey } from "@/lib/hooks/useLocalTodayKey";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCalendarStore } from "@/lib/stores/calendar-store";

export const CALENDAR_PROJECTION_LIMIT = 500;
export const CALENDAR_PAGE_SIZE_DAYS = 42;

function buildItemsByDate(items: CalendarProjectionItem[]) {
  const itemsByDate = new Map<string, CalendarProjectionItem[]>();
  for (const item of items) {
    const dayItems = itemsByDate.get(item.calendarDate) ?? [];
    dayItems.push(item);
    itemsByDate.set(item.calendarDate, dayItems);
  }
  return itemsByDate;
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
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !selectedDateKey) {
      setSelectedDateKey(persistedActiveDate ?? todayKey);
    }
  }, [hydrated, persistedActiveDate, selectedDateKey, todayKey]);

  const settledDateKey = selectedDateKey ?? todayKey;
  const activeMonthKey = getStartOfMonthKey(settledDateKey);
  const pageStartDate = getMonthGridStartKey(activeMonthKey);
  const eventsQuery = api.calendar.page.useQuery(
    {
      pageStartDate,
      pageSizeDays: CALENDAR_PAGE_SIZE_DAYS,
      includeAdhoc: true,
      limit: CALENDAR_PROJECTION_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled && hydrated,
      placeholderData: keepPreviousData,
    },
  );

  const projectionItems = useMemo(
    () => [...(eventsQuery.data?.items ?? [])].sort(compareCalendarProjectionItems),
    [eventsQuery.data?.items],
  );
  const itemsByDate = useMemo(() => buildItemsByDate(projectionItems), [projectionItems]);
  const selectDate = useCallback(
    (dateKey: string) => {
      setSelectedDateKey(dateKey);
      setActiveDate(dateKey);
    },
    [setActiveDate],
  );

  const moveMonth = useCallback(
    (months: number) => selectDate(addMonthsToDateKey(settledDateKey, months)),
    [selectDate, settledDateKey],
  );

  const handleCreateEvent = useCallback(() => {
    navigateTo({
      pathname: "/(internal)/(standard)/agenda-create",
      params: { date: settledDateKey },
    } as never);
  }, [navigateTo, settledDateKey]);

  const handleOpenItem = useCallback(
    (item: CalendarProjectionItem) => {
      const route = buildCalendarItemRoute(item);
      if (route) navigateTo(route as never);
    },
    [navigateTo],
  );

  return {
    activeMonthKey,
    calendarProjectionTruncated: eventsQuery.data?.truncated ?? false,
    hasActivitiesData: Boolean(eventsQuery.data),
    hasPartialError: eventsQuery.isError || eventsQuery.isRefetchError,
    hydrated,
    isLoadingAdjacentPage: eventsQuery.isFetching && Boolean(eventsQuery.data),
    itemsByDate,
    loadingEvents: !authReady || !hydrated || eventsQuery.isLoading,
    monthTitle: format(parseDateKey(activeMonthKey), "MMMM yyyy"),
    onCreateEvent: handleCreateEvent,
    onMoveMonth: moveMonth,
    onOpenItem: handleOpenItem,
    onSelectDate: selectDate,
    onToday: () => selectDate(todayKey),
    retryActivities: eventsQuery.refetch,
    selectedDateKey: settledDateKey,
    todayKey,
  };
}
