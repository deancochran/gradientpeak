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

export function MicroLineChart({ data, color = "#3b82f6", height = 60 }: MicroChartProps) {
  const chartData = useMicroChartData(data);

  if (chartData.length === 0) return null;

  return (
    <View style={{ height, width: "100%" }}>
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
    <View style={{ height, width: "100%" }}>
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
