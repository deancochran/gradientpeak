import { type CalendarProjectionItem, compareCalendarProjectionItems } from "@repo/core";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { buildCalendarItemRoute } from "@/lib/calendar/calendarItemRouting";
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  getMonthGridStartKey,
  getStartOfMonthKey,
  parseDateKey,
} from "@/lib/calendar/dateMath";
import { mergeDirectPlannedSessionsIntoCalendar } from "@/lib/calendar/plannedSessionCalendarProjection";
import { ROUTES } from "@/lib/constants/routes";
import { useLocalTodayKey } from "@/lib/hooks/useLocalTodayKey";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { buildPlannedSessionRecordingLaunchPayload } from "@/lib/recording/plannedSessionLaunch";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
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
  const profileId = useAuthStore((state) => state.user?.id ?? "");
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
  const plannedSessionsQuery = api.plannedSessions.range.useQuery(
    {
      profileId,
      range: {
        startDate: pageStartDate,
        endDate: addDaysToDateKey(pageStartDate, CALENDAR_PAGE_SIZE_DAYS - 1),
      },
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled && hydrated && Boolean(profileId),
      placeholderData: keepPreviousData,
    },
  );

  const projectionItems = useMemo(() => {
    const items = [...(eventsQuery.data?.items ?? [])].sort(compareCalendarProjectionItems);
    return mergeDirectPlannedSessionsIntoCalendar({
      items,
      sessions: plannedSessionsQuery.data?.items ?? [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
  }, [eventsQuery.data?.items, plannedSessionsQuery.data?.items]);
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
    async (item: CalendarProjectionItem) => {
      if (item.plannedSession?.source.kind === "direct" && item.event === null) {
        const session = plannedSessionsQuery.data?.items.find(
          (candidate) => candidate.id === item.plannedSession?.id,
        );
        if (!session) return;
        activitySelectionStore.setSelection(
          await buildPlannedSessionRecordingLaunchPayload({
            plannedSession: {
              id: session.id,
              sessionRevision: session.sessionRevision,
              prescription: session.prescription,
            },
            name: item.title,
          }),
        );
        navigateTo(ROUTES.RECORD as never);
        return;
      }
      const route = buildCalendarItemRoute(item);
      if (route) navigateTo(route as never);
    },
    [navigateTo, plannedSessionsQuery.data?.items],
  );

  return {
    activeMonthKey,
    calendarProjectionTruncated:
      (eventsQuery.data?.truncated ?? false) || (plannedSessionsQuery.data?.truncated ?? false),
    hasActivitiesData: Boolean(eventsQuery.data || plannedSessionsQuery.data),
    hasPartialError:
      eventsQuery.isError ||
      eventsQuery.isRefetchError ||
      plannedSessionsQuery.isError ||
      plannedSessionsQuery.isRefetchError,
    hydrated,
    isLoadingAdjacentPage:
      (eventsQuery.isFetching && Boolean(eventsQuery.data)) ||
      (plannedSessionsQuery.isFetching && Boolean(plannedSessionsQuery.data)),
    itemsByDate,
    loadingEvents:
      !authReady || !hydrated || eventsQuery.isLoading || plannedSessionsQuery.isLoading,
    monthTitle: format(parseDateKey(activeMonthKey), "MMMM yyyy"),
    onCreateEvent: handleCreateEvent,
    onMoveMonth: moveMonth,
    onOpenItem: handleOpenItem,
    onSelectDate: selectDate,
    onToday: () => selectDate(todayKey),
    retryActivities: async () => {
      await Promise.all([eventsQuery.refetch(), plannedSessionsQuery.refetch()]);
    },
    selectedDateKey: settledDateKey,
    todayKey,
  };
}
