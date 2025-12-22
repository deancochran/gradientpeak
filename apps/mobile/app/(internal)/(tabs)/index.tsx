import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  EmptyState,
  QuickActions,
  StatCard,
  TodaysFocusCard,
  TrainingFormCard,
  TrainingReadinessCard,
  WeeklyGoalCard,
  WeeklyPlanPreview,
} from "@/components/home";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useHomeData } from "@/lib/hooks/useHomeData";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { ActivityPayload } from "@repo/core";
import { useRouter } from "expo-router";
import { Flame, Target, TrendingUp } from "lucide-react-native";
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
    todaysActivity,
    weeklyStats,
    formStatus,
    trainingReadiness,
    upcomingActivitys,
    weeklyGoal,
    isLoading,
    hasData,
    refetch,
  } = useHomeData();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleStartActivity = (activityId?: string) => {
    if (!todaysActivity && !activityId) return;

    const targetActivity = activityId
      ? upcomingActivitys.find((w) => w.id === activityId)
      : todaysActivity;

    if (!targetActivity) return;

    // Set activity selection for the record screen
    const payload: ActivityPayload = {
      category: targetActivity.type as any,
      location: "outdoor", // Default to outdoor, will be properly set when creating plans
      plannedActivityId: targetActivity.id,
      plan: undefined,
    };

    activitySelectionStore.setSelection(payload);

    router.push("/(internal)/(tabs)/record");
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

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-4 gap-4"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      testID="home-screen"
    >
      {/* Header Section */}
      <View className="flex-row items-center justify-between mb-2">
        <View>
          <Text className="text-3xl font-bold text-foreground">
            GradientPeak
          </Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Welcome back,{" "}
            {profile?.username || user?.email?.split("@")[0] || "Athlete"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/settings")}
          className="w-10 h-10 rounded-full bg-muted items-center justify-center"
        >
          <Text className="text-foreground text-lg font-semibold">
            {profile?.username?.charAt(0)?.toUpperCase() ||
              user?.email?.charAt(0)?.toUpperCase() ||
              "A"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Today's Focus Card (Hero Element) */}
      <TodaysFocusCard
        todaysActivity={todaysActivity}
        onStartActivity={() => handleStartActivity()}
        onViewPlan={() => router.push("/(internal)/(tabs)/plan")}
      />

      {/* Quick Stats Grid */}
      {hasData && (
        <View className="flex-row gap-3">
          <StatCard
            title="30-Day Volume"
            value={`${weeklyStats.volume.toFixed(1)} km`}
            icon={Target}
            className="flex-1"
          />
          <StatCard
            title="Activities"
            value={weeklyStats.activitiesCompleted}
            icon={TrendingUp}
            className="flex-1"
          />
          <StatCard
            title="Total TSS"
            value={weeklyStats.totalTSS}
            icon={Flame}
            className="flex-1"
          />
        </View>
      )}

      {/* Training Readiness Indicator */}
      {hasData && (
        <TrainingReadinessCard
          percentage={trainingReadiness.percentage}
          status={trainingReadiness.status}
          ctl={trainingReadiness.ctl}
          ctlStatus={trainingReadiness.ctlStatus}
          atl={trainingReadiness.atl}
          atlStatus={trainingReadiness.atlStatus}
          tsb={trainingReadiness.tsb}
          tsbStatus={trainingReadiness.tsbStatus}
        />
      )}

      {/* Weekly Plan Preview */}
      <WeeklyPlanPreview
        upcomingActivities={upcomingActivitys}
        onActivityPress={(activityId) => handleStartActivity(activityId)}
        onViewAll={() => router.push("/(internal)/(tabs)/plan")}
      />

      {/* Weekly Goal Progress */}
      {hasData && <WeeklyGoalCard weeklyGoal={weeklyGoal} />}

      {/* Quick Actions */}
      <QuickActions
        onPlanPress={() => router.push("/(internal)/(tabs)/plan")}
        onTrendsPress={() => router.push("/(internal)/(tabs)/trends")}
        onRecordPress={() => router.push("/(internal)/(tabs)/record")}
      />

      {/* Empty State for New Users */}
      {!hasData && (
        <EmptyState
          onCreatePlan={() => router.push("/(internal)/(tabs)/plan")}
        />
      )}
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
