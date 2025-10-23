// apps/mobile/src/app/(internal)/(tabs)/trends.tsx

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import { Activity, BarChart3, TrendingUp } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import {
  getDateRangeFromTimeRange,
  TimeRangeSelector,
  type TimeRange,
} from "./trends/components/TimeRangeSelector";

type TabView = "overview" | "weekly" | "intensity";

/**
 * TrendsScreen Component
 *
 * Main analytics screen showing training trends and progress.
 * Features:
 * - Current training status (CTL/ATL/TSB)
 * - Training curve visualization
 * - Weekly summary
 * - Intensity distribution analysis
 *
 * Tabs:
 * - Overview: Current status and key metrics
 * - Weekly Summary: Week-by-week breakdown
 * - Intensity Analysis: Target vs actual intensity distribution
 */
export default function TrendsScreen() {
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");
  const [activeTab, setActiveTab] = useState<TabView>("overview");
  const [refreshing, setRefreshing] = useState(false);

  // Get user's training plan
  const {
    data: trainingPlan,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery();

  // Get current status
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: !!trainingPlan,
  });

  // Get actual curve data
  const dateRange = getDateRangeFromTimeRange(timeRange);
  const { data: actualCurve, refetch: refetchCurve } =
    trpc.trainingPlans.getActualCurve.useQuery(dateRange, {
      enabled: !!trainingPlan,
    });

  // Get ideal curve data (if periodization exists)
  const { data: idealCurve, refetch: refetchIdeal } =
    trpc.trainingPlans.getIdealCurve.useQuery(
      {
        id: trainingPlan?.id ?? "",
        ...dateRange,
      },
      {
        enabled: !!trainingPlan?.id,
      },
    );

  // Get weekly summary
  const {
    data: weeklySummary,
    isLoading: weeklyLoading,
    refetch: refetchWeekly,
  } = trpc.trainingPlans.getWeeklySummary.useQuery(
    {
      training_plan_id: trainingPlan?.id ?? "",
      weeks_back: 12,
    },
    {
      enabled: !!trainingPlan && activeTab === "weekly",
    },
  );

  // Get intensity distribution from actual IF values (7-zone system)
  const {
    data: intensityData,
    isLoading: intensityLoading,
    refetch: refetchIntensity,
  } = trpc.trainingPlans.getIntensityDistribution.useQuery(
    {
      training_plan_id: trainingPlan?.id,
      start_date: dateRange.start_date,
      end_date: dateRange.end_date,
    },
    {
      enabled: !!trainingPlan && activeTab === "intensity",
    },
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchPlan(),
      refetchStatus(),
      refetchCurve(),
      refetchIdeal(),
      activeTab === "weekly" && refetchWeekly(),
      activeTab === "intensity" && refetchIntensity(),
    ]);
    setRefreshing(false);
  };

  const getFormStatusColor = (form: string): string => {
    switch (form) {
      case "fresh":
        return "text-green-600";
      case "optimal":
        return "text-blue-600";
      case "neutral":
        return "text-gray-600";
      case "tired":
        return "text-orange-600";
      case "overreached":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getFormStatusBg = (form: string): string => {
    switch (form) {
      case "fresh":
        return "bg-green-50 border-green-200";
      case "optimal":
        return "bg-blue-50 border-blue-200";
      case "neutral":
        return "bg-gray-50 border-gray-200";
      case "tired":
        return "bg-orange-50 border-orange-200";
      case "overreached":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const renderTabBar = () => (
    <View className="flex-row bg-gray-100 rounded-lg p-1 mb-4">
      <Pressable
        onPress={() => setActiveTab("overview")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "overview" ? "bg-white shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <TrendingUp
            size={16}
            className={
              activeTab === "overview" ? "text-blue-600" : "text-gray-600"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "overview" ? "text-blue-600" : "text-gray-600"
            }`}
          >
            Overview
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => setActiveTab("weekly")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "weekly" ? "bg-white shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <BarChart3
            size={16}
            className={
              activeTab === "weekly" ? "text-blue-600" : "text-gray-600"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "weekly" ? "text-blue-600" : "text-gray-600"
            }`}
          >
            Weekly
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => setActiveTab("intensity")}
        className={`flex-1 py-2 px-3 rounded-md ${
          activeTab === "intensity" ? "bg-white shadow-sm" : ""
        }`}
      >
        <View className="flex-row items-center justify-center">
          <Activity
            size={16}
            className={
              activeTab === "intensity" ? "text-blue-600" : "text-gray-600"
            }
          />
          <Text
            className={`ml-1 text-sm font-medium ${
              activeTab === "intensity" ? "text-blue-600" : "text-gray-600"
            }`}
          >
            Intensity
          </Text>
        </View>
      </Pressable>
    </View>
  );

  const renderOverviewTab = () => {
    if (statusLoading) {
      return (
        <View className="items-center justify-center py-12">
          <ActivityIndicator size="large" />
          <Text className="text-gray-600 mt-2">Loading status...</Text>
        </View>
      );
    }

    if (!status) {
      return (
        <View className="items-center justify-center py-12">
          <Text className="text-gray-600">No training data available</Text>
        </View>
      );
    }

    return (
      <View className="space-y-4">
        {/* Current Status Card */}
        <View
          className={`p-4 rounded-lg border ${getFormStatusBg(status.form)}`}
        >
          <Text className="text-sm font-medium text-gray-600 mb-2">
            Current Form Status
          </Text>
          <Text
            className={`text-3xl font-bold ${getFormStatusColor(status.form)} capitalize`}
          >
            {status.form}
          </Text>
          <Text className="text-sm text-gray-600 mt-2">
            TSB: {status.tsb > 0 ? "+" : ""}
            {status.tsb}
          </Text>
        </View>

        {/* Training Metrics */}
        <View className="bg-white rounded-lg border border-gray-200 p-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">
            Training Load Metrics
          </Text>

          <View className="space-y-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-gray-600">
                  Chronic Training Load (CTL)
                </Text>
                <Text className="text-xs text-gray-500">42-day fitness</Text>
              </View>
              <Text className="text-2xl font-bold text-gray-900">
                {status.ctl}
              </Text>
            </View>

            <View className="h-px bg-gray-200" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-gray-600">
                  Acute Training Load (ATL)
                </Text>
                <Text className="text-xs text-gray-500">7-day fatigue</Text>
              </View>
              <Text className="text-2xl font-bold text-gray-900">
                {status.atl}
              </Text>
            </View>

            <View className="h-px bg-gray-200" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-gray-600">
                  Training Stress Balance (TSB)
                </Text>
                <Text className="text-xs text-gray-500">Form indicator</Text>
              </View>
              <Text
                className={`text-2xl font-bold ${status.tsb > 0 ? "text-green-600" : status.tsb < -10 ? "text-red-600" : "text-gray-900"}`}
              >
                {status.tsb > 0 ? "+" : ""}
                {status.tsb}
              </Text>
            </View>
          </View>
        </View>

        {/* Week Progress */}
        <View className="bg-white rounded-lg border border-gray-200 p-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">
            This Week&apos;s Progress
          </Text>

          <View className="space-y-3">
            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm text-gray-600">Weekly TSS</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {status.weekProgress.completedTSS} /{" "}
                  {status.weekProgress.targetTSS}
                </Text>
              </View>
              <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className="h-full bg-blue-500"
                  style={{
                    width: `${Math.min((status.weekProgress.completedTSS / status.weekProgress.targetTSS) * 100, 100)}%`,
                  }}
                />
              </View>
            </View>

            <View>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm text-gray-600">Workouts</Text>
                <Text className="text-sm font-medium text-gray-900">
                  {status.weekProgress.completedWorkouts} /{" "}
                  {status.weekProgress.totalPlannedWorkouts}
                </Text>
              </View>
              <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <View
                  className="h-full bg-green-500"
                  style={{
                    width: `${Math.min((status.weekProgress.completedWorkouts / status.weekProgress.totalPlannedWorkouts) * 100, 100)}%`,
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Training Curve Summary */}
        {actualCurve && actualCurve.dataPoints.length > 0 && (
          <View className="bg-white rounded-lg border border-gray-200 p-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">
              Training Trend ({timeRange})
            </Text>
            <Text className="text-sm text-gray-600 mb-2">
              {actualCurve.dataPoints.length} days of data
            </Text>

            {idealCurve && (
              <View className="mt-2 p-3 bg-blue-50 rounded-lg">
                <Text className="text-sm text-gray-700">
                  📈 Target CTL: {idealCurve.targetCTL}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">
                  Starting: {idealCurve.startCTL} → Target by{" "}
                  {new Date(idealCurve.targetDate).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderWeeklyTab = () => {
    if (weeklyLoading) {
      return (
        <View className="items-center justify-center py-12">
          <ActivityIndicator size="large" />
          <Text className="text-gray-600 mt-2">Loading weekly data...</Text>
        </View>
      );
    }

    if (!weeklySummary || weeklySummary.length === 0) {
      return (
        <View className="items-center justify-center py-12">
          <Text className="text-gray-600">No weekly data available</Text>
        </View>
      );
    }

    return (
      <View className="space-y-3">
        {weeklySummary.map((week, index) => {
          const statusColor =
            week.status === "good"
              ? "border-green-200 bg-green-50"
              : week.status === "warning"
                ? "border-yellow-200 bg-yellow-50"
                : "border-red-200 bg-red-50";

          const statusIcon =
            week.status === "good"
              ? "✓"
              : week.status === "warning"
                ? "⚠️"
                : "❌";

          return (
            <View
              key={index}
              className={`p-4 rounded-lg border ${statusColor}`}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-sm font-semibold text-gray-900">
                    Week {weeklySummary.length - index}
                  </Text>
                  <Text className="text-xs text-gray-600">
                    {new Date(week.weekStart).toLocaleDateString()} -{" "}
                    {new Date(week.weekEnd).toLocaleDateString()}
                  </Text>
                </View>
                <Text className="text-2xl">{statusIcon}</Text>
              </View>

              <View className="space-y-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-600">TSS</Text>
                  <Text className="text-sm font-medium text-gray-900">
                    {week.completedTSS} / {week.plannedTSS} (
                    {week.tssPercentage}%)
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-600">Workouts</Text>
                  <Text className="text-sm font-medium text-gray-900">
                    {week.completedWorkouts} / {week.plannedWorkouts} (
                    {week.workoutPercentage}%)
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderIntensityTab = () => {
    if (intensityLoading) {
      return (
        <View className="items-center justify-center py-12">
          <ActivityIndicator size="large" />
          <Text className="text-gray-600 mt-2">Loading intensity data...</Text>
        </View>
      );
    }

    if (!intensityData) {
      return (
        <View className="items-center justify-center py-12">
          <Text className="text-gray-600 mb-2">
            No intensity data available
          </Text>
          <Text className="text-sm text-gray-500 text-center px-6">
            Complete some workouts to see your intensity distribution
          </Text>
        </View>
      );
    }

    // Use actual 7-zone distribution from backend (calculated from IF)
    const distributionPercent = {
      recovery: intensityData.distribution.recovery || 0,
      endurance: intensityData.distribution.endurance || 0,
      tempo: intensityData.distribution.tempo || 0,
      threshold: intensityData.distribution.threshold || 0,
      vo2max: intensityData.distribution.vo2max || 0,
      anaerobic: intensityData.distribution.anaerobic || 0,
      neuromuscular: intensityData.distribution.neuromuscular || 0,
    };

    const totalActivities = intensityData.totalActivities || 0;
    const activitiesWithIntensity = intensityData.activitiesWithIntensity || 0;
    const totalTSS = intensityData.totalTSS || 0;
    const recommendations = intensityData.recommendations || [];

    const intensities = [
      {
        key: "recovery",
        label: "Recovery",
        description: "< 0.55 IF",
        color: "bg-blue-400",
        emoji: "🔵",
      },
      {
        key: "endurance",
        label: "Endurance",
        description: "0.55-0.75 IF",
        color: "bg-green-400",
        emoji: "🟢",
      },
      {
        key: "tempo",
        label: "Tempo",
        description: "0.75-0.85 IF",
        color: "bg-yellow-400",
        emoji: "🟡",
      },
      {
        key: "threshold",
        label: "Threshold",
        description: "0.85-0.95 IF",
        color: "bg-orange-400",
        emoji: "🟠",
      },
      {
        key: "vo2max",
        label: "VO2max",
        description: "0.95-1.05 IF",
        color: "bg-red-400",
        emoji: "🔴",
      },
      {
        key: "anaerobic",
        label: "Anaerobic",
        description: "1.05-1.15 IF",
        color: "bg-red-600",
        emoji: "🔥",
      },
      {
        key: "neuromuscular",
        label: "Sprint",
        description: "> 1.15 IF",
        color: "bg-purple-600",
        emoji: "⚡",
      },
    ];

    return (
      <View className="space-y-4">
        {/* Info Banner */}
        <View className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Text className="text-sm font-semibold text-blue-900 mb-1">
            📊 Intensity Calculated from IF
          </Text>
          <Text className="text-xs text-blue-700">
            Zones are calculated from your actual Intensity Factor (IF) after
            each workout. This shows your real training distribution.
          </Text>
        </View>

        {/* Summary */}
        <View className="bg-white rounded-lg border border-gray-200 p-4">
          <Text className="text-base font-semibold text-gray-900 mb-2">
            Intensity Distribution
          </Text>
          <Text className="text-sm text-gray-600">
            {totalActivities} total activities • {activitiesWithIntensity} with
            power data
          </Text>
          <Text className="text-xs text-gray-500 mt-1">
            Total TSS: {totalTSS}
          </Text>
        </View>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <View className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <Text className="text-sm font-semibold text-blue-900 mb-2">
              💡 Training Insights
            </Text>
            {recommendations.map((rec, index) => (
              <Text key={index} className="text-xs text-blue-700 mb-1">
                • {rec}
              </Text>
            ))}
          </View>
        )}

        {/* Distribution Bars */}
        <View className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {intensities.map((intensity, index) => {
            const percentage =
              distributionPercent[
                intensity.key as keyof typeof distributionPercent
              ];

            return (
              <View
                key={intensity.key}
                className={`p-4 ${index !== intensities.length - 1 ? "border-b border-gray-200" : ""}`}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center flex-1">
                    <Text className="text-lg mr-2">{intensity.emoji}</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900">
                        {intensity.label}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {intensity.description}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm font-semibold text-gray-900">
                    {percentage.toFixed(1)}%
                  </Text>
                </View>

                {/* Progress Bar */}
                <View className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <View
                    className={`h-full ${intensity.color}`}
                    style={{ width: `${percentage}%` }}
                  />
                </View>

                {/* TSS breakdown */}
                <Text className="text-xs text-gray-500 mt-1">
                  {percentage > 0
                    ? `${percentage.toFixed(1)}% of total TSS`
                    : "No activities in this zone"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Guidance */}
        <View className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <Text className="text-sm font-semibold text-gray-900 mb-2">
            💡 Training Distribution Tips
          </Text>
          <Text className="text-xs text-gray-700 leading-5">
            • <Text className="font-semibold">80/20 Rule:</Text> 80%
            recovery/endurance, 20% threshold/vo2max/anaerobic{"\n"}•{" "}
            <Text className="font-semibold">Polarized:</Text> Lots of endurance
            + some vo2max/anaerobic, minimal tempo/threshold{"\n"}•{" "}
            <Text className="font-semibold">Pyramidal:</Text> Most endurance,
            moderate tempo, least threshold/vo2max
          </Text>
        </View>
      </View>
    );
  };

  // No training plan state
  if (!planLoading && !trainingPlan) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            No Training Plan
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Create a training plan to see your trends and analytics
          </Text>
          <Button
            onPress={() => router.push("/plan/training-plan/create" as any)}
          >
            <Text className="text-white">Create Training Plan</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View className="mb-4">
          <Text className="text-2xl font-bold text-gray-900">
            Training Trends
          </Text>
          <Text className="text-sm text-gray-600 mt-1">
            Track your progress and analyze your training
          </Text>
        </View>

        {/* Time Range Selector */}
        {activeTab === "overview" && (
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        )}

        {/* Tab Bar */}
        {renderTabBar()}

        {/* Tab Content */}
        {activeTab === "overview" && renderOverviewTab()}
        {activeTab === "weekly" && renderWeeklyTab()}
        {activeTab === "intensity" && renderIntensityTab()}
      </ScrollView>
    </View>
  );
}
