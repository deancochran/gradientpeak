import { formatGoalTypeLabel } from "@repo/core";
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
import { useAutoPaginateInfiniteQuery } from "@/lib/hooks/useAutoPaginateInfiniteQuery";
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

function formatPlanAnchorDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value.includes("T") ? value : `${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getWeeklyStatusCopy(
  weeklyLoadSummary:
    | {
        primaryLoad: number;
        currentRecommended: number;
      }
    | null
    | undefined,
) {
  if (!weeklyLoadSummary) {
    return "Add a goal or schedule your next sessions to build this week.";
  }

  const delta = weeklyLoadSummary.primaryLoad - Math.round(weeklyLoadSummary.currentRecommended);

  if (Math.abs(delta) <= 10) {
    return "You are on track for this week.";
  }

  if (delta < 0) {
    return "You are slightly below target this week.";
  }

  return "You are ahead of target this week.";
}

function getLoadSummaryText(primaryLoad: number | null, targetLoad: number | null) {
  if (primaryLoad == null || targetLoad == null) {
    return "No load target yet";
  }

  return `${primaryLoad} / ${targetLoad} TSS`;
}

function PlanDashboardScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const { data: activePlan, refetch: refetchActivePlan } = api.trainingPlans.getActivePlan.useQuery(
    undefined,
    scheduleAwareReadQueryOptions,
  );
  const ownPlansQuery = api.trainingPlans.list.useInfiniteQuery(
    {
      includeOwnOnly: true,
      includeSystemTemplates: false,
      limit: 25,
    },
    {
      ...scheduleAwareReadQueryOptions,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );
  const ownPlans = useMemo(
    () => ownPlansQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [ownPlansQuery.data],
  );
  useAutoPaginateInfiniteQuery({
    enabled: true,
    hasNextPage: ownPlansQuery.hasNextPage,
    isFetchingNextPage: ownPlansQuery.isFetchingNextPage,
    fetchNextPage: ownPlansQuery.fetchNextPage,
  });

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
  const goals = useProfileGoals({ loadAllPages: true });
  const goalEditor = usePlanGoalEditorController({ goals });
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
  const primaryActivePlan = dashboard.activePlansInProgress[0] ?? null;
  const nextSessionDate = formatPlanAnchorDate(primaryActivePlan?.nextEventAt);
  const nextGoalDate = formatPlanAnchorDate(dashboard.nextGoal?.goal.target_date);
  const weeklyLoadTarget = dashboard.weeklyLoadSummary
    ? Math.round(dashboard.weeklyLoadSummary.currentRecommended)
    : null;

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
          <Card testID="plan-week-summary-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>This Week</CardTitle>
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
              <View className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 gap-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-xs text-muted-foreground">Next session</Text>
                    <Text className="text-lg font-semibold text-foreground">
                      {nextSessionDate ?? "Nothing scheduled yet"}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="text-xs text-muted-foreground">Load target</Text>
                    <Text className="text-lg font-semibold text-foreground">
                      {getLoadSummaryText(
                        dashboard.weeklyLoadSummary?.primaryLoad ?? null,
                        weeklyLoadTarget,
                      )}
                    </Text>
                  </View>
                </View>
                <Text className="text-sm text-muted-foreground">
                  {getWeeklyStatusCopy(dashboard.weeklyLoadSummary)}
                </Text>
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                  {formatLoadModeLabel(dashboard.loadGuidance?.mode)}.
                </Text>
                <Button
                  variant="outline"
                  onPress={() => router.navigate(ROUTES.CALENDAR as any)}
                  testID="plan-open-schedule-button"
                >
                  <Text>Open Schedule</Text>
                </Button>
              </View>
            </CardContent>
          </Card>

          {dashboard.nextGoal ? (
            <TouchableOpacity
              onPress={() =>
                navigateTo({
                  pathname: "/goal-detail",
                  params: { id: dashboard.nextGoal?.goal.id },
                } as any)
              }
              className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 gap-2"
              activeOpacity={0.8}
              testID="plan-next-goal-card"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-xs uppercase tracking-wide text-primary">Next Goal</Text>
                  <Text className="text-base font-semibold text-foreground">
                    {dashboard.nextGoal.goal.title}
                  </Text>
                </View>
                <Text className="text-sm font-medium text-primary">
                  {nextGoalDate ?? "No date"}
                </Text>
              </View>
              <Text className="text-sm text-muted-foreground">
                {activePlan?.id
                  ? "Your current schedule is aligned to this target."
                  : "Add sessions to start building toward this target."}
              </Text>
            </TouchableOpacity>
          ) : null}

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
                    ? "Your goals are syncing to this screen now."
                    : "Add a goal to shape your schedule."}
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
                    className="rounded-xl border border-border bg-card px-4 py-3"
                    activeOpacity={0.8}
                    testID={`plan-goal-row-${goal.id}`}
                  >
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <View className="flex-row items-center justify-between gap-3">
                          <Text className="text-sm font-semibold text-foreground">
                            {goal.title}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted-foreground">
                          {formatGoalTypeLabel(goal)}
                          {goal.target_date
                            ? ` · ${formatShortDate(goal.target_date) ?? "date"}`
                            : ""}
                        </Text>
                      </View>
                      <View className="rounded-full bg-primary/10 px-3 py-1">
                        <Text className="text-xs font-semibold text-primary">
                          {formatReadiness(readinessPercent)} ready
                        </Text>
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

          <Card testID="plan-projection-card">
            <CardHeader>
              <CardTitle>Projection</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              <Text className="text-xs text-muted-foreground">
                Long-range trend for your current plan and goals.
              </Text>
              {dashboard.estimationWarning ? (
                <Text className="text-xs text-muted-foreground">{dashboard.estimationWarning}</Text>
              ) : null}
              <View testID="plan-projection-chart">
                <PlanVsActualChart
                  timeline={dashboard.insightTimelinePoints}
                  actualData={dashboard.fitnessHistory}
                  projectedData={dashboard.projectedFitness}
                  idealData={dashboard.idealFitnessCurve}
                  goalMarkers={dashboard.goalMarkers}
                  goalMetrics={dashboard.goalMetrics}
                  height={280}
                  showLegend
                />
              </View>
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
