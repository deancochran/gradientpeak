import React from "react";
import { View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";

interface MicroChartProps {
  data: number[];
  color?: string;
  height?: number;
}

export function MicroLineChart({
  data,
  color = "#3b82f6",
  height = 60,
}: MicroChartProps) {
  if (data.length === 0) return null;

  const width = 200;
  const padding = 4;

  // Normalize data to fit in chart area
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y =
      height - ((value - min) / range) * (height - padding * 2) - padding;
    return { x, y };
  });

  // Create path string
  const pathData = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    return `${path} L ${point.x} ${point.y}`;
  }, "");

  return (
    <View style={{ height, width: "100%" }}>
      <Svg height={height} width="100%" viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={pathData}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

interface MicroBarChartProps {
  data: number[];
  color?: string;
  height?: number;
}

export function MicroBarChart({
  data,
  color = "#10b981",
  height = 60,
}: MicroBarChartProps) {
  if (data.length === 0) return null;

  const width = 200;
  const padding = 4;
  const barWidth = (width - padding * 2) / data.length - 2;

  const max = Math.max(...data) || 1;

  return (
    <View style={{ height, width: "100%" }}>
      <Svg height={height} width="100%" viewBox={`0 0 ${width} ${height}`}>
        {data.map((value, index) => {
          const barHeight = (value / max) * (height - padding * 2);
          const x = padding + index * (barWidth + 2);
          const y = height - barHeight - padding;

          return (
            <Line
              key={index}
              x1={x}
              y1={height - padding}
              x2={x}
              y2={y}
              stroke={color}
              strokeWidth={barWidth}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
    </View>
  );
}
