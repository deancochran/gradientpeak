// apps/mobile/app/(internal)/(tabs)/trends/index.tsx

import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  IntensityTab,
  OverviewTab,
  TrendsTabBar,
  WeeklyTab,
  VolumeTab,
  PerformanceTab,
  FitnessTab,
  ConsistencyTab,
  type TabView,
} from "@/components/trends";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ActivityListModal } from "./components/ActivityListModal";
import {
  getDateRangeFromTimeRange,
  TimeRangeSelector,
  type TimeRange,
} from "./components/TimeRangeSelector";

/**
 * TrendsScreen Component
 *
 * Main analytics screen showing training trends and progress.
 * NOW WORKS WITHOUT TRAINING PLAN - Universal access to trends!
 *
 * Features:
 * - Volume trends (distance, time, activity count)
 * - Performance trends (speed, power, HR)
 * - Training load (CTL/ATL/TSB) - calculated from activities
 * - Zone distribution over time
 * - Consistency tracking (streaks, heatmap)
 *
 * Tabs:
 * - Overview: Current status and key metrics
 * - Volume: Distance, time, and activity count trends
 * - Performance: Speed/power/HR improvements
 * - Fitness: Training load (CTL/ATL/TSB) and zone distribution
 * - Consistency: Training frequency and streaks
 */
function TrendsScreen() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>("3M");
  const [activeTab, setActiveTab] = useState<TabView>("overview");
  const [refreshing, setRefreshing] = useState(false);

  // Activity list modal state
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [activityModalConfig, setActivityModalConfig] = useState<{
    title: string;
    subtitle?: string;
    dateFrom: string;
    dateTo: string;
    intensityZone?: string;
  } | null>(null);

  const dateRange = getDateRangeFromTimeRange(timeRange);

  // Get user's training plan (optional)
  const {
    data: trainingPlan,
    isLoading: planLoading,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery();

  // Universal trends queries (work without training plan)

  // Volume trends
  const {
    data: volumeData,
    isLoading: volumeLoading,
    refetch: refetchVolume,
  } = trpc.trends.getVolumeTrends.useQuery(
    {
      ...dateRange,
      groupBy: "week",
    },
    {
      enabled: activeTab === "volume" || activeTab === "overview",
    },
  );

  // Performance trends
  const {
    data: performanceData,
    isLoading: performanceLoading,
    refetch: refetchPerformance,
  } = trpc.trends.getPerformanceTrends.useQuery(dateRange, {
    enabled: activeTab === "performance",
  });

  // Training load trends (universal - no plan needed)
  const {
    data: trainingLoadData,
    isLoading: trainingLoadLoading,
    refetch: refetchTrainingLoad,
  } = trpc.trends.getTrainingLoadTrends.useQuery(dateRange, {
    enabled: activeTab === "fitness" || activeTab === "overview",
  });

  // Zone distribution trends
  const {
    data: zoneDistributionData,
    isLoading: zoneLoading,
    refetch: refetchZones,
  } = trpc.trends.getZoneDistributionTrends.useQuery(
    {
      ...dateRange,
      metric: "power",
    },
    {
      enabled: activeTab === "fitness",
    },
  );

  // Consistency metrics
  const {
    data: consistencyData,
    isLoading: consistencyLoading,
    refetch: refetchConsistency,
  } = trpc.trends.getConsistencyMetrics.useQuery(dateRange, {
    enabled: activeTab === "consistency",
  });

  // Legacy endpoints for training plan users (weekly summary, intensity distribution)
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

  // Get current status for overview
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: !!trainingPlan && activeTab === "overview",
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchPlan(),
      refetchVolume(),
      activeTab === "performance" && refetchPerformance(),
      activeTab === "fitness" && refetchTrainingLoad(),
      activeTab === "fitness" && refetchZones(),
      activeTab === "consistency" && refetchConsistency(),
      activeTab === "overview" && trainingPlan && refetchStatus(),
      activeTab === "weekly" && trainingPlan && refetchWeekly(),
      activeTab === "intensity" && trainingPlan && refetchIntensity(),
    ]);
    setRefreshing(false);
  };

  // Allow users to explore trends even with no data - charts will show empty states

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
          <Text className="text-2xl font-bold text-foreground">
            Training Trends
          </Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Track your progress and analyze your training
          </Text>
        </View>

        {/* Time Range Selector - only show for time-based tabs */}
        {[
          "overview",
          "volume",
          "performance",
          "fitness",
          "consistency",
        ].includes(activeTab) && (
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        )}

        {/* Tab Bar */}
        <TrendsTabBar
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewTab
            status={status ?? null}
            statusLoading={statusLoading}
            actualCurve={trainingLoadData ?? null}
            idealCurve={null}
            timeRange={timeRange}
          />
        )}

        {activeTab === "volume" && (
          <VolumeTab
            volumeData={volumeData ?? null}
            volumeLoading={volumeLoading}
            timeRange={timeRange}
          />
        )}

        {activeTab === "performance" && (
          <PerformanceTab
            performanceData={performanceData ?? null}
            performanceLoading={performanceLoading}
            timeRange={timeRange}
          />
        )}

        {activeTab === "fitness" && (
          <FitnessTab
            trainingLoadData={trainingLoadData ?? null}
            zoneDistributionData={zoneDistributionData ?? null}
            fitnessLoading={trainingLoadLoading || zoneLoading}
            timeRange={timeRange}
          />
        )}

        {activeTab === "consistency" && (
          <ConsistencyTab
            consistencyData={consistencyData ?? null}
            consistencyLoading={consistencyLoading}
            startDate={dateRange.start_date}
            endDate={dateRange.end_date}
          />
        )}

        {/* Legacy tabs - only for training plan users */}
        {activeTab === "weekly" &&
          (trainingPlan ? (
            <WeeklyTab
              weeklySummary={weeklySummary ?? null}
              weeklyLoading={weeklyLoading}
              onWeekPress={(config) => {
                setActivityModalConfig(config);
                setActivityModalVisible(true);
              }}
            />
          ) : (
            <View className="p-6 items-center">
              <Text className="text-lg font-semibold text-foreground mb-2">
                Training Plan Required
              </Text>
              <Text className="text-muted-foreground text-center mb-4">
                Weekly summary requires an active training plan
              </Text>
              <Button
                onPress={() => router.push("/plan/training-plan/create" as any)}
              >
                <Text className="text-white">Create Training Plan</Text>
              </Button>
            </View>
          ))}

        {activeTab === "intensity" &&
          (trainingPlan ? (
            <IntensityTab
              intensityData={intensityData ?? null}
              intensityLoading={intensityLoading}
              dateRange={dateRange}
              onZonePress={(config) => {
                setActivityModalConfig(config);
                setActivityModalVisible(true);
              }}
            />
          ) : (
            <View className="p-6 items-center">
              <Text className="text-lg font-semibold text-foreground mb-2">
                Training Plan Required
              </Text>
              <Text className="text-muted-foreground text-center mb-4">
                Intensity distribution requires an active training plan
              </Text>
              <Button
                onPress={() => router.push("/plan/training-plan/create" as any)}
              >
                <Text className="text-white">Create Training Plan</Text>
              </Button>
            </View>
          ))}
      </ScrollView>

      {/* Activity List Modal */}
      {activityModalConfig && (
        <ActivityListModal
          visible={activityModalVisible}
          title={activityModalConfig.title}
          subtitle={activityModalConfig.subtitle}
          dateFrom={activityModalConfig.dateFrom}
          dateTo={activityModalConfig.dateTo}
          intensityZone={activityModalConfig.intensityZone}
          onClose={() => {
            setActivityModalVisible(false);
            setActivityModalConfig(null);
          }}
        />
      )}
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
