import { Text } from "@/components/ui/text";
import { useColorScheme } from "nativewind";
import { Dimensions, View } from "react-native";
import { LineChart } from "react-native-chart-kit";

export interface FitnessDataPoint {
  date: string;
  ctl: number;
  atl?: number;
  tsb?: number;
}

export interface InsightTimelinePoint {
  date: string;
  ideal_tss: number;
  scheduled_tss: number;
  actual_tss: number;
  adherence_score: number;
  boundary_state?: "safe" | "caution" | "exceeded";
  boundary_reasons?: string[];
}

export interface PlanVsActualChartProps {
  timeline?: InsightTimelinePoint[];
  actualData: FitnessDataPoint[];
  projectedData: FitnessDataPoint[];
  idealData?: Array<{ date: string; ctl: number }>; // Ideal CTL curve from training plan
  goalMetrics?: {
    targetCTL: number;
    targetDate: string;
    description?: string;
  } | null;
  height?: number;
  showLegend?: boolean;
}

export function PlanVsActualChart({
  timeline,
  actualData,
  projectedData,
  idealData,
  goalMetrics,
  height = 300,
  showLegend = true,
}: PlanVsActualChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 48; // Account for padding
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const useInsightTimeline = !!timeline && timeline.length > 0;

  const isEmpty = useInsightTimeline
    ? timeline.length === 0
    : (!actualData || actualData.length === 0) &&
      (!idealData || idealData.length === 0);

  const hasActual = useInsightTimeline
    ? (timeline?.length || 0) > 0
    : actualData && actualData.length > 0;
  const hasIdeal = useInsightTimeline
    ? (timeline?.length || 0) > 0
    : idealData && idealData.length > 0;
  const hasScheduled = useInsightTimeline
    ? (timeline?.length || 0) > 0
    : projectedData && projectedData.length > 0;
  const hasProjected =
    !useInsightTimeline && projectedData && projectedData.length > 0;

  const datasets: any[] = [];

  if (useInsightTimeline && timeline) {
    datasets.push({
      data: timeline.map((d) => d.ideal_tss),
      color: () => "rgba(148, 163, 184, 0.9)",
      strokeWidth: 2,
      withDots: false,
    });
    datasets.push({
      data: timeline.map((d) => d.scheduled_tss),
      color: () => "rgba(59, 130, 246, 0.85)",
      strokeWidth: 2,
      withDots: false,
    });
    datasets.push({
      data: timeline.map((d) => d.actual_tss),
      color: () => "rgba(16, 185, 129, 1)",
      strokeWidth: 3,
    });
  } else {
    if (hasIdeal && idealData) {
      datasets.push({
        data: idealData.map((d) => d.ctl),
        color: () => "rgba(147, 197, 253, 0.8)",
        strokeWidth: 2,
        withDots: false,
      });
    }

    if (hasActual && actualData) {
      datasets.push({
        data: actualData.map((d) => d.ctl),
        color: () => "rgba(59, 130, 246, 1)",
        strokeWidth: 3,
      });
    }

    if (hasProjected && projectedData) {
      datasets.push({
        data: projectedData.map((d) => d.ctl),
        color: () => "rgba(147, 197, 253, 0.5)",
        strokeWidth: 2,
        withDots: false,
      });
    }
  }

  if (
    !useInsightTimeline &&
    goalMetrics?.targetCTL &&
    (hasActual || hasIdeal)
  ) {
    const totalPoints = Math.max(
      actualData?.length || 0,
      idealData?.length || 0,
      projectedData?.length || 0,
    );
    const goalLine = new Array(totalPoints).fill(goalMetrics.targetCTL);
    datasets.push({
      data: goalLine,
      color: () => `rgba(34, 197, 94, 0.6)`, // Green for goal
      strokeWidth: 2,
      withDots: false,
    });
  }

  const currentMetric = useInsightTimeline
    ? timeline?.[timeline.length - 1]?.actual_tss || 0
    : hasActual
      ? actualData[actualData.length - 1]?.ctl
      : 0;

  const today = new Date().toISOString().split("T")[0];
  const idealMetricToday = useInsightTimeline
    ? timeline?.find((d) => d.date === today)?.ideal_tss
    : hasIdeal
      ? idealData?.find((d) => d.date === today)?.ctl
      : undefined;

  const projectedCTL = hasProjected
    ? projectedData[projectedData.length - 1]?.ctl
    : undefined;

  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        {useInsightTimeline ? "Load Path" : "Fitness Progress: Plan vs Actual"}
      </Text>
      <Text className="text-xs text-muted-foreground mb-4">
        {useInsightTimeline
          ? "Ideal, scheduled, actual load, and adherence trend"
          : "Track your actual fitness (CTL) against your training plan projection"}
      </Text>

      <View style={{ height: height - 80 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              {useInsightTimeline
                ? "No insight timeline data available"
                : "No fitness data available"}
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              {useInsightTimeline
                ? "Schedule and complete sessions to populate the load path"
                : "Complete activities and create a training plan to see your progress"}
            </Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: [],
              datasets,
            }}
            width={chartWidth}
            height={height - 120}
            withDots={false}
            withInnerLines={true}
            withOuterLines={true}
            withVerticalLines={false}
            withHorizontalLines={true}
            chartConfig={{
              backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
              backgroundGradientFrom: isDark ? "#0a0a0a" : "#ffffff",
              backgroundGradientTo: isDark ? "#0a0a0a" : "#ffffff",
              decimalPlaces: 0,
              color: (opacity = 1) =>
                isDark
                  ? `rgba(250, 250, 250, ${opacity})`
                  : `rgba(10, 10, 10, ${opacity})`,
              labelColor: (opacity = 1) =>
                isDark
                  ? `rgba(163, 163, 163, ${opacity})`
                  : `rgba(115, 115, 115, ${opacity})`,
              strokeWidth: 2,
              propsForBackgroundLines: {
                strokeWidth: 1,
                stroke: isDark
                  ? "rgba(38, 38, 38, 0.5)"
                  : "rgba(228, 228, 228, 0.5)",
              },
            }}
            bezier
            style={{
              paddingRight: 16,
            }}
          />
        )}
      </View>

      {/* Legend */}
      {showLegend && !isEmpty && (
        <View className="flex-row justify-center mt-2 gap-4 flex-wrap">
          {hasActual && (
            <View className="flex-row items-center">
              <View
                className={`w-4 h-0.5 mr-1.5 ${useInsightTimeline ? "bg-emerald-500" : "bg-blue-500"}`}
              />
              <Text className="text-xs text-muted-foreground">
                {useInsightTimeline ? "Actual" : "Actual"}
              </Text>
            </View>
          )}
          {hasIdeal && (
            <View className="flex-row items-center">
              <View
                className={`w-4 h-0.5 mr-1.5 ${useInsightTimeline ? "bg-slate-400" : "bg-blue-300"}`}
              />
              <Text className="text-xs text-muted-foreground">
                {useInsightTimeline ? "Ideal" : "Plan Target"}
              </Text>
            </View>
          )}
          {hasScheduled && (
            <View className="flex-row items-center">
              <View className="w-4 h-0.5 bg-blue-500 mr-1.5" />
              <Text className="text-xs text-muted-foreground">
                {useInsightTimeline ? "Scheduled" : "Projected"}
              </Text>
            </View>
          )}
          {goalMetrics && (
            <View className="flex-row items-center">
              <View className="w-4 h-0.5 bg-green-500 mr-1.5" />
              <Text className="text-xs text-muted-foreground">Goal</Text>
            </View>
          )}
        </View>
      )}

      {/* Current vs Goal metrics */}
      {!isEmpty && (
        <View className="flex-row justify-around mt-4 pt-3 border-t border-border">
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Current</Text>
            <Text className="text-lg font-semibold text-blue-600">
              {Math.round(currentMetric || 0)}
            </Text>
          </View>
          {idealMetricToday !== undefined && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Target Today
              </Text>
              <Text
                className={`text-lg font-semibold ${
                  (currentMetric || 0) >= idealMetricToday
                    ? "text-green-600"
                    : "text-orange-500"
                }`}
              >
                {Math.round(idealMetricToday)}
              </Text>
              {(currentMetric || 0) !== idealMetricToday && (
                <Text
                  className={`text-xs ${
                    (currentMetric || 0) >= idealMetricToday
                      ? "text-green-600"
                      : "text-orange-500"
                  }`}
                >
                  {(currentMetric || 0) > idealMetricToday ? "+" : ""}
                  {Math.round((currentMetric || 0) - idealMetricToday)}
                </Text>
              )}
            </View>
          )}
          {goalMetrics && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Goal</Text>
              <Text className="text-lg font-semibold text-green-600">
                {goalMetrics.targetCTL}
              </Text>
            </View>
          )}
        </View>
      )}

      {useInsightTimeline && timeline && timeline.length > 0 && (
        <View className="mt-3 p-2 bg-muted/50 rounded">
          <Text className="text-xs text-muted-foreground text-center">
            Latest adherence:{" "}
            {Math.round(timeline[timeline.length - 1]!.adherence_score)}%
          </Text>
        </View>
      )}

      {goalMetrics?.description && (
        <View className="mt-3 p-2 bg-muted/50 rounded">
          <Text className="text-xs text-muted-foreground text-center">
            Goal: {goalMetrics.description}
          </Text>
        </View>
      )}
    </View>
  );
}
