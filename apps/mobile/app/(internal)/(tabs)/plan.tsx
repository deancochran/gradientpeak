import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GhostCard } from "@/components/plan/GhostCard";
import { WeekStrip } from "@/components/plan/WeekStrip";
import { WeeklyLedger } from "@/components/plan/WeeklyLedger";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
import { Play, Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
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

  // Calculate weekly totals for ledger
  const weeklyTotals = useMemo(() => {
    if (!status?.weekProgress) {
      return { distance: 0, time: 0, count: 0 };
    }

    // Calculate from completed activities in the current week
    const startOfWeek = weekDates[0];
    const endOfWeek = weekDates[6];

    const completedThisWeek =
      allPlannedActivities?.items.filter((activity) => {
        const activityDate = new Date(activity.scheduled_date);
        return (
          isActivityCompleted(activity) &&
          activityDate >= startOfWeek &&
          activityDate <= endOfWeek
        );
      }) || [];

    // For now, use placeholder values (in production, fetch from completed activities)
    const totalDistance = 0; // Would sum actual distance from completed_activity
    const totalTime = 0; // Would sum actual time from completed_activity

    return {
      distance: totalDistance,
      time: totalTime,
      count: completedThisWeek.length,
    };
  }, [status, allPlannedActivities, weekDates]);

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
    router.push("/training-plan" as any);
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
          {/* 1. Active Plan Summary or Placeholder */}
          <View className="mb-4">
            {plan && planProgress ? (
              <TouchableOpacity
                onPress={handleViewTrainingPlan}
                className="bg-card border border-border rounded-lg p-4"
                activeOpacity={0.7}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="font-semibold text-base">
                      {planProgress.planName}
                    </Text>
                    {"daysRemaining" in planProgress ? (
                      <Text className="text-sm text-muted-foreground mt-1">
                        {planProgress.daysRemaining} days remaining •{" "}
                        {adherenceRate}% adherence
                      </Text>
                    ) : "weeksActive" in planProgress ? (
                      <Text className="text-sm text-muted-foreground mt-1">
                        Week {planProgress.weeksActive} • {adherenceRate}%
                        adherence
                      </Text>
                    ) : null}
                  </View>
                  <Icon
                    as={Plus}
                    size={20}
                    className="text-muted-foreground rotate-45"
                  />
                </View>
                {planProgress.progress > 0 && (
                  <View className="mt-3">
                    <View className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <View
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${planProgress.progress}%` }}
                      />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleViewTrainingPlan}
                className="bg-card border-2 border-dashed border-border rounded-lg p-6"
                activeOpacity={0.7}
              >
                <View className="items-center">
                  <View className="bg-primary/10 rounded-full p-3 mb-3">
                    <Icon as={Plus} size={32} className="text-primary" />
                  </View>
                  <Text className="font-semibold text-base mb-1">
                    No Training Plan
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center">
                    Create a plan to track fitness and structure your training
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* 2. Week Strip with Day Selector */}
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

          {/* 3. Selected Day Activities */}
          <View className="mb-6">
            {/* Date Label */}
            <Text className="text-lg font-semibold mb-4">
              {format(selectedDate, "EEEE, MMM d")}
            </Text>

            {/* Hero Content (Scenarios A, B, C, or D) */}
            {selectedDayActivities.length === 0 ? (
              // Scenario D: Empty/Casual - Ghost Card
              <GhostCard onPress={handleScheduleActivity} />
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

          {/* 3. THE HORIZON (Bottom 30% - Forecast) */}
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

          {/* 4. THE LEDGER (Footer - Collapsible Insight) */}
          <WeeklyLedger
            totalDistance={weeklyTotals.distance}
            totalTime={weeklyTotals.time}
            activityCount={weeklyTotals.count}
            unit="mi"
            defaultCollapsed={true}
          />
        </View>
      </ScrollView>

      {/* Floating Action Button for Scheduling */}
      <View className="absolute bottom-6 right-6">
        <TouchableOpacity
          onPress={handleScheduleActivity}
          className="w-14 h-14 rounded-full bg-primary shadow-lg items-center justify-center"
          activeOpacity={0.8}
          style={{
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 4.65,
          }}
        >
          <Icon as={Plus} size={28} className="text-primary-foreground" />
        </TouchableOpacity>
      </View>

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
