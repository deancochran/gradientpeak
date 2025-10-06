import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { IntensityTarget } from "@repo/core";
import { Heart, Target, Zap } from "lucide-react-native";
import React, { memo } from "react";
import { View } from "react-native";

// ================================
// Individual Target Metric Card
// ================================

interface TargetMetricsCardProps {
  target: IntensityTarget;
  current?: number;
}

const TargetMetricsCard = memo<TargetMetricsCardProps>(
  function TargetMetricsCard({ target, current }) {
    // Determine metric display properties
    const getMetricInfo = () => {
      switch (target.type) {
        case "%FTP":
          return {
            icon: Zap,
            label: "Power",
            unit: "% FTP",
            color: "text-yellow-600",
            bgColor: "bg-yellow-500/10",
            current: current,
          };
        case "watts":
          return {
            icon: Zap,
            label: "Power",
            unit: "W",
            color: "text-yellow-600",
            bgColor: "bg-yellow-500/10",
            current: current,
          };
        case "%MaxHR":
        case "%ThresholdHR":
          return {
            icon: Heart,
            label: "Heart Rate",
            unit: target.type === "%MaxHR" ? "% Max" : "% Threshold",
            color: "text-red-600",
            bgColor: "bg-red-500/10",
            current: current,
          };
        case "bpm":
          return {
            icon: Heart,
            label: "Heart Rate",
            unit: "bpm",
            color: "text-red-600",
            bgColor: "bg-red-500/10",
            current: current,
          };
        case "cadence":
          return {
            icon: Target,
            label: "Cadence",
            unit: "rpm",
            color: "text-blue-600",
            bgColor: "bg-blue-500/10",
            current: current,
          };
        default:
          return {
            icon: Target,
            label: target.type,
            unit: "",
            color: "text-muted-foreground",
            bgColor: "bg-muted/10",
            current: current,
          };
      }
    };

    // Format target display
    const getTargetDisplay = () => {
      if (target.target) {
        return `${Math.round(target.target)}`;
      }
      if (target.min && target.max) {
        return `${Math.round(target.min)}-${Math.round(target.max)}`;
      }
      if (target.min) return `>${Math.round(target.min)}`;
      if (target.max) return `<${Math.round(target.max)}`;
      return "--";
    };

    // Check if current is in range
    const isInRange = () => {
      if (current === undefined) return null;
      const min = target.min || 0;
      const max = target.max || Infinity;
      const targetVal = target.target;

      if (targetVal) {
        // Within 5% of target
        const tolerance = targetVal * 0.05;
        return (
          current >= targetVal - tolerance && current <= targetVal + tolerance
        );
      }

      return current >= min && current <= max;
    };

    const metricInfo = getMetricInfo();
    const targetDisplay = getTargetDisplay();
    const inRange = isInRange();
    const currentDisplay = current !== undefined ? Math.round(current) : "--";

    return (
      <View className={`p-3 rounded-lg ${metricInfo.bgColor}`}>
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Icon as={metricInfo.icon} size={16} className={metricInfo.color} />
            <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {metricInfo.label}
            </Text>
          </View>
          {inRange !== null && (
            <View
              className={`w-2 h-2 rounded-full ${
                inRange ? "bg-green-500" : "bg-orange-500"
              }`}
            />
          )}
        </View>

        <View className="flex-row items-end justify-between">
          {/* Target Value */}
          <View>
            <Text className="text-xs text-muted-foreground mb-1">Target</Text>
            <Text className={`text-xl font-semibold ${metricInfo.color}`}>
              {targetDisplay}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {metricInfo.unit}
            </Text>
          </View>

          {/* Current Value */}
          <View className="items-end">
            <Text className="text-xs text-muted-foreground mb-1">Current</Text>
            <Text className="text-xl font-semibold">{currentDisplay}</Text>
            <Text className="text-xs text-muted-foreground">
              {metricInfo.unit}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

TargetMetricsCard.displayName = "TargetMetricsCard";

// ================================
// Target Metrics Grid
// ================================

interface TargetMetricsGridProps {
  targets?: IntensityTarget[];
  currentMetrics: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
  };
}

export const TargetMetricsGrid = memo<TargetMetricsGridProps>(
  function TargetMetricsGrid({
    targets,
    currentMetrics,
  }: TargetMetricsGridProps) {
    if (!targets || targets.length === 0) {
      return (
        <View className="p-4 bg-muted/10 rounded-lg">
          <Text className="text-center text-muted-foreground">
            No targets for this step
          </Text>
        </View>
      );
    }

    const getCurrentValue = (targetType: string): number | undefined => {
      switch (targetType) {
        case "%FTP":
        case "watts":
          return currentMetrics.power;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          return currentMetrics.heartRate;
        case "cadence":
          return currentMetrics.cadence;
        case "speed":
          return currentMetrics.speed;
        default:
          return undefined;
      }
    };

    return (
      <View className="gap-3">
        {targets.map((target, index) => (
          <TargetMetricsCard
            key={`${target.type}-${index}`}
            target={target}
            current={getCurrentValue(target.type)}
          />
        ))}
      </View>
    );
  },
);

TargetMetricsGrid.displayName = "TargetMetricsGrid";
