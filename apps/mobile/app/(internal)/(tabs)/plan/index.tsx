import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { trpc } from "@/lib/trpc";
import { ActivityPayload } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Library,
  Plus,
  Target,
  TrendingUp,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
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

export default function PlanScreen() {
  const router = useRouter();

  const [selectedPlannedActivityId, setSelectedPlannedActivityId] = useState<
    string | null
  >(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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
  const { data: plan, isLoading: loadingPlan } =
    trpc.trainingPlans.get.useQuery();

  const { data: status, isLoading: loadingStatus } =
    trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
      enabled: !!plan,
    });

  // Query for all planned activities
  const { data: allPlannedActivities, isLoading: loadingAllPlanned } =
    trpc.plannedActivities.list.useQuery({
      limit: 100,
    });

  const { data: weeklyScheduled = 0 } =
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
      const type = dayActivities[0]?.activity_plan?.activity_type || "other";
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

  // Upcoming workouts from status.upcomingActivities (limit to 3)
  const upcomingWorkouts = useMemo(() => {
    if (!status?.upcomingActivities) return [];
    return status.upcomingActivities.slice(0, 3).map((activity) => ({
      id: activity.id,
      title: activity.activity_plan?.name || "Unnamed Workout",
      type: activity.activity_plan?.activity_type || "other",
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
      type: plannedActivity.activity_plan.activity_type,
      plannedActivityId: plannedActivity.id,
      plan: plannedActivity.activity_plan,
    };
    activitySelectionStore.setSelection(payload);

    router.push("/record" as any);
  };

  const handleScheduleActivity = () => {
    router.push("/plan/create_planned_activity" as any);
  };

  // Loading state
  if (loadingPlan || loadingStatus || loadingAllPlanned) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">Loading plan...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      {/* Gradient Header */}
      <View className="bg-primary px-5 pt-12 pb-6">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-primary-foreground">
            Plan
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/plan/planned_activities" as any)}
            className="p-2"
            activeOpacity={0.7}
          >
            <Icon as={Calendar} size={24} className="text-primary-foreground" />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-primary-foreground/10 rounded-xl p-3">
            <View className="flex-row items-center gap-1 mb-1">
              <Icon as={Target} size={16} className="text-primary-foreground" />
              <Text className="text-xs text-primary-foreground/90">
                Adherence
              </Text>
            </View>
            <Text className="text-2xl font-bold text-primary-foreground">
              {adherenceRate}%
            </Text>
          </View>

          <View className="flex-1 bg-primary-foreground/10 rounded-xl p-3">
            <View className="flex-row items-center gap-1 mb-1">
              <Icon
                as={TrendingUp}
                size={16}
                className="text-primary-foreground"
              />
              <Text className="text-xs text-primary-foreground/90">
                This Week
              </Text>
            </View>
            <Text className="text-2xl font-bold text-primary-foreground">
              {weeklyScheduled}
            </Text>
          </View>
        </View>

        {/* Plan Progress */}
        <Card className="bg-primary-foreground/10 border-primary-foreground/20 mb-6">
          <CardHeader className="pb-3">
            <View className="flex-row items-center justify-between">
              <CardTitle className="text-primary-foreground text-base">
                {planProgress.name}
              </CardTitle>
              <Text className="text-primary-foreground text-sm font-medium">
                Week {planProgress.week}
              </Text>
            </View>
          </CardHeader>
          <CardContent className="pt-0">
            <Progress
              value={planProgress.percentage}
              className="w-full h-2 mb-2"
              indicatorClassName="bg-primary-foreground"
            />
            <Text className="text-primary-foreground/80 text-sm">
              {planProgress.percentage}% complete
            </Text>
          </CardContent>
        </Card>

        {/* Week Navigation */}
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            className="p-2"
            onPress={handlePreviousWeek}
            activeOpacity={0.7}
          >
            <Icon
              as={ChevronLeft}
              size={20}
              className="text-primary-foreground"
            />
          </TouchableOpacity>
          <Text className="font-medium text-primary-foreground">
            {format(startOfWeek, "MMM d")} - {format(endOfWeek, "MMM d")}
          </Text>
          <TouchableOpacity
            className="p-2"
            onPress={handleNextWeek}
            activeOpacity={0.7}
          >
            <Icon
              as={ChevronRight}
              size={20}
              className="text-primary-foreground"
            />
          </TouchableOpacity>
        </View>

        {/* Week Calendar */}
        <View className="flex-row justify-between">
          {weekDays.map((day, idx) => {
            const dateObj = weekDates[idx];
            const isSelectedDay = isSameDay(dateObj, selectedDate);
            const isTodayMarker = isSameDay(dateObj, new Date());

            return (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSelectDay(idx)}
                className={`items-center ${isSelectedDay ? "opacity-100" : "opacity-60"}`}
                activeOpacity={0.7}
              >
                <Text className="text-xs mb-2 text-primary-foreground">
                  {day}
                </Text>
                <View
                  className={`w-12 h-12 rounded-lg items-center justify-center relative ${
                    isSelectedDay
                      ? "bg-primary-foreground"
                      : "bg-primary-foreground/10"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelectedDay ? "text-primary" : "text-primary-foreground"
                    }`}
                  >
                    {dates[idx]}
                  </Text>
                  {weekActivities[idx].count > 0 && (
                    <View
                      className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                        weekActivities[idx].completed
                          ? "bg-green-500"
                          : isSelectedDay
                            ? "bg-primary"
                            : "bg-primary-foreground"
                      }`}
                    />
                  )}
                  {isTodayMarker && !isSelectedDay && (
                    <View className="absolute top-1 right-1 w-1 h-1 rounded-full bg-yellow-400" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Content Area */}
      <View className="px-5 py-6 gap-4">
        {/* Selected Day Section */}
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold">
              {isToday
                ? "Today's Workout"
                : isPast
                  ? format(selectedDate, "EEEE, MMM d")
                  : format(selectedDate, "EEEE, MMM d")}
            </Text>
            {selectedDayActivities.length > 0 && (
              <Text className="text-sm text-muted-foreground">
                {selectedDayActivities.length}{" "}
                {selectedDayActivities.length === 1 ? "activity" : "activities"}
              </Text>
            )}
          </View>

          {selectedDayActivities.length > 0 ? (
            selectedDayActivities.map((activity: any) => (
              <TouchableOpacity
                key={activity.id}
                onPress={() => handleSelectPlannedActivity(activity.id)}
                activeOpacity={0.7}
              >
                <Card
                  className={`${
                    isActivityCompleted(activity)
                      ? "border-green-500/30 bg-green-50/50"
                      : "border-primary/20"
                  }`}
                >
                  <CardContent className="p-0">
                    <View className="flex-row items-center p-4 gap-3">
                      <View
                        className={`w-14 h-14 ${getActivityBgClass(activity.activity_plan?.activity_type)} rounded-xl items-center justify-center`}
                      >
                        <Icon
                          as={Flame}
                          size={28}
                          className="text-primary-foreground"
                        />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-start justify-between mb-1">
                          <Text
                            className={`font-bold text-base flex-1 ${
                              isActivityCompleted(activity)
                                ? "line-through text-muted-foreground"
                                : ""
                            }`}
                          >
                            {activity.activity_plan?.name || "Workout"}
                          </Text>
                          <View className="bg-yellow-50 px-2 py-1 rounded-full ml-2">
                            <Text className="text-xs font-medium text-yellow-600">
                              Moderate
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center gap-3 mb-3">
                          <View className="flex-row items-center gap-1">
                            <Icon
                              as={Clock}
                              size={14}
                              className="text-muted-foreground"
                            />
                            <Text className="text-sm text-muted-foreground">
                              {activity.activity_plan?.estimated_duration || 0}{" "}
                              min
                            </Text>
                          </View>
                          {activity.activity_plan?.activity_type && (
                            <Text className="text-sm text-muted-foreground capitalize">
                              {activity.activity_plan.activity_type.replace(
                                /_/g,
                                " ",
                              )}
                            </Text>
                          )}
                        </View>

                        {isToday && !isActivityCompleted(activity) && (
                          <Button
                            size="sm"
                            onPress={() => handleStartActivity(activity)}
                            className="self-start"
                          >
                            <Text className="text-primary-foreground font-semibold">
                              Start Workout
                            </Text>
                          </Button>
                        )}

                        {isActivityCompleted(activity) && (
                          <View className="flex-row items-center gap-1">
                            <View className="w-2 h-2 bg-green-500 rounded-full" />
                            <Text className="text-sm text-green-600 font-medium">
                              Completed
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            ))
          ) : (
            <Card>
              <CardContent className="p-6 items-center">
                <Icon
                  as={Calendar}
                  size={48}
                  className="text-muted-foreground"
                />
                <Text className="text-lg font-semibold mb-1">
                  {isPast ? "Rest Day" : "No Workout Scheduled"}
                </Text>
                <Text className="text-sm text-muted-foreground text-center mb-4">
                  {isPast
                    ? "You rested on this day"
                    : isToday
                      ? "No workouts scheduled for today"
                      : "No workouts scheduled for this date"}
                </Text>
                {!isPast && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={handleScheduleActivity}
                  >
                    <Icon as={Plus} size={16} className="mr-2" />
                    <Text>Schedule Workout</Text>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </View>

        {/* Upcoming Workouts - Only show if viewing today */}
        {isToday && upcomingWorkouts.length > 0 && (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold">Coming Up</Text>
              <TouchableOpacity
                onPress={() => router.push("/plan/planned_activities" as any)}
                activeOpacity={0.7}
              >
                <Text className="text-sm text-primary font-medium">
                  View All
                </Text>
              </TouchableOpacity>
            </View>

            {upcomingWorkouts.map((workout) => (
              <TouchableOpacity
                key={workout.id}
                onPress={() => handleSelectPlannedActivity(workout.id)}
                activeOpacity={0.7}
              >
                <Card>
                  <CardContent className="p-4">
                    <View className="flex-row items-start gap-3">
                      <View
                        className={`w-12 h-12 ${getActivityBgClass(workout.type)} rounded-xl items-center justify-center`}
                      >
                        <Icon
                          as={Clock}
                          size={24}
                          className="text-primary-foreground"
                        />
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-start justify-between mb-1">
                          <Text className="font-semibold flex-1">
                            {workout.title}
                          </Text>
                          <View
                            className={`px-2 py-1 rounded-full ml-2 ${getIntensityColor(workout.intensity).bg}`}
                          >
                            <Text
                              className={`text-xs font-medium ${getIntensityColor(workout.intensity).text}`}
                            >
                              {workout.intensity}
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center gap-3 mb-2">
                          <Text className="text-sm text-muted-foreground">
                            {workout.duration}
                          </Text>
                        </View>

                        <Text className="text-xs text-muted-foreground">
                          {workout.date}
                        </Text>
                      </View>
                    </View>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
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
                    <Text className="font-medium">Workout Library</Text>
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
                    <Text className="font-medium">Create Custom Workout</Text>
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
