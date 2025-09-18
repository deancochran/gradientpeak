import { ThemedView } from "@/components/ThemedView";
import { useProfile } from "@/lib/api/trpc-hooks";
import { usePerformanceMetrics } from "@/lib/hooks/usePerformanceMetrics";
import { TrendsService } from "@/lib/services/trends-service";
import { Ionicons } from "@expo/vector-icons";
import type { TrendsData } from "@repo/core";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// Simple chart placeholder components
const ChartPlaceholder = ({
  title,
  height = 220,
}: {
  title: string;
  height?: number;
}) => (
  <View
    style={{
      height,
      backgroundColor: "#f9fafb",
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#e5e7eb",
    }}
  >
    <Ionicons name="analytics-outline" size={32} color="#9ca3af" />
    <Text
      style={{
        marginTop: 8,
        fontSize: 14,
        color: "#6b7280",
        textAlign: "center",
      }}
    >
      {title}
    </Text>
    <Text
      style={{
        marginTop: 4,
        fontSize: 12,
        color: "#9ca3af",
        textAlign: "center",
      }}
    >
      Chart will render with real data
    </Text>
  </View>
);

const { width } = Dimensions.get("window");

interface TrendsPeriod {
  label: string;
  days: number;
  value: "7d" | "30d" | "90d" | "1y";
}

const TREND_PERIODS: TrendsPeriod[] = [
  { label: "7D", days: 7, value: "7d" },
  { label: "30D", days: 30, value: "30d" },
  { label: "90D", days: 90, value: "90d" },
  { label: "1Y", days: 365, value: "1y" },
];

export default function TrendsScreen() {
  // State management
  const [selectedPeriod, setSelectedPeriod] = useState<TrendsPeriod>(
    TREND_PERIODS[1], // 30D default
  );
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  // Profile data
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();

  // Performance metrics
  const { metrics: performanceMetrics, refreshMetrics } =
    usePerformanceMetrics();

  // Initialize and load data
  useEffect(() => {
    loadTrendsData();
  }, [selectedPeriod, profile?.id]);

  const loadTrendsData = async () => {
    if (!profile?.id) {
      console.log("📊 No profile ID available");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setTrendsError(null);

    try {
      console.log("📊 Loading trends data for period:", selectedPeriod.label);

      // Check if we have sufficient data
      const availability = await TrendsService.checkDataAvailability(
        profile.id,
        3, // Minimum 3 activities
      );

      if (!availability.hasData) {
        console.log("📊 Insufficient data, using sample data");
        const timeFrame = TrendsService.getTimeFrameConfig(
          selectedPeriod.value,
        );
        const sampleData = TrendsService.getSampleTrendsData(timeFrame);
        setTrendsData(sampleData);
        setIsLoading(false);
        return;
      }

      // Load real trends data
      const timeFrame = TrendsService.getTimeFrameConfig(selectedPeriod.value);
      const trends = await TrendsService.calculateTrends({
        timeFrame,
        profileId: profile.id,
        ftp: profile.ftp || undefined,
        maxHR: profile.dob
          ? 220 - new Date().getFullYear() + new Date(profile.dob).getFullYear()
          : undefined,
        thresholdHR: profile.thresholdHr || undefined,
      });

      setTrendsData(trends);
      console.log("📊 Trends data loaded successfully");
    } catch (err) {
      console.error("📊 Failed to load trends data:", err);
      setTrendsError("Failed to load trends data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    try {
      await refetchProfile();
      await loadTrendsData();
      refreshMetrics();
    } catch (err) {
      console.error("📊 Refresh error:", err);
    }
  }, [refetchProfile, selectedPeriod, refreshMetrics]);

  const handlePeriodChange = (period: TrendsPeriod) => {
    console.log("📊 Period changed:", period.label);
    setSelectedPeriod(period);
  };

  const getFormColor = (
    form: "optimal" | "good" | "tired" | "very_tired" | "unknown",
  ) => {
    switch (form) {
      case "optimal":
        return "#10b981";
      case "good":
        return "#3b82f6";
      case "tired":
        return "#f59e0b";
      case "very_tired":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  if (profileLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor="#3b82f6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Performance Trends</Text>
          <TouchableOpacity style={styles.infoButton}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#6b7280"
            />
          </TouchableOpacity>
        </View>

        {(trendsError || profileError) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{trendsError || profileError}</Text>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {TREND_PERIODS.map((period) => (
            <TouchableOpacity
              key={period.value}
              onPress={() => handlePeriodChange(period)}
              style={[
                styles.periodButton,
                selectedPeriod.value === period.value &&
                  styles.periodButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod.value === period.value &&
                    styles.periodButtonTextActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Current Performance Metrics */}
        {performanceMetrics && (
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>Current Performance</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {performanceMetrics.currentCTL.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>CTL (Fitness)</Text>
                <View style={styles.trendIndicator}>
                  <Ionicons name="trending-up" size={16} color="#10b981" />
                  <Text style={[styles.trendText, { color: "#10b981" }]}>
                    42-day avg
                  </Text>
                </View>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {performanceMetrics.currentATL.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>ATL (Fatigue)</Text>
                <Text style={styles.metricSubtext}>7-day avg</Text>
              </View>

              <View style={styles.metricCard}>
                <Text
                  style={[
                    styles.metricValue,
                    {
                      color:
                        performanceMetrics.currentTSB > 0
                          ? "#10b981"
                          : "#ef4444",
                    },
                  ]}
                >
                  {performanceMetrics.currentTSB > 0 ? "+" : ""}
                  {performanceMetrics.currentTSB.toFixed(1)}
                </Text>
                <Text style={styles.metricLabel}>TSB (Form)</Text>
                <Text
                  style={[
                    styles.formBadge,
                    { color: getFormColor(performanceMetrics.form) },
                  ]}
                >
                  {performanceMetrics.form.replace("_", " ").toUpperCase()}
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {performanceMetrics.weeklyTSS}
                </Text>
                <Text style={styles.metricLabel}>Weekly TSS</Text>
                <Text style={styles.metricSubtext}>Last 7 days</Text>
              </View>
            </View>
          </View>
        )}

        {/* Training Load Progression Chart */}
        {trendsData && trendsData.trainingLoad.length > 0 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Training Load Progression</Text>
            <View style={styles.chartContainer}>
              <ChartPlaceholder title="Training Load Progression (CTL vs ATL)" />
              <View style={styles.chartData}>
                <Text style={styles.chartDataText}>
                  Data Points: {trendsData.trainingLoad.length}
                </Text>
                {trendsData.trainingLoad.length > 0 && (
                  <Text style={styles.chartDataText}>
                    Latest CTL:{" "}
                    {trendsData.trainingLoad[
                      trendsData.trainingLoad.length - 1
                    ]?.ctl.toFixed(1) || "N/A"}{" "}
                    | ATL:{" "}
                    {trendsData.trainingLoad[
                      trendsData.trainingLoad.length - 1
                    ]?.atl.toFixed(1) || "N/A"}{" "}
                    | TSB:{" "}
                    {trendsData.trainingLoad[
                      trendsData.trainingLoad.length - 1
                    ]?.tsb.toFixed(1) || "N/A"}
                  </Text>
                )}
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: "#3b82f6" }]}
                  />
                  <Text style={styles.legendText}>CTL (Fitness)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: "#ef4444" }]}
                  />
                  <Text style={styles.legendText}>ATL (Fatigue)</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Power Zone Distribution */}
        {trendsData &&
          trendsData.powerZones.length > 0 &&
          trendsData.validation.hasPowerZones && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Power Zone Distribution</Text>
              <Text style={styles.sectionSubtitle}>
                Time spent in each power zone over time
              </Text>
              <View style={styles.chartContainer}>
                <ChartPlaceholder title="Power Zone Distribution Over Time" />
                <View style={styles.chartData}>
                  <Text style={styles.chartDataText}>
                    Data Points: {trendsData.powerZones.length}
                  </Text>
                </View>
                <View style={styles.zoneLabels}>
                  <Text style={styles.zoneLabel}>Z1: Active Recovery</Text>
                  <Text style={styles.zoneLabel}>Z2: Endurance</Text>
                  <Text style={styles.zoneLabel}>Z3: Tempo</Text>
                  <Text style={styles.zoneLabel}>Z4: Threshold</Text>
                  <Text style={styles.zoneLabel}>Z5: VO2 Max</Text>
                </View>
              </View>
            </View>
          )}

        {/* Heart Rate Zone Distribution */}
        {trendsData &&
          trendsData.heartRateZones.length > 0 &&
          trendsData.validation.hasHeartRateZones && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>
                Heart Rate Zone Distribution
              </Text>
              <Text style={styles.sectionSubtitle}>
                Cardiovascular load distribution over time
              </Text>
              <View style={styles.chartContainer}>
                <ChartPlaceholder title="Heart Rate Zone Distribution Over Time" />
                <View style={styles.chartData}>
                  <Text style={styles.chartDataText}>
                    Data Points: {trendsData.heartRateZones.length}
                  </Text>
                </View>
              </View>
            </View>
          )}

        {/* Power vs Heart Rate Efficiency */}
        {trendsData &&
          trendsData.powerHeartRate.length > 0 &&
          trendsData.validation.hasPowerHeartRate && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Power vs Heart Rate Trend</Text>
              <Text style={styles.sectionSubtitle}>
                Efficiency improvements over time (5W power buckets)
              </Text>
              <View style={styles.chartContainer}>
                <ChartPlaceholder title="Power vs Heart Rate Efficiency Trend" />
                <View style={styles.chartData}>
                  <Text style={styles.chartDataText}>
                    Data Points: {trendsData.powerHeartRate.length}
                  </Text>
                </View>
              </View>
            </View>
          )}

        {/* Power Curve */}
        {trendsData &&
          trendsData.powerCurve.length > 0 &&
          trendsData.validation.hasPowerCurve && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Power Curve</Text>
              <Text style={styles.sectionSubtitle}>
                Best sustained power efforts across different durations
              </Text>
              <View style={styles.chartContainer}>
                <ChartPlaceholder title="Best Power Efforts (Power Curve)" />
                <View style={styles.chartData}>
                  <Text style={styles.chartDataText}>
                    Data Points: {trendsData.powerCurve.length}
                  </Text>
                  {trendsData.powerCurve.length > 0 && (
                    <ScrollView horizontal style={styles.powerCurveData}>
                      {trendsData.powerCurve.map((point, index) => (
                        <View key={index} style={styles.powerCurvePoint}>
                          <Text style={styles.powerCurveLabel}>
                            {point.duration < 60
                              ? `${point.duration}s`
                              : point.duration < 3600
                                ? `${Math.round(point.duration / 60)}m`
                                : `${Math.round(point.duration / 3600)}h`}
                          </Text>
                          <Text style={styles.powerCurveValue}>
                            {point.power}W
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            </View>
          )}

        {/* No Data Message */}
        {trendsData && !isLoading && (
          <View style={styles.noDataContainer}>
            {trendsData.validation.activityCount === 0 ? (
              <View style={styles.noDataMessage}>
                <Ionicons name="analytics-outline" size={48} color="#6b7280" />
                <Text style={styles.noDataTitle}>No Activities Found</Text>
                <Text style={styles.noDataText}>
                  Start recording activities to see your performance trends and
                  insights.
                </Text>
              </View>
            ) : !trendsData.validation.hasTrainingLoad &&
              !trendsData.validation.hasPowerZones &&
              !trendsData.validation.hasHeartRateZones ? (
              <View style={styles.noDataMessage}>
                <Ionicons name="time-outline" size={48} color="#6b7280" />
                <Text style={styles.noDataTitle}>More Data Needed</Text>
                <Text style={styles.noDataText}>
                  You have {trendsData.validation.activityCount} activities, but
                  more completed activities are needed for meaningful trends.
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Performance Insights */}
        {performanceMetrics && (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Performance Insights</Text>
            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Ionicons name="bulb-outline" size={20} color="#f59e0b" />
                <Text style={styles.insightTitle}>Training Recommendation</Text>
              </View>
              <Text style={styles.insightText}>
                {performanceMetrics?.form === "optimal"
                  ? "Your form is optimal! Consider scheduling a high-intensity activity or test."
                  : performanceMetrics?.form === "tired" ||
                      performanceMetrics?.form === "very_tired"
                    ? "You appear fatigued. Focus on recovery or light training for the next few days."
                    : "Your training is well balanced. Maintain current intensity distribution."}
              </Text>
            </View>

            <View style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Ionicons name="fitness-outline" size={20} color="#3b82f6" />
                <Text style={styles.insightTitle}>Fitness Trend</Text>
              </View>
              <Text style={styles.insightText}>
                {performanceMetrics && performanceMetrics.currentCTL > 50
                  ? "Your fitness is improving steadily. Great progress!"
                  : performanceMetrics && performanceMetrics.currentCTL < 30
                    ? "Your fitness has declined recently. Consider increasing training volume."
                    : "Your fitness is stable. Consistent training pays off!"}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  infoButton: {
    padding: 4,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    textAlign: "center",
  },
  periodSelector: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  periodButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  periodButtonTextActive: {
    color: "#3b82f6",
    fontWeight: "600",
  },
  metricsSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
    marginTop: -8,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  metricSubtext: {
    fontSize: 12,
    color: "#9ca3af",
  },
  trendIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  formBadge: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  chartSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  chartContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  chartLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  zoneLabels: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f9fafb",
  },
  zoneLabel: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "500",
  },
  noDataContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  noDataMessage: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  noDataTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  noDataText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  insightsSection: {
    marginHorizontal: 20,
    marginBottom: 100,
  },
  insightCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  insightText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  chartData: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  chartDataText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  powerCurveData: {
    marginTop: 8,
  },
  powerCurvePoint: {
    marginRight: 16,
    alignItems: "center",
  },
  powerCurveLabel: {
    fontSize: 10,
    color: "#9ca3af",
    marginBottom: 2,
  },
  powerCurveValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
});
