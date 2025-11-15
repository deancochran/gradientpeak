import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { AddActivityButton } from "./components/calendar/AddActivityButton";
import { DayCard } from "./components/calendar/DayCard";
import { useWeekNavigation } from "./components/calendar/hooks/useWeekNavigation";
import { WeeklySummaryBar } from "./components/calendar/WeeklySummaryBar";
import { WeekNavigator } from "./components/calendar/WeekNavigator";

/**
 * Training Plan Calendar - Weekly view of scheduled activities
 * Phase 2 of Training Plans UI-First Implementation
 */
export default function TrainingPlanCalendar() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Week navigation state
  const {
    currentWeekStart,
    currentWeekEnd,
    weekNumber,
    weekDateRange,
    isCurrentWeek,
    weekDates,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useWeekNavigation();

  // Get training plan
  const { data: plan, isLoading: loadingPlan } =
    trpc.trainingPlans.get.useQuery();

  // TODO: Get planned activities for the current week
  // Need to implement trpc.plannedActivities.listByWeek endpoint
  const plannedActivities: any[] = [];
  const loadingActivities = false;
  const refetchActivities = async () => {};

  // TODO: Get completed activities for the current week
  // Need to implement trpc.activities.list endpoint with date filtering
  const completedActivities: any[] = [];

  const [refreshing, setRefreshing] = useState(false);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      utils.trainingPlans.get.invalidate(),
      refetchActivities(),
    ]);
    setRefreshing(false);
  };

  // Calculate weekly summary metrics
  const calculateWeeklySummary = () => {
    const completedTSS = completedActivities.reduce(
      (sum: number, activity: any) => sum + (activity.tss || 0),
      0,
    );

    const plannedTSS = plannedActivities.reduce(
      (sum: number, activity: any) =>
        sum + (activity.activity_plan?.estimated_tss || 0),
      0,
    );

    const targetTSS = plan?.structure
      ? ((plan.structure as any).target_weekly_tss_min +
          (plan.structure as any).target_weekly_tss_max) /
        2
      : 0;

    const completedActivities = completedActivities.length;
    const totalPlannedActivities = plannedActivities.length;

    // Determine status
    let status: "on_track" | "behind" | "ahead" | "warning" = "on_track";
    const progressPercent =
      targetTSS > 0 ? (completedTSS / targetTSS) * 100 : 0;

    if (progressPercent < 50 && totalPlannedActivities > completedActivities) {
      status = "behind";
    } else if (progressPercent > 120) {
      status = "warning";
    } else if (progressPercent > 100) {
      status = "ahead";
    }

    return {
      completedTSS,
      plannedTSS,
      targetTSS,
      completedActivities,
      totalPlannedActivities,
      status,
    };
  };

  // Organize activities by day
  const getActivitiesForDate = (date: Date) => {
    const dateString = date.toISOString().split("T")[0];

    // Get completed activities for this date
    const completed = completedActivities
      .filter((activity: any) => {
        const activityDate = new Date(activity.start_time)
          .toISOString()
          .split("T")[0];
        return activityDate === dateString;
      })
      .map((activity: any) => ({
        id: activity.id,
        name: activity.name || "Completed Activity",
        activityType: activity.activity_type || "unknown",
        duration: Math.round((activity.duration || 0) / 60), // Convert to minutes
        tss: activity.tss || 0,
        status: "completed" as const,
      }));

    // Get planned activities for this date
    const planned = plannedActivities
      .filter((activity: any) => {
        const scheduledDate = new Date(activity.scheduled_date)
          .toISOString()
          .split("T")[0];
        return scheduledDate === dateString;
      })
      .map((activity: any) => ({
        id: activity.id,
        name: activity.activity_plan?.name || "Scheduled Activity",
        activityType: activity.activity_plan?.activity_type || "unknown",
        duration: activity.activity_plan?.estimated_duration || 0,
        tss: activity.activity_plan?.estimated_tss || 0,
        status: "scheduled" as const, // TODO: Add constraint validation
      }));

    return [...completed, ...planned];
  };

  // Check if date is a rest day
  const isRestDay = (date: Date) => {
    const activities = getActivitiesForDate(date);
    return activities.length === 0;
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Handle activity press
  const handleActivityPress = (activityId: string) => {
    router.push({
      pathname:
        "/(internal)/(tabs)/plan/planned_activities/[activity_uuid]" as any,
      params: { activity_uuid: activityId },
    });
  };

  // Handle activity long press (quick actions)
  const handleActivityLongPress = (activityId: string) => {
    Alert.alert("Activity Actions", "What would you like to do?", [
      {
        text: "View Details",
        onPress: () => handleActivityPress(activityId),
      },
      {
        text: "Reschedule",
        onPress: () => {
          // TODO: Implement reschedule
          Alert.alert("Coming Soon", "Reschedule feature coming soon!");
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          // TODO: Implement delete
          Alert.alert("Coming Soon", "Delete feature coming soon!");
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  // Handle add activity for specific date
  const handleAddActivityForDate = (date: Date) => {
    // TODO: Open activity selection modal with pre-selected date
    Alert.alert(
      "Add Activity",
      `Add a activity for ${date.toLocaleDateString()}?`,
      [
        {
          text: "Choose from Library",
          onPress: () => {
            router.push({
              pathname: "/(internal)/(tabs)/plan/library" as any,
              params: {
                scheduleIntent: "true",
                scheduledDate: date.toISOString(),
              },
            });
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
    );
  };

  // Handle floating add button
  const handleAddActivity = () => {
    // Default to today
    const today = new Date();
    handleAddActivityForDate(today);
  };

  // Loading state
  if (loadingPlan || loadingActivities) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading calendar...</Text>
      </View>
    );
  }

  // No training plan
  if (!plan) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Text className="text-2xl font-bold mb-4">No Training Plan</Text>
        <Text className="text-muted-foreground text-center mb-6">
          Create a training plan to start scheduling activities
        </Text>
        <Button onPress={() => router.push("./create")} size="lg">
          <Text className="text-primary-foreground font-semibold">
            Create Training Plan
          </Text>
        </Button>
      </View>
    );
  }

  const weeklySummary = calculateWeeklySummary();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        className="flex-1"
      >
        <View className="p-4">
          {/* Week Navigator */}
          <WeekNavigator
            weekNumber={weekNumber}
            weekDateRange={weekDateRange}
            isCurrentWeek={isCurrentWeek}
            onPreviousWeek={goToPreviousWeek}
            onNextWeek={goToNextWeek}
            onCurrentWeek={goToCurrentWeek}
          />

          {/* Weekly Summary */}
          <WeeklySummaryBar
            completedTSS={weeklySummary.completedTSS}
            plannedTSS={weeklySummary.plannedTSS}
            targetTSS={weeklySummary.targetTSS}
            completedActivities={weeklySummary.completedActivities}
            totalPlannedActivities={weeklySummary.totalPlannedActivities}
            status={weeklySummary.status}
          />

          {/* Calendar Grid - Horizontal Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {weekDates.map((date) => (
              <DayCard
                key={date.toISOString()}
                date={date}
                activities={getActivitiesForDate(date)}
                isRestDay={isRestDay(date)}
                isToday={isToday(date)}
                onActivityPress={handleActivityPress}
                onActivityLongPress={handleActivityLongPress}
                onAddActivity={handleAddActivityForDate}
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Floating Add Button */}
      <AddActivityButton onPress={handleAddActivity} />
    </View>
  );
}
