import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  TrendingUp,
} from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { CurrentStatusCard } from "./components/CurrentStatusCard";
import { UpcomingWorkoutsCard } from "./components/UpcomingWorkoutsCard";
import { WeeklyProgressCard } from "./components/WeeklyProgressCard";

export default function TrainingPlanOverview() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Get training plan
  const { data: plan, isLoading: loadingPlan } =
    trpc.trainingPlans.get.useQuery();

  // Get current status (CTL/ATL/TSB)
  const { data: status, isLoading: loadingStatus } =
    trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
      enabled: !!plan,
    });

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      utils.trainingPlans.get.invalidate(),
      utils.trainingPlans.getCurrentStatus.invalidate(),
    ]);
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push("./create");
  };

  const handleViewCalendar = () => {
    router.push("./calendar");
  };

  const handleViewTrends = () => {
    router.push("/(internal)/(tabs)/trends" as any);
  };

  // Loading state
  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading training plan...
        </Text>
      </View>
    );
  }

  // No training plan - show empty state
  if (!plan) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="flex-1 p-6 gap-6">
          {/* Header */}
          <View>
            <Text className="text-3xl font-bold">Training Plan</Text>
            <Text className="text-muted-foreground mt-2">
              Create a structured plan to reach your fitness goals
            </Text>
          </View>

          {/* Empty State Card */}
          <Card className="mt-8">
            <CardContent className="p-8">
              <View className="items-center">
                <View className="bg-primary/10 rounded-full p-6 mb-6">
                  <Icon as={Activity} size={64} className="text-primary" />
                </View>
                <Text className="text-2xl font-bold mb-3 text-center">
                  No Training Plan
                </Text>
                <Text className="text-base text-muted-foreground text-center mb-6">
                  A training plan helps you build fitness systematically, track
                  your progress, and prevent overtraining through structured
                  workouts and recovery.
                </Text>

                <View className="w-full gap-3">
                  <Button size="lg" onPress={handleCreatePlan}>
                    <Text className="text-primary-foreground font-semibold">
                      Create Training Plan
                    </Text>
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Benefits Section */}
          <View className="gap-4 mt-4">
            <Text className="text-lg font-semibold">
              Benefits of a Training Plan:
            </Text>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={TrendingUp} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Track Your Fitness</Text>
                <Text className="text-sm text-muted-foreground">
                  Monitor CTL, ATL, and TSB to understand your fitness trends
                  and form.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Calendar} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">
                  Structured Scheduling
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Weekly TSS targets and constraint validation ensure balanced
                  training.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Activity} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Prevent Overtraining</Text>
                <Text className="text-sm text-muted-foreground">
                  Recovery rules and intensity distribution keep you healthy and
                  improving.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Has training plan - show dashboard
  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View className="flex-1 p-4 gap-4">
        {/* Header with Plan Name */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-1">
            <Text className="text-3xl font-bold">{plan.name}</Text>
            {plan.description && (
              <Text className="text-muted-foreground mt-1">
                {plan.description}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={() => router.push("./settings")}>
            <View className="bg-muted rounded-full p-2">
              <Icon as={ChevronRight} size={24} className="text-foreground" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Current Status Card - CTL/ATL/TSB */}
        {loadingStatus ? (
          <Card>
            <CardContent className="p-6">
              <View className="items-center justify-center py-8">
                <ActivityIndicator size="small" />
                <Text className="text-sm text-muted-foreground mt-2">
                  Calculating fitness metrics...
                </Text>
              </View>
            </CardContent>
          </Card>
        ) : status ? (
          <CurrentStatusCard
            ctl={status.ctl}
            atl={status.atl}
            tsb={status.tsb}
            form={status.form}
          />
        ) : null}

        {/* Weekly Progress Card */}
        {status?.weekProgress && (
          <WeeklyProgressCard
            completedTSS={status.weekProgress.completedTSS}
            plannedTSS={status.weekProgress.plannedTSS}
            targetTSS={status.weekProgress.targetTSS}
            completedWorkouts={status.weekProgress.completedWorkouts}
            totalPlannedWorkouts={status.weekProgress.totalPlannedWorkouts}
          />
        )}

        {/* Upcoming Workouts */}
        {status?.upcomingWorkouts && status.upcomingWorkouts.length > 0 && (
          <UpcomingWorkoutsCard workouts={status.upcomingWorkouts} />
        )}

        {/* Action Buttons */}
        <View className="gap-3 mt-2">
          <Button
            size="lg"
            onPress={handleViewCalendar}
            className="flex-row items-center justify-center gap-2"
          >
            <Icon as={Calendar} size={20} className="text-primary-foreground" />
            <Text className="text-primary-foreground font-semibold">
              View Calendar
            </Text>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onPress={handleViewTrends}
            className="flex-row items-center justify-center gap-2"
          >
            <Icon as={TrendingUp} size={20} className="text-foreground" />
            <Text className="text-foreground font-semibold">View Trends</Text>
          </Button>
        </View>

        {/* Quick Info */}
        <Card>
          <CardHeader>
            <CardTitle>Training Plan Details</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {plan.structure && (
                <>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Weekly TSS Target
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_weekly_tss_min} -{" "}
                      {(plan.structure as any).target_weekly_tss_max}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Activities per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_activities_per_week}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Rest Days per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).min_rest_days_per_week}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
