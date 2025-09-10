import { ThemedView } from "@components/ThemedView";
import { Ionicons } from "@expo/vector-icons";
import { useProfile } from "@lib/hooks/api/profiles";
import { usePerformanceMetrics } from "@lib/hooks/usePerformanceMetrics";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart, LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const chartConfig = {
  backgroundColor: "#ffffff",
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#ffffff",
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: "4",
    strokeWidth: "2",
    stroke: "#3b82f6",
  },
};

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

interface ChartData {
  labels: string[];
  datasets: Array<{
    data: number[];
    color?: (opacity: number) => string;
    strokeWidth?: number;
  }>;
}

export default function TrendsScreen() {
  // Profile data
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfile();

  // Period selection
  const [selectedPeriod, setSelectedPeriod] = useState<TrendsPeriod>(
    TREND_PERIODS[1],
  ); // 30D default

  // Performance data
  const { metrics: performanceMetrics, refreshMetrics } =
    usePerformanceMetrics();

  // Chart data
  const [trainingLoadData, setTrainingLoadData] = useState<ChartData | null>(
    null,
  );
  const [tssData, setTssData] = useState<ChartData | null>(null);

  // Loading states
  const isLoading = profileLoading;
  const error = profileError;

  useEffect(() => {
    console.log("📊 Trends Screen - Initializing");
    initializeTrendsScreen();
  }, [selectedPeriod, profile?.id]);

  const initializeTrendsScreen = async () => {
    if (profile) {
      console.log("📊 Trends Screen - Profile loaded:", {
        id: profile.id,
        ftp: profile.ftp,
        thresholdHr: profile.thresholdHr,
      });

      await loadTrendsData();
    } else if (profileError) {
      console.warn("📊 Trends Screen - No profile found");
    }
  };

  const loadTrendsData = async () => {
    console.log(
      "📊 Trends Screen - Loading trends data for period:",
      selectedPeriod.label,
    );

    // Generate mock training load data
    const days = selectedPeriod.days;
    const labels: string[] = [];
    const ctlData: number[] = [];
    const atlData: number[] = [];
    const tssValues: number[] = [];

    // Generate data points
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Format label based on period
      let label: string;
      if (days <= 7) {
        label = date.toLocaleDateString("en-US", { weekday: "short" });
      } else if (days <= 30) {
        label = date.getDate().toString();
      } else {
        label = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }

      labels.push(label);

      // Mock CTL/ATL/TSB progression
      const dayIndex = days - 1 - i;
      const ctl = 40 + Math.sin(dayIndex / 10) * 15 + dayIndex * 0.3;
      const atl = 35 + Math.sin(dayIndex / 5) * 20 + dayIndex * 0.2;
      const dailyTss = Math.max(0, 50 + Math.sin(dayIndex / 3) * 40);

      ctlData.push(Math.max(0, ctl));
      atlData.push(Math.max(0, atl));
      tssValues.push(dailyTss);
    }

    // Sample every nth point for readability
    const sampleRate = Math.max(1, Math.floor(days / 10));
    const sampledLabels = labels.filter((_, index) => index % sampleRate === 0);
    const sampledCtlData = ctlData.filter(
      (_, index) => index % sampleRate === 0,
    );
    const sampledAtlData = atlData.filter(
      (_, index) => index % sampleRate === 0,
    );

    setTrainingLoadData({
      labels: sampledLabels,
      datasets: [
        {
          data: sampledCtlData,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 2,
        },
        {
          data: sampledAtlData,
          color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    });

    setTssData({
      labels: sampledLabels,
      datasets: [
        {
          data: tssValues.filter((_, index) => index % sampleRate === 0),
        },
      ],
    });

    console.log("📊 Trends Screen - Chart data generated:", {
      points: sampledLabels.length,
      currentCTL: performanceMetrics?.currentCTL || 0,
      currentTSB: performanceMetrics?.currentTSB || 0,
    });
  };

  const handleRefresh = useCallback(async () => {
    console.log("📊 Trends Screen - Refreshing");
    try {
      await refetchProfile();
      await loadTrendsData();
      refreshMetrics();
    } catch (err) {
      console.error("📊 Trends Screen - Refresh error:", err);
    }
  }, [refetchProfile, selectedPeriod, refreshMetrics]);

  const handlePeriodChange = (period: TrendsPeriod) => {
    console.log("📊 Trends Screen - Period changed:", period.label);
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

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading performance trends...</Text>
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
            refreshing={profileLoading || isLoading}
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

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {typeof error === "string" ? error : "An error occurred"}
            </Text>
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
                    {performanceMetrics.currentCTL.toFixed(1)}
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
                <Text style={styles.metricSubtext}>Last 7 days total</Text>
              </View>
            </View>
          </View>
        )}

        {/* Training Load Chart */}
        {trainingLoadData && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Training Load (CTL vs ATL)</Text>
            <View style={styles.chartContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={trainingLoadData}
                  width={Math.max(
                    width - 40,
                    trainingLoadData.labels.length * 30,
                  )}
                  height={220}
                  chartConfig={{
                    ...chartConfig,
                    color: (opacity = 1, index = 0) => {
                      const colors = [
                        "rgba(59, 130, 246, opacity)",
                        "rgba(239, 68, 68, opacity)",
                      ];
                      return colors[index] || `rgba(59, 130, 246, ${opacity})`;
                    },
                  }}
                  bezier
                  style={styles.chart}
                  withDots={trainingLoadData.labels.length <= 14}
                  withShadow={false}
                />
              </ScrollView>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: "#3b82f6" }]}
                  />
                  <Text style={styles.legendText}>
                    CTL (Chronic Training Load)
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: "#ef4444" }]}
                  />
                  <Text style={styles.legendText}>
                    ATL (Acute Training Load)
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Daily TSS Chart */}
        {tssData && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Daily Training Stress Score</Text>
            <View style={styles.chartContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <BarChart
                  data={tssData}
                  width={Math.max(width - 40, tssData.labels.length * 40)}
                  height={220}
                  chartConfig={chartConfig}
                  style={styles.chart}
                  yAxisLabel=""
                  yAxisSuffix=""
                  showValuesOnTopOfBars
                  fromZero
                />
              </ScrollView>
            </View>
          </View>
        )}

        {/* Performance Insights */}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  infoButton: {
    padding: 8,
  },
  errorContainer: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
  },
  periodSelector: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  periodButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  periodButtonTextActive: {
    color: "#ffffff",
  },
  metricsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 4,
  },
  metricSubtext: {
    fontSize: 10,
    color: "#9ca3af",
    textAlign: "center",
  },
  trendIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trendText: {
    fontSize: 10,
    fontWeight: "500",
  },
  formBadge: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  chartSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  chartContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chart: {
    borderRadius: 8,
  },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 12,
    gap: 20,
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
  },
  insightsSection: {
    paddingHorizontal: 20,
    marginBottom: 100,
  },
  insightCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
});
