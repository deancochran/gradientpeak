// apps/mobile/app/(internal)/(tabs)/trends/components/charts/TrainingLoadChart.tsx

import { Text } from "@/components/ui/text";
import { Dimensions, View } from "react-native";
import { LineChart } from "react-native-chart-kit";

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

  if (!data || data.length === 0) {
    return (
      <View
        className="bg-white rounded-lg border border-gray-200 p-4"
        style={{ height }}
      >
        <Text className="text-base font-semibold text-gray-900 mb-2">
          Training Load Chart
        </Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">No training load data available</Text>
        </View>
      </View>
    );
  }

  // Prepare data for chart - show last 30 days max for readability
  const recentData = data.slice(-30);

  const chartData = {
    labels: recentData.map((d, index) => {
      if (index % Math.ceil(recentData.length / 5) === 0) {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }
      return "";
    }),
    datasets: [
      {
        data: recentData.map((d) => d.ctl),
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`, // blue
        strokeWidth: 3,
      },
      {
        data: recentData.map((d) => d.atl),
        color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`, // yellow
        strokeWidth: 3,
      },
      {
        data: recentData.map((d) => d.tsb),
        color: (opacity = 1) => {
          const avgTsb =
            recentData.reduce((sum, d) => sum + d.tsb, 0) / recentData.length;
          return avgTsb > 0
            ? `rgba(16, 185, 129, ${opacity})` // green
            : `rgba(239, 68, 68, ${opacity})`; // red
        },
        strokeWidth: 2,
      },
    ],
  };

  const chartConfig = {
    backgroundColor: "#ffffff",
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: 8,
    },
    propsForDots: {
      r: "0",
    },
    propsForBackgroundLines: {
      strokeDasharray: "",
      stroke: "#f3f4f6",
      strokeWidth: 1,
    },
  };

  return (
    <View className="bg-white rounded-lg border border-gray-200 p-4">
      <Text className="text-base font-semibold text-gray-900 mb-2">
        Training Load Curve
      </Text>
      <Text className="text-xs text-gray-500 mb-4">
        CTL (Fitness), ATL (Fatigue), and TSB (Form) over time
      </Text>

      <LineChart
        data={chartData}
        width={screenWidth - 64}
        height={height}
        chartConfig={chartConfig}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 8,
        }}
        withHorizontalLabels={true}
        withVerticalLabels={true}
        withDots={false}
        withShadow={false}
        fromZero={false}
      />

      {/* Legend */}
      <View className="flex-row justify-center mt-2 space-x-6">
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-blue-500 mr-1" />
          <Text className="text-xs text-gray-600">CTL (Fitness)</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-yellow-500 mr-1" />
          <Text className="text-xs text-gray-600">ATL (Fatigue)</Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-green-500 mr-1" />
          <Text className="text-xs text-gray-600">TSB (Form)</Text>
        </View>
      </View>

      {/* Current values */}
      {recentData.length > 0 && (
        <View className="flex-row justify-around mt-4 pt-3 border-t border-gray-100">
          <View className="items-center">
            <Text className="text-xs text-gray-500">Current CTL</Text>
            <Text className="text-sm font-semibold text-blue-600">
              {recentData[recentData.length - 1].ctl}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-gray-500">Current ATL</Text>
            <Text className="text-sm font-semibold text-yellow-600">
              {recentData[recentData.length - 1].atl}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-gray-500">Current TSB</Text>
            <Text
              className={`text-sm font-semibold ${
                recentData[recentData.length - 1].tsb > 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {recentData[recentData.length - 1].tsb > 0 ? "+" : ""}
              {recentData[recentData.length - 1].tsb}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
