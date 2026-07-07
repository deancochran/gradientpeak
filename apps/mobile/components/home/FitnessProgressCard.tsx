import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { CartesianChart, Line } from "victory-native";

interface FitnessProgressCardProps {
  currentCTL: number;
  projectedCTL?: number; // Target CTL for today
  goalCTL?: number;
  trendData?: number[]; // 7-day rolling window: 3 days back + today + 3 days forward of actual CTL
  idealTrendData?: number[]; // 7-day rolling window: 3 days back + today + 3 days forward of ideal CTL
  behindSchedule?: number; // How many CTL points behind/ahead
  onPress?: () => void;
}

type FitnessChartDatum = Record<string, unknown> & {
  index: number;
  actual: number | null;
  ideal: number | null;
};

type FitnessChartYKey = "actual" | "ideal";

export function FitnessProgressCard({
  currentCTL,
  projectedCTL,
  goalCTL,
  trendData,
  idealTrendData,
  behindSchedule,
  onPress,
}: FitnessProgressCardProps) {
  const hasProjection = projectedCTL !== undefined && projectedCTL !== null;
  const hasGoal = goalCTL !== undefined && goalCTL !== null;
  const hasActualData = trendData && trendData.length > 0;
  const hasIdealData = idealTrendData && idealTrendData.length > 0;

  const CardWrapper = onPress ? TouchableOpacity : View;

  const chartData = useMemo<FitnessChartDatum[]>(() => {
    const pointCount = Math.max(trendData?.length ?? 0, idealTrendData?.length ?? 0);

    return Array.from({ length: pointCount }, (_, index) => ({
      index,
      actual: trendData?.[index] ?? null,
      ideal: idealTrendData?.[index] ?? null,
    }));
  }, [idealTrendData, trendData]);

  const chartYKeys = useMemo<FitnessChartYKey[]>(() => {
    const keys: FitnessChartYKey[] = [];
    if (hasIdealData) keys.push("ideal");
    if (hasActualData) keys.push("actual");
    return keys;
  }, [hasActualData, hasIdealData]);

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.7}>
      <View className="gap-3 rounded-xl border border-border bg-card px-4 py-4">
        {chartData.length > 0 && chartYKeys.length > 0 ? (
          <View className="h-16 -mx-2">
            <CartesianChart<FitnessChartDatum, "index", FitnessChartYKey>
              data={chartData}
              xKey="index"
              yKeys={chartYKeys}
              padding={{ left: 8, right: 8, top: 4, bottom: 4 }}
            >
              {({ points }) => (
                <>
                  {hasIdealData ? (
                    <Line points={points.ideal} color="rgba(147, 197, 253, 0.6)" strokeWidth={2} />
                  ) : null}
                  {hasActualData ? (
                    <Line points={points.actual} color="rgba(59, 130, 246, 1)" strokeWidth={3} />
                  ) : null}
                </>
              )}
            </CartesianChart>
          </View>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-xs text-muted-foreground">Current</Text>
            <View className="flex-row items-baseline gap-2">
              <Text className="text-2xl font-semibold text-foreground">{currentCTL}</Text>
              {hasProjection && behindSchedule !== undefined && behindSchedule !== 0 ? (
                <Text
                  className={`text-sm font-medium ${
                    behindSchedule > 0 ? "text-green-600" : "text-orange-500"
                  }`}
                >
                  {behindSchedule > 0 ? "+" : ""}
                  {behindSchedule}
                </Text>
              ) : null}
            </View>
          </View>

          {hasProjection ? (
            <View className="flex-row items-baseline justify-between">
              <Text className="text-xs text-muted-foreground">Target Today</Text>
              <Text className="text-2xl font-semibold text-foreground">{projectedCTL}</Text>
            </View>
          ) : null}

          {hasGoal ? (
            <View className="flex-row items-baseline justify-between">
              <Text className="text-xs text-muted-foreground">Goal</Text>
              <Text className="text-2xl font-semibold text-foreground">{goalCTL}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </CardWrapper>
  );
}
