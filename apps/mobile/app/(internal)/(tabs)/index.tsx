import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  EmptyState,
  QuickActions,
  StatCard,
  TodaysFocusCard,
  TrainingFormCard,
  WeeklyGoalCard,
  WeeklyPlanPreview,
} from "@/components/home";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    upcomingActivitys,
    weeklyGoal,
    isLoading,
    hasData,
  } = useHomeData();

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger refetch by remounting (simple approach)
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleStartActivity = (activityId?: string) => {
    if (!todaysActivity && !activityId) return;

    const targetActivity = activityId
      ? upcomingActivitys.find((w) => w.id === activityId)
      : todaysActivity;

    if (!targetActivity) return;

    // Set activity selection for the record screen
    const payload: ActivityPayload = {
      type: targetActivity.type as any,
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
            title="Weekly Volume"
            value={`${weeklyStats.volume.toFixed(1)} km`}
            icon={Target}
            className="flex-1"
          />
          <StatCard
            title="Fitness"
            value={weeklyStats.fitness}
            icon={TrendingUp}
            trend={
              weeklyStats.fitnessChange !== 0
                ? {
                    value: weeklyStats.fitnessChange,
                    direction: weeklyStats.fitnessChange > 0 ? "up" : "down",
                  }
                : undefined
            }
            className="flex-1"
          />
          <StatCard
            title="Fatigue"
            value={weeklyStats.fatigue}
            icon={Flame}
            trend={
              weeklyStats.fatigueChange !== 0
                ? {
                    value: weeklyStats.fatigueChange,
                    direction: weeklyStats.fatigueChange > 0 ? "up" : "down",
                  }
                : undefined
            }
            className="flex-1"
          />
        </View>
      )}

      {/* Training Form Status Indicator */}
      {hasData && <TrainingFormCard formStatus={formStatus} />}

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

      {/* Debug Info (Development only) */}
      {__DEV__ && (
        <Card className="bg-muted/50 border-border">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm">
              Debug Info
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-1">
            <Text className="text-muted-foreground text-xs">
              User ID: {user?.id || "None"}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Email: {user?.email || "None"}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Profile: {profile?.username || "None"}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Has Plan: {hasData ? "Yes" : "No"}
            </Text>
          </CardContent>
        </Card>
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
