import { summarizeChartValues } from "@repo/ui/lib/chart";
import { useMemo } from "react";
import { View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

interface MicroChartProps {
  data: number[];
  color?: string;
  height?: number;
}

type MicroChartDatum = Record<string, unknown> & {
  index: number;
  value: number;
};

function useMicroChartData(data: number[]) {
  return useMemo<MicroChartDatum[]>(() => data.map((value, index) => ({ index, value })), [data]);
}

function getMicroChartAccessibilityLabel(data: number[], chartType: string) {
  const summary = summarizeChartValues(data);
  if (!summary) return `${chartType} chart. No data available.`;
  const trend =
    summary.direction === "up"
      ? "increasing"
      : summary.direction === "down"
        ? "decreasing"
        : "steady";
  return `${chartType} chart. Latest ${summary.last}. Minimum ${summary.min}. Maximum ${summary.max}. Trend ${trend}.`;
}

export function MicroLineChart({ data, color = "#3b82f6", height = 60 }: MicroChartProps) {
  const chartData = useMicroChartData(data);

  if (chartData.length === 0) return null;

  return (
    <View
      style={{ height, width: "100%" }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={getMicroChartAccessibilityLabel(data, "Line")}
    >
      <CartesianChart<MicroChartDatum, "index", "value">
        data={chartData}
        xKey="index"
        yKeys={["value"]}
        domainPadding={{ left: 4, right: 4, top: 4, bottom: 4 }}
        padding={{ left: 4, right: 4, top: 4, bottom: 4 }}
      >
        {({ points }) => <Line points={points.value} color={color} strokeWidth={2} />}
      </CartesianChart>
    </View>
  );
}

interface MicroBarChartProps {
  data: number[];
  color?: string;
  height?: number;
}

export function MicroBarChart({ data, color = "#10b981", height = 60 }: MicroBarChartProps) {
  const chartData = useMicroChartData(data);

  if (chartData.length === 0) return null;

  return (
    <View
      style={{ height, width: "100%" }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={getMicroChartAccessibilityLabel(data, "Bar")}
    >
      <CartesianChart<MicroChartDatum, "index", "value">
        data={chartData}
        xKey="index"
        yKeys={["value"]}
        domainPadding={{ left: 8, right: 8, top: 4 }}
        padding={{ left: 4, right: 4, top: 4, bottom: 4 }}
      >
        {({ points, chartBounds }) => (
          <Bar
            points={points.value}
            chartBounds={chartBounds}
            color={color}
            roundedCorners={{ topLeft: 4, topRight: 4 }}
          />
        )}
      </CartesianChart>
    </View>
  );
}
