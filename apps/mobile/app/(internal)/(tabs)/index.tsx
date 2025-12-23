import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  TodaysTrainingCard,
  TrainingReadinessCard,
  WeeklySnapshot,
} from "@/components/home";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useHomeData } from "@/lib/hooks/useHomeData";
import { useRouter } from "expo-router";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

function HomeScreen() {
  const { user, profile } = useAuth();
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
    await refetch();
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
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="p-4 gap-4"
      >
        <Skeleton className="h-12 w-full bg-muted" />
        <Skeleton className="h-48 w-full bg-muted" />
        <View className="flex-row gap-4">
          <Skeleton className="flex-1 h-24 bg-muted" />
          <Skeleton className="flex-1 h-24 bg-muted" />
        </View>
        <Skeleton className="h-32 w-full bg-muted" />
      </ScrollView>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-5 py-6 gap-5"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      testID="home-screen"
    >
      {/* Header Section */}
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-1 mr-3">
          <Text className="text-3xl font-bold text-foreground">
            {getGreeting()}, {profile?.username || "Athlete"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/settings")}
          className="w-12 h-12 rounded-full bg-primary items-center justify-center shadow-sm"
          activeOpacity={0.7}
        >
          <Text className="text-primary-foreground text-xl font-bold">
            {profile?.username?.charAt(0)?.toUpperCase() ||
              user?.email?.charAt(0)?.toUpperCase() ||
              "A"}
          </Text>
        </TouchableOpacity>
      </View>

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
  );
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <HomeScreen />
    </ErrorBoundary>
  );
}
