import { Text } from "@/components/ui/text";
import { View, Dimensions } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useColorScheme } from "nativewind";

export interface TrainingLoadData {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface TrainingLoadChartProps {
  data: TrainingLoadData[];
  height?: number;
}

export function TrainingLoadChart({
  data,
  height = 250,
}: TrainingLoadChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - 48;
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const isEmpty = !data || data.length === 0;

  // Prepare data for chart - show last 30 days max for readability
  const recentData = isEmpty ? [] : data.slice(-30);

  // Extract datasets
  const ctlData = recentData.map((d) => d.ctl);
  const atlData = recentData.map((d) => d.atl);
  const tsbData = recentData.map((d) => d.tsb);

  const datasets = [
    {
      data: ctlData.length > 0 ? ctlData : [0],
      color: () => `rgba(59, 130, 246, 1)`, // Blue for CTL
      strokeWidth: 3,
    },
    {
      data: atlData.length > 0 ? atlData : [0],
      color: () => `rgba(245, 158, 11, 1)`, // Orange for ATL
      strokeWidth: 3,
    },
    {
      data: tsbData.length > 0 ? tsbData : [0],
      color: () => `rgba(16, 185, 129, 1)`, // Green for TSB
      strokeWidth: 2,
    },
  ];

  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        Training Load Curve
      </Text>
      <Text className="text-xs text-muted-foreground mb-4">
        CTL (Fitness), ATL (Fatigue), and TSB (Form) over time
      </Text>

      <View style={{ height: height - 50 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              No training load data yet
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              Complete activities to track your fitness (CTL), fatigue (ATL),
              and form (TSB)
            </Text>
          </View>
        ) : (
          <LineChart
            data={{
              labels: [],
              datasets,
            }}
            width={chartWidth}
            height={height - 100}
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
      <View className="flex-row justify-center mt-2 gap-6">
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-blue-500 mr-1" />
          <Text className="text-xs text-muted-foreground">CTL (Fitness)</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-yellow-500 mr-1" />
          <Text className="text-xs text-muted-foreground">ATL (Fatigue)</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-green-500 mr-1" />
          <Text className="text-xs text-muted-foreground">TSB (Form)</Text>
        </View>
      </View>

      {/* Current values */}
      {!isEmpty && recentData.length > 0 && (
        <View className="flex-row justify-around mt-4 pt-3 border-t border-border">
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Current CTL</Text>
            <Text className="text-sm font-semibold text-blue-600">
              {Math.round(recentData[recentData.length - 1]!.ctl)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Current ATL</Text>
            <Text className="text-sm font-semibold text-yellow-600">
              {Math.round(recentData[recentData.length - 1]!.atl)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Current TSB</Text>
            <Text
              className={`text-sm font-semibold ${
                recentData[recentData.length - 1]!.tsb > 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {recentData[recentData.length - 1]!.tsb > 0 ? "+" : ""}
              {Math.round(recentData[recentData.length - 1]!.tsb)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
