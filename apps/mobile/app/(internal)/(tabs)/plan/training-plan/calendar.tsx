import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
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
import { DeleteConfirmationModal } from "./components/calendar/DeleteConfirmationModal";
import { useWeekNavigation } from "./components/calendar/hooks/useWeekNavigation";
import { RescheduleModal } from "./components/calendar/RescheduleModal";
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

  // Get planned activities for the current week
  const {
    data: plannedActivities = [],
    isLoading: loadingPlannedActivities,
    refetch: refetchPlannedActivities,
  } = trpc.plannedActivities.listByWeek.useQuery({
    weekStart: currentWeekStart.toISOString().split("T")[0],
    weekEnd: currentWeekEnd.toISOString().split("T")[0],
  });

  // Get completed activities for the current week
  const {
    data: completedActivities = [],
    isLoading: loadingCompletedActivities,
    refetch: refetchCompletedActivities,
  } = trpc.activities.list.useQuery({
    date_from: currentWeekStart.toISOString().split("T")[0],
    date_to: currentWeekEnd.toISOString().split("T")[0],
  });

  const loadingActivities =
    loadingPlannedActivities || loadingCompletedActivities;
  const refetchActivities = async () => {
    await Promise.all([
      refetchPlannedActivities(),
      refetchCompletedActivities(),
    ]);
  };

  const [refreshing, setRefreshing] = useState(false);

  // Modal states for reschedule and delete
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<{
    id: string;
    name: string;
    date: Date;
  } | null>(null);

  // tRPC mutations
  const updateMutation = useReliableMutation(trpc.plannedActivities.update, {
    invalidate: [utils.plannedActivities],
    success: "Activity rescheduled successfully!",
    onSuccess: () => {
      setRescheduleModalVisible(false);
      setSelectedActivity(null);
    },
  });

  const deleteMutation = useReliableMutation(trpc.plannedActivities.delete, {
    invalidate: [utils.plannedActivities],
    success: "Activity deleted successfully!",
    onSuccess: () => {
      setDeleteModalVisible(false);
      setSelectedActivity(null);
    },
  });

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
      (sum: number, activity: any) =>
        sum + (activity.training_stress_score || 0),
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

    const completedActivitiesCount: number = completedActivities.length;
    const totalPlannedActivities: number = plannedActivities.length;

    // Determine status
    let status: "on_track" | "behind" | "ahead" | "warning" = "on_track";
    const progressPercent =
      targetTSS > 0 ? (completedTSS / targetTSS) * 100 : 0;

    if (
      progressPercent < 50 &&
      totalPlannedActivities > completedActivitiesCount
    ) {
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
      completedActivities: completedActivitiesCount,
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
        const activityDate = new Date(activity.started_at)
          .toISOString()
          .split("T")[0];
        return activityDate === dateString;
      })
      .map((activity: any) => ({
        id: activity.id,
        name: activity.name || "Completed Activity",
        activityType: activity.activity_category || "unknown",
        duration: Math.round((activity.duration_seconds || 0) / 60), // Convert to minutes
        tss: activity.training_stress_score || 0,
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
        activityType: activity.activity_plan?.activity_category || "unknown",
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
      pathname: ROUTES.PLAN.ACTIVITY_DETAIL(activityId),
    });
  };

  // Handle activity long press (quick actions)
  const handleActivityLongPress = (
    activityId: string,
    status: "completed" | "scheduled" | "warning" | "violation",
  ) => {
    // Can only reschedule/delete planned activities, not completed ones
    if (status === "completed") {
      Alert.alert(
        "Completed Activity",
        "This activity has already been completed. You can view details but cannot reschedule or delete it.",
        [
          {
            text: "View Details",
            onPress: () => handleActivityPress(activityId),
          },
          {
            text: "OK",
            style: "cancel",
          },
        ],
      );
      return;
    }

    // Find the planned activity
    const plannedActivity = plannedActivities.find((a) => a.id === activityId);
    if (!plannedActivity) return;

    Alert.alert("Activity Actions", "What would you like to do?", [
      {
        text: "View Details",
        onPress: () => handleActivityPress(activityId),
      },
      {
        text: "Reschedule",
        onPress: () => {
          setSelectedActivity({
            id: plannedActivity.id,
            name: plannedActivity.activity_plan?.name || "Activity",
            date: new Date(plannedActivity.scheduled_date),
          });
          setRescheduleModalVisible(true);
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setSelectedActivity({
            id: plannedActivity.id,
            name: plannedActivity.activity_plan?.name || "Activity",
            date: new Date(plannedActivity.scheduled_date),
          });
          setDeleteModalVisible(true);
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  // Handle reschedule confirmation
  const handleRescheduleConfirm = (newDate: Date) => {
    if (!selectedActivity) return;

    updateMutation.mutate({
      id: selectedActivity.id,
      scheduled_date: newDate.toISOString().split("T")[0],
    });
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (!selectedActivity) return;

    deleteMutation.mutate({
      id: selectedActivity.id,
    });
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
              pathname: ROUTES.PLAN.LIBRARY,
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
        <Button
          onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE)}
          size="lg"
        >
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

      {/* Reschedule Modal */}
      {selectedActivity && (
        <RescheduleModal
          visible={rescheduleModalVisible}
          activityName={selectedActivity.name}
          currentDate={selectedActivity.date}
          onConfirm={handleRescheduleConfirm}
          onCancel={() => {
            setRescheduleModalVisible(false);
            setSelectedActivity(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {selectedActivity && (
        <DeleteConfirmationModal
          visible={deleteModalVisible}
          activityName={selectedActivity.name}
          activityDate={selectedActivity.date}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setDeleteModalVisible(false);
            setSelectedActivity(null);
          }}
        />
      )}
    </View>
  );
}
