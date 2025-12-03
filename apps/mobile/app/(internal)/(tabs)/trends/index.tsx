// apps/mobile/app/(internal)/(tabs)/trends.tsx

import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import {
  IntensityTab,
  OverviewTab,
  TrendsTabBar,
  WeeklyTab,
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
          <Text className="text-2xl font-bold text-foreground">
            Training Trends
          </Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Track your progress and analyze your training
          </Text>
        </View>

        {/* Time Range Selector */}
        {activeTab === "overview" && (
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
            actualCurve={actualCurve ?? null}
            idealCurve={idealCurve ?? null}
            timeRange={timeRange}
          />
        )}
        {activeTab === "weekly" && (
          <WeeklyTab
            weeklySummary={weeklySummary ?? null}
            weeklyLoading={weeklyLoading}
            onWeekPress={(config) => {
              setActivityModalConfig(config);
              setActivityModalVisible(true);
            }}
          />
        )}
        {activeTab === "intensity" && (
          <IntensityTab
            intensityData={intensityData ?? null}
            intensityLoading={intensityLoading}
            dateRange={dateRange}
            onZonePress={(config) => {
              setActivityModalConfig(config);
              setActivityModalVisible(true);
            }}
          />
        )}
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
