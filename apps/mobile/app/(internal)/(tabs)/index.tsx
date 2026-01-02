import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  ScheduleStrip,
  TodaysTrainingCard,
  TrainingReadinessCard,
} from "@/components/home";
import { TrainingLoadChart } from "@/components/charts/TrainingLoadChart";
import { AppHeader } from "@/components/shared";
import { DetailChartModal } from "@/components/shared/DetailChartModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useHomeData } from "@/lib/hooks/useHomeData";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";

function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [trainingStatusModalVisible, setTrainingStatusModalVisible] =
    React.useState(false);

  const {
    plan,
    todaysActivity,
    weeklyStats,
    trainingReadiness,
    isLoading,
    refetch,
    trends,
    projectedFitness,
    idealFitnessCurve,
    goalMetrics,
    consistency,
    schedule,
    weeklyGoal,
    weeklySummary,
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

  const handlePressActivity = (activityId: string) => {
    router.push({
      pathname: "/(internal)/(tabs)/plan",
      params: { activityId },
    } as any);
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
        {/* Training Status Section */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground px-1">
            Training Status
          </Text>
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
            onPress={() => setTrainingStatusModalVisible(true)}
          />
        </View>

        {/* Today's Training Card - Most Important */}
        <TodaysTrainingCard
          todaysActivity={todaysActivity}
          onStartActivity={handleStartActivity}
          onViewPlan={handleViewPlan}
        />

        {/* Upcoming Schedule */}
        {schedule && schedule.length > 0 && (
          <ScheduleStrip
            schedule={schedule.map((s) => ({
              id: s.id,
              date: s.date,
              activityName: s.activityName,
              activityType: s.activityType,
              estimatedDuration: s.estimatedDuration,
              estimatedTSS: s.estimatedTSS,
              isCompleted: s.isCompleted,
            }))}
            onPressActivity={handlePressActivity}
          />
        )}
      </ScrollView>

      {/* Training Status Modal */}
      <DetailChartModal
        visible={trainingStatusModalVisible}
        onClose={() => setTrainingStatusModalVisible(false)}
        title="Training Load"
        defaultDateRange="30d"
      >
        {(dateRange) => {
          // Filter data based on date range
          const days =
            dateRange === "7d"
              ? 7
              : dateRange === "30d"
                ? 30
                : dateRange === "90d"
                  ? 90
                  : trends.length;
          const filteredData = trends.slice(-days);

          return (
            <TrainingLoadChart
              data={filteredData.map((t) => ({
                date: t.date,
                ctl: t.ctl,
                atl: t.atl || 0,
                tsb: t.tsb || 0,
              }))}
              height={400}
            />
          );
        }}
      </DetailChartModal>
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
