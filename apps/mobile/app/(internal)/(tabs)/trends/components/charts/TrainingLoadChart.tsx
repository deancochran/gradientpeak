// apps/mobile/app/(internal)/(tabs)/trends/components/charts/TrainingLoadChart.tsx

import { Text } from "@/components/ui/text";
import { View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useFont } from "@shopify/react-native-skia";

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
  const isEmpty = !data || data.length === 0;

  // Prepare data for chart - show last 30 days max for readability
  const recentData = isEmpty ? [] : data.slice(-30);

  // Transform data for victory-native
  const chartData = recentData.map((d, index) => ({
    index,
    ctl: d.ctl,
    atl: d.atl,
    tsb: d.tsb,
    date: d.date,
  }));

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
          <CartesianChart
            data={chartData}
            xKey="index"
            yKeys={["ctl", "atl", "tsb"]}
          >
            {({ points }) => (
              <>
                {/* CTL line (blue) */}
                <Line points={points.ctl} color="#3b82f6" strokeWidth={3} />
                {/* ATL line (orange) */}
                <Line points={points.atl} color="#f59e0b" strokeWidth={3} />
                {/* TSB line (green/red based on value) */}
                <Line points={points.tsb} color="#10b981" strokeWidth={2} />
              </>
            )}
          </CartesianChart>
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
              {recentData[recentData.length - 1]!.ctl}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">Current ATL</Text>
            <Text className="text-sm font-semibold text-yellow-600">
              {recentData[recentData.length - 1]!.atl}
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
              {recentData[recentData.length - 1]!.tsb}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
