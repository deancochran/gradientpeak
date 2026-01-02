import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import React from "react";
import { Dimensions, TouchableOpacity, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useColorScheme } from "nativewind";

interface FitnessProgressCardProps {
  currentCTL: number;
  projectedCTL?: number; // Target CTL for today
  goalCTL?: number;
  trendData?: number[]; // 7-day rolling window: 3 days back + today + 3 days forward of actual CTL
  idealTrendData?: number[]; // 7-day rolling window: 3 days back + today + 3 days forward of ideal CTL
  behindSchedule?: number; // How many CTL points behind/ahead
  onPress?: () => void;
}

export function FitnessProgressCard({
  currentCTL,
  projectedCTL,
  goalCTL,
  trendData,
  idealTrendData,
  behindSchedule,
  onPress,
}: FitnessProgressCardProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 64; // Account for padding
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const hasProjection = projectedCTL !== undefined && projectedCTL !== null;
  const hasGoal = goalCTL !== undefined && goalCTL !== null;
  const hasActualData = trendData && trendData.length > 0;
  const hasIdealData = idealTrendData && idealTrendData.length > 0;

  const CardWrapper = onPress ? TouchableOpacity : View;

  // Build datasets for chart
  const datasets: any[] = [];

  // Add ideal curve first (so it renders behind)
  if (hasIdealData) {
    datasets.push({
      data: idealTrendData,
      color: () => `rgba(147, 197, 253, 0.6)`, // Light blue for ideal/planned
      strokeWidth: 2,
      withDots: false,
    });
  }

  // Add actual data on top
  if (hasActualData) {
    datasets.push({
      data: trendData,
      color: () => `rgba(59, 130, 246, 1)`, // Solid blue for actual
      strokeWidth: 3,
    });
  }

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.7}>
      <Card className="bg-card border-border">
        <CardContent className="space-y-3">
          {/* Mini Chart with both actual and ideal */}
          {datasets.length > 0 && (
            <View className="h-16 -mx-2">
              <LineChart
                data={{
                  labels: [],
                  datasets,
                }}
                width={chartWidth}
                height={64}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withVerticalLabels={false}
                withHorizontalLabels={false}
                chartConfig={{
                  backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
                  backgroundGradientFrom: isDark ? "#0a0a0a" : "#ffffff",
                  backgroundGradientTo: isDark ? "#0a0a0a" : "#ffffff",
                  decimalPlaces: 0,
                  color: (opacity = 1) =>
                    isDark
                      ? `rgba(250, 250, 250, ${opacity})`
                      : `rgba(10, 10, 10, ${opacity})`,
                  strokeWidth: 2,
                  propsForBackgroundLines: {
                    strokeWidth: 0,
                  },
                }}
                bezier
                style={{
                  paddingRight: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              />
            </View>
          )}

          {/* Metrics */}
          <View className="space-y-2">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-xs text-muted-foreground">Current</Text>
              <View className="flex-row items-baseline gap-2">
                <Text className="text-2xl font-semibold text-foreground">
                  {currentCTL}
                </Text>
                {hasProjection &&
                  behindSchedule !== undefined &&
                  behindSchedule !== 0 && (
                    <Text
                      className={`text-sm font-medium ${
                        behindSchedule > 0
                          ? "text-green-600"
                          : "text-orange-500"
                      }`}
                    >
                      {behindSchedule > 0 ? "+" : ""}
                      {behindSchedule}
                    </Text>
                  )}
              </View>
            </View>

            {hasProjection && (
              <View className="flex-row items-baseline justify-between">
                <Text className="text-xs text-muted-foreground">
                  Target Today
                </Text>
                <Text className="text-2xl font-semibold text-foreground">
                  {projectedCTL}
                </Text>
              </View>
            )}

            {hasGoal && (
              <View className="flex-row items-baseline justify-between">
                <Text className="text-xs text-muted-foreground">Goal</Text>
                <Text className="text-2xl font-semibold text-foreground">
                  {goalCTL}
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
