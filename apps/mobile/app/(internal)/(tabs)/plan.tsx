import { formatGoalTypeLabel, getGoalObjectiveSummary } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GoalEditorModal } from "@/components/goals";
import { usePlanDashboardViewModel } from "@/components/plan/usePlanDashboardViewModel";
import { usePlanGoalEditorController } from "@/components/plan/usePlanGoalEditorController";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function formatReadiness(readinessPercent: number | null) {
  if (typeof readinessPercent !== "number" || Number.isNaN(readinessPercent)) {
    return "--";
  }

  const rounded = Math.round(readinessPercent);
  return `${rounded}%`;
}

function formatLoadModeLabel(mode: string | null | undefined) {
  return mode === "goal_driven" ? "Based on your goal" : "Based on recent load";
}

function formatPriorityLabel(priority: number | undefined | null) {
  if (typeof priority !== "number") return "Medium";
  if (priority >= 8) return "High";
  if (priority >= 5) return "Medium";
  return "Low";
}

function PlanDashboardScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const { data: activePlan, refetch: refetchActivePlan } = api.trainingPlans.getActivePlan.useQuery(
    undefined,
    scheduleAwareReadQueryOptions,
  );
  const { data: ownPlans } = api.trainingPlans.list.useQuery(
    {
      includeOwnOnly: true,
      includeSystemTemplates: false,
    },
    scheduleAwareReadQueryOptions,
  );

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);

  const recentWindowStart = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 45);
    return getDateKey(start);
  }, [today]);

  const upcomingWindowEnd = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 365);
    return getDateKey(end);
  }, [today]);

  const upcomingPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: false,
      date_from: todayKey,
      date_to: upcomingWindowEnd,
      limit: 500,
    },
    scheduleAwareReadQueryOptions,
  );

  const recentPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: false,
      date_from: recentWindowStart,
      date_to: todayKey,
      limit: 500,
    },
    scheduleAwareReadQueryOptions,
  );

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
  });
  const goals = useProfileGoals();
  const goalEditor = usePlanGoalEditorController({
    activePlanId: activePlan?.id,
    goals,
  });
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);

  const dashboard = usePlanDashboardViewModel({
    activePlan,
    ownPlans,
    goals,
    snapshot,
    upcomingPlannedEvents: upcomingPlannedEventsQuery.data?.items,
    recentPlannedEvents: recentPlannedEventsQuery.data?.items,
    today,
  });

  useEffect(() => {
    const refreshKey = [
      activePlan?.id ?? "",
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
    ].join(":");

    if (!activePlan?.id) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }

    if (!upcomingPlannedEventsQuery.dataUpdatedAt && !recentPlannedEventsQuery.dataUpdatedAt) {
      return;
    }

    if (lastProjectionRefreshKeyRef.current === null) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }

    if (lastProjectionRefreshKeyRef.current === refreshKey) {
      return;
    }

    lastProjectionRefreshKeyRef.current = refreshKey;
    void Promise.all([refetchActivePlan(), snapshot.refetchAll()]);
  }, [
    activePlan?.id,
    recentPlannedEventsQuery.dataUpdatedAt,
    refetchActivePlan,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.dataUpdatedAt,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPlanTabData({
      refetchActivePlan,
      refetchSnapshot: snapshot.refetchAll,
      refetchGoals: goals.refetch,
      refetchUpcomingEvents: upcomingPlannedEventsQuery.refetch,
      refetchRecentEvents: recentPlannedEventsQuery.refetch,
    });
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="px-4 py-4 gap-4">
          <Card testID="plan-projection-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Forecasted Projection</CardTitle>
              <TouchableOpacity
                testID="projection-settings-button"
                onPress={() =>
                  navigateTo({
                    pathname: ROUTES.PLAN.TRAINING_PREFERENCES,
                  } as any)
                }
                className="rounded-full bg-primary/10 p-2"
                activeOpacity={0.8}
              >
                <Icon as={Settings} size={18} className="text-primary" />
              </TouchableOpacity>
            </CardHeader>
            <CardContent className="gap-3">
              {dashboard.weeklyLoadSummary ? (
                <View className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 gap-1">
                  <View className="flex-row items-end justify-between">
                    <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      This week&apos;s load
                    </Text>
                    <Text
                      className={`text-xs font-medium ${dashboard.weeklyLoadSummary.vsLastWeek >= 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {dashboard.weeklyLoadSummary.vsLastWeek >= 0 ? "+" : ""}
                      {dashboard.weeklyLoadSummary.vsLastWeek} vs last week
                    </Text>
                  </View>
                  <Text className="text-2xl font-semibold text-foreground">
                    {dashboard.weeklyLoadSummary.primaryLoad} TSS
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-1">
                    Recommended this week:{" "}
                    {Math.round(dashboard.weeklyLoadSummary.currentRecommended)} TSS.{" "}
                    {formatLoadModeLabel(dashboard.loadGuidance?.mode)}.
                  </Text>
                </View>
              ) : null}

              {dashboard.estimationWarning ? (
                <Text className="text-xs text-muted-foreground">{dashboard.estimationWarning}</Text>
              ) : null}

              {dashboard.nextGoal ? (
                <View className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 gap-1">
                  <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Next Goal
                  </Text>
                  <Text className="text-sm font-semibold text-foreground">
                    {dashboard.nextGoal.goal.title}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {new Date(
                      dashboard.nextGoal.goal.target_date + "T12:00:00.000Z",
                    ).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              ) : null}

              <View testID="plan-projection-chart">
                <PlanVsActualChart
                  timeline={dashboard.insightTimelinePoints}
                  actualData={dashboard.fitnessHistory}
                  projectedData={dashboard.projectedFitness}
                  idealData={dashboard.idealFitnessCurve}
                  goalMarkers={dashboard.goalMarkers}
                  goalMetrics={dashboard.goalMetrics}
                  height={360}
                  showLegend
                />
              </View>
            </CardContent>
          </Card>

          <Card testID="plan-goals-card">
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              {dashboard.lowReadinessExplainer ? (
                <Text className="text-xs text-muted-foreground">
                  {dashboard.lowReadinessExplainer}
                </Text>
              ) : null}
              {dashboard.goalReadiness.length === 0 ? (
                <Text className="text-sm text-muted-foreground">
                  {(dashboard.loadGuidance?.goal_count ?? 0) > 0
                    ? "Goal data is available and the detailed goal list is still syncing on this screen."
                    : "No profile goals yet. Add one to start planning with intent."}
                </Text>
              ) : (
                dashboard.goalReadiness.map(({ goal, readinessPercent, projectedCtl }) => (
                  <TouchableOpacity
                    key={goal.id}
                    onPress={() =>
                      navigateTo({
                        pathname: "/goal-detail",
                        params: { id: goal.id },
                      } as any)
                    }
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    testID={`plan-goal-row-${goal.id}`}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-sm font-semibold text-foreground">{goal.title}</Text>
                        <Text className="text-xs text-muted-foreground">
                          {formatGoalTypeLabel(goal)} · Priority:{" "}
                          {formatPriorityLabel(goal.priority)}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {getGoalObjectiveSummary(goal)}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {goal.target_date
                            ? `Target: ${new Date(goal.target_date + "T12:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                            : "No target date set"}
                        </Text>
                      </View>
                      <View className="items-end gap-2">
                        <Text className="text-base font-semibold text-primary">
                          {formatReadiness(readinessPercent)}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">Readiness</Text>
                        {projectedCtl != null ? (
                          <Text className="text-[11px] text-muted-foreground">
                            CTL {Math.round(projectedCtl)}
                          </Text>
                        ) : null}
                        {projectedCtl == null ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onPress={() => router.navigate(ROUTES.CALENDAR as any)}
                          >
                            <Text>Log</Text>
                          </Button>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <Button
                variant="outline"
                onPress={goalEditor.openCreateGoalEditor}
                testID="plan-add-goal-button"
              >
                <Text>Add Goal</Text>
              </Button>
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      <GoalEditorModal
        visible={goalEditor.isGoalModalVisible}
        initialValue={goalEditor.goalEditorInitialValue}
        title={goalEditor.goalEditorTitle}
        submitLabel={goalEditor.goalEditorSubmitLabel}
        isSubmitting={goalEditor.isGoalSaving}
        onClose={goalEditor.closeGoalEditor}
        onSubmit={goalEditor.submitGoal}
      />
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
