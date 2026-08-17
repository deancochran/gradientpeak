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
    hasPartialError,
    headerTitle,
    hydrated,
    loadingEvents,
    onCreateEvent,
    onCancelPersonalSession,
    onJumpToday,
    onSelectWeekDate,
    retryActivities,
    personalSessions,
    plannedSessionsTruncated,
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
      hasPartialError={hasPartialError}
      hydrated={hydrated}
      dayListProps={dayListProps}
      onCreateEvent={onCreateEvent}
      onCancelPersonalSession={onCancelPersonalSession}
      onJumpToday={onJumpToday}
      onRetry={retryActivities}
      onSelectWeekDate={onSelectWeekDate}
      personalSessions={personalSessions}
      plannedSessionsTruncated={plannedSessionsTruncated}
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
