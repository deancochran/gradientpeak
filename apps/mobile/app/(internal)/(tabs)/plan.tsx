import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import type { TrainingPathLedgerSelection } from "@/components/plan/training-path/TrainingPathLoadChartSection";
import { TrainingPathSection } from "@/components/plan/training-path/TrainingPathSection";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";
import { usePlanDisplayPreferences } from "@/lib/stores/planDisplayPreferences";

function PlanDashboardScreen() {
  const router = useRouter();
  usePerformanceScreenReady("route-plan");
  const trainingPath = usePlanTrainingPathData();
  const chartRange = usePlanDisplayPreferences((state) => state.range);
  const chartPreferencesHydrated = usePlanDisplayPreferences((state) => state.hydrated);
  const setChartRange = usePlanDisplayPreferences((state) => state.setRange);
  const { height: viewportHeight } = useWindowDimensions();
  // Derive from the stable device viewport, never from ScrollView content.
  // The chart is the primary surface, so it receives most of the tab height;
  // the clamp still protects compact phones and large tablet layouts.
  const chartHeight = Math.max(320, Math.min(540, Math.floor(viewportHeight * 0.58)));
  const hasBlockingFailure = trainingPath.queryFailureCount > 0 && !trainingPath.hasUsableData;

  const navigateToCreateGoal = useCallback(
    () => router.navigate(ROUTES.GOALS.CREATE as never),
    [router],
  );
  const navigateToPlanningLedger = useCallback(
    ({ anchorDate, period }: TrainingPathLedgerSelection) =>
      router.navigate(ROUTES.PLAN.PLANNING_LEDGER({ anchorDate, period }) as never),
    [router],
  );
  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={trainingPath.refreshing}
            onRefresh={trainingPath.handleRefresh}
          />
        }
      >
        <View className="gap-3 px-2 pb-3 pt-2">
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
          {!hasBlockingFailure && chartPreferencesHydrated ? (
            <TrainingPathSection
              chartHeight={chartHeight}
              chartRange={chartRange}
              dailyPoints={trainingPath.dailyTrainingPathPoints}
              chartLoading={trainingPath.chartLoading}
              chartUnavailable={trainingPath.chartUnavailable}
              model={trainingPath.trainingPath}
              selectedDate={trainingPath.selectedDate}
              onScrollNearEnd={trainingPath.extendTrainingPathWindowEnd}
              onScrollNearStart={trainingPath.extendTrainingPathWindowStart}
              onCreateGoal={navigateToCreateGoal}
              onChartRangeChange={setChartRange}
              onViewDetails={navigateToPlanningLedger}
              onSelectedDateChange={trainingPath.handleSelectedDateChange}
              onSelectedWeekChange={trainingPath.handleSelectedWeekChange}
            />
          ) : !hasBlockingFailure ? (
            <View className="gap-3 px-2" testID="plan-chart-preferences-loading">
              <Skeleton className="h-11 w-36 rounded-lg" />
              <Skeleton className="h-[300px] w-full rounded-2xl" />
            </View>
          ) : null}
        </View>
      </ScrollView>
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
