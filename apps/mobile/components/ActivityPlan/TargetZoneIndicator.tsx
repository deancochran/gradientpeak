// ================================
// Target Metrics Display
// ================================

import { getTargetRange, type IntensityTargetV2 } from "@repo/core";
import { memo } from "react";
import { Text, View } from "react-native";

interface TargetZoneIndicatorProps {
  target: IntensityTargetV2;
  current?: number;
}

const TargetZoneIndicator = memo<TargetZoneIndicatorProps>(
  function TargetZoneIndicator({ target, current }) {
    const [minVal, maxVal] = getTargetRange(target);
    const targetVal = target.intensity;

    const range = maxVal - minVal;
    const currentPercent = current
      ? Math.min(100, Math.max(0, ((current - minVal) / range) * 100))
      : 0;
    const targetPercent = ((targetVal - minVal) / range) * 100;

    return (
      <View className="relative">
        {/* Background bar */}
        <View className="h-2 bg-muted rounded-full overflow-hidden">
          {/* Target zone */}
          <View
            className="absolute h-full bg-green-200 rounded-full"
            style={{
              left: "0%",
              width: "100%",
            }}
          />

          {/* Target value indicator */}
          <View
            className="absolute h-full w-1 bg-green-600 rounded-full"
            style={{ left: `${targetPercent}%` }}
          />

          {/* Current value indicator */}
          {current && (
            <View
              className="absolute h-full w-2 bg-blue-600 rounded-full shadow-md"
              style={{ left: `${Math.max(0, currentPercent - 1)}%` }}
            />
          )}
        </View>

        {/* Value labels */}
        <View className="flex-row justify-between mt-1">
          <Text className="text-xs text-muted-foreground">
            {Math.round(minVal)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(maxVal)}
          </Text>
        </View>
      </View>
    );
  },
);

TargetZoneIndicator.displayName = "TargetZoneIndicator";
