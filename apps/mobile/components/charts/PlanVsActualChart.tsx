import { Text } from "@/components/ui/text";
import { View, Dimensions } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useColorScheme } from "nativewind";

export interface FitnessDataPoint {
  date: string;
  ctl: number;
  atl?: number;
  tsb?: number;
}

export interface PlanVsActualChartProps {
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

  const isEmpty =
    (!actualData || actualData.length === 0) &&
    (!idealData || idealData.length === 0);

  // Combine and prepare data
  const hasActual = actualData && actualData.length > 0;
  const hasIdeal = idealData && idealData.length > 0;
  const hasProjected = projectedData && projectedData.length > 0;

  const datasets: any[] = [];

  // Add ideal/planned curve first (so it renders behind actual)
  if (hasIdeal) {
    datasets.push({
      data: idealData.map((d) => d.ctl),
      color: () => `rgba(147, 197, 253, 0.8)`, // Light blue for ideal/planned
      strokeWidth: 2,
      withDots: false,
    });
  }

  // Add actual data on top
  if (hasActual) {
    datasets.push({
      data: actualData.map((d) => d.ctl),
      color: () => `rgba(59, 130, 246, 1)`, // Solid blue for actual
      strokeWidth: 3,
    });
  }

  // Add future projection if available
  if (hasProjected) {
    datasets.push({
      data: projectedData.map((d) => d.ctl),
      color: () => `rgba(147, 197, 253, 0.5)`, // Very light blue for future projection
      strokeWidth: 2,
      withDots: false,
    });
  }

  // If we have a goal, add it as a horizontal line dataset
  if (goalMetrics?.targetCTL && (hasActual || hasIdeal)) {
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

  // Get current and target CTL values
  const currentCTL = hasActual ? actualData[actualData.length - 1]?.ctl : 0;

  // Find where user should be today in the ideal curve
  const today = new Date().toISOString().split("T")[0];
  const idealCTLToday = hasIdeal
    ? idealData.find((d) => d.date === today)?.ctl
    : undefined;

  const projectedCTL = hasProjected
    ? projectedData[projectedData.length - 1]?.ctl
    : undefined;

  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        Fitness Progress: Plan vs Actual
      </Text>
      <Text className="text-xs text-muted-foreground mb-4">
        Track your actual fitness (CTL) against your training plan projection
      </Text>

      <View style={{ height: height - 80 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              No fitness data available
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              Complete activities and create a training plan to see your
              progress
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
              <View className="w-4 h-0.5 bg-blue-500 mr-1.5" />
              <Text className="text-xs text-muted-foreground">Actual</Text>
            </View>
          )}
          {hasIdeal && (
            <View className="flex-row items-center">
              <View className="w-4 h-0.5 bg-blue-300 mr-1.5" />
              <Text className="text-xs text-muted-foreground">Plan Target</Text>
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
              {Math.round(currentCTL)}
            </Text>
          </View>
          {idealCTLToday !== undefined && (
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">
                Target Today
              </Text>
              <Text
                className={`text-lg font-semibold ${
                  currentCTL >= idealCTLToday
                    ? "text-green-600"
                    : "text-orange-500"
                }`}
              >
                {Math.round(idealCTLToday)}
              </Text>
              {currentCTL !== idealCTLToday && (
                <Text
                  className={`text-xs ${
                    currentCTL >= idealCTLToday
                      ? "text-green-600"
                      : "text-orange-500"
                  }`}
                >
                  {currentCTL > idealCTLToday ? "+" : ""}
                  {Math.round(currentCTL - idealCTLToday)}
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

      {/* Goal description */}
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
