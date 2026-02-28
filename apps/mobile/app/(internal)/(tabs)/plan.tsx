import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GhostCard } from "@/components/plan/GhostCard";
import { ScheduleActivityModal } from "@/components/ScheduleActivityModal";
import { AppHeader, PlanCalendarSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";

import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { useNavigationActionGuard } from "@/lib/navigation/useNavigationActionGuard";
import { trpc } from "@/lib/trpc";
import { isActivityCompleted } from "@/lib/utils/plan/dateGrouping";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { CalendarDays, Play } from "lucide-react-native";
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
  const guardNavigation = useNavigationActionGuard();

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

  const snapshot = useTrainingPlanSnapshot();

  const plan = snapshot.plan;
  const status = snapshot.status;
  const refetchSnapshot = snapshot.refetch;
  const refetchSnapshotAll = snapshot.refetchAll;

  // Query for activities in the current month
  const {
    data: activitiesData,
    isLoading: loadingAllPlanned,
    refetch: refetchActivities,
  } = trpc.events.list.useQuery({
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

  const weeklyExecutionSummary = useMemo(() => {
    if (!status?.weekProgress) {
      return "No weekly execution data yet";
    }

    const completed = status.weekProgress.completedActivities;
    const planned = status.weekProgress.totalPlannedActivities;
    return `${completed}/${planned} sessions completed this week`;
  }, [status]);

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
      gpsRecordingEnabled: true,
      eventId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };
    activitySelectionStore.setSelection(payload);

    guardNavigation(() => {
      router.push("/record" as any);
    });
  };

  const handleScheduleActivity = () => {
    // Open library to select a plan first
    guardNavigation(() => {
      router.replace("/library" as any);
    });
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

  const progressSummary = useMemo(() => {
    if (!planProgress) {
      return "-";
    }

    if ("daysRemaining" in planProgress) {
      return `${planProgress.daysRemaining} days to target`;
    }

    if ("weeksActive" in planProgress) {
      return `${planProgress.weeksActive} weeks active`;
    }

    return "-";
  }, [planProgress]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchSnapshotAll(), refetchActivities()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refetchSnapshot(), refetchActivities()]);
    }, [refetchSnapshot, refetchActivities]),
  );

  useEffect(() => {
    if (!plan?.id) {
      return;
    }

    void Promise.all([refetchSnapshot(), refetchActivities()]);
  }, [plan?.id, refetchSnapshot, refetchActivities]);

  // Loading state
  if (snapshot.isLoadingSharedDependencies || loadingAllPlanned) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Plan" />
        <ScrollView className="flex-1 p-6">
          <PlanCalendarSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader title="Plan" />
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-muted-foreground text-center">
            Unable to load training plan right now.
          </Text>
          <TouchableOpacity
            onPress={() => void refetchSnapshot()}
            className="px-4 py-2 rounded-full border border-border bg-card"
            activeOpacity={0.8}
          >
            <Text className="text-sm text-foreground">Retry</Text>
          </TouchableOpacity>
        </View>
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
          <View className="mb-6">
            {plan && planProgress ? (
              <View className="bg-card border border-border rounded-lg p-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold">{plan.name}</Text>
                  <View
                    className={`px-2 py-1 rounded-full ${
                      plan.is_active ? "bg-emerald-500/15" : "bg-muted"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        plan.is_active
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {plan.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                </View>

                <Text className="text-sm text-muted-foreground">
                  {progressSummary}
                </Text>

                {planProgress.progress > 0 && (
                  <View className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <View
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${planProgress.progress}%` }}
                    />
                  </View>
                )}

                <View className="bg-muted/50 rounded-md px-3 py-2">
                  <Text className="text-xs text-muted-foreground">
                    {weeklyExecutionSummary}
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleViewTrainingPlan}
                    className="flex-1 bg-primary rounded-lg py-2.5 items-center"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm text-primary-foreground font-medium">
                      Open Full Plan
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
            ) : (
              <View className="bg-card border border-border rounded-lg overflow-hidden">
                <TouchableOpacity
                  onPress={() =>
                    guardNavigation(() =>
                      router.replace(
                        ROUTES.LIBRARY_WITH_RESOURCE("training_plans"),
                      ),
                    )
                  }
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
