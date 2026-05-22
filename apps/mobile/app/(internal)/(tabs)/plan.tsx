import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Flag, Plus, Settings } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { FitnessFatigueFormChart, PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { formatGoalTargetDate, GoalListItem } from "@/components/plan/GoalListItem";
import { usePlanDashboardViewModel } from "@/components/plan/usePlanDashboardViewModel";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import {
  attachSelectedGroupEventActivityPlans,
  getSelectedGroupEventActivityPlanIds,
  toGroupEventScheduledActivityPlanEvent,
} from "@/lib/calendar/groupEventPlans";
import { ROUTES } from "@/lib/constants/routes";
import { markEstimated } from "@/lib/estimatedMetrics";
import { useAutoPaginateInfiniteQuery } from "@/lib/hooks/useAutoPaginateInfiniteQuery";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { usePerformanceScreenReady } from "@/lib/performance";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
} from "@/lib/training-plan-form/projectionPreview";

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function formatMinutes(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function formatBaselineEstimate(dashboard: ReturnType<typeof usePlanDashboardViewModel>) {
  const estimate = dashboard.baselineEstimate;
  if (!estimate) return null;

  const parts = [
    typeof estimate.weeklyLoad === "number"
      ? markEstimated(`${estimate.weeklyLoad} TSS/week`)
      : null,
    typeof estimate.sessionsPerWeek === "number"
      ? `${estimate.sessionsPerWeek} sessions/week`
      : null,
    markEstimated(formatMinutes(estimate.weeklyDurationMinutes)),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function getPlanningStateCopy(dashboard: ReturnType<typeof usePlanDashboardViewModel>) {
  const gapType = dashboard.readinessForecast?.gap_summary?.type;
  const baselineEstimate = formatBaselineEstimate(dashboard);
  const targetDelta = dashboard.activityPlanMatchSummary.targetTssDelta;
  const targetDate =
    dashboard.activityPlanMatchSummary.targetDate ?? dashboard.scheduleAction?.date ?? null;
  const dateLabel = targetDate ? formatGoalTargetDate(targetDate) : "This week";
  const targetMetric =
    typeof targetDelta === "number" && Number.isFinite(targetDelta)
      ? markEstimated(`${Math.round(targetDelta)} TSS short`)
      : null;

  if (gapType === "low_confidence") {
    if (
      !dashboard.hasCompletedActivityHistory &&
      dashboard.goalOutlook.totalUpcomingGoalCount > 0
    ) {
      return {
        title: "Baseline plan estimate",
        body: baselineEstimate ?? "Built from your goals and training preferences",
        actionLabel: targetDate ? `View ${dateLabel}` : "Open calendar",
        supportingText: "Built from your goals and training preferences.",
      };
    }

    return {
      title: "Plan confidence is limited",
      body: "Missing session load",
      actionLabel: targetDate ? `Review ${dateLabel}` : "Review schedule",
      supportingText: null,
    };
  }

  if (gapType === "overload_risk") {
    return {
      title: `${dateLabel} load looks high`,
      body: "Above readiness path",
      actionLabel: targetDate ? `Review ${dateLabel}` : "Review schedule",
      supportingText: null,
    };
  }

  if (gapType === "plan_gap" || gapType === "goal_risk") {
    return {
      title: targetMetric ? `${dateLabel} is ${targetMetric}` : `${dateLabel} needs review`,
      body: "Below goal path",
      actionLabel: targetDate ? `Review ${dateLabel}` : "Review schedule",
      supportingText: null,
    };
  }

  return {
    title: "Schedule is aligned",
    body: "Tracking goal path",
    actionLabel: targetDate ? `View ${dateLabel}` : "Open calendar",
    supportingText: null,
  };
}

function compactDateTime(value: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateRangeLabel(startValue: string | null | undefined, endValue?: string | null) {
  if (!startValue) return "Current microcycle";
  const start = new Date(`${startValue}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "Current microcycle";
  const end = endValue ? new Date(`${endValue}T12:00:00.000Z`) : new Date(start);
  if (!endValue) {
    end.setUTCDate(end.getUTCDate() + 6);
  }
  if (Number.isNaN(end.getTime())) return compactDateTime(startValue);
  return `${compactDateTime(startValue)} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function getWeekStartDateKey(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysFromMonday);
  return getDateKey(parsed);
}

function addWeeks(dateKey: string, weekOffset: number) {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + weekOffset * 7);
  return getDateKey(parsed);
}

function getWeekEndDateKey(weekStart: string) {
  const parsed = new Date(`${weekStart}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return weekStart;
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return getDateKey(parsed);
}

type LoadDateRange = "30d" | "60d" | "90d" | "all";

const loadDateRanges: { label: string; value: LoadDateRange }[] = [
  { label: "30d", value: "30d" },
  { label: "60d", value: "60d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

function getDateRangeStartKey(dateRange: LoadDateRange, referenceDateKey?: string | null) {
  if (dateRange === "all" || !referenceDateKey) return null;
  const parsed = new Date(`${referenceDateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = dateRange === "30d" ? 30 : dateRange === "60d" ? 60 : 90;
  parsed.setDate(parsed.getDate() - days);
  return getDateKey(parsed);
}

function getDateRangeEndKey(dateRange: LoadDateRange, referenceDateKey?: string | null) {
  if (dateRange === "all" || !referenceDateKey) return null;
  const parsed = new Date(`${referenceDateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = dateRange === "30d" ? 30 : dateRange === "60d" ? 60 : 90;
  parsed.setDate(parsed.getDate() + days);
  return getDateKey(parsed);
}

function filterByDateRange<T>(
  items: T[],
  dateRange: LoadDateRange,
  referenceDateKey: string | null | undefined,
  getItemDate: (item: T) => string | null | undefined,
) {
  const startKey = getDateRangeStartKey(dateRange, referenceDateKey);
  const endKey = getDateRangeEndKey(dateRange, referenceDateKey);
  if (!startKey || !endKey) return items;
  return items.filter((item) => {
    const itemDate = getItemDate(item);
    return !!itemDate && itemDate >= startKey && itemDate <= endKey;
  });
}

function getLoadTotalsForWeek(
  timeline: Array<{
    date: string;
    completed_load_tss?: number | null;
    scheduled_load_tss?: number | null;
    recommended_load_tss?: number | null;
    ideal_tss?: number | null;
  }>,
  weekStart: string,
  weekEnd: string,
) {
  return timeline.reduce(
    (totals, point) => {
      if (point.date < weekStart || point.date > weekEnd) {
        return totals;
      }

      return {
        completed: totals.completed + (point.completed_load_tss ?? 0),
        scheduled: totals.scheduled + (point.scheduled_load_tss ?? 0),
        recommended: totals.recommended + (point.recommended_load_tss ?? point.ideal_tss ?? 0),
      };
    },
    { completed: 0, scheduled: 0, recommended: 0 },
  );
}

function getWeeklyLoadInsight(input: {
  completed: number;
  scheduled: number;
  recommended: number;
  weekEnd: string;
  todayKey: string;
}) {
  const scheduledGap = Math.round(input.scheduled - input.recommended);
  const completedGap = Math.round(input.completed - input.scheduled);
  const isPastOrCurrent = input.weekEnd <= input.todayKey;

  if (isPastOrCurrent && Math.abs(completedGap) >= 10) {
    return completedGap < 0
      ? `${Math.abs(completedGap)} TSS behind schedule`
      : `${completedGap} TSS ahead of schedule`;
  }

  if (Math.abs(scheduledGap) < 10) {
    return "Aligned with recommended load";
  }

  return scheduledGap < 0
    ? `${Math.abs(scheduledGap)} TSS under recommended`
    : `${scheduledGap} TSS over recommended`;
}

function PlanDashboardScreen() {
  const router = useRouter();
  usePerformanceScreenReady("route-plan");
  const [refreshing, setRefreshing] = useState(false);
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );

  const { data: activePlan, refetch: refetchActivePlan } = api.trainingPlans.getActivePlan.useQuery(
    undefined,
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
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
  const [loadDateRange, setLoadDateRange] = useState<LoadDateRange>("90d");
  const [loadAnalysisWeekOffset, setLoadAnalysisWeekOffset] = useState(0);

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
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
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

  const groupCalendarEventsQuery = api.groups.events.myCalendarGroupEvents.useQuery(
    {
      includeCancelled: false,
      startsAfter: `${recentWindowStart}T00:00:00.000Z`,
      startsBefore: `${upcomingWindowEnd}T23:59:59.999Z`,
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );
  const groupCalendarEvents = useMemo(
    () => groupCalendarEventsQuery.data?.items ?? [],
    [groupCalendarEventsQuery.data?.items],
  );
  const selectedGroupActivityPlanIds = useMemo(
    () => getSelectedGroupEventActivityPlanIds(groupCalendarEvents),
    [groupCalendarEvents],
  );
  const selectedGroupActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: selectedGroupActivityPlanIds },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled && selectedGroupActivityPlanIds.length > 0,
    },
  );
  const groupScheduledActivityPlanEvents = useMemo(
    () =>
      attachSelectedGroupEventActivityPlans(
        groupCalendarEvents,
        selectedGroupActivityPlansQuery.data?.items ?? [],
      )
        .map(toGroupEventScheduledActivityPlanEvent)
        .filter(isPresent),
    [groupCalendarEvents, selectedGroupActivityPlansQuery.data?.items],
  );

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
    curveWindow: "overview",
  });
  const goals = useProfileGoals({ loadAllPages: true });
  const profileSettings = useProfileSettings();
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
  const dashboard = usePlanDashboardViewModel({
    activePlan,
    ownPlans,
    goals,
    profileSettings: profileSettings.settings,
    snapshot,
    upcomingPlannedEvents: upcomingPlannedEventsQuery.data?.items,
    recentPlannedEvents: recentPlannedEventsQuery.data?.items,
    today,
  });
  const localProjectionPreview = useMemo(
    () =>
      buildTrainingPreferencesProjectionPreview({
        draft: profileSettings.settings,
        fitnessHistory: dashboard.fitnessHistory,
        snapshot,
      }),
    [dashboard.fitnessHistory, profileSettings.settings, snapshot],
  );
  const loadTimelinePoints = useMemo(
    () =>
      buildTrainingPreferencesLoadTimeline({
        projectionChart: localProjectionPreview.projectionChart,
        snapshot,
        scheduledEvents: [
          ...(recentPlannedEventsQuery.data?.items ?? []),
          ...(upcomingPlannedEventsQuery.data?.items ?? []),
          ...groupScheduledActivityPlanEvents,
        ],
        scheduledWindowStart: recentWindowStart,
        scheduledWindowEnd: upcomingWindowEnd,
      }),
    [
      localProjectionPreview.projectionChart,
      groupScheduledActivityPlanEvents,
      recentPlannedEventsQuery.data?.items,
      recentWindowStart,
      snapshot,
      upcomingPlannedEventsQuery.data?.items,
      upcomingWindowEnd,
    ],
  );
  const planningStateCopy = getPlanningStateCopy(dashboard);
  const baseLoadAnalysisWeekStart =
    dashboard.currentWeekLoadDetail?.weekStart ?? getWeekStartDateKey(todayKey);
  const loadAnalysisWeekStart = addWeeks(baseLoadAnalysisWeekStart, loadAnalysisWeekOffset);
  const loadAnalysisWeekEnd = getWeekEndDateKey(loadAnalysisWeekStart);
  const loadRangeReferenceKey = loadAnalysisWeekStart;
  const rangedTimelinePoints = filterByDateRange(
    loadTimelinePoints,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const rangedFitnessHistory = filterByDateRange(
    dashboard.fitnessHistory,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const rangedProjectedFitness = filterByDateRange(
    dashboard.projectedFitness,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const rangedIdealFitnessCurve = filterByDateRange(
    dashboard.idealFitnessCurve,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const selectedWeekLoadTotals = getLoadTotalsForWeek(
    loadTimelinePoints,
    loadAnalysisWeekStart,
    loadAnalysisWeekEnd,
  );
  const weeklyLoadInsight = getWeeklyLoadInsight({
    ...selectedWeekLoadTotals,
    weekEnd: loadAnalysisWeekEnd,
    todayKey,
  });
  const loadDetailRows = [
    {
      label: "Completed",
      value: `${Math.round(selectedWeekLoadTotals.completed)} TSS`,
    },
    {
      label: "Scheduled",
      value: markEstimated(`${Math.round(selectedWeekLoadTotals.scheduled)} TSS`),
    },
    {
      label: "Recommended",
      value: markEstimated(`${Math.round(selectedWeekLoadTotals.recommended)} TSS`),
    },
  ];
  const planAnalysisDateRangeLabel = formatDateRangeLabel(
    loadAnalysisWeekStart,
    loadAnalysisWeekEnd,
  );
  useEffect(() => {
    const refreshKey = [
      activePlan?.id ?? "",
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(groupCalendarEventsQuery.dataUpdatedAt ?? 0),
      String(selectedGroupActivityPlansQuery.dataUpdatedAt ?? 0),
      String(goals.dataUpdatedAt ?? 0),
    ].join(":");

    if (!activePlan?.id) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }

    if (
      !upcomingPlannedEventsQuery.dataUpdatedAt &&
      !recentPlannedEventsQuery.dataUpdatedAt &&
      !groupCalendarEventsQuery.dataUpdatedAt
    ) {
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
    goals.dataUpdatedAt,
    groupCalendarEventsQuery.dataUpdatedAt,
    recentPlannedEventsQuery.dataUpdatedAt,
    refetchActivePlan,
    selectedGroupActivityPlansQuery.dataUpdatedAt,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.dataUpdatedAt,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshPlanTabData({
        refetchActivePlan,
        refetchSnapshot: snapshot.refetchAll,
        refetchGoals: goals.refetch,
        refetchUpcomingEvents: upcomingPlannedEventsQuery.refetch,
        refetchRecentEvents: recentPlannedEventsQuery.refetch,
      }),
      groupCalendarEventsQuery.refetch(),
      selectedGroupActivityPlanIds.length > 0
        ? selectedGroupActivityPlansQuery.refetch()
        : Promise.resolve(null),
    ]);
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="gap-5 px-4 pb-6 pt-3">
          <View className="gap-3" testID="plan-goal-outlook">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">Goals</Text>
              <TouchableOpacity
                className="rounded-full border border-border px-3 py-1.5"
                activeOpacity={0.85}
                onPress={() => router.navigate(ROUTES.GOALS.LIST as never)}
                testID="plan-view-goals-button"
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-foreground">View all</Text>
              </TouchableOpacity>
            </View>
            {dashboard.goalOutlook.featured.length > 0 ? (
              <View className="gap-3">
                {dashboard.goalOutlook.featured.map(
                  ({ goal, label, readinessPercent, readinessTarget, status }) => (
                    <GoalListItem
                      key={goal.id}
                      goal={goal}
                      label={label}
                      readinessPercent={readinessPercent}
                      readinessTarget={readinessTarget}
                      status={status}
                      onPress={() => router.navigate(ROUTES.GOALS.DETAIL(goal.id) as never)}
                      testID={`plan-goal-outlook-card-${goal.id}`}
                    />
                  ),
                )}
                {dashboard.goalOutlook.hiddenNextDayGoalCount > 0 ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.85}
                    className="flex-row items-center justify-between rounded-2xl border border-border px-3 py-2.5"
                    onPress={() => router.navigate(ROUTES.GOALS.LIST as never)}
                    testID="plan-hidden-next-day-goals"
                  >
                    <Text className="flex-1 text-xs font-medium text-muted-foreground">
                      {dashboard.goalOutlook.hiddenNextDayGoalCount} more goal
                      {dashboard.goalOutlook.hiddenNextDayGoalCount === 1 ? "" : "s"} on{" "}
                      {formatGoalTargetDate(dashboard.goalOutlook.nextTargetDate)}
                    </Text>
                    <Icon as={ChevronRight} size={14} className="text-muted-foreground" />
                  </TouchableOpacity>
                ) : null}
                {dashboard.goalOutlook.canAddGoal ? (
                  <TouchableOpacity
                    className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-3"
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Add another goal"
                    onPress={() => router.navigate(ROUTES.GOALS.CREATE as never)}
                    testID="plan-add-goal-button"
                  >
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Icon as={Plus} size={14} className="text-muted-foreground" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">Add another goal</Text>
                      <Text className="text-xs text-muted-foreground">
                        Plan for targets beyond what is already scheduled.
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity
                className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-3"
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add goal"
                onPress={() => router.navigate(ROUTES.GOALS.CREATE as never)}
                testID="plan-add-goal-button"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Icon as={Flag} size={14} className="text-muted-foreground" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground">No goals yet</Text>
                  <Text className="text-xs text-muted-foreground">
                    Add a goal to shape the plan around what you're training for.
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View className="gap-3" testID="plan-analysis-section">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground">Plan analysis</Text>
              <TouchableOpacity
                className="rounded-full border border-border px-3 py-1.5"
                activeOpacity={0.85}
                onPress={() => router.navigate(ROUTES.PLAN.CALENDAR_DAY(todayKey) as never)}
                testID="plan-today-agenda-button"
                accessibilityRole="button"
                accessibilityLabel="View today's agenda"
              >
                <Text className="text-xs font-semibold text-foreground">Today</Text>
              </TouchableOpacity>
            </View>
            <View
              className="gap-4 rounded-2xl border border-border bg-card p-4"
              testID="plan-state-card"
            >
              <View className="gap-1">
                <Text className="text-lg font-semibold text-foreground" numberOfLines={2}>
                  {planningStateCopy.title}
                </Text>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    accessibilityLabel="Show previous load analysis week"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                    className="h-7 w-7 items-center justify-center rounded-full border border-border bg-background"
                    onPress={() => setLoadAnalysisWeekOffset((offset) => offset - 1)}
                    testID="plan-analysis-week-previous"
                  >
                    <Icon as={ChevronLeft} size={14} className="text-muted-foreground" />
                  </TouchableOpacity>
                  <Text
                    className="text-xs font-semibold text-muted-foreground"
                    testID="plan-analysis-week-range"
                  >
                    {planAnalysisDateRangeLabel}
                  </Text>
                  <TouchableOpacity
                    accessibilityLabel="Show next load analysis week"
                    accessibilityRole="button"
                    activeOpacity={0.85}
                    className="h-7 w-7 items-center justify-center rounded-full border border-border bg-background"
                    onPress={() => setLoadAnalysisWeekOffset((offset) => offset + 1)}
                    testID="plan-analysis-week-next"
                  >
                    <Icon as={ChevronRight} size={14} className="text-muted-foreground" />
                  </TouchableOpacity>
                </View>
                <Text className="text-xs font-medium text-muted-foreground">
                  {planningStateCopy.body}
                </Text>
                {planningStateCopy.supportingText ? (
                  <Text className="text-xs text-muted-foreground">
                    {planningStateCopy.supportingText}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {loadDetailRows.map((stat) => (
                  <View key={stat.label} className="min-w-[92px] flex-1">
                    <Text
                      className="text-[10px] font-medium text-muted-foreground"
                      numberOfLines={1}
                    >
                      {stat.label}
                    </Text>
                    <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                      {stat.value}
                    </Text>
                  </View>
                ))}
              </View>
              <Text
                className="text-xs font-semibold text-muted-foreground"
                testID="plan-analysis-load-insight"
              >
                {weeklyLoadInsight}
              </Text>
            </View>
          </View>

          <View className="gap-3" testID="plan-signals">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-sm font-semibold text-foreground">
                Weekly training load (TSS)
              </Text>
              <View className="flex-row items-center gap-2">
                <View
                  className="flex-row rounded-full border border-border bg-card p-0.5"
                  testID="plan-load-range-selector"
                >
                  {loadDateRanges.map((range) => {
                    const isSelected = loadDateRange === range.value;
                    return (
                      <TouchableOpacity
                        key={range.value}
                        accessibilityRole="button"
                        activeOpacity={0.85}
                        className={`rounded-full px-2 py-1 ${isSelected ? "bg-primary" : "bg-transparent"}`}
                        onPress={() => setLoadDateRange(range.value)}
                        testID={`plan-load-range-${range.value}`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            isSelected ? "text-primary-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {range.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  accessibilityLabel="Edit training preferences"
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  className="h-8 w-8 items-center justify-center rounded-full border border-border bg-card"
                  onPress={() => router.navigate(ROUTES.PLAN.TRAINING_PREFERENCES as never)}
                  testID="plan-signals-settings-button"
                >
                  <Icon as={Settings} size={15} className="text-muted-foreground" />
                </TouchableOpacity>
              </View>
            </View>
            <View testID="plan-insight-card-load">
              <View testID="plan-projection-chart">
                <PlanVsActualChart
                  timeline={rangedTimelinePoints}
                  actualData={rangedFitnessHistory}
                  projectedData={rangedProjectedFitness}
                  idealData={rangedIdealFitnessCurve}
                  goalMarkers={dashboard.goalMarkers}
                  goalMetrics={dashboard.goalMetrics}
                  highlightedRange={{ start: loadAnalysisWeekStart, end: loadAnalysisWeekEnd }}
                  height={260}
                  showLegend
                />
              </View>
            </View>
            <View className="gap-2" testID="plan-fitness-fatigue-card">
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">
                  Fitness, fatigue & form
                </Text>
                <Text className="text-xs text-muted-foreground">
                  TrainingPeaks-style trend of CTL, ATL, and TSB across the selected range.
                </Text>
              </View>
              <View testID="plan-fitness-fatigue-chart">
                <FitnessFatigueFormChart
                  actualData={rangedFitnessHistory}
                  projectedData={rangedProjectedFitness}
                  height={260}
                  showLegend
                />
              </View>
            </View>
          </View>
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
