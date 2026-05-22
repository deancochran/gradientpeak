import React from "react";
import {
  CalendarErrorScreen,
  CalendarLoadingScreen,
  CalendarReadyScreen,
} from "@/components/calendar";
import { useCalendarTimelineController } from "@/components/calendar/useCalendarTimelineController";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { usePerformanceScreenReady } from "@/lib/performance";

function CalendarScreen() {
  const {
    dayListProps,
    hasActivitiesData,
    headerTitle,
    hydrated,
    loadingEvents,
    onCreateEvent,
    onJumpToday,
    onSelectWeekDate,
    retryActivities,
    selectedDateKey,
    todayKey,
    weekDayIndicators,
  } = useCalendarTimelineController();
  usePerformanceScreenReady("route-calendar", hasActivitiesData);

  if (loadingEvents && !hasActivitiesData) {
    return <CalendarLoadingScreen />;
  }

  if (!hasActivitiesData) {
    return <CalendarErrorScreen onRetry={retryActivities} />;
  }

  return (
    <CalendarReadyScreen
      headerTitle={headerTitle}
      hydrated={hydrated}
      dayListProps={dayListProps}
      onCreateEvent={onCreateEvent}
      onJumpToday={onJumpToday}
      onSelectWeekDate={onSelectWeekDate}
      selectedDateKey={selectedDateKey}
      todayKey={todayKey}
      weekDayIndicators={weekDayIndicators}
    />
  );
}

export default function CalendarScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <CalendarScreen />
    </ErrorBoundary>
  );
}
