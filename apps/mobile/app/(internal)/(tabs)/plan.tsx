import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GhostCard } from "@/components/plan/GhostCard";
import { WeekStrip } from "@/components/plan/WeekStrip";
import { WeeklyLedger } from "@/components/plan/WeeklyLedger";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { TrainingPlanAdjustmentAlert } from "@/components/training-plan/TrainingPlanAdjustmentAlert";
import { FitnessProgressCard } from "@/components/home/FitnessProgressCard";
import WeeklySnapshot from "@/components/home/WeeklySnapshot";
import { DetailChartModal } from "@/components/shared/DetailChartModal";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { TrainingLoadChart } from "@/components/charts/TrainingLoadChart";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useSmartSuggestions } from "@/lib/hooks/useSmartSuggestions";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import {
  getWeekDatesArray,
  isActivityCompleted,
  normalizeDate,
} from "@/lib/utils/plan/dateGrouping";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CalendarDays,
  List,
  Play,
  Settings,
  Shuffle,
  Sliders,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

// No longer need local transform function - ActivityPlanCard handles it internally

function PlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalDate, setScheduleModalDate] = useState<
    string | undefined
  >();
  const [showAdjustSheet, setShowAdjustSheet] = useState(false);
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(
    null,
  );
  const [trainingStatusModalVisible, setTrainingStatusModalVisible] =
    useState(false);

  // Calculate week dates based on offset
  const weekDates = useMemo(() => {
    return getWeekDatesArray(weekOffset);
  }, [weekOffset]);

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

  // Query for all planned activities
  const {
    data: allPlannedActivities,
    isLoading: loadingAllPlanned,
    refetch: refetchActivities,
  } = trpc.plannedActivities.list.useQuery({
    limit: 100,
  });

  const { data: weeklyScheduled = 0, refetch: refetchWeekCount } =
    trpc.plannedActivities.getWeekCount.useQuery();

  // Get weekly totals for ledger
  const { data: weeklyTotals, refetch: refetchWeeklyTotals } =
    trpc.trainingPlans.getWeeklyTotals.useQuery({
      weekStartDate: weekDates[0]?.toISOString().split("T")[0],
    });

  // Get weekly summaries for smart suggestions (last 4 weeks)
  const { data: weeklySummaries } =
    trpc.trainingPlans.getWeeklySummary.useQuery(
      {
        training_plan_id: plan?.id || "",
        weeks_back: 4,
      },
      {
        enabled: !!plan?.id,
      },
    );

  // Calculate date ranges for fitness data
  const today = useMemo(() => new Date(), []);
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
  const { data: idealCurveData } = trpc.trainingPlans.getIdealCurve.useQuery(
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

  // Calculate smart suggestions
  const smartSuggestion = useSmartSuggestions({
    plan,
    status,
    weeklySummaries,
  });

  // Load dismissed suggestion from storage
  useEffect(() => {
    const loadDismissedSuggestion = async () => {
      try {
        const dismissed = await AsyncStorage.getItem("dismissedSuggestion");
        if (dismissed) {
          const { reason, timestamp } = JSON.parse(dismissed);
          // Auto-expire after 3 days
          const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
          if (timestamp > threeDaysAgo) {
            setDismissedSuggestion(reason);
          } else {
            await AsyncStorage.removeItem("dismissedSuggestion");
          }
        }
      } catch (error) {
        console.error("Failed to load dismissed suggestion:", error);
      }
    };
    loadDismissedSuggestion();
  }, []);

  // Check if current suggestion is dismissed
  const shouldShowAlert =
    smartSuggestion && smartSuggestion.reason !== dismissedSuggestion;

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

  // Get activities for the selected date
  const selectedDayActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    return allPlannedActivities.items.filter((activity) => {
      const activityDate = normalizeDate(new Date(activity.scheduled_date));
      return activityDate.getTime() === normalizeDate(selectedDate).getTime();
    });
  }, [allPlannedActivities, selectedDate]);

  // Group activities by day for week calendar
  const weekActivities = useMemo(() => {
    if (!allPlannedActivities?.items) {
      return Array(7).fill({ completed: false, type: "rest", count: 0 });
    }

    return weekDates.map((weekDate) => {
      const dayActivities = allPlannedActivities.items.filter((activity) => {
        const activityDate = normalizeDate(new Date(activity.scheduled_date));
        return activityDate.getTime() === normalizeDate(weekDate).getTime();
      });

      if (dayActivities.length === 0) {
        return { completed: false, type: "rest", count: 0 };
      }

      const completed = dayActivities.every((a) => isActivityCompleted(a));
      const type =
        dayActivities[0]?.activity_plan?.activity_category || "other";
      return { completed, type, count: dayActivities.length };
    });
  }, [allPlannedActivities, weekDates]);

  // Calculate adherence rate from status.weekProgress
  const adherenceRate = useMemo(() => {
    if (!status?.weekProgress) return 0;
    const total = status.weekProgress.totalPlannedActivities;
    if (total === 0) return 0;
    return Math.round((status.weekProgress.completedActivities / total) * 100);
  }, [status]);

  // Get upcoming activities (next 3-4 days after today, excluding today)
  const upcomingActivities = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    const today = normalizeDate(new Date());
    const futureDays: { date: Date; activities: any[] }[] = [];

    // Get next 4 days
    for (let i = 1; i <= 4; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + i);
      const normalized = normalizeDate(futureDate);

      const activities = allPlannedActivities.items.filter((activity) => {
        const activityDate = normalizeDate(new Date(activity.scheduled_date));
        return activityDate.getTime() === normalized.getTime();
      });

      if (activities.length > 0) {
        futureDays.push({ date: normalized, activities });
      }
    }

    return futureDays.slice(0, 3); // Limit to 3 days
  }, [allPlannedActivities]);

  // Navigation handlers
  const handlePreviousWeek = () => {
    setWeekOffset((prev) => prev - 1);
  };

  const handleNextWeek = () => {
    setWeekOffset((prev) => prev + 1);
  };

  const handleSelectDay = (index: number) => {
    setSelectedDate(weekDates[index]);
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

  const handleOpenAdjustSheet = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.ADJUST);
  };

  const handleDismissSuggestion = async () => {
    if (!smartSuggestion) return;

    try {
      await AsyncStorage.setItem(
        "dismissedSuggestion",
        JSON.stringify({
          reason: smartSuggestion.reason,
          timestamp: Date.now(),
        }),
      );
      setDismissedSuggestion(smartSuggestion.reason);
    } catch (error) {
      console.error("Failed to dismiss suggestion:", error);
    }
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
    await Promise.all([
      refetchPlan(),
      refetchStatus(),
      refetchActivities(),
      refetchWeekCount(),
      refetchWeeklyTotals(),
      refetchFitnessHistory(),
    ]);
    setRefreshing(false);
  };

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
          {/* Smart Suggestion Alert */}
          {shouldShowAlert && plan && (
            <TrainingPlanAdjustmentAlert
              suggestion={smartSuggestion}
              onPress={handleOpenAdjustSheet}
              onDismiss={handleDismissSuggestion}
            />
          )}

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
                    <View className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <View
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${planProgress.progress}%` }}
                      />
                    </View>
                  )}
                </TouchableOpacity>

                {/* Action Buttons Row */}
                <View className="flex-row border-t border-border">
                  <TouchableOpacity
                    onPress={() =>
                      router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)
                    }
                    className="flex-1 flex-row items-center justify-center py-3 border-r border-border"
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
                  <TouchableOpacity
                    onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.LIST)}
                    className="flex-1 flex-row items-center justify-center py-3 border-r border-border"
                    activeOpacity={0.7}
                  >
                    <Icon as={List} size={16} className="text-primary mr-1.5" />
                    <Text className="text-xs font-medium text-primary">
                      Switch
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleOpenAdjustSheet}
                    className="flex-1 flex-row items-center justify-center py-3 border-r border-border relative"
                    activeOpacity={0.7}
                  >
                    <Icon
                      as={Sliders}
                      size={16}
                      className="text-primary mr-1.5"
                    />
                    <Text className="text-xs font-medium text-primary">
                      Adjust
                    </Text>
                    {shouldShowAlert && (
                      <View className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push(ROUTES.WORKOUTS_REORDER)}
                    className="flex-1 flex-row items-center justify-center py-3"
                    activeOpacity={0.7}
                  >
                    <Icon
                      as={Shuffle}
                      size={16}
                      className="text-primary mr-1.5"
                    />
                    <Text className="text-xs font-medium text-primary">
                      Reorder
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

          {/* 2. Fitness Progress Card */}
          {plan && fitnessHistory && fitnessHistory.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-muted-foreground mb-2">
                Fitness Progress
              </Text>
              <FitnessProgressCard
                currentCTL={currentCTL}
                projectedCTL={idealCTLToday}
                goalCTL={goalMetrics?.targetCTL}
                trendData={fitnessChartData}
                idealTrendData={idealChartData}
                behindSchedule={behindSchedule}
                onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.INDEX)}
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

          {/* 3. This Week Card */}
          {weeklyTotals && (
            <View className="mb-4">
              <Text className="text-sm font-semibold text-muted-foreground mb-2">
                This Week
              </Text>
              <WeeklySnapshot
                distance={parseFloat(
                  (weeklyTotals.distance * 0.621371).toFixed(1),
                )}
                workouts={weeklyTotals.count}
                totalTSS={Math.round(status?.weekProgress?.completedTSS || 0)}
                plannedTSS={status?.weekProgress?.plannedTSS}
                plannedWorkouts={status?.weekProgress?.totalPlannedActivities}
                onPress={() => setTrainingStatusModalVisible(true)}
              />
            </View>
          )}

          {/* 4. Week Strip with Day Selector */}
          <View className="mb-6">
            <WeekStrip
              weekDates={weekDates}
              weekActivities={weekActivities}
              selectedDate={selectedDate}
              onSelectDay={handleSelectDay}
              onPreviousWeek={handlePreviousWeek}
              onNextWeek={handleNextWeek}
            />
          </View>

          {/* 5. Selected Day Activities */}
          <View className="mb-6">
            {/* Date Label */}
            <Text className="text-lg font-semibold mb-4">
              {format(selectedDate, "EEEE, MMM d")}
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
                  plannedActivity={selectedDayActivities[0]}
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
                      plannedActivity={activity}
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
                          {format(date, "EEE")}
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

          {/* 7. THE LEDGER (Footer - Collapsible Insight) */}
          {weeklyTotals && (
            <WeeklyLedger
              totalDistance={weeklyTotals.distance}
              totalTime={weeklyTotals.time}
              activityCount={weeklyTotals.count}
              unit="mi"
              defaultCollapsed={true}
            />
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
                  : fitnessHistory?.length || 30;
          const filteredData = (fitnessHistory || []).slice(-days);

          return (
            <TrainingLoadChart
              data={filteredData.map((t) => ({
                date: t.date,
                ctl: t.ctl,
                atl: t.atl || 0,
                tsb: t.tsb || 0,
              }))}
              height={400}
            />
          );
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
