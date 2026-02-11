import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GhostCard } from "@/components/plan/GhostCard";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { FitnessProgressCard } from "@/components/home/FitnessProgressCard";
import { DetailChartModal } from "@/components/shared/DetailChartModal";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { TrainingLoadChart } from "@/components/charts/TrainingLoadChart";
import { PlanAdherenceMiniChart } from "@/components/plan/PlanAdherenceMiniChart";
import { PlanCapabilityMiniChart } from "@/components/plan/PlanCapabilityMiniChart";
import { PlanStatusSummaryCard } from "@/components/plan/PlanStatusSummaryCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";

import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { CalendarDays, Play, Settings } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useColorScheme } from "nativewind";

// No longer need local transform function - ActivityPlanCard handles it internally

function PlanScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]!,
  );
  const [currentMonth, setCurrentMonth] = useState<string>(
    new Date().toISOString().split("T")[0]!,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalDate, setScheduleModalDate] = useState<
    string | undefined
  >();
  const [trainingStatusModalVisible, setTrainingStatusModalVisible] =
    useState(false);
  const [selectedInsightRange, setSelectedInsightRange] = useState<7 | 30 | 90>(
    30,
  );

  const todayDate = useMemo(() => new Date(), []);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const insightWindow = useMemo(() => {
    const endDateValue = new Date();
    const startDateValue = new Date(endDateValue);
    startDateValue.setDate(endDateValue.getDate() - (selectedInsightRange - 1));

    return {
      start_date: startDateValue.toISOString().split("T")[0]!,
      end_date: endDateValue.toISOString().split("T")[0]!,
    };
  }, [selectedInsightRange]);

  // Calculate month range for calendar
  const { startDate, endDate } = useMemo(() => {
    const date = new Date(currentMonth);
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
      startDate: start.toISOString().split("T")[0]!,
      endDate: end.toISOString().split("T")[0]!,
    };
  }, [currentMonth]);

  // Query for training plan
  const {
    data: plan,
    isLoading: loadingPlan,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery();

  const {
    data: status,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: !!plan,
  });

  const {
    data: insightTimeline,
    isLoading: loadingInsightTimeline,
    isError: insightTimelineError,
    refetch: refetchInsightTimeline,
  } = trpc.trainingPlans.getInsightTimeline.useQuery(
    {
      training_plan_id: plan?.id || "",
      start_date: insightWindow.start_date,
      end_date: insightWindow.end_date,
      timezone,
    },
    {
      enabled: !!plan?.id,
    },
  );

  // Query for activities in the current month
  const {
    data: activitiesData,
    isLoading: loadingAllPlanned,
    refetch: refetchActivities,
  } = trpc.plannedActivities.list.useQuery({
    date_from: startDate,
    date_to: endDate,
    training_plan_id: plan?.id,
    include_adhoc: true,
    limit: 100,
  });

  const allPlannedActivities = { items: activitiesData?.items || [] };

  // Get completed activities for the month
  const { data: completedActivities } = trpc.activities.list.useQuery(
    {
      date_from: startDate,
      date_to: endDate,
    },
    {
      enabled: !!startDate && !!endDate,
    },
  );

  // Calculate date ranges for fitness data
  const today = todayDate;
  const thirtyDaysAgo = useMemo(() => {
    const date = new Date(today);
    date.setDate(today.getDate() - 30);
    return date;
  }, [today]);
  const fourteenDaysAhead = useMemo(() => {
    const date = new Date(today);
    date.setDate(today.getDate() + 14);
    return date;
  }, [today]);

  // Get actual fitness curve (last 30 days)
  const { data: actualCurveData, refetch: refetchFitnessHistory } =
    trpc.trainingPlans.getActualCurve.useQuery(
      {
        start_date: thirtyDaysAgo.toISOString().split("T")[0]!,
        end_date: today.toISOString().split("T")[0]!,
      },
      { enabled: !!plan },
    );

  // Get ideal fitness curve from training plan (if exists)
  const { data: idealCurveData, refetch: refetchIdealCurve } =
    trpc.trainingPlans.getIdealCurve.useQuery(
      {
        id: plan?.id || "",
        start_date: thirtyDaysAgo.toISOString().split("T")[0]!,
        end_date: fourteenDaysAhead.toISOString().split("T")[0]!,
      },
      {
        enabled: !!plan?.id,
      },
    );

  // Extract data from API responses
  const fitnessHistory = useMemo(
    () => actualCurveData?.dataPoints || [],
    [actualCurveData],
  );
  const idealFitnessCurve = useMemo(
    () => idealCurveData?.dataPoints || [],
    [idealCurveData],
  );
  const projectedFitness = useMemo(() => {
    // Extract future dates from ideal curve (after today)
    if (!idealCurveData?.dataPoints) return [];
    const todayStr = today.toISOString().split("T")[0];
    return idealCurveData.dataPoints.filter((d) => d.date > todayStr);
  }, [idealCurveData, today]);

  // Prepare 7-day rolling window: 3 days back + today + 3 days forward
  const fitnessChartData = useMemo(() => {
    if (!fitnessHistory || fitnessHistory.length === 0) return undefined;

    const todayStr = today.toISOString().split("T")[0];

    // Create array of dates: -3, -2, -1, 0 (today), +1, +2, +3
    const dates: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split("T")[0]!);
    }

    // Map to actual CTL values, or null for future dates
    const ctlValues = dates.map((dateStr) => {
      const dataPoint = fitnessHistory.find((d) => d.date === dateStr);
      return dataPoint ? dataPoint.ctl : null;
    });

    // Only return if we have at least today's data
    const hasData = ctlValues.some((v) => v !== null);
    return hasData ? ctlValues.map((v) => v || 0) : undefined;
  }, [fitnessHistory, today]);

  // Prepare ideal fitness trend data for the same 7-day window
  const idealChartData = useMemo(() => {
    if (!idealFitnessCurve || idealFitnessCurve.length === 0) {
      return undefined;
    }

    // Create array of dates: -3, -2, -1, 0 (today), +1, +2, +3
    const dates: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split("T")[0]!);
    }

    // Map to ideal CTL values
    const idealValues = dates.map((dateStr) => {
      const idealPoint = idealFitnessCurve.find((d) => d.date === dateStr);
      return idealPoint ? idealPoint.ctl : null;
    });

    // Only return if we have meaningful data
    const hasData = idealValues.some((v) => v !== null);
    return hasData ? idealValues.map((v) => v || 0) : undefined;
  }, [idealFitnessCurve, today]);

  // Get current CTL value
  const currentCTL = useMemo(() => {
    if (!fitnessHistory || fitnessHistory.length === 0) return 0;
    return Math.round(fitnessHistory[fitnessHistory.length - 1]?.ctl || 0);
  }, [fitnessHistory]);

  // Calculate ideal CTL for today
  const idealCTLToday = useMemo(() => {
    if (!idealFitnessCurve || idealFitnessCurve.length === 0) return undefined;
    const today = new Date().toISOString().split("T")[0];
    const todayData = idealFitnessCurve.find((d) => d.date === today);
    return todayData ? Math.round(todayData.ctl) : undefined;
  }, [idealFitnessCurve]);

  // Calculate how far behind/ahead of plan
  const behindSchedule = useMemo(() => {
    if (idealCTLToday === undefined) return undefined;
    return Math.round(currentCTL - idealCTLToday);
  }, [currentCTL, idealCTLToday]);

  // Get goal metrics from ideal curve data
  const goalMetrics = useMemo(() => {
    if (!idealCurveData) return undefined;
    return {
      targetCTL: idealCurveData.targetCTL,
      targetDate: idealCurveData.targetDate,
      description: `Target: ${idealCurveData.targetCTL} CTL by ${new Date(idealCurveData.targetDate).toLocaleDateString()}`,
    };
  }, [idealCurveData]);

  // Build marked dates for calendar
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const activities = activitiesData?.items || [];

    // Theme colors for dots
    const primaryDotColor = isDark ? "#fafafa" : "#171717"; // primary color
    const mutedDotColor = isDark ? "#737373" : "#a3a3a3"; // muted color for ad-hoc
    const completedDotColor = "#22c55e"; // green-500 for completed

    // Mark planned activities
    activities.forEach((activity) => {
      const date = activity.scheduled_date;
      const isPlanActivity = !!(activity as any).training_plan_id;

      if (!marks[date]) {
        marks[date] = {
          marked: true,
          dots: [],
        };
      }

      marks[date].dots.push({
        color: isPlanActivity ? primaryDotColor : mutedDotColor,
        selectedDotColor: isPlanActivity ? primaryDotColor : mutedDotColor,
      });
    });

    // Mark completed activities with a different color
    if (completedActivities && Array.isArray(completedActivities)) {
      completedActivities.forEach((activity) => {
        const date = new Date(activity.started_at).toISOString().split("T")[0];
        if (!date) return;

        if (!marks[date]) {
          marks[date] = {
            marked: true,
            dots: [],
          };
        }

        // If already has a planned activity, mark it as completed
        if (marks[date].dots && marks[date].dots.length > 0) {
          marks[date].dots[0].color = completedDotColor;
          marks[date].dots[0].selectedDotColor = completedDotColor;
        }
      });
    }

    // Highlight selected date
    if (selectedDate) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: isDark ? "#fafafa" : "#171717",
      };
    }

    return marks;
  }, [activitiesData, completedActivities, selectedDate, isDark]);

  // Get activities for the selected date
  const selectedDayActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    return allPlannedActivities.items.filter((activity) => {
      return activity.scheduled_date === selectedDate;
    });
  }, [allPlannedActivities, selectedDate]);

  // Calculate adherence rate from status.weekProgress
  const adherenceRate = useMemo(() => {
    if (!status?.weekProgress) return 0;
    const total = status.weekProgress.totalPlannedActivities;
    if (total === 0) return 0;
    return Math.round((status.weekProgress.completedActivities / total) * 100);
  }, [status]);

  const insightTimelinePoints = useMemo(
    () => insightTimeline?.timeline || [],
    [insightTimeline],
  );

  const activeGoalFeasibility = useMemo(
    () => insightTimeline?.goal_feasibility?.[0],
    [insightTimeline],
  );

  const activeGoalSafety = useMemo(
    () => insightTimeline?.goal_safety?.[0],
    [insightTimeline],
  );

  const divergenceSummary = useMemo(() => {
    if (!insightTimelinePoints.length) {
      return "No load divergence available in this window.";
    }

    const latestPoint =
      insightTimelinePoints[insightTimelinePoints.length - 1]!;
    const scheduled = latestPoint.scheduled_tss;
    const actual = latestPoint.actual_tss;
    const deltaPct =
      scheduled > 0
        ? Math.round(((actual - scheduled) / scheduled) * 100)
        : actual > 0
          ? 100
          : 0;

    if (deltaPct > 0) {
      return `Actual load is ${Math.abs(deltaPct)}% over scheduled in the latest session window.`;
    }

    if (deltaPct < 0) {
      return `Actual load is ${Math.abs(deltaPct)}% under scheduled in the latest session window.`;
    }

    return "Actual load is on schedule in the latest session window.";
  }, [insightTimelinePoints]);

  const capabilityCurrentEstimate = useMemo(() => {
    const directValue = insightTimeline?.capability?.cp_or_cs;
    if (typeof directValue === "number") {
      return directValue;
    }

    if (!insightTimelinePoints.length) {
      return null;
    }

    return insightTimelinePoints[insightTimelinePoints.length - 1]!.actual_tss;
  }, [insightTimeline, insightTimelinePoints]);

  const capabilityProjectionEstimate = useMemo(() => {
    const directProjection =
      insightTimeline?.projection?.at_goal_date?.projected_goal_metric;
    if (typeof directProjection === "number") {
      return directProjection;
    }

    if (!insightTimelinePoints.length) {
      return null;
    }

    return insightTimelinePoints[insightTimelinePoints.length - 1]!
      .scheduled_tss;
  }, [insightTimeline, insightTimelinePoints]);

  // Get upcoming activities (next 3-4 days after today, excluding today)
  const upcomingActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    const today = new Date().toISOString().split("T")[0]!;
    const futureDays: { date: string; activities: any[] }[] = [];

    // Get next 4 days
    for (let i = 1; i <= 4; i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      const futureDateStr = futureDate.toISOString().split("T")[0]!;

      const activities = allPlannedActivities.items.filter((activity) => {
        return activity.scheduled_date === futureDateStr;
      });

      if (activities.length > 0) {
        futureDays.push({ date: futureDateStr, activities });
      }
    }

    return futureDays.slice(0, 3); // Limit to 3 days
  }, [allPlannedActivities]);

  // Calendar handlers
  const handleDayPress = (day: any) => {
    setSelectedDate(day.dateString);
  };

  const handleMonthChange = (month: any) => {
    setCurrentMonth(month.dateString);
  };

  const handleSelectPlannedActivity = (id: string) => {
    router.push(`/scheduled-activity-detail?id=${id}` as any);
  };

  const handleStartActivity = (plannedActivity: any) => {
    if (!plannedActivity.activity_plan) {
      return;
    }

    const payload: ActivityPayload = {
      category: plannedActivity.activity_plan.activity_category,
      location: plannedActivity.activity_plan.activity_location,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };
    activitySelectionStore.setSelection(payload);

    router.push("/record" as any);
  };

  const handleScheduleActivity = () => {
    // Open library to select a plan first
    router.push("/library" as any);
  };

  const handleViewTrainingPlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX);
  };

  // Calculate plan progress if we have a plan with target date
  // MUST be before any conditional returns to follow React Hooks rules
  const planProgress = useMemo(() => {
    if (!plan) return null;

    const structure = plan.structure as any;
    const periodization = structure?.periodization_template;

    // If we have periodization with a target date, calculate progress
    if (periodization?.target_date) {
      const targetDate = new Date(periodization.target_date);
      const startDate = new Date(plan.created_at);
      const today = new Date();

      const totalDays = Math.floor(
        (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const elapsedDays = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const progress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
      const daysRemaining = Math.max(0, totalDays - elapsedDays);

      return {
        planName: plan.name,
        daysRemaining,
        progress: Math.min(100, Math.max(0, progress)),
        targetDate: periodization.target_date,
      };
    }

    // No periodization - show basic info
    return {
      planName: plan.name,
      weeksActive: Math.floor(
        (Date.now() - new Date(plan.created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
      progress: 0,
      date: "Active",
    };
  }, [plan]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const insightRefresh = plan?.id
      ? refetchInsightTimeline()
      : Promise.resolve();
    await Promise.all([
      refetchPlan(),
      refetchStatus(),
      insightRefresh,
      refetchActivities(),
      refetchFitnessHistory(),
      refetchIdealCurve(),
    ]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      const insightRefresh = plan?.id
        ? refetchInsightTimeline()
        : Promise.resolve();
      void Promise.all([
        refetchPlan(),
        refetchStatus(),
        insightRefresh,
        refetchActivities(),
      ]);
    }, [
      plan?.id,
      refetchPlan,
      refetchStatus,
      refetchInsightTimeline,
      refetchActivities,
    ]),
  );

  useEffect(() => {
    if (!plan?.id) {
      return;
    }

    void Promise.all([
      refetchStatus(),
      refetchInsightTimeline(),
      refetchActivities(),
    ]);
  }, [plan?.id, refetchStatus, refetchInsightTimeline, refetchActivities]);

  // Loading state
  if (loadingPlan || loadingStatus || loadingAllPlanned) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Plan" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Plan" />
      {/* Scrollable Content */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="px-4 py-4">
          {/* 1. Active Plan Summary or Placeholder */}
          <View className="mb-4">
            {plan && planProgress ? (
              <View className="bg-card border border-border rounded-lg overflow-hidden">
                <TouchableOpacity
                  onPress={handleViewTrainingPlan}
                  className="p-4"
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <Text className="font-semibold text-lg mb-1">
                        {planProgress.planName}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {plan.is_active ? "Active" : "Paused"} • Started{" "}
                        {new Date(plan.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  {/* Metadata Row */}
                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1 bg-muted/50 rounded-lg p-2.5">
                      <Text className="text-xs text-muted-foreground mb-0.5">
                        Progress
                      </Text>
                      {"daysRemaining" in planProgress ? (
                        <Text className="text-sm font-semibold">
                          {planProgress.daysRemaining}d left
                        </Text>
                      ) : "weeksActive" in planProgress ? (
                        <Text className="text-sm font-semibold">
                          Week {planProgress.weeksActive}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-1 bg-muted/50 rounded-lg p-2.5">
                      <Text className="text-xs text-muted-foreground mb-0.5">
                        Adherence
                      </Text>
                      <Text className="text-sm font-semibold">
                        {adherenceRate}%
                      </Text>
                    </View>
                    {status && (
                      <View className="flex-1 bg-muted/50 rounded-lg p-2.5">
                        <Text className="text-xs text-muted-foreground mb-0.5">
                          Fitness
                        </Text>
                        <Text className="text-sm font-semibold">
                          {status.ctl} CTL
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Progress Bar */}
                  {planProgress.progress > 0 && (
                    <View className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-3">
                      <View
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${planProgress.progress}%` }}
                      />
                    </View>
                  )}

                  {/* Fitness Progress Chart */}
                  {fitnessHistory && fitnessHistory.length > 0 && (
                    <View className="mb-3">
                      <FitnessProgressCard
                        currentCTL={currentCTL}
                        projectedCTL={idealCTLToday}
                        goalCTL={goalMetrics?.targetCTL}
                        trendData={fitnessChartData}
                        idealTrendData={idealChartData}
                        behindSchedule={behindSchedule}
                        onPress={() =>
                          router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX)
                        }
                      />
                      {!idealCurveData && (
                        <TouchableOpacity
                          onPress={() =>
                            router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)
                          }
                          className="mt-2 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3"
                          activeOpacity={0.7}
                        >
                          <Text className="text-xs font-medium text-orange-600 text-center">
                            Add periodization to see fitness projection • Tap to
                            configure
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>

                {/* Action Buttons Row */}
                <View className="flex-row border-t border-border">
                  <TouchableOpacity
                    onPress={() =>
                      router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)
                    }
                    className="flex-1 flex-row items-center justify-center py-3"
                    activeOpacity={0.7}
                  >
                    <Icon
                      as={Settings}
                      size={16}
                      className="text-primary mr-1.5"
                    />
                    <Text className="text-xs font-medium text-primary">
                      Settings
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="bg-card border border-border rounded-lg overflow-hidden">
                <TouchableOpacity
                  onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.LIST)}
                  className="p-6"
                  activeOpacity={0.7}
                >
                  <View className="items-center">
                    <View className="bg-primary/10 rounded-full p-3 mb-3">
                      <Icon
                        as={CalendarDays}
                        size={32}
                        className="text-primary"
                      />
                    </View>
                    <Text className="font-semibold text-base mb-1">
                      No Training Plan
                    </Text>
                    <Text className="text-sm text-muted-foreground text-center mb-2">
                      Select an existing plan or create a new one
                    </Text>
                    <Text className="text-xs text-primary font-medium">
                      Tap to view plans
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Plan Insights (Phase 4) */}
          {plan && (
            <View className="mb-6 gap-3">
              <PlanStatusSummaryCard
                planFeasibility={insightTimeline?.plan_feasibility}
                planSafety={insightTimeline?.plan_safety}
                activeGoalFeasibility={activeGoalFeasibility}
                activeGoalSafety={activeGoalSafety}
                divergenceSummary={divergenceSummary}
                confidence={
                  insightTimeline?.projection?.at_goal_date?.confidence
                }
              />

              <View className="bg-card border border-border rounded-lg p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-semibold">Load Path</Text>
                  <View className="flex-row gap-2">
                    {[7, 30, 90].map((days) => (
                      <TouchableOpacity
                        key={days}
                        onPress={() =>
                          setSelectedInsightRange(days as 7 | 30 | 90)
                        }
                        className={`px-3 py-1.5 rounded-full border ${
                          selectedInsightRange === days
                            ? "bg-primary border-primary"
                            : "bg-muted border-border"
                        }`}
                        activeOpacity={0.8}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            selectedInsightRange === days
                              ? "text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {days}D
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {loadingInsightTimeline &&
                insightTimelinePoints.length === 0 ? (
                  <View className="h-44 items-center justify-center bg-muted/30 rounded-md">
                    <Text className="text-xs text-muted-foreground">
                      Loading insight timeline...
                    </Text>
                  </View>
                ) : insightTimelineError ? (
                  <View className="h-44 items-center justify-center bg-muted/30 rounded-md px-4 gap-2">
                    <Text className="text-xs text-muted-foreground text-center">
                      Unable to load plan insights right now.
                    </Text>
                    <TouchableOpacity
                      onPress={() => void refetchInsightTimeline()}
                      className="px-3 py-1.5 rounded-full border border-border bg-card"
                      activeOpacity={0.8}
                    >
                      <Text className="text-xs text-foreground">Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : insightTimelinePoints.length === 0 ? (
                  <View className="h-44 items-center justify-center bg-muted/30 rounded-md px-4 gap-2">
                    <Text className="text-xs text-muted-foreground text-center">
                      No insight timeline yet for this range.
                    </Text>
                    <Text className="text-xs text-muted-foreground text-center">
                      Schedule your first week to start tracking load paths.
                    </Text>
                  </View>
                ) : (
                  <PlanVsActualChart
                    timeline={insightTimelinePoints}
                    actualData={[]}
                    projectedData={[]}
                    showLegend
                    height={260}
                  />
                )}
              </View>

              <View className="flex-row gap-3">
                <PlanAdherenceMiniChart timeline={insightTimelinePoints} />
                <PlanCapabilityMiniChart
                  currentCapability={capabilityCurrentEstimate}
                  projectedCapability={capabilityProjectionEstimate}
                  confidence={
                    insightTimeline?.projection?.at_goal_date?.confidence
                  }
                  category={insightTimeline?.capability?.category}
                />
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() =>
                    router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)
                  }
                  className="flex-1 bg-muted rounded-lg py-2.5 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-sm text-muted-foreground font-medium">
                    Adjust Plan
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const todayStr = new Date().toISOString().split("T")[0]!;
                    setSelectedDate(todayStr);
                    setCurrentMonth(todayStr);
                  }}
                  className="flex-1 bg-muted rounded-lg py-2.5 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-sm text-muted-foreground font-medium">
                    Open Calendar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Calendar View */}
          <View className="mb-6">
            <Calendar
              current={currentMonth}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
              markingType={"multi-dot"}
              markedDates={markedDates}
              theme={{
                calendarBackground: isDark ? "#0a0a0a" : "#ffffff",
                textSectionTitleColor: isDark ? "#a3a3a3" : "#737373",
                selectedDayBackgroundColor: isDark ? "#fafafa" : "#171717",
                selectedDayTextColor: isDark ? "#171717" : "#fafafa",
                todayTextColor: isDark ? "#fafafa" : "#171717",
                dayTextColor: isDark ? "#fafafa" : "#0a0a0a",
                textDisabledColor: isDark ? "#404040" : "#e5e5e5",
                dotColor: isDark ? "#fafafa" : "#171717",
                selectedDotColor: isDark ? "#171717" : "#fafafa",
                arrowColor: isDark ? "#fafafa" : "#171717",
                monthTextColor: isDark ? "#fafafa" : "#0a0a0a",
                indicatorColor: isDark ? "#fafafa" : "#171717",
                textDayFontFamily: "System",
                textMonthFontFamily: "System",
                textDayHeaderFontFamily: "System",
                textDayFontWeight: "400",
                textMonthFontWeight: "600",
                textDayHeaderFontWeight: "600",
                textDayFontSize: 14,
                textMonthFontSize: 16,
                textDayHeaderFontSize: 12,
              }}
            />
          </View>

          {/* Selected Day Activities */}
          <View className="mb-6">
            {/* Date Label */}
            <Text className="text-lg font-semibold mb-4">
              {format(new Date(selectedDate), "EEEE, MMM d")}
            </Text>

            {/* Hero Content (Scenarios A, B, C, or D) */}
            {selectedDayActivities.length === 0 ? (
              // Scenario D: Empty/Casual - Simpler Ghost Card
              <GhostCard
                onPress={handleScheduleActivity}
                message="Nothing scheduled"
              />
            ) : selectedDayActivities.length === 1 ? (
              // Scenario A or B: Single Activity - Hero Card
              <View>
                <ActivityPlanCard
                  plannedActivity={selectedDayActivities[0] as any}
                  onPress={() =>
                    handleSelectPlannedActivity(selectedDayActivities[0].id)
                  }
                  variant="hero"
                  showScheduleInfo={false}
                />
                {!isActivityCompleted(selectedDayActivities[0]) && (
                  <Button
                    onPress={() =>
                      handleStartActivity(selectedDayActivities[0])
                    }
                    size="lg"
                    className="w-full mt-3"
                  >
                    <Icon
                      as={Play}
                      size={20}
                      className="text-primary-foreground mr-2"
                    />
                    <Text className="text-primary-foreground font-semibold">
                      Start Activity
                    </Text>
                  </Button>
                )}
              </View>
            ) : (
              // Scenario C: Multiple Activities - Stacked View
              <View className="gap-3">
                {selectedDayActivities.map((activity, index) => (
                  <View key={activity.id}>
                    <ActivityPlanCard
                      plannedActivity={activity as any}
                      onPress={() => handleSelectPlannedActivity(activity.id)}
                      variant={index === 0 ? "default" : "compact"}
                      showScheduleInfo={false}
                    />
                    {index === 0 && !isActivityCompleted(activity) && (
                      <Button
                        onPress={() => handleStartActivity(activity)}
                        size="lg"
                        className="w-full mt-2"
                      >
                        <Icon
                          as={Play}
                          size={20}
                          className="text-primary-foreground mr-2"
                        />
                        <Text className="text-primary-foreground font-semibold">
                          Start Activity
                        </Text>
                      </Button>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 6. THE HORIZON (Bottom 30% - Forecast) */}
          {upcomingActivities.length > 0 && (
            <View className="mb-6">
              <Text className="text-base font-semibold mb-3">Up Next</Text>
              <View className="gap-2">
                {upcomingActivities.map(({ date, activities }, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setSelectedDate(date)}
                    className="bg-card border border-border rounded-lg p-3"
                    activeOpacity={0.7}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold mb-1">
                          {format(new Date(date), "EEE")}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {activities[0]?.activity_plan?.name ||
                            "Unnamed Activity"}
                          {activities.length > 1 &&
                            ` + ${activities.length - 1} more`}
                        </Text>
                      </View>
                      {activities[0]?.activity_plan?.estimated_duration && (
                        <Text className="text-sm text-muted-foreground">
                          {activities[0].activity_plan.estimated_duration} min
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Schedule Activity Modal */}
      {showScheduleModal && scheduleModalDate && (
        <ScheduleActivityModal
          visible={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            setScheduleModalDate(undefined);
          }}
          preselectedDate={scheduleModalDate}
          onSuccess={handleRefresh}
        />
      )}

      {/* Training Status Detail Modal */}
      <DetailChartModal
        visible={trainingStatusModalVisible}
        onClose={() => setTrainingStatusModalVisible(false)}
        title="Training Load"
        defaultDateRange="30d"
      >
        {(dateRange) => {
          const days =
            dateRange === "7d"
              ? 7
              : dateRange === "30d"
                ? 30
                : dateRange === "90d"
                  ? 90
                  : insightTimelinePoints.length || 30;
          const filteredTimeline = insightTimelinePoints.slice(-days);

          return <TrainingLoadChart timeline={filteredTimeline} height={400} />;
        }}
      </DetailChartModal>
    </View>
  );
}

export default function PlanScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanScreen />
    </ErrorBoundary>
  );
}
