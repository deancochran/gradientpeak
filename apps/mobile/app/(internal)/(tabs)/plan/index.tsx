import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  DayActivityList,
  PlanHeader,
  UpcomingActivities,
  WeekCalendar,
} from "@/components/plan";
import { PlanCalendarSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import {
  ChevronRight,
  Library,
  MapPin,
  Plus,
  TrendingUp,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { PlannedActivityDetailModal } from "./components/modals/PlannedActivityDetailModal";
import { getActivityBgClass, getIntensityColor } from "./utils/colors";
import {
  getWeekDates,
  isActivityCompleted,
  isSameDay,
  normalizeDate,
} from "./utils/dateGrouping";

function PlanScreen() {
  const router = useRouter();

  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Calculate week dates based on offset
  const weekDates = useMemo(() => {
    return getWeekDates(weekOffset);
  }, [weekOffset]);

  const startOfWeek = weekDates[0];
  const endOfWeek = weekDates[6];

  // Format week days and dates for display
  const weekDays = weekDates.map((date) => format(date, "EEE"));
  const dates = weekDates.map((date) => date.getDate());

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

  // Upcoming activities from status.upcomingActivities (limit to 3)
  const upcomingActivitys = useMemo(() => {
    if (!status?.upcomingActivities) return [];
    return status.upcomingActivities.slice(0, 3).map((activity) => ({
      id: activity.id,
      title: activity.activity_plan?.name || "Unnamed Activity",
      type: activity.activity_plan?.activity_category || "other",
      duration: `${activity.activity_plan?.estimated_duration || 0} min`,
      intensity: "Moderate",
      date: format(new Date(activity.scheduled_date), "EEE, MMM d"),
    }));
  }, [status]);

  // Plan progress calculation
  const planProgress = useMemo(() => {
    if (!plan || !plan.structure) {
      return { name: "No Active Plan", week: "0/0", percentage: 0 };
    }

    const totalWeeks = (plan.structure as any).target_weeks || 16;
    const weeksSinceStart = Math.floor(
      (Date.now() - new Date(plan.created_at).getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    );
    const currentWeek = Math.min(weeksSinceStart + 1, totalWeeks);

    return {
      name: plan.name,
      week: `${currentWeek}/${totalWeeks}`,
      percentage: Math.min(Math.round((currentWeek / totalWeeks) * 100), 100),
    };
  }, [plan]);

  // Check if selected date is today
  const isToday = isSameDay(selectedDate, new Date());
  const isPast = selectedDate < new Date();

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
      type: plannedActivity.activity_plan.activity_category,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };
    activitySelectionStore.setSelection(payload);

    router.push("/record" as any);
  };

  const handleScheduleActivity = () => {
    router.push("/plan/create_planned_activity" as any);
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

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header with Stats */}
      <PlanHeader
        adherenceRate={adherenceRate}
        weeklyScheduled={weeklyScheduled}
        planProgress={planProgress}
        onCalendarPress={() => router.push("/plan/planned_activities" as any)}
      />

      {/* Week Calendar */}
      <WeekCalendar
        weekDates={weekDates}
        weekDays={weekDays}
        dates={dates}
        weekActivities={weekActivities}
        selectedDate={selectedDate}
        startOfWeek={startOfWeek}
        endOfWeek={endOfWeek}
        onPreviousWeek={handlePreviousWeek}
        onNextWeek={handleNextWeek}
        onSelectDay={handleSelectDay}
      />

      {/* Content Area */}
      <View className="px-5 py-6 gap-4">
        {/* Selected Day Activities */}
        <DayActivityList
          selectedDate={selectedDate}
          activities={selectedDayActivities}
          isToday={isToday}
          isPast={isPast}
          onActivityPress={handleSelectPlannedActivity}
          onStartActivity={handleStartActivity}
          onScheduleActivity={handleScheduleActivity}
          getActivityBgClass={getActivityBgClass}
          isActivityCompleted={isActivityCompleted}
        />

        {/* Upcoming Activities */}
        {isToday && (
          <UpcomingActivities
            activities={upcomingActivitys}
            onActivityPress={handleSelectPlannedActivity}
            onViewAll={() => router.push("/plan/planned_activities" as any)}
            getActivityBgClass={getActivityBgClass}
            getIntensityColor={getIntensityColor}
          />
        )}

        {/* Training Plan Progress */}
        {plan && (
          <TouchableOpacity
            onPress={() => router.push("/plan/training-plan" as any)}
            activeOpacity={0.7}
          >
            <Card className="bg-primary/5 border-primary/10">
              <CardContent className="p-4">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="font-semibold">{planProgress.name}</Text>
                  <Text className="text-sm text-primary font-medium">
                    Week {planProgress.week}
                  </Text>
                </View>
                <View className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <View
                    className="bg-primary h-full"
                    style={{ width: `${planProgress.percentage}%` }}
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>
        )}

        {/* No Plan CTA */}
        {!plan && (
          <Card className="bg-muted/50">
            <CardContent className="p-6 items-center">
              <Icon
                as={TrendingUp}
                size={48}
                className="text-muted-foreground mb-3"
              />
              <Text className="text-lg font-semibold mb-1">
                Create Your Training Plan
              </Text>
              <Text className="text-sm text-muted-foreground text-center mb-4">
                Get personalized training recommendations and track your
                progress
              </Text>
              <Button
                onPress={() => router.push("/plan/training-plan/create" as any)}
              >
                <Icon
                  as={Plus}
                  size={20}
                  className="text-primary-foreground mr-2"
                />
                <Text className="text-primary-foreground font-semibold">
                  Create Plan
                </Text>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <View className="gap-2 pt-2">
          <TouchableOpacity
            onPress={() => router.push("/routes" as any)}
            activeOpacity={0.7}
          >
            <Card>
              <CardContent className="p-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Icon
                      as={MapPin}
                      size={20}
                      className="text-muted-foreground"
                    />
                    <Text className="font-medium">Routes</Text>
                  </View>
                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground"
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/plan/library" as any)}
            activeOpacity={0.7}
          >
            <Card>
              <CardContent className="p-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Icon
                      as={Library}
                      size={20}
                      className="text-muted-foreground"
                    />
                    <Text className="font-medium">Activity Library</Text>
                  </View>
                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground"
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/plan/create_activity_plan" as any)}
            activeOpacity={0.7}
          >
            <Card>
              <CardContent className="p-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Icon
                      as={Plus}
                      size={20}
                      className="text-muted-foreground"
                    />
                    <Text className="font-medium">Create Custom Activity</Text>
                  </View>
                  <Icon
                    as={ChevronRight}
                    size={20}
                    className="text-muted-foreground"
                  />
                </View>
              </CardContent>
            </Card>
          </TouchableOpacity>
        </View>
      </View>

      {/* Activity Detail Modal */}
      {selectedPlannedActivityId && (
        <PlannedActivityDetailModal
          plannedActivityId={selectedPlannedActivityId}
          isVisible={!!selectedPlannedActivityId}
          onClose={() => setSelectedPlannedActivityId(null)}
        />
      )}
    </ScrollView>
  );
}

export default function PlanScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanScreen />
    </ErrorBoundary>
  );
}
