import { useRouter } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { TrainingPathSection } from "@/components/plan/training-path/TrainingPathSection";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";

function PlanDashboardScreen() {
  const router = useRouter();
  usePerformanceScreenReady("route-plan");
  const trainingPath = usePlanTrainingPathData();

  const navigateToActivity = useCallback(
    (activityId: string) =>
      router.navigate({ pathname: "/activity-detail", params: { id: activityId } } as never),
    [router],
  );
  const navigateToGoal = useCallback(
    (goalId: string) =>
      router.navigate({ pathname: "/goal-detail", params: { id: goalId } } as never),
    [router],
  );
  const navigateToGroup = useCallback(
    (groupId: string) =>
      router.navigate({ pathname: "/group-detail", params: { groupId } } as never),
    [router],
  );
  const navigateToGroupEvent = useCallback(
    (eventId: string) =>
      router.navigate({
        pathname: "/group-event-detail",
        params: { groupEventId: eventId },
      } as never),
    [router],
  );
  const navigateToScheduledEvent = useCallback(
    (eventId: string) =>
      router.navigate({ pathname: "/event-detail", params: { id: eventId } } as never),
    [router],
  );
  const navigateToTrainingPreferences = useCallback(
    () => router.navigate(ROUTES.PLAN.TRAINING_PREFERENCES as never),
    [router],
  );

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={trainingPath.refreshing}
            onRefresh={trainingPath.handleRefresh}
          />
        }
      >
        <View className="gap-5 px-2 pb-6 pt-3">
          <TrainingPathSection
            model={trainingPath.trainingPath}
            selectedWeekGoals={trainingPath.selectedWeekGoals}
            selectedWeekEvents={trainingPath.selectedWeekEvents}
            selectedWeekGroupEvents={trainingPath.selectedWeekGroupEvents}
            selectedWeekCompletedActivities={trainingPath.selectedWeekCompletedActivities}
            selectedWeekLoading={trainingPath.selectedWeekLoading}
            onScrollNearEnd={trainingPath.extendTrainingPathWindowEnd}
            onScrollNearStart={trainingPath.extendTrainingPathWindowStart}
            onOpenActivity={navigateToActivity}
            onOpenGoal={navigateToGoal}
            onOpenGroup={navigateToGroup}
            onOpenGroupEvent={navigateToGroupEvent}
            onOpenScheduledEvent={navigateToScheduledEvent}
            onOpenSettings={navigateToTrainingPreferences}
            onWeekScrollStart={trainingPath.handleWeekScrollStart}
            onSelectedWeekChange={trainingPath.handleSelectedWeekChange}
          />
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
