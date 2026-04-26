import { PlanCalendarSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { CalendarMonthList } from "@/components/calendar";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import {
  addMonthsToDateKey,
  getEndOfMonthKey,
  getMonthAnchor,
  getStartOfMonthKey,
  toDateKey,
} from "@/lib/calendar/dateMath";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import {
  buildCalendarQueryWindow,
  ensureCalendarQueryWindowCovers,
} from "@/lib/calendar/queryWindow";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useCalendarStore } from "@/lib/stores/calendar-store";

const CALENDAR_EVENT_QUERY_LIMIT = 500;
const MONTH_RANGE_EXTENSION = 2;

function CalendarScreen() {
  const hasNormalizedInitialVisibleAnchorRef = useRef(false);
  const navigateTo = useAppNavigate();

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const hydrated = useCalendarStore((state) => state.hydrated);
  const persistedActiveDate = useCalendarStore((state) => state.activeDate);
  const persistedVisibleAnchor = useCalendarStore((state) => state.visibleAnchor);
  const setActiveDate = useCalendarStore((state) => state.setActiveDate);
  const setVisibleAnchor = useCalendarStore((state) => state.setVisibleAnchor);

  const activeDate = persistedActiveDate ?? todayKey;
  const visibleAnchor = persistedVisibleAnchor ?? getMonthAnchor(persistedActiveDate ?? todayKey);

  const initialWindow = useMemo(() => buildCalendarQueryWindow(activeDate), [activeDate]);
  const [rangeStart, setRangeStart] = useState(initialWindow.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialWindow.rangeEnd);

  useEffect(() => {
    if (!persistedActiveDate) {
      setActiveDate(todayKey);
    }
    if (!persistedVisibleAnchor) {
      setVisibleAnchor(getMonthAnchor(todayKey));
    }
  }, [persistedActiveDate, persistedVisibleAnchor, setActiveDate, setVisibleAnchor, todayKey]);

  useEffect(() => {
    if (hasNormalizedInitialVisibleAnchorRef.current) {
      return;
    }

    hasNormalizedInitialVisibleAnchorRef.current = true;
    const activeMonthAnchor = getMonthAnchor(activeDate);
    if (visibleAnchor !== activeMonthAnchor) {
      setVisibleAnchor(activeMonthAnchor);
    }
  }, [activeDate, setVisibleAnchor, visibleAnchor]);

  useEffect(() => {
    const windowCoveringActiveDate = ensureCalendarQueryWindowCovers({
      rangeStart,
      rangeEnd,
      anchorDate: activeDate,
    });

    if (windowCoveringActiveDate.rangeStart !== rangeStart) {
      setRangeStart(windowCoveringActiveDate.rangeStart);
    }
    if (windowCoveringActiveDate.rangeEnd !== rangeEnd) {
      setRangeEnd(windowCoveringActiveDate.rangeEnd);
    }
  }, [activeDate, rangeEnd, rangeStart]);

  const {
    data: activitiesData,
    isLoading: loadingEvents,
    refetch: refetchActivities,
  } = api.events.list.useQuery(
    {
      date_from: rangeStart,
      date_to: rangeEnd,
      include_adhoc: true,
      limit: CALENDAR_EVENT_QUERY_LIMIT,
    },
    {
      ...scheduleAwareReadQueryOptions,
      placeholderData: keepPreviousData,
    },
  );

  const events = useMemo(
    () => (activitiesData?.items ?? []) as CalendarEvent[],
    [activitiesData?.items],
  );
  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);
  const profileGoals = useProfileGoals();
  const goalDates = useMemo(
    () => new Set(profileGoals.goals.map((goal) => goal.target_date)),
    [profileGoals.goals],
  );

  const extendMonthRangeBackward = useCallback(() => {
    setRangeStart((current) =>
      getStartOfMonthKey(addMonthsToDateKey(getStartOfMonthKey(current), -MONTH_RANGE_EXTENSION)),
    );
  }, []);

  const extendMonthRangeForward = useCallback(() => {
    setRangeEnd((current) =>
      getEndOfMonthKey(addMonthsToDateKey(getStartOfMonthKey(current), MONTH_RANGE_EXTENSION)),
    );
  }, []);

  const selectDate = useCallback(
    (dateKey: string) => {
      setActiveDate(dateKey);

      const nextAnchor = getMonthAnchor(dateKey);
      const nextWindow =
        nextAnchor < rangeStart || nextAnchor > rangeEnd
          ? buildCalendarQueryWindow(nextAnchor)
          : ensureCalendarQueryWindowCovers({
              rangeStart,
              rangeEnd,
              anchorDate: nextAnchor,
            });

      if (nextWindow.rangeStart !== rangeStart) {
        setRangeStart(nextWindow.rangeStart);
      }
      if (nextWindow.rangeEnd !== rangeEnd) {
        setRangeEnd(nextWindow.rangeEnd);
      }
      if (visibleAnchor !== nextAnchor) {
        setVisibleAnchor(nextAnchor);
      }
    },
    [
      rangeEnd,
      rangeStart,
      setActiveDate,
      setRangeEnd,
      setRangeStart,
      setVisibleAnchor,
      visibleAnchor,
    ],
  );

  const handleVisibleMonthChange = useCallback(
    (monthStartKey: string) => {
      if (monthStartKey !== visibleAnchor) {
        setVisibleAnchor(monthStartKey);
      }
    },
    [setVisibleAnchor, visibleAnchor],
  );

  const handleMonthDayPress = useCallback(
    (dateKey: string) => {
      selectDate(dateKey);
      navigateTo(ROUTES.PLAN.CALENDAR_DAY(dateKey));
    },
    [navigateTo, selectDate],
  );

  if (loadingEvents && !activitiesData) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
        <View testID="calendar-screen-loading" />
      </View>
    );
  }

  if (!activitiesData) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Calendar" />
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-muted-foreground">
            Unable to load calendar events right now.
          </Text>
          <TouchableOpacity
            onPress={() => void refetchActivities()}
            className="rounded-full border border-border bg-card px-4 py-2"
            activeOpacity={0.85}
          >
            <Text className="text-sm text-foreground">Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="calendar-screen-ready">
      <AppHeader title="Calendar" />

      <View className="flex-1" testID="calendar-screen-content-ready">
        <CalendarMonthList
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          visibleMonthAnchor={visibleAnchor}
          todayKey={todayKey}
          eventsByDate={eventsByDate}
          goalDates={goalDates}
          onVisibleMonthChange={handleVisibleMonthChange}
          onReachStart={extendMonthRangeBackward}
          onReachEnd={extendMonthRangeForward}
          onSelectDay={handleMonthDayPress}
        />
      </View>

      {!hydrated ? <View testID="calendar-store-pending" /> : null}
    </View>
  );
}

export default function CalendarScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <CalendarScreen />
    </ErrorBoundary>
  );
}
