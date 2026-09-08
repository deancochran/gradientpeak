import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { CalendarTabView } from "@/components/calendar";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { PlanDashboardContent } from "@/components/plan/training-path/PlanDashboardContent";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";

type PlanView = "overview" | "calendar";

function PlanViewToggle({
  activeView,
  onChange,
}: {
  activeView: PlanView;
  onChange: (view: PlanView) => void;
}) {
  return (
    <Tabs onValueChange={(view) => onChange(view as PlanView)} value={activeView}>
      <TabsList
        className="mx-4 mt-3 flex-row rounded-2xl border border-border bg-muted/40 p-1"
        testId="plan-view-toggle"
      >
        {(["overview", "calendar"] as const).map((view) => {
          const selected = activeView === view;
          return (
            <TabsTrigger
              accessibilityState={{ selected }}
              className={
                selected
                  ? "flex-1 rounded-xl bg-background px-3 py-2 shadow-sm"
                  : "flex-1 rounded-xl px-3 py-2"
              }
              key={view}
              testId={`plan-view-${view}`}
              value={view}
            >
              <Text
                className={
                  selected
                    ? "text-center text-sm font-semibold text-foreground"
                    : "text-center text-sm font-semibold text-muted-foreground"
                }
              >
                {view === "overview" ? "Overview" : "Calendar"}
              </Text>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function PlanOverview() {
  const router = useRouter();
  usePerformanceScreenReady("route-plan");
  const trainingPath = usePlanTrainingPathData();
  const hasBlockingFailure = trainingPath.queryFailureCount > 0 && !trainingPath.hasUsableData;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-8 pt-3"
      refreshControl={
        <RefreshControl
          refreshing={trainingPath.refreshing}
          onRefresh={trainingPath.handleRefresh}
        />
      }
      testID="plan-scroll"
    >
      {trainingPath.queryFailureCount > 0 ? (
        <View
          accessibilityRole={hasBlockingFailure ? "alert" : undefined}
          className="gap-2 rounded-2xl border border-destructive/40 bg-card p-4"
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
        <PlanDashboardContent
          data={trainingPath}
          onCreateGoal={() => router.navigate(ROUTES.GOALS.CREATE as never)}
          onOpenGoal={(goalId) => router.navigate(ROUTES.GOALS.DETAIL(goalId) as never)}
          onOpenGoals={() => router.navigate(ROUTES.GOALS.LIST as never)}
          onOpenSourceActivity={(activityId) =>
            router.navigate(ROUTES.ACTIVITIES.DETAIL(activityId) as never)
          }
          onViewDetails={(date, period) =>
            router.navigate(ROUTES.PLAN.PLANNING_LEDGER({ anchorDate: date, period }) as never)
          }
        />
      ) : null}
    </ScrollView>
  );
}

function PlanDashboardScreen() {
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const activeView: PlanView = view === "calendar" ? "calendar" : "overview";

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <PlanViewToggle
        activeView={activeView}
        onChange={(nextView) =>
          router.navigate({
            pathname: "/(internal)/(tabs)/plan",
            params: { view: nextView },
          } as never)
        }
      />
      {activeView === "calendar" ? <CalendarTabView /> : <PlanOverview />}
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
