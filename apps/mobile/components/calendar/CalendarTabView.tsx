import {
  CalendarErrorScreen,
  CalendarLoadingScreen,
  CalendarReadyScreen,
} from "@/components/calendar/CalendarTabScaffold";
import { useCalendarTimelineController } from "@/components/calendar/useCalendarTimelineController";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { usePerformanceScreenReady } from "@/lib/performance";

function CalendarTabContent() {
  const navigateTo = useAppNavigate();
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
    onSelectDate,
    onToday,
    retryActivities,
    selectedDateKey,
    todayKey,
  } = useCalendarTimelineController();
  usePerformanceScreenReady("route-calendar", hasActivitiesData);

  if (loadingEvents && !hasActivitiesData) {
    return <CalendarLoadingScreen showHeader={false} />;
  }

  if (!hasActivitiesData) {
    return <CalendarErrorScreen onRetry={retryActivities} showHeader={false} />;
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
      onOpenDayBreakdown={(dateKey) => {
        onSelectDate(dateKey);
        navigateTo(ROUTES.PLAN.PLANNING_LEDGER({ anchorDate: dateKey, period: "day" }));
      }}
      onSelectDate={onSelectDate}
      onToday={onToday}
      onRetry={retryActivities}
      calendarProjectionTruncated={calendarProjectionTruncated}
      selectedDateKey={selectedDateKey}
      showHeader={false}
      todayKey={todayKey}
    />
  );
}

export function CalendarTabView() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <CalendarTabContent />
    </ErrorBoundary>
  );
}
