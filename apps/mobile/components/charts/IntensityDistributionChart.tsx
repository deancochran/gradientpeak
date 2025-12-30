// apps/mobile/app/(internal)/(tabs)/trends/components/charts/IntensityDistributionChart.tsx

import { Text } from "@/components/ui/text";
import { Dimensions, Pressable, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

export interface IntensityZone {
  key: string;
  label: string;
  description: string;
  color: string;
  emoji: string;
  percentage: number;
  tss: number;
}

export interface IntensityDistributionChartProps {
  data: {
    recovery: number;
    endurance: number;
    tempo: number;
    threshold: number;
    vo2max: number;
    anaerobic: number;
    neuromuscular: number;
  };
  totalTSS: number;
  onZonePress?: (zoneKey: string) => void;
  height?: number;
}

export function IntensityDistributionChart({
  data,
  totalTSS,
  onZonePress,
  height = 320,
}: IntensityDistributionChartProps) {
  const screenWidth = Dimensions.get("window").width;
  const chartSize = Math.min(screenWidth - 64, height - 60);

  // Define intensity zones with colors and metadata
  const intensityZones: IntensityZone[] = [
    {
      key: "recovery",
      label: "Recovery",
      description: "< 0.55 IF",
      color: "#3b82f6", // blue-500
      emoji: "🔵",
      percentage: data.recovery || 0,
      tss: Math.round((totalTSS * (data.recovery || 0)) / 100),
    },
    {
      key: "endurance",
      label: "Endurance",
      description: "0.55-0.75 IF",
      color: "#10b981", // green-500
      emoji: "🟢",
      percentage: data.endurance || 0,
      tss: Math.round((totalTSS * (data.endurance || 0)) / 100),
    },
    {
      key: "tempo",
      label: "Tempo",
      description: "0.75-0.85 IF",
      color: "#f59e0b", // yellow-500
      emoji: "🟡",
      percentage: data.tempo || 0,
      tss: Math.round((totalTSS * (data.tempo || 0)) / 100),
    },
    {
      key: "threshold",
      label: "Threshold",
      description: "0.85-0.95 IF",
      color: "#f97316", // orange-500
      emoji: "🟠",
      percentage: data.threshold || 0,
      tss: Math.round((totalTSS * (data.threshold || 0)) / 100),
    },
    {
      key: "vo2max",
      label: "VO2max",
      description: "0.95-1.05 IF",
      color: "#ef4444", // red-500
      emoji: "🔴",
      percentage: data.vo2max || 0,
      tss: Math.round((totalTSS * (data.vo2max || 0)) / 100),
    },
    {
      key: "anaerobic",
      label: "Anaerobic",
      description: "1.05-1.15 IF",
      color: "#dc2626", // red-600
      emoji: "🔥",
      percentage: data.anaerobic || 0,
      tss: Math.round((totalTSS * (data.anaerobic || 0)) / 100),
    },
    {
      key: "neuromuscular",
      label: "Sprint",
      description: "> 1.15 IF",
      color: "#7c3aed", // purple-600
      emoji: "⚡",
      percentage: data.neuromuscular || 0,
      tss: Math.round((totalTSS * (data.neuromuscular || 0)) / 100),
    },
  ];

  // Filter out zones with 0% for cleaner visualization
  const activeZones = intensityZones.filter((zone) => zone.percentage > 0);

  if (activeZones.length === 0) {
    return (
      <View
        className="bg-white rounded-lg border border-gray-200 p-4"
        style={{ height }}
      >
        <Text className="text-base font-semibold text-gray-900 mb-2">
          Intensity Distribution
        </Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">No intensity data available</Text>
          <Text className="text-xs text-gray-400 mt-1 text-center">
            Complete activities with power data to see distribution
          </Text>
        </View>
      </View>
    );
  }

  // Calculate dominant zone
  const dominantZone = activeZones.reduce((prev, current) =>
    prev.percentage > current.percentage ? prev : current,
  );

  // Create donut chart paths
  const radius = chartSize / 2 - 20;
  const innerRadius = radius * 0.6;
  const centerX = chartSize / 2;
  const centerY = chartSize / 2;

  let currentAngle = -Math.PI / 2; // Start at top
  const paths: {
    path: string;
    color: string;
    zone: IntensityZone;
  }[] = [];

  activeZones.forEach((zone) => {
    const angle = (zone.percentage / 100) * 2 * Math.PI;
    const endAngle = currentAngle + angle;

    const x1 = centerX + radius * Math.cos(currentAngle);
    const y1 = centerY + radius * Math.sin(currentAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const x3 = centerX + innerRadius * Math.cos(endAngle);
    const y3 = centerY + innerRadius * Math.sin(endAngle);
    const x4 = centerX + innerRadius * Math.cos(currentAngle);
    const y4 = centerY + innerRadius * Math.sin(currentAngle);

    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const pathData = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
      "Z",
    ].join(" ");

    paths.push({
      path: pathData,
      color: zone.color,
      zone,
    });

    currentAngle = endAngle;
  });

  return (
    <View className="bg-white rounded-lg border border-gray-200 p-4">
      <Text className="text-base font-semibold text-gray-900 mb-2">
        Intensity Distribution
      </Text>
      <Text className="text-xs text-gray-500 mb-4">
        Training zones based on Intensity Factor (IF)
      </Text>

      <View className="items-center">
        {/* Custom Donut Chart */}
        <View style={{ width: chartSize, height: chartSize }}>
          <Svg width={chartSize} height={chartSize}>
            <G>
              {paths.map((item, index) => (
                <Path
                  key={index}
                  d={item.path}
                  fill={item.color}
                  opacity={0.8}
                />
              ))}
            </G>
            {/* Center circle for cleaner look */}
            <Circle
              cx={centerX}
              cy={centerY}
              r={innerRadius}
              fill="#ffffff"
              stroke="#f3f4f6"
              strokeWidth={2}
            />
          </Svg>

          {/* Center content overlay */}
          <View
            className="absolute items-center justify-center"
            style={{
              top: centerY - 30,
              left: centerX - 40,
              width: 80,
              height: 60,
            }}
          >
            <Text className="text-2xl mb-1">{dominantZone.emoji}</Text>
            <Text className="text-xs font-semibold text-gray-900 text-center">
              {dominantZone.label}
            </Text>
            <Text className="text-xs text-gray-600 text-center">
              {dominantZone.percentage.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Zone breakdown */}
      <View className="mt-4 space-y-2">
        {activeZones.slice(0, 4).map((zone) => (
          <Pressable
            key={zone.key}
            onPress={() => onZonePress?.(zone.key)}
            className="flex-row items-center justify-between py-2 px-3 rounded-lg bg-gray-50 active:bg-gray-100"
          >
            <View className="flex-row items-center flex-1">
              <View
                className="w-4 h-4 rounded-full mr-3"
                style={{ backgroundColor: zone.color }}
              />
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900">
                  {zone.label}
                </Text>
                <Text className="text-xs text-gray-500">
                  {zone.description}
                </Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="text-sm font-semibold text-gray-900">
                {zone.percentage.toFixed(1)}%
              </Text>
              <Text className="text-xs text-gray-500">{zone.tss} TSS</Text>
            </View>
          </Pressable>
        ))}

        {activeZones.length > 4 && (
          <Text className="text-xs text-gray-500 text-center pt-2">
            +{activeZones.length - 4} more zones with activity
          </Text>
        )}
      </View>

      {/* Training insights */}
      <View className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Text className="text-xs font-semibold text-blue-900 mb-1">
          💡 Training Pattern
        </Text>
        <Text className="text-xs text-blue-700">
          {dominantZone.percentage > 50
            ? `Primarily ${dominantZone.label.toLowerCase()} focused training`
            : `Balanced training across multiple zones`}
          {dominantZone.key === "endurance" && dominantZone.percentage > 60
            ? " - following aerobic base building"
            : dominantZone.key === "threshold" && dominantZone.percentage > 30
              ? " - high threshold emphasis"
              : ""}
        </Text>
      </View>
    </View>
  );
}
