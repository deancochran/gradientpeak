import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { EmptyStateCard } from "@/components/shared";
import { CollapsibleSection } from "@/components/trends/CollapsibleSection";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart2,
  Calendar,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  View,
  TouchableOpacity,
} from "react-native";
import {
  ConsistencyHeatmap,
  IntensityDistributionChart,
  PerformanceTrendsChart,
  TrainingLoadChart,
  VolumeTrendsChart,
  ZoneDistributionOverTimeChart,
  type ConsistencyData,
  type PerformanceDataPoint,
  type TrainingLoadData,
  type VolumeDataPoint,
  type ZoneDistributionWeekData,
} from "./components/charts";
import {
  getDateRangeFromTimeRange,
  type TimeRange,
} from "./components/TimeRangeSelector";

/**
 * Simplified TrendsScreen
 *
 * Single vertically scrollable page showing all training analytics.
 * No tabs, no complex navigation - just clean, organized charts.
 *
 * Features:
 * - All charts in one scroll view
 * - Collapsible sections for organization
 * - Single time range selector for all charts
 * - Progressive loading as you scroll
 */
function TrendsScreen() {
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");
  const [refreshing, setRefreshing] = useState(false);

  // Performance metric selector state
  const [selectedMetric, setSelectedMetric] = useState<
    "speed" | "power" | "heartrate"
  >("speed");

  const dateRange = getDateRangeFromTimeRange(timeRange);

  // Fetch all data at once (enabled: true for all)
  const {
    data: volumeData,
    isLoading: volumeLoading,
    refetch: refetchVolume,
  } = trpc.trends.getVolumeTrends.useQuery({
    ...dateRange,
    groupBy: "week",
  });

  const {
    data: performanceData,
    isLoading: performanceLoading,
    refetch: refetchPerformance,
  } = trpc.trends.getPerformanceTrends.useQuery(dateRange);

  const {
    data: trainingLoadData,
    isLoading: trainingLoadLoading,
    refetch: refetchTrainingLoad,
  } = trpc.trends.getTrainingLoadTrends.useQuery(dateRange);

  const {
    data: zoneDistributionData,
    isLoading: zoneLoading,
    refetch: refetchZones,
  } = trpc.trends.getZoneDistributionTrends.useQuery({
    ...dateRange,
    metric: "power",
  });

  const {
    data: consistencyData,
    isLoading: consistencyLoading,
    refetch: refetchConsistency,
  } = trpc.trends.getConsistencyMetrics.useQuery(dateRange);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchVolume(),
      refetchPerformance(),
      refetchTrainingLoad(),
      refetchZones(),
      refetchConsistency(),
    ]);
    setRefreshing(false);
  };

  // Get current status from training load data
  const currentStatus = trainingLoadData?.currentStatus ?? null;
  const trainingLoadPoints = trainingLoadData?.dataPoints ?? [];

  // Volume data
  const volumeDataPoints = volumeData?.dataPoints ?? [];
  const volumeTotals = volumeData?.totals ?? null;

  // Performance data
  const performanceDataPoints = performanceData?.dataPoints ?? [];
  const hasSpeed = performanceDataPoints.some((d) => d.avgSpeed !== null);
  const hasPower = performanceDataPoints.some((d) => d.avgPower !== null);
  const hasHeartRate = performanceDataPoints.some(
    (d) => d.avgHeartRate !== null,
  );

  // Zone distribution
  const zoneWeeklyData = zoneDistributionData?.weeklyData ?? [];

  // Consistency
  const consistency = consistencyData ?? null;

  // Helper functions
  const getFormStatusColor = (form: string): string => {
    switch (form) {
      case "fresh":
        return "text-green-600";
      case "optimal":
        return "text-blue-600";
      case "neutral":
        return "text-muted-foreground";
      case "tired":
        return "text-orange-600";
      case "overreaching":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  const avgDistance = volumeTotals
    ? volumeTotals.totalDistance / volumeTotals.totalActivities
    : 0;
  const avgTime = volumeTotals
    ? volumeTotals.totalTime / volumeTotals.totalActivities
    : 0;

  // Calculate consistency metrics
  const trainingDaysPercentage =
    consistency && consistency.totalDays > 0
      ? (consistency.totalActivities / consistency.totalDays) * 100
      : 0;
  const weeklyRestDays = consistency ? 7 - consistency.weeklyAvg : 7;

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: "3M", label: "3M" },
    { value: "6M", label: "6M" },
    { value: "12M", label: "12M" },
    { value: "ALL", label: "All" },
  ];

  const hasAnyData =
    volumeDataPoints.length > 0 ||
    performanceDataPoints.length > 0 ||
    trainingLoadPoints.length > 0 ||
    (consistency && consistency.totalActivities > 0);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        stickyHeaderIndices={[1]}
      >
        {/* Header */}
        <View className="mb-4">
          <Text className="text-2xl font-bold text-foreground">
            Training Trends
          </Text>
          <Text className="text-muted-foreground text-sm mt-1">
            All your training analytics in one place
          </Text>
        </View>

        {/* Sticky Time Range Selector */}
        <View className="bg-background pb-4">
          <View className="flex-row bg-muted rounded-lg p-1 gap-1">
            {timeRanges.map((range) => (
              <TouchableOpacity
                key={range.value}
                onPress={() => setTimeRange(range.value)}
                className={`flex-1 py-2 px-3 rounded ${
                  timeRange === range.value ? "bg-primary" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-center text-sm font-medium ${
                    timeRange === range.value
                      ? "text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* No Data State */}
        {!hasAnyData && !volumeLoading && (
          <EmptyStateCard
            icon={TrendingUp}
            title="No Training Data"
            description="Start tracking your activities to see your training trends and progress metrics."
            iconColor="text-blue-500"
          />
        )}

        {/* Overview Section */}
        {hasAnyData && (
          <CollapsibleSection
            title="Overview"
            icon={TrendingUp}
            iconColor="text-blue-500"
            defaultOpen={true}
          >
            <View className="space-y-4">
              {/* Current Status Card */}
              {currentStatus && (
                <View className="p-4 rounded-lg border bg-card border-border">
                  <Text className="text-sm font-medium text-muted-foreground mb-2">
                    Current Form Status
                  </Text>
                  <Text
                    className={`text-3xl font-bold ${getFormStatusColor(currentStatus.form)} capitalize`}
                  >
                    {currentStatus.form}
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-2">
                    TSB: {currentStatus.tsb > 0 ? "+" : ""}
                    {currentStatus.tsb}
                  </Text>
                </View>
              )}

              {/* Training Load Chart */}
              {trainingLoadPoints.length > 0 && (
                <TrainingLoadChart
                  data={trainingLoadPoints.map(
                    (point): TrainingLoadData => ({
                      date: point.date,
                      ctl: point.ctl || 0,
                      atl: point.atl || 0,
                      tsb: point.tsb || 0,
                    }),
                  )}
                  height={250}
                />
              )}

              {/* Training Metrics */}
              {currentStatus && (
                <View className="bg-card rounded-lg border border-border p-4">
                  <Text className="text-base font-semibold text-foreground mb-3">
                    Training Load Metrics
                  </Text>

                  <View className="gap-3">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Chronic Training Load (CTL)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          42-day fitness
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-foreground">
                        {currentStatus.ctl}
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Acute Training Load (ATL)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          7-day fatigue
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-foreground">
                        {currentStatus.atl}
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Training Stress Balance (TSB)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Form indicator
                        </Text>
                      </View>
                      <Text
                        className={`text-2xl font-bold ${currentStatus.tsb > 0 ? "text-green-600" : currentStatus.tsb < -10 ? "text-orange-500" : "text-foreground"}`}
                      >
                        {currentStatus.tsb > 0 ? "+" : ""}
                        {currentStatus.tsb}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </CollapsibleSection>
        )}

        {/* Volume Section */}
        {volumeDataPoints.length > 0 && (
          <CollapsibleSection
            title="Volume"
            icon={BarChart2}
            iconColor="text-green-500"
            defaultOpen={true}
          >
            <View className="space-y-4">
              <VolumeTrendsChart data={volumeDataPoints} height={300} />

              {/* Summary Stats */}
              {volumeTotals && (
                <View className="bg-card rounded-lg border border-border p-4">
                  <Text className="text-base font-semibold text-foreground mb-3">
                    Summary
                  </Text>

                  <View className="gap-3">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Total Distance
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Avg: {(avgDistance / 1000).toFixed(1)} km per activity
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-blue-600">
                        {(volumeTotals.totalDistance / 1000).toFixed(1)}
                        <Text className="text-base text-muted-foreground">
                          {" "}
                          km
                        </Text>
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Total Time
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Avg: {(avgTime / 3600).toFixed(1)} h per activity
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-green-600">
                        {(volumeTotals.totalTime / 3600).toFixed(1)}
                        <Text className="text-base text-muted-foreground">
                          {" "}
                          h
                        </Text>
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Total Activities
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {volumeDataPoints.length} weeks of data
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-orange-600">
                        {volumeTotals.totalActivities}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </CollapsibleSection>
        )}

        {/* Performance Section */}
        {performanceDataPoints.length > 0 && (
          <CollapsibleSection
            title="Performance"
            icon={Zap}
            iconColor="text-purple-500"
            defaultOpen={true}
          >
            <View className="space-y-4">
              {/* Metric Selector */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-sm font-medium text-foreground mb-2">
                  Select Metric
                </Text>
                <View className="flex-row gap-2">
                  {hasSpeed && (
                    <TouchableOpacity
                      onPress={() => setSelectedMetric("speed")}
                      className={`flex-1 py-2 px-3 rounded ${
                        selectedMetric === "speed" ? "bg-blue-500" : "bg-muted"
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-medium ${
                          selectedMetric === "speed"
                            ? "text-white"
                            : "text-muted-foreground"
                        }`}
                      >
                        Speed
                      </Text>
                    </TouchableOpacity>
                  )}
                  {hasPower && (
                    <TouchableOpacity
                      onPress={() => setSelectedMetric("power")}
                      className={`flex-1 py-2 px-3 rounded ${
                        selectedMetric === "power"
                          ? "bg-purple-500"
                          : "bg-muted"
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-medium ${
                          selectedMetric === "power"
                            ? "text-white"
                            : "text-muted-foreground"
                        }`}
                      >
                        Power
                      </Text>
                    </TouchableOpacity>
                  )}
                  {hasHeartRate && (
                    <TouchableOpacity
                      onPress={() => setSelectedMetric("heartrate")}
                      className={`flex-1 py-2 px-3 rounded ${
                        selectedMetric === "heartrate"
                          ? "bg-red-500"
                          : "bg-muted"
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-medium ${
                          selectedMetric === "heartrate"
                            ? "text-white"
                            : "text-muted-foreground"
                        }`}
                      >
                        Heart Rate
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <PerformanceTrendsChart
                data={performanceDataPoints}
                metric={selectedMetric}
                height={300}
                showTrendline={true}
              />

              {/* Top 5 Activities */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-base font-semibold text-foreground mb-3">
                  Top 5 Activities
                </Text>

                {performanceDataPoints
                  .filter((d) => {
                    switch (selectedMetric) {
                      case "speed":
                        return d.avgSpeed !== null;
                      case "power":
                        return d.avgPower !== null;
                      case "heartrate":
                        return d.avgHeartRate !== null;
                    }
                  })
                  .sort((a, b) => {
                    let aValue = 0;
                    let bValue = 0;
                    switch (selectedMetric) {
                      case "speed":
                        aValue = a.avgSpeed || 0;
                        bValue = b.avgSpeed || 0;
                        break;
                      case "power":
                        aValue = a.avgPower || 0;
                        bValue = b.avgPower || 0;
                        break;
                      case "heartrate":
                        aValue = a.avgHeartRate || 0;
                        bValue = b.avgHeartRate || 0;
                        break;
                    }
                    return bValue - aValue;
                  })
                  .slice(0, 5)
                  .map((activity, index) => {
                    let value = "";
                    switch (selectedMetric) {
                      case "speed":
                        value = `${((activity.avgSpeed || 0) * 3.6).toFixed(1)} km/h`;
                        break;
                      case "power":
                        value = `${activity.avgPower} W`;
                        break;
                      case "heartrate":
                        value = `${activity.avgHeartRate} bpm`;
                        break;
                    }

                    const date = new Date(activity.date).toLocaleDateString();

                    return (
                      <View key={activity.activityId}>
                        <View className="flex-row items-center justify-between py-2">
                          <View className="flex-1">
                            <Text className="text-sm font-medium text-foreground">
                              {index + 1}. {activity.activityName}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {date}
                            </Text>
                          </View>
                          <Text className="text-sm font-semibold text-foreground">
                            {value}
                          </Text>
                        </View>
                        {index < 4 && <View className="h-px bg-border" />}
                      </View>
                    );
                  })}
              </View>
            </View>
          </CollapsibleSection>
        )}

        {/* Fitness Section */}
        {(trainingLoadPoints.length > 0 || zoneWeeklyData.length > 0) && (
          <CollapsibleSection
            title="Fitness"
            icon={Activity}
            iconColor="text-orange-500"
            defaultOpen={false}
          >
            <View className="space-y-4">
              {/* Current Status */}
              {currentStatus && (
                <View className="p-4 rounded-lg border bg-card border-border">
                  <Text className="text-sm font-medium text-muted-foreground mb-2">
                    Current Form Status
                  </Text>
                  <Text
                    className={`text-3xl font-bold ${getFormStatusColor(currentStatus.form)} capitalize`}
                  >
                    {currentStatus.form}
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-2">
                    TSB: {currentStatus.tsb > 0 ? "+" : ""}
                    {currentStatus.tsb}
                  </Text>
                </View>
              )}

              {/* Training Load Chart */}
              {trainingLoadPoints.length > 0 && (
                <TrainingLoadChart
                  data={trainingLoadPoints.map(
                    (point): TrainingLoadData => ({
                      date: point.date,
                      ctl: point.ctl || 0,
                      atl: point.atl || 0,
                      tsb: point.tsb || 0,
                    }),
                  )}
                  height={300}
                />
              )}

              {/* Training Metrics */}
              {currentStatus && (
                <View className="bg-card rounded-lg border border-border p-4">
                  <Text className="text-base font-semibold text-foreground mb-3">
                    Training Load Metrics
                  </Text>

                  <View className="gap-3">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Chronic Training Load (CTL)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          42-day fitness
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-blue-600">
                        {currentStatus.ctl}
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Acute Training Load (ATL)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          7-day fatigue
                        </Text>
                      </View>
                      <Text className="text-2xl font-bold text-orange-600">
                        {currentStatus.atl}
                      </Text>
                    </View>

                    <View className="h-px bg-border" />

                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-sm text-card-foreground">
                          Training Stress Balance (TSB)
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Form indicator
                        </Text>
                      </View>
                      <Text
                        className={`text-2xl font-bold ${currentStatus.tsb > 0 ? "text-green-600" : currentStatus.tsb < -10 ? "text-orange-500" : "text-foreground"}`}
                      >
                        {currentStatus.tsb > 0 ? "+" : ""}
                        {currentStatus.tsb}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Zone Distribution Over Time */}
              {zoneWeeklyData.length > 0 && (
                <ZoneDistributionOverTimeChart
                  data={zoneWeeklyData}
                  height={350}
                />
              )}

              {/* Form Status Guide */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-base font-semibold text-foreground mb-3">
                  Understanding Form Status
                </Text>

                <View className="gap-2">
                  <View className="flex-row items-center gap-2">
                    <View className="w-3 h-3 rounded-full bg-green-600" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        Fresh (TSB &gt; +25)
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Well rested, ready to race
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View className="w-3 h-3 rounded-full bg-blue-600" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        Optimal (+5 to +25)
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Peak performance zone
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View className="w-3 h-3 rounded-full bg-gray-600" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        Neutral (-10 to +5)
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Balanced training state
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View className="w-3 h-3 rounded-full bg-orange-600" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        Tired (-30 to -10)
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        Productive fatigue, recovery needed
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <View className="w-3 h-3 rounded-full bg-red-600" />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        Overreaching (TSB &lt; -30)
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        High fatigue, risk of overtraining
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </CollapsibleSection>
        )}

        {/* Consistency Section */}
        {consistency && consistency.totalActivities > 0 && (
          <CollapsibleSection
            title="Consistency"
            icon={Calendar}
            iconColor="text-pink-500"
            defaultOpen={false}
          >
            <View className="space-y-4">
              {/* Consistency Heatmap */}
              <ConsistencyHeatmap
                data={consistency}
                startDate={dateRange.start_date}
                endDate={dateRange.end_date}
              />

              {/* Training Frequency */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-base font-semibold text-foreground mb-3">
                  Training Frequency
                </Text>

                <View className="gap-3">
                  <View>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-sm text-card-foreground">
                        Training Days
                      </Text>
                      <Text className="text-sm font-medium text-foreground">
                        {trainingDaysPercentage.toFixed(1)}%
                      </Text>
                    </View>
                    <View className="h-3 bg-muted rounded-full overflow-hidden">
                      <View
                        className="h-full bg-green-500"
                        style={{ width: `${trainingDaysPercentage}%` }}
                      />
                    </View>
                    <Text className="text-xs text-muted-foreground mt-1">
                      {consistency.totalActivities} of {consistency.totalDays}{" "}
                      days
                    </Text>
                  </View>

                  <View className="h-px bg-border" />

                  <View>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-sm text-card-foreground">
                        Rest Days
                      </Text>
                      <Text className="text-sm font-medium text-foreground">
                        {(100 - trainingDaysPercentage).toFixed(1)}%
                      </Text>
                    </View>
                    <View className="h-3 bg-muted rounded-full overflow-hidden">
                      <View
                        className="h-full bg-gray-400"
                        style={{ width: `${100 - trainingDaysPercentage}%` }}
                      />
                    </View>
                    <Text className="text-xs text-muted-foreground mt-1">
                      {consistency.totalDays - consistency.totalActivities} of{" "}
                      {consistency.totalDays} days
                    </Text>
                  </View>
                </View>
              </View>

              {/* Streak Insights */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-base font-semibold text-foreground mb-3">
                  Streak Insights
                </Text>

                <View className="gap-3">
                  {consistency.currentStreak > 0 ? (
                    <View className="p-3 bg-green-50 rounded-lg">
                      <Text className="text-sm font-medium text-green-900 mb-1">
                        🔥 Active Streak!
                      </Text>
                      <Text className="text-xs text-green-700">
                        You've trained {consistency.currentStreak} days in a
                        row. Keep it up!
                      </Text>
                    </View>
                  ) : (
                    <View className="p-3 bg-gray-50 rounded-lg">
                      <Text className="text-sm font-medium text-gray-900 mb-1">
                        No Active Streak
                      </Text>
                      <Text className="text-xs text-gray-700">
                        Complete an activity today to start a new streak!
                      </Text>
                    </View>
                  )}

                  {consistency.longestStreak > consistency.currentStreak && (
                    <View className="p-3 bg-blue-50 rounded-lg">
                      <Text className="text-sm font-medium text-blue-900 mb-1">
                        🏆 Longest Streak: {consistency.longestStreak} days
                      </Text>
                      <Text className="text-xs text-blue-700">
                        {consistency.currentStreak > 0
                          ? `${consistency.longestStreak - consistency.currentStreak} more days to beat your record!`
                          : "Try to beat your personal best!"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Consistency Score */}
              <View className="bg-card rounded-lg border border-border p-4">
                <Text className="text-base font-semibold text-foreground mb-3">
                  Consistency Rating
                </Text>

                <View className="items-center">
                  <View className="w-32 h-32 rounded-full items-center justify-center border-8 border-green-500 bg-green-50">
                    <Text className="text-4xl font-bold text-green-700">
                      {trainingDaysPercentage.toFixed(0)}
                    </Text>
                    <Text className="text-sm text-green-600">out of 100</Text>
                  </View>

                  <Text className="text-center text-sm text-muted-foreground mt-4">
                    {trainingDaysPercentage >= 80
                      ? "Exceptional consistency! You're on fire! 🔥"
                      : trainingDaysPercentage >= 60
                        ? "Great consistency! Keep building the habit. 💪"
                        : trainingDaysPercentage >= 40
                          ? "Good progress! Try to train more regularly. 👍"
                          : trainingDaysPercentage >= 20
                            ? "Room for improvement. Small steps add up! 🌱"
                            : "Just getting started? Build the habit gradually. 🎯"}
                  </Text>
                </View>
              </View>
            </View>
          </CollapsibleSection>
        )}
      </ScrollView>
    </View>
  );
}

export default function TrendsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <TrendsScreen />
    </ErrorBoundary>
  );
}
