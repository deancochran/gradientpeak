import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { FeedList } from "@/components/feed";
import { PlanDashboardContent } from "@/components/plan/training-path/PlanDashboardContent";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";

function HomeScreen() {
  usePerformanceScreenReady("route-home");
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const selectedDate = typeof date === "string" ? date : null;
  const trainingPath = usePlanTrainingPathData(selectedDate);
  const hasBlockingFailure = trainingPath.queryFailureCount > 0 && !trainingPath.hasUsableData;

  return (
    <View className="flex-1 bg-background" testID="home-screen">
      <AppHeader title="Home" />
      <FeedList
        primaryContent={
          <View className="gap-4" testID="home-training-workspace">
            {trainingPath.planningTimezoneState !== "ready" ? (
              <View className="gap-2 rounded-2xl border border-border bg-card p-4">
                <Text className="text-sm text-muted-foreground">
                  {trainingPath.timezoneSetupError ?? "Preparing your training workspace…"}
                </Text>
                {trainingPath.timezoneSetupError ? (
                  <Button
                    className="self-start"
                    disabled={trainingPath.timezoneInitializing}
                    onPress={() => void trainingPath.retryTimezoneInitialization()}
                    size="sm"
                    testID="home-training-setup-retry"
                    variant="outline"
                  >
                    <Text>Retry</Text>
                  </Button>
                ) : null}
              </View>
            ) : hasBlockingFailure ? (
              <View
                accessibilityRole="alert"
                className="gap-2 rounded-2xl border border-destructive/40 bg-card p-4"
                testID="home-training-error"
              >
                <Text className="font-semibold text-foreground">
                  Your training workspace is unavailable
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Check your connection and retry loading your plan.
                </Text>
                <Button
                  className="self-start"
                  onPress={trainingPath.handleRefresh}
                  size="sm"
                  testID="home-training-retry"
                  variant="outline"
                >
                  <Text>Retry</Text>
                </Button>
              </View>
            ) : (
              <PlanDashboardContent
                data={trainingPath}
                onCreateGoal={() => router.navigate(ROUTES.GOALS.CREATE as never)}
                onOpenGoal={(goalId) => router.navigate(ROUTES.GOALS.DETAIL(goalId) as never)}
                onOpenGoals={() => router.navigate(ROUTES.GOALS.LIST as never)}
                onOpenPlannedSession={(sessionId) =>
                  router.navigate(ROUTES.PLAN.EVENT_DETAIL(sessionId) as never)
                }
                onOpenSourceActivity={(activityId) =>
                  router.navigate(ROUTES.ACTIVITIES.DETAIL(activityId) as never)
                }
                onSelectedDateChange={(nextDate) => router.setParams({ date: nextDate })}
                onViewDetails={(anchorDate, period) =>
                  router.navigate(ROUTES.PLAN.PLANNING_LEDGER({ anchorDate, period }) as never)
                }
              />
            )}
          </View>
        }
      />
    </View>
  );
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <HomeScreen />
    </ErrorBoundary>
  );
}
