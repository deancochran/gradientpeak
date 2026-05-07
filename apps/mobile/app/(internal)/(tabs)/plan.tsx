import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Flag, Flame, Plus, Sparkles } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { CalendarMonthList } from "@/components/calendar/CalendarMonthList";
import { PlanReadinessComparisonChart } from "@/components/charts/PlanReadinessComparisonChart";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { usePlanDashboardViewModel } from "@/components/plan/usePlanDashboardViewModel";
import {
  AppHeader,
  CompactInsightCard,
  type DateRange,
  DetailChartModal,
} from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import {
  addMonthsToDateKey,
  getEndOfMonthKey,
  getMonthAnchor,
  getStartOfMonthKey,
  parseDateKey,
} from "@/lib/calendar/dateMath";
import { buildEventsByDate, type CalendarEvent } from "@/lib/calendar/normalizeEvents";
import { ROUTES } from "@/lib/constants/routes";
import { useAutoPaginateInfiniteQuery } from "@/lib/hooks/useAutoPaginateInfiniteQuery";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import {
  type CompactInsightLayout,
  getPlanInsightVisualPolicy,
  type InsightSource,
  type InsightVisualType,
} from "@/lib/insights/visualPolicy";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function loadBarWidth(value: number, max: number): `${number}%` {
  if (max <= 0) return "0%";
  return `${Math.max(4, Math.min(100, Math.round((value / max) * 100)))}%`;
}

function readinessBarWidth(value: number | null): `${number}%` {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${Math.max(4, Math.min(100, Math.round(value)))}%`;
}

function formatReadinessPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatGoalTargetDate(value: string | null | undefined) {
  if (!value) return "No target date";
  return compactDateTime(value);
}

function compactDateTime(value: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDateRangeStartKey(dateRange: DateRange, referenceDateKey?: string | null) {
  if (dateRange === "all" || !referenceDateKey) return null;
  const days = dateRange === "7d" ? 6 : dateRange === "30d" ? 29 : 89;
  const parsed = new Date(`${referenceDateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() - days);
  return getDateKey(parsed);
}

function filterByDateRange<T>(
  items: T[],
  dateRange: DateRange,
  referenceDateKey: string | null | undefined,
  getItemDate: (item: T) => string | null | undefined,
) {
  const startKey = getDateRangeStartKey(dateRange, referenceDateKey);
  if (!startKey || !referenceDateKey) return items;
  return items.filter((item) => {
    const itemDate = getItemDate(item);
    return !!itemDate && itemDate >= startKey && itemDate <= referenceDateKey;
  });
}

type PlanInsightKind = "load" | "readiness";

const PLAN_INSIGHT_VISUAL_POLICIES = {
  load: getPlanInsightVisualPolicy("loadComparison"),
  readiness: getPlanInsightVisualPolicy("readinessForecast"),
} satisfies Record<
  PlanInsightKind,
  { source: InsightSource; visualType: InsightVisualType; compactLayout: CompactInsightLayout }
>;

function getPlanToneClass(tone: "orange" | "green") {
  return tone === "orange"
    ? "bg-orange-500/10 border-orange-500/25"
    : "bg-green-500/10 border-green-500/25";
}

function buildMiniPath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function MiniLoadTrend({
  weeks,
}: {
  weeks: Array<{
    actual: number;
    scheduled: number;
    recommended: number;
    weekStart: string;
    isCurrentWeek?: boolean;
  }>;
}) {
  const visibleWeeks = weeks.slice(0, 6);
  const maxLoad = Math.max(
    1,
    ...visibleWeeks.flatMap((week) => [week.actual, week.scheduled, week.recommended]),
  );

  if (visibleWeeks.length === 0) {
    return <View className="h-24 rounded-2xl bg-muted/40" />;
  }

  const width = 150;
  const height = 104;
  const padding = 10;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const toPoints = (key: "actual" | "scheduled" | "recommended") =>
    visibleWeeks.map((week, index) => ({
      x:
        padding +
        (visibleWeeks.length <= 1 ? chartWidth : (index / (visibleWeeks.length - 1)) * chartWidth),
      y: padding + (1 - Math.max(0, Math.min(1, week[key] / maxLoad))) * chartHeight,
    }));
  const currentIndex = visibleWeeks.findIndex((week) => week.isCurrentWeek);
  const currentX =
    currentIndex >= 0
      ? padding + (currentIndex / Math.max(visibleWeeks.length - 1, 1)) * chartWidth
      : null;

  return (
    <View className="h-24 overflow-hidden rounded-2xl bg-muted/30">
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        {currentX !== null ? (
          <Line
            x1={currentX}
            y1={padding}
            x2={currentX}
            y2={height - padding}
            stroke="#94a3b8"
            strokeWidth={1}
            opacity={0.28}
          />
        ) : null}
        <Path
          d={buildMiniPath(toPoints("recommended"))}
          stroke="#22c55e"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
        <Path
          d={buildMiniPath(toPoints("scheduled"))}
          stroke="#60a5fa"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.86}
        />
        <Path
          d={buildMiniPath(toPoints("actual"))}
          stroke="#64748b"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function MiniReadinessTrend({
  points,
}: {
  points: Array<{
    actual: number | null;
    scheduled: number | null;
    recommended: number | null;
    date: string;
  }>;
}) {
  const visiblePoints = points.slice(-12);

  if (visiblePoints.length === 0) {
    return <View className="h-24 rounded-2xl bg-muted/40" />;
  }

  const width = 150;
  const height = 104;
  const padding = 10;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const toPoints = (key: "actual" | "scheduled" | "recommended") =>
    visiblePoints
      .map((point, index) => {
        const value = point[key];
        if (typeof value !== "number") return null;
        return {
          x:
            padding +
            (visiblePoints.length <= 1
              ? chartWidth
              : (index / (visiblePoints.length - 1)) * chartWidth),
          y: padding + (1 - Math.max(0, Math.min(100, value)) / 100) * chartHeight,
        };
      })
      .filter((point): point is { x: number; y: number } => point !== null);
  const actualPoints = toPoints("actual");
  const scheduledPoints = toPoints("scheduled");
  const recommendedPoints = toPoints("recommended");

  return (
    <View className="h-24 overflow-hidden rounded-2xl bg-muted/30">
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Rect
          x={padding}
          y={padding + chartHeight * 0.15}
          width={chartWidth}
          height={chartHeight * 0.3}
          rx={8}
          fill="#22c55e"
          opacity={0.13}
        />
        {scheduledPoints.length > 1 ? (
          <Path
            d={buildMiniPath(scheduledPoints)}
            stroke="#60a5fa"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.86}
          />
        ) : null}
        {recommendedPoints.length > 1 ? (
          <Path
            d={buildMiniPath(recommendedPoints)}
            stroke="#22c55e"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.92}
          />
        ) : null}
        {actualPoints.length > 1 ? (
          <Path
            d={buildMiniPath(actualPoints)}
            stroke="#64748b"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {actualPoints.at(-1) ? (
          <Circle cx={actualPoints.at(-1)!.x} cy={actualPoints.at(-1)!.y} r={3.5} fill="#64748b" />
        ) : null}
      </Svg>
    </View>
  );
}

function PlanInsightCard({
  title,
  value,
  icon,
  children,
  visualPolicy,
  onPress,
  testID,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
  visualPolicy: {
    source: InsightSource;
    visualType: InsightVisualType;
    compactLayout: CompactInsightLayout;
  };
  onPress: () => void;
  testID: string;
}) {
  return (
    <CompactInsightCard
      title={title}
      value={value}
      icon={icon}
      layout={visualPolicy.compactLayout}
      visualPolicy={visualPolicy}
      onPress={onPress}
      testID={testID}
    >
      {children}
    </CompactInsightCard>
  );
}

function PlanInsightDetailHero({
  category,
  value,
  detail,
  tone,
  children,
}: {
  category: string;
  value: string;
  detail: string;
  tone: "orange" | "green";
  children: React.ReactNode;
}) {
  return (
    <Card className={`rounded-3xl border bg-card ${getPlanToneClass(tone)}`}>
      <CardContent className="gap-4 p-5">
        <View>
          <Text className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {category}
          </Text>
          <Text className="text-4xl font-semibold text-foreground">{value}</Text>
          <Text className="mt-2 text-sm text-muted-foreground">{detail}</Text>
        </View>
        {children}
      </CardContent>
    </Card>
  );
}

function PlanKeyReadings({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <Card className="rounded-3xl border border-border bg-card">
      <CardContent className="gap-3 p-5">
        <Text className="text-base font-semibold text-foreground">Key readings</Text>
        {rows.map((row) => (
          <View
            key={row.label}
            className="flex-row justify-between gap-4 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
          >
            <Text className="flex-1 text-sm text-muted-foreground">{row.label}</Text>
            <Text className="flex-1 text-right text-sm font-medium text-foreground">
              {row.value}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

function PlanDashboardScreen() {
  const router = useRouter();
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
  const currentMonthAnchor = useMemo(() => getMonthAnchor(todayKey), [todayKey]);
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState(currentMonthAnchor);
  const [selectedPlanInsight, setSelectedPlanInsight] = useState<PlanInsightKind | null>(null);

  const calendarRangeStart = useMemo(
    () => getStartOfMonthKey(visibleCalendarMonth),
    [visibleCalendarMonth],
  );
  const calendarRangeEnd = useMemo(
    () => getEndOfMonthKey(visibleCalendarMonth),
    [visibleCalendarMonth],
  );
  const calendarMonthTitle = useMemo(
    () => format(parseDateKey(visibleCalendarMonth), "MMMM yyyy"),
    [visibleCalendarMonth],
  );

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

  const calendarEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: true,
      date_from: calendarRangeStart,
      date_to: calendarRangeEnd,
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      placeholderData: keepPreviousData,
    },
  );

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
    curveWindow: "overview",
  });
  const goals = useProfileGoals({ loadAllPages: true });
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
  const calendarEvents = useMemo(
    () => (calendarEventsQuery.data?.items ?? []) as CalendarEvent[],
    [calendarEventsQuery.data?.items],
  );
  const calendarEventsByDate = useMemo(() => buildEventsByDate(calendarEvents), [calendarEvents]);
  const calendarGoalDates = useMemo(
    () => new Set(goals.goals.map((goal) => goal.target_date).filter(Boolean) as string[]),
    [goals.goals],
  );
  const dashboard = usePlanDashboardViewModel({
    activePlan,
    ownPlans,
    goals,
    snapshot,
    upcomingPlannedEvents: upcomingPlannedEventsQuery.data?.items,
    recentPlannedEvents: recentPlannedEventsQuery.data?.items,
    today,
  });
  const loadCardValue = dashboard.currentWeekLoadDetail
    ? `${dashboard.currentWeekLoadDetail.actual}/${dashboard.currentWeekLoadDetail.recommended}`
    : dashboard.weeklyLoadBars.length > 0
      ? `${dashboard.weeklyLoadBars.length}w`
      : "--";
  const readinessCardValue =
    typeof dashboard.readinessForecast?.current_readiness === "number"
      ? `Current ${Math.round(dashboard.readinessForecast.current_readiness)}`
      : "--";
  const loadDetailRows = [
    {
      label: "Completed",
      value: dashboard.currentWeekLoadDetail
        ? `${dashboard.currentWeekLoadDetail.actual} TSS`
        : "--",
    },
    {
      label: "Scheduled",
      value: dashboard.currentWeekLoadDetail
        ? `${dashboard.currentWeekLoadDetail.scheduled} TSS`
        : "--",
    },
    {
      label: "Recommended",
      value: dashboard.currentWeekLoadDetail
        ? `${dashboard.currentWeekLoadDetail.recommended} TSS`
        : "--",
    },
  ];
  const readinessDetailRows = [
    { label: "Current", value: readinessCardValue },
    { label: "Confidence", value: dashboard.readinessConfidenceSummary?.label ?? "--" },
    { label: "Goal markers", value: String(dashboard.readinessGoalMarkers.length) },
  ];
  useEffect(() => {
    const refreshKey = [
      activePlan?.id ?? "",
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(goals.dataUpdatedAt ?? 0),
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
    goals.dataUpdatedAt,
    recentPlannedEventsQuery.dataUpdatedAt,
    refetchActivePlan,
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
      calendarEventsQuery.refetch(),
    ]);
    setRefreshing(false);
  };

  const handleCalendarDatePress = useCallback(
    (dateKey: string) => {
      const params: Record<string, string> = { date: dateKey };
      if (activePlan?.id) {
        params.trainingPlanId = activePlan.id;
      }

      router.navigate({
        pathname: "/(internal)/(standard)/calendar-day",
        params,
      } as never);
    },
    [activePlan?.id, router],
  );

  const handleChangeCalendarMonth = useCallback(
    (monthDelta: number) => {
      const nextMonth = getMonthAnchor(addMonthsToDateKey(visibleCalendarMonth, monthDelta));
      setVisibleCalendarMonth(nextMonth);
    },
    [visibleCalendarMonth],
  );

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="gap-5 px-4 pb-6 pt-3">
          <View className="gap-2" testID="plan-calendar-card">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                activeOpacity={0.7}
                className="h-8 w-8 items-center justify-center rounded-full bg-muted/50"
                onPress={() => handleChangeCalendarMonth(-1)}
                testID="plan-calendar-previous-month"
              >
                <Icon as={ChevronLeft} size={16} className="text-foreground" />
              </TouchableOpacity>
              <Text
                className="text-sm font-semibold text-foreground"
                testID="plan-calendar-month-title"
              >
                {calendarMonthTitle}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Next month"
                activeOpacity={0.7}
                className="h-8 w-8 items-center justify-center rounded-full bg-muted/50"
                onPress={() => handleChangeCalendarMonth(1)}
                testID="plan-calendar-next-month"
              >
                <Icon as={ChevronRight} size={16} className="text-foreground" />
              </TouchableOpacity>
            </View>
            <CalendarMonthList
              activeDate=""
              rangeStart={calendarRangeStart}
              rangeEnd={calendarRangeEnd}
              visibleMonthAnchor={visibleCalendarMonth}
              todayKey={todayKey}
              eventsByDate={calendarEventsByDate}
              goalDates={calendarGoalDates}
              compact
              scrollEnabled={false}
              showMonthTitle={false}
              showSurface={false}
              onVisibleMonthChange={setVisibleCalendarMonth}
              onReachStart={() => undefined}
              onReachEnd={() => undefined}
              onSelectDay={handleCalendarDatePress}
            />
            <View className="flex-row items-center gap-3 px-0.5">
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <Text className="text-[10px] font-medium text-muted-foreground">activity</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <Text className="text-[10px] font-medium text-muted-foreground">planned</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-full border border-amber-500" />
                <Text className="text-[10px] font-medium text-muted-foreground">goal</Text>
              </View>
            </View>
          </View>

          <View className="gap-2" testID="plan-goals-card">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.85}
                onPress={() => router.navigate(ROUTES.GOALS.LIST as never)}
                testID="plan-view-goals-button"
              >
                <Text className="text-sm font-semibold text-foreground">Goals</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="h-8 w-8 items-center justify-center rounded-full bg-primary"
                activeOpacity={0.85}
                onPress={() => router.navigate(ROUTES.GOALS.CREATE as never)}
                testID="plan-add-goal-button"
                accessibilityRole="button"
                accessibilityLabel="Add goal"
              >
                <Icon as={Plus} size={15} className="text-primary-foreground" />
              </TouchableOpacity>
            </View>
            {dashboard.goalReadiness.length > 0 ? (
              <View className="gap-2">
                {dashboard.goalReadiness.slice(0, 3).map(({ goal, readinessPercent }) => (
                  <TouchableOpacity
                    key={goal.id}
                    className="flex-row items-center gap-3 rounded-2xl bg-muted/30 px-3 py-2.5"
                    activeOpacity={0.85}
                    onPress={() => router.navigate(ROUTES.GOALS.DETAIL(goal.id) as never)}
                    testID={`plan-goal-row-${goal.id}`}
                  >
                    <View className="h-8 w-8 items-center justify-center rounded-full border border-amber-500/70 bg-amber-500/10">
                      <Icon as={Flag} size={14} className="text-foreground" />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text
                          className="flex-1 text-xs font-semibold text-foreground"
                          numberOfLines={1}
                        >
                          {goal.title}
                        </Text>
                        <Text className="text-[10px] font-semibold text-primary">
                          {formatReadinessPercent(readinessPercent)}
                        </Text>
                      </View>
                      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <View
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: readinessBarWidth(readinessPercent) }}
                        />
                      </View>
                      <Text className="text-[10px] text-muted-foreground">
                        {formatGoalTargetDate(goal.target_date)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-3"
                activeOpacity={0.85}
                onPress={() => router.navigate(ROUTES.GOALS.CREATE as never)}
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Icon as={Flag} size={14} className="text-muted-foreground" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground">No goals yet</Text>
                  <Text className="text-xs text-muted-foreground">
                    Add a target date to mark the calendar.
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-lg font-semibold text-foreground">Insights</Text>
            </View>
            <View className="flex-row flex-wrap gap-4">
              <PlanInsightCard
                title="Load Comparison"
                value={loadCardValue}
                icon={Flame}
                visualPolicy={PLAN_INSIGHT_VISUAL_POLICIES.load}
                onPress={() => setSelectedPlanInsight("load")}
                testID="plan-insight-card-load"
              >
                <MiniLoadTrend weeks={dashboard.weeklyLoadBars} />
              </PlanInsightCard>
              <PlanInsightCard
                title="Readiness Forecast"
                value={readinessCardValue}
                icon={Sparkles}
                visualPolicy={PLAN_INSIGHT_VISUAL_POLICIES.readiness}
                onPress={() => setSelectedPlanInsight("readiness")}
                testID="plan-insight-card-readiness"
              >
                <MiniReadinessTrend points={dashboard.readinessComparisonPoints} />
              </PlanInsightCard>
            </View>
          </View>

          {dashboard.upcomingImpact.length > 0 ? (
            <View className="gap-2" testID="plan-upcoming-impact">
              <Text className="text-sm font-semibold text-foreground">Upcoming</Text>
              {dashboard.upcomingImpact.slice(0, 3).map((impact) => (
                <View
                  key={`${impact.id}-${impact.scheduledAt}`}
                  className="flex-row items-center gap-3 py-1.5"
                >
                  <View className="h-8 w-1 rounded-full bg-primary/40" />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text
                        className="flex-1 text-xs font-semibold text-foreground"
                        numberOfLines={1}
                      >
                        {impact.title}
                      </Text>
                      <Text className="text-[10px] text-muted-foreground">
                        {compactDateTime(impact.scheduledAt)}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
                      {impact.estimatedLoad === null
                        ? "Load TBD"
                        : `${Math.round(impact.estimatedLoad)} TSS`}{" "}
                      ·{" "}
                      {impact.readinessDelta === null
                        ? "readiness impact TBD"
                        : `${impact.readinessDelta > 0 ? "+" : ""}${impact.readinessDelta} readiness`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <DetailChartModal
        visible={!!selectedPlanInsight}
        onClose={() => setSelectedPlanInsight(null)}
        title={selectedPlanInsight === "readiness" ? "Readiness Forecast" : "Load Comparison"}
        defaultDateRange="90d"
      >
        {(dateRange: DateRange) => {
          const rangeEndKey = dashboard.readinessForecast?.today ?? todayKey;
          const rangedReadinessPoints = filterByDateRange(
            dashboard.readinessComparisonPoints,
            dateRange,
            rangeEndKey,
            (point) => point.date,
          );
          const rangedReadinessGoalMarkers = filterByDateRange(
            dashboard.readinessGoalMarkers,
            dateRange,
            rangeEndKey,
            (marker) => marker.targetDate,
          );
          const rangedWeeklyLoadBars = filterByDateRange(
            dashboard.weeklyLoadBars,
            dateRange,
            rangeEndKey,
            (week) => week.weekStart,
          );
          const rangedTimelinePoints = filterByDateRange(
            dashboard.insightTimelinePoints,
            dateRange,
            rangeEndKey,
            (point) => point.date,
          );
          const rangedGoalMarkers = filterByDateRange(
            dashboard.goalMarkers,
            dateRange,
            rangeEndKey,
            (marker) => marker.targetDate,
          );

          return selectedPlanInsight === "readiness" ? (
            <View className="gap-4">
              <PlanInsightDetailHero
                category="Trajectory"
                value={readinessCardValue}
                detail={
                  dashboard.readinessConfidenceSummary?.reasons.join(" ") ||
                  "Actual readiness versus scheduled and recommended trajectories across your goal window."
                }
                tone="green"
              >
                <MiniReadinessTrend points={rangedReadinessPoints} />
              </PlanInsightDetailHero>
              <Card className="rounded-3xl border border-border bg-card">
                <CardContent className="p-5">
                  <View testID="plan-readiness-comparison-chart">
                    <PlanReadinessComparisonChart
                      points={rangedReadinessPoints}
                      goalMarkers={rangedReadinessGoalMarkers}
                      zones={dashboard.readinessForecast?.zones}
                      today={dashboard.readinessForecast?.today}
                      accessibilitySummary={dashboard.readinessAccessibilitySummary}
                      height={360}
                    />
                  </View>
                </CardContent>
              </Card>
              <PlanKeyReadings rows={readinessDetailRows} />
            </View>
          ) : (
            <View className="gap-4">
              <PlanInsightDetailHero
                category="Training plan"
                value={loadCardValue}
                detail={
                  dashboard.estimationWarning ??
                  "Recommended load versus your scheduled plan and completed work."
                }
                tone="orange"
              >
                <MiniLoadTrend weeks={rangedWeeklyLoadBars} />
              </PlanInsightDetailHero>
              <Card className="rounded-3xl border border-border bg-card">
                <CardContent className="p-5">
                  <View testID="plan-projection-chart">
                    <PlanVsActualChart
                      timeline={rangedTimelinePoints}
                      actualData={dashboard.fitnessHistory}
                      projectedData={dashboard.projectedFitness}
                      idealData={dashboard.idealFitnessCurve}
                      goalMarkers={rangedGoalMarkers}
                      goalMetrics={dashboard.goalMetrics}
                      height={360}
                      showLegend
                    />
                  </View>
                </CardContent>
              </Card>
              <PlanKeyReadings rows={loadDetailRows} />
              {rangedWeeklyLoadBars.length > 0 ? (
                <Card
                  className="rounded-3xl border border-border bg-card"
                  testID="plan-weekly-load-bars"
                >
                  <CardContent className="gap-3 p-5">
                    <Text className="text-base font-semibold text-foreground">Weekly Load Gap</Text>
                    {rangedWeeklyLoadBars.slice(0, 6).map((week) => {
                      const maxLoad = Math.max(1, week.actual, week.scheduled, week.recommended);
                      return (
                        <View key={week.weekStart} className="gap-1">
                          <Text className="text-[10px] font-medium text-muted-foreground">
                            {week.label}
                            {week.isCurrentWeek ? " · current" : ""}
                          </Text>
                          <View className="gap-1">
                            <View className="h-2 rounded-full bg-muted">
                              <View
                                className="h-2 rounded-full bg-slate-900 dark:bg-slate-100"
                                style={{ width: loadBarWidth(week.actual, maxLoad) }}
                              />
                            </View>
                            <View className="h-2 rounded-full bg-muted">
                              <View
                                className="h-2 rounded-full bg-blue-400"
                                style={{ width: loadBarWidth(week.scheduled, maxLoad) }}
                              />
                            </View>
                            <View className="h-2 rounded-full bg-muted">
                              <View
                                className="h-2 rounded-full bg-green-500"
                                style={{ width: loadBarWidth(week.recommended, maxLoad) }}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : null}
            </View>
          );
        }}
      </DetailChartModal>
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
