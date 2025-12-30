import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  TodaysTrainingCard,
  TrainingReadinessCard,
  WeeklySnapshot,
} from "@/components/home";
import { AppHeader } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeData } from "@/lib/hooks/useHomeData";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";

function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  const {
    plan,
    todaysActivity,
    weeklyStats,
    trainingReadiness,
    isLoading,
    refetch,
  } = useHomeData();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch?.();
    setRefreshing(false);
  };

  const handleStartActivity = () => {
    if (!todaysActivity) return;

    // Navigate to plan page with activity ID to open the modal
    router.push({
      pathname: "/(internal)/(tabs)/plan",
      params: { activityId: todaysActivity.id },
    } as any);
  };

  const handleViewPlan = () => {
    router.push("/(internal)/(tabs)/plan");
  };

  if (isLoading) {
    return (
      <View className="flex-1">
        <AppHeader title="Home" />
        <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
          <Skeleton className="h-48 w-full bg-muted" />
          <View className="flex-row gap-4">
            <Skeleton className="flex-1 h-24 bg-muted" />
            <Skeleton className="flex-1 h-24 bg-muted" />
          </View>
          <Skeleton className="h-32 w-full bg-muted" />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <AppHeader title="Home" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 py-6 gap-5"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        testID="home-screen"
      >
        {/* Training Readiness Indicator */}
        <TrainingReadinessCard
          ctl={trainingReadiness.ctl}
          atl={trainingReadiness.atl}
          tsb={trainingReadiness.tsb}
          form={
            trainingReadiness.tsb > 15
              ? "fresh"
              : trainingReadiness.tsb > 5
                ? "optimal"
                : trainingReadiness.tsb > -10
                  ? "neutral"
                  : trainingReadiness.tsb > -20
                    ? "tired"
                    : "overreaching"
          }
        />

        {/* Today's Training Card - Most Important */}
        <TodaysTrainingCard
          todaysActivity={todaysActivity}
          onStartActivity={handleStartActivity}
          onViewPlan={handleViewPlan}
        />

        {/* Weekly Snapshot */}
        <WeeklySnapshot
          distance={parseFloat((weeklyStats.volume * 0.621371).toFixed(1))}
          workouts={weeklyStats.activitiesCompleted}
          totalTSS={weeklyStats.totalTSS}
        />
      </ScrollView>
    </View>
  );
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <HomeScreen />
    </ErrorBoundary>
  );
}
