import { StatCard } from "@/components/home/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useHomeData } from "@/lib/hooks/useHomeData";
import { activitySelectionStore } from "@/lib/stores/activitySelectionStore";
import { ActivityPayload } from "@repo/core";
import { useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  Flame,
  Heart,
  Play,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function HomeScreen() {
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

  const getFormStatusColor = () => {
    switch (formStatus.color) {
      case "green":
        return "bg-green-500";
      case "blue":
        return "bg-blue-500";
      case "purple":
        return "bg-purple-500";
      case "orange":
        return "bg-orange-500";
      default:
        return "bg-slate-500";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 border-green-500";
      case "current":
        return "bg-blue-500/20 border-blue-500";
      case "upcoming":
        return "bg-slate-500/20 border-slate-500";
      default:
        return "bg-slate-500/20 border-slate-500";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "current":
        return "text-blue-400";
      case "upcoming":
        return "text-slate-400";
      default:
        return "text-slate-400";
    }
  };

  if (isLoading) {
    return (
      <ScrollView
        className="flex-1 bg-slate-950"
        contentContainerClassName="p-4 gap-4"
      >
        <Skeleton className="h-12 w-full bg-slate-800" />
        <Skeleton className="h-48 w-full bg-slate-800" />
        <View className="flex-row gap-4">
          <Skeleton className="flex-1 h-24 bg-slate-800" />
          <Skeleton className="flex-1 h-24 bg-slate-800" />
        </View>
        <Skeleton className="h-32 w-full bg-slate-800" />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-950"
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
          <Text className="text-3xl font-bold text-white">GradientPeak</Text>
          <Text className="text-slate-400 text-sm mt-1">
            Welcome back,{" "}
            {profile?.username || user?.email?.split("@")[0] || "Athlete"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/settings")}
          className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center"
        >
          <Text className="text-white text-lg font-semibold">
            {profile?.username?.charAt(0)?.toUpperCase() ||
              user?.email?.charAt(0)?.toUpperCase() ||
              "A"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Today's Focus Card (Hero Element) */}
      {todaysActivity ? (
        <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 border-0 overflow-hidden">
          <CardHeader className="pb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  Today's Focus
                </Text>
                <Text className="text-white text-2xl font-bold">
                  {todaysActivity.title}
                </Text>
              </View>
              <View className="bg-white/20 rounded-full p-3">
                <Activity size={24} color="#ffffff" />
              </View>
            </View>
          </CardHeader>
          <CardContent className="pt-0">
            <View className="flex-row items-center mb-4 gap-4">
              <View className="flex-row items-center">
                <Zap size={16} color="#e0e7ff" />
                <Text className="text-indigo-100 text-sm ml-1">
                  {todaysActivity.intensity}
                </Text>
              </View>
              {todaysActivity.duration > 0 && (
                <View className="flex-row items-center">
                  <Target size={16} color="#e0e7ff" />
                  <Text className="text-indigo-100 text-sm ml-1">
                    {todaysActivity.duration} min
                  </Text>
                </View>
              )}
              {todaysActivity.distance > 0 && (
                <View className="flex-row items-center">
                  <TrendingUp size={16} color="#e0e7ff" />
                  <Text className="text-indigo-100 text-sm ml-1">
                    {todaysActivity.distance} km
                  </Text>
                </View>
              )}
            </View>
            {todaysActivity.description && (
              <Text className="text-indigo-100 text-sm mb-4">
                {todaysActivity.description}
              </Text>
            )}
            <Button
              className="bg-white w-full"
              onPress={() => handleStartActivity()}
            >
              <View className="flex-row items-center justify-center">
                <Play size={20} color="#4f46e5" fill="#4f46e5" />
                <Text className="text-indigo-600 font-bold text-base ml-2">
                  Start Activity
                </Text>
              </View>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 items-center">
            <Calendar size={32} color="#64748b" className="mb-2" />
            <Text className="text-slate-300 text-center font-medium mb-1">
              No activity scheduled today
            </Text>
            <Text className="text-slate-500 text-sm text-center mb-4">
              Rest day or time to plan your next activity
            </Text>
            <Button
              variant="outline"
              className="border-slate-600"
              onPress={() => router.push("/(internal)/(tabs)/plan")}
            >
              <Text className="text-slate-300">View Plan</Text>
            </Button>
          </CardContent>
        </Card>
      )}

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
      {hasData && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <View className="flex-row items-center justify-between">
              <CardTitle className="text-white">Training Form</CardTitle>
              <View
                className={`px-3 py-1 rounded-full ${getFormStatusColor()}/20`}
              >
                <Text
                  className={`${getFormStatusColor().replace("bg-", "text-")} font-semibold text-sm`}
                >
                  {formStatus.label}
                </Text>
              </View>
            </View>
          </CardHeader>
          <CardContent>
            <Progress
              value={formStatus.percentage}
              className="w-full h-3 mb-3"
              indicatorClassName={getFormStatusColor()}
            />
            <Text className="text-slate-300 text-sm mb-3">
              {formStatus.explanation}
            </Text>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-slate-500 text-xs">Fitness (CTL)</Text>
                <Text className="text-white font-semibold">
                  {formStatus.ctl}
                </Text>
              </View>
              <View>
                <Text className="text-slate-500 text-xs">Fatigue (ATL)</Text>
                <Text className="text-white font-semibold">
                  {formStatus.atl}
                </Text>
              </View>
              <View>
                <Text className="text-slate-500 text-xs">Form (TSB)</Text>
                <Text className="text-white font-semibold">
                  {formStatus.tsb}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Weekly Plan Preview */}
      {upcomingActivitys.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-white">This Week's Plan</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => router.push("/(internal)/(tabs)/plan")}
            >
              <Text className="text-blue-400 text-sm">View All</Text>
            </Button>
          </CardHeader>
          <CardContent className="gap-2">
            {upcomingActivitys.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                onPress={() => handleStartActivity(activity.id)}
                className="flex-row items-center justify-between p-3 bg-slate-700/50 rounded-lg border border-slate-600"
              >
                <View className="flex-1">
                  <View className="flex-row items-center mb-1">
                    <Text className="text-slate-400 text-xs font-medium mr-2">
                      {activity.day}
                    </Text>
                    <View
                      className={`px-2 py-0.5 rounded ${getStatusBadgeColor(activity.status)}`}
                    >
                      <Text
                        className={`${getStatusTextColor(activity.status)} text-xs font-medium`}
                      >
                        {activity.status}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-white font-medium mb-1">
                    {activity.title}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-slate-400 text-xs">
                      {activity.type}
                    </Text>
                    {activity.distance > 0 && (
                      <Text className="text-slate-400 text-xs">
                        {activity.distance} km
                      </Text>
                    )}
                    {activity.duration > 0 && (
                      <Text className="text-slate-400 text-xs">
                        {activity.duration} min
                      </Text>
                    )}
                  </View>
                </View>
                {activity.status !== "completed" && (
                  <Play size={20} color="#64748b" />
                )}
              </TouchableOpacity>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Weekly Goal Progress */}
      {hasData && weeklyGoal.target > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">Weekly Goal</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="flex-row items-end justify-between mb-2">
              <View>
                <Text className="text-slate-400 text-sm">Progress</Text>
                <Text className="text-white text-2xl font-bold">
                  {weeklyGoal.actual} {weeklyGoal.unit}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-400 text-sm">Target</Text>
                <Text className="text-slate-300 text-xl font-semibold">
                  {weeklyGoal.target} {weeklyGoal.unit}
                </Text>
              </View>
            </View>
            <Progress
              value={weeklyGoal.percentage}
              className="w-full h-3 mb-2"
              indicatorClassName={
                weeklyGoal.percentage >= 100
                  ? "bg-green-500"
                  : weeklyGoal.percentage >= 70
                    ? "bg-blue-500"
                    : "bg-orange-500"
              }
            />
            <Text className="text-slate-400 text-sm text-center">
              {weeklyGoal.percentage}% complete
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <View className="flex-row gap-3 mb-4">
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/plan")}
          className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-4 items-center"
        >
          <Calendar size={24} color="#64748b" className="mb-2" />
          <Text className="text-slate-300 text-sm font-medium">Plan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/trends")}
          className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-4 items-center"
        >
          <TrendingUp size={24} color="#64748b" className="mb-2" />
          <Text className="text-slate-300 text-sm font-medium">Trends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(internal)/(tabs)/record")}
          className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-4 items-center"
        >
          <Heart size={24} color="#64748b" className="mb-2" />
          <Text className="text-slate-300 text-sm font-medium">Record</Text>
        </TouchableOpacity>
      </View>

      {/* Empty State for New Users */}
      {!hasData && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 items-center">
            <Target size={48} color="#64748b" className="mb-4" />
            <Text className="text-white text-lg font-bold text-center mb-2">
              Welcome to GradientPeak!
            </Text>
            <Text className="text-slate-400 text-sm text-center mb-4">
              Start by creating your first training plan to unlock personalized
              insights and track your progress.
            </Text>
            <Button
              onPress={() => router.push("/(internal)/(tabs)/plan")}
              className="bg-indigo-600"
            >
              <Text className="text-white font-semibold">
                Create Training Plan
              </Text>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Debug Info (Development only) */}
      {__DEV__ && (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-400 text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="gap-1">
            <Text className="text-slate-500 text-xs">
              User ID: {user?.id || "None"}
            </Text>
            <Text className="text-slate-500 text-xs">
              Email: {user?.email || "None"}
            </Text>
            <Text className="text-slate-500 text-xs">
              Profile: {profile?.username || "None"}
            </Text>
            <Text className="text-slate-500 text-xs">
              Has Plan: {hasData ? "Yes" : "No"}
            </Text>
          </CardContent>
        </Card>
      )}
    </ScrollView>
  );
}
