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
    activeMonthKey,
    calendarProjectionTruncated,
    hasActivitiesData,
    hasPartialError,
    hydrated,
    isLoadingAdjacentPage,
    itemsByDate,
    loadingEvents,
    monthTitle,
    onCreateEvent,
    onMoveMonth,
    onOpenItem,
    onSelectDate,
    onToday,
    retryActivities,
    selectedDateKey,
    todayKey,
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
      activeMonthKey={activeMonthKey}
      hasPartialError={hasPartialError}
      hydrated={hydrated}
      isLoadingAdjacentPage={isLoadingAdjacentPage}
      itemsByDate={itemsByDate}
      monthTitle={monthTitle}
      onCreateEvent={onCreateEvent}
      onMoveMonth={onMoveMonth}
      onOpenItem={onOpenItem}
      onSelectDate={onSelectDate}
      onToday={onToday}
      onRetry={retryActivities}
      calendarProjectionTruncated={calendarProjectionTruncated}
      selectedDateKey={selectedDateKey}
      todayKey={todayKey}
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
