import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { CalendarAgendaSheet } from "@/components/calendar/CalendarAgendaSheet";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { PlanningLedgerSheet } from "@/components/plan/ledger/PlanningLedgerSheet";
import type { TrainingPathLedgerSelection } from "@/components/plan/training-path/TrainingPathLoadChartSection";
import { TrainingPathSection } from "@/components/plan/training-path/TrainingPathSection";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { AppHeader } from "@/components/shared";
import { buildCalendarItemRoute } from "@/lib/calendar/calendarItemRouting";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";
import { usePlanDisplayPreferences } from "@/lib/stores/planDisplayPreferences";

function PlanDashboardScreen() {
  const router = useRouter();
  usePerformanceScreenReady("route-plan");
  const trainingPath = usePlanTrainingPathData();
  const chartRange = usePlanDisplayPreferences((state) => state.range);
  const setChartRange = usePlanDisplayPreferences((state) => state.setRange);
  const [ledgerSelection, setLedgerSelection] = useState<TrainingPathLedgerSelection | null>(null);
  const hasBlockingFailure = trainingPath.queryFailureCount > 0 && !trainingPath.hasUsableData;

  const navigateToCreateGoal = useCallback(
    () => router.navigate(ROUTES.GOALS.CREATE as never),
    [router],
  );
  const openPlanningLedger = useCallback(
    (selection: TrainingPathLedgerSelection) => setLedgerSelection(selection),
    [],
  );
  const openLedgerEntry = useCallback(
    (target: { target: "activity" | "event" | "group_event" | "goal"; id: string }) => {
      setLedgerSelection(null);
      const route =
        target.target === "activity"
          ? { pathname: "/activity-detail", params: { id: target.id } }
          : target.target === "event"
            ? { pathname: "/event-detail", params: { id: target.id } }
            : target.target === "group_event"
              ? { pathname: "/group-event-detail", params: { groupEventId: target.id } }
              : { pathname: "/goal-detail", params: { id: target.id } };
      router.navigate(route as never);
    },
    [router],
  );
  const openDayItem = useCallback(
    (item: Parameters<typeof buildCalendarItemRoute>[0]) => {
      setLedgerSelection(null);
      const route = buildCalendarItemRoute(item);
      if (route) router.navigate(route as never);
    },
    [router],
  );
  const createDayItem = useCallback(() => {
    if (!ledgerSelection || ledgerSelection.period !== "day") return;
    const date = ledgerSelection.anchorDate;
    setLedgerSelection(null);
    router.navigate(ROUTES.PLAN.AGENDA_CREATE(date) as never);
  }, [ledgerSelection, router]);
  const planningLedgerSelection =
    ledgerSelection && ledgerSelection.period !== "day"
      ? { anchorDate: ledgerSelection.anchorDate, period: ledgerSelection.period }
      : null;
  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <View className="min-h-0 flex-1 gap-3 px-2 pb-2 pt-2">
        {trainingPath.queryFailureCount > 0 ? (
          <View
            accessibilityRole={hasBlockingFailure ? "alert" : undefined}
            className="mx-2 gap-2 rounded-2xl border border-destructive/40 bg-card p-4"
            testID="plan-query-error"
          >
            <Text className="font-semibold text-foreground">
              {trainingPath.hasUsableData
                ? "Some plan details could not be refreshed"
                : "Your plan could not be loaded"}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {trainingPath.hasUsableData
                ? "Available schedule and training data is still shown below."
                : "Check your connection and retry loading your plan."}
            </Text>
            <Button
              className="self-start"
              onPress={trainingPath.handleRefresh}
              size="sm"
              variant="outline"
              testID="plan-query-retry"
            >
              <Text>Retry</Text>
            </Button>
          </View>
        ) : null}
        {!hasBlockingFailure ? (
          <TrainingPathSection
            chartRange={chartRange}
            dailyPoints={trainingPath.dailyTrainingPathPoints}
            chartLoading={trainingPath.chartLoading}
            chartUnavailable={trainingPath.chartUnavailable}
            model={trainingPath.trainingPath}
            selectedDate={trainingPath.selectedDate}
            onCreateGoal={navigateToCreateGoal}
            onChartRangeChange={setChartRange}
            onViewDetails={openPlanningLedger}
            onSelectedDateChange={trainingPath.handleSelectedDateChange}
            onSelectedWeekChange={trainingPath.handleSelectedWeekChange}
          />
        ) : null}
        {ledgerSelection?.period === "day" ? (
          <CalendarAgendaSheet
            dateKey={ledgerSelection.anchorDate}
            onClose={() => setLedgerSelection(null)}
            onCreateEvent={createDayItem}
            onOpenItem={openDayItem}
            visible
          />
        ) : (
          <PlanningLedgerSheet
            onClose={() => setLedgerSelection(null)}
            onOpenEntry={openLedgerEntry}
            selection={planningLedgerSelection}
          />
        )}
      </View>
    </View>
  );
}

export default function PlanDashboardWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanDashboardScreen />
    </ErrorBoundary>
  );
}
