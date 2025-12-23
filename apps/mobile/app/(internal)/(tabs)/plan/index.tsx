import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import PlanProgressCard from "@/components/home/PlanProgressCard";
import { GhostCard } from "@/components/plan/GhostCard";
import { HeroCard, StackedHeroCards } from "@/components/plan/HeroCard";
import { WeekStrip } from "@/components/plan/WeekStrip";
import { WeeklyLedger } from "@/components/plan/WeeklyLedger";
import { PlanCalendarSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendar, CalendarDays, Plus, Target } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { AllActivitiesCalendarModal } from "./components/modals/AllActivitiesCalendarModal";
import { PlanDetailsModal } from "./components/modals/PlanDetailsModal";
import { PlannedActivityDetailModal } from "./components/modals/PlannedActivityDetailModal";
import { ScheduleActivityModal } from "./components/modals/ScheduleActivityModal";
import {
  getWeekDates,
  isActivityCompleted,
  isSameDay,
  normalizeDate,
} from "./utils/dateGrouping";

function PlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Modal states for consolidated UI
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAllActivitiesModal, setShowAllActivitiesModal] = useState(false);
  const [showPlanDetailsModal, setShowPlanDetailsModal] = useState(false);

  // Handle navigation params to open modal
  useEffect(() => {
    if (params.activityId && typeof params.activityId === "string") {
      setSelectedPlannedActivityId(params.activityId);
    }
  }, [params.activityId]);

  // Calculate week dates based on offset
  const weekDates = useMemo(() => {
    return getWeekDates(weekOffset);
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
    setSelectedPlannedActivityId(id);
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
    setShowScheduleModal(true);
  };

  const handleViewAllActivities = () => {
    setShowAllActivitiesModal(true);
  };

  const handleViewPlanDetails = () => {
    setShowPlanDetailsModal(true);
  };

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
      <ScrollView className="flex-1 bg-background p-6">
        <PlanCalendarSkeleton />
      </ScrollView>
    );
  }

  // Calculate plan progress if we have a plan with target date
  const planProgress = useMemo(() => {
    if (!plan) return null;

    // For now, we'll show basic plan info without progress
    // In the future, we can add target_date to the plan query
    return {
      planName: plan.name,
      weeksOut: 0, // Will calculate from target_date when available
      progress: 0, // Will calculate from CTL progress when available
      date: "Active",
    };
  }, [plan]);

  return (
    <View className="flex-1 bg-background">
      {/* 1. THE ANCHOR (Top 15% - Sticky) */}
      <View className="bg-card border-b border-border">
        {/* Plan Progress Card or Empty State */}
        {plan ? (
          <View className="px-4 pt-3">
            <PlanProgressCard
              planName={planProgress!.planName}
              weeksOut={planProgress!.weeksOut}
              progress={planProgress!.progress}
              date={planProgress!.date}
              onPress={handleViewPlanDetails}
            />
          </View>
        ) : (
          <View className="px-4 pt-3">
            <View className="bg-muted/30 border-2 border-dashed border-muted-foreground/30 p-4 rounded-xl">
              <View className="flex-row items-center mb-2">
                <View className="bg-muted p-2 rounded-full mr-2">
                  <Icon
                    as={Target}
                    size={16}
                    className="text-muted-foreground"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground mb-1">
                    No Training Plan
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Create a plan to track your progress
                  </Text>
                </View>
              </View>
              <Button
                variant="outline"
                size="sm"
                onPress={() =>
                  router.push("/(internal)/(tabs)/plan/training-plan" as any)
                }
                className="mt-2"
              >
                <Text className="text-xs font-medium">
                  Create Training Plan
                </Text>
              </Button>
            </View>
          </View>
        )}

        {/* Header Row: Month + Action Icons */}
        <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
          <Text className="text-2xl font-bold">
            {format(selectedDate, "MMMM")}
          </Text>

          {/* Action Icons */}
          <View className="flex-row items-center gap-2">
            {/* Training Plan Details - Only show if plan exists */}
            {plan && (
              <TouchableOpacity
                onPress={handleViewPlanDetails}
                className="w-10 h-10 rounded-full bg-muted items-center justify-center"
                activeOpacity={0.7}
              >
                <Icon as={Calendar} size={20} className="text-foreground" />
              </TouchableOpacity>
            )}

            {/* All Activities Calendar */}
            <TouchableOpacity
              onPress={handleViewAllActivities}
              className="w-10 h-10 rounded-full bg-muted items-center justify-center"
              activeOpacity={0.7}
            >
              <Icon as={CalendarDays} size={20} className="text-foreground" />
            </TouchableOpacity>

            {/* Schedule New Activity */}
            <TouchableOpacity
              onPress={handleScheduleActivity}
              className="w-12 h-12 rounded-full bg-primary items-center justify-center"
              activeOpacity={0.8}
            >
              <Icon as={Plus} size={24} className="text-primary-foreground" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Week Strip with Status Dots */}
        <WeekStrip
          weekDates={weekDates}
          weekActivities={weekActivities}
          selectedDate={selectedDate}
          onSelectDay={handleSelectDay}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
        />
      </View>

      {/* Scrollable Content */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="px-4 py-5">
          {/* 2. THE STAGE (Middle 45% - Selected Day Focus) */}
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
              <HeroCard
                activity={selectedDayActivities[0]}
                onPress={() =>
                  handleSelectPlannedActivity(selectedDayActivities[0].id)
                }
                onStartActivity={() =>
                  handleStartActivity(selectedDayActivities[0])
                }
                isCompleted={isActivityCompleted(selectedDayActivities[0])}
                isPrimary={true}
              />
            ) : (
              // Scenario C: Multiple Activities - Stacked View
              <StackedHeroCards
                activities={selectedDayActivities}
                onActivityPress={handleSelectPlannedActivity}
                onStartActivity={handleStartActivity}
                isActivityCompleted={isActivityCompleted}
              />
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

      {/* Activity Detail Modal */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={() => setSelectedPlannedActivityId(null)}
        />
      )}

      {/* Schedule Activity Modal */}
      <ScheduleActivityModal
        isVisible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        preselectedDate={selectedDate}
      />

      {/* All Activities Calendar Modal */}
      <AllActivitiesCalendarModal
        isVisible={showAllActivitiesModal}
        onClose={() => setShowAllActivitiesModal(false)}
      />

      {/* Training Plan Details Modal */}
      <PlanDetailsModal
        isVisible={showPlanDetailsModal}
        onClose={() => setShowPlanDetailsModal(false)}
      />
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
