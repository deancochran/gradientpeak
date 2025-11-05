import {
    ANIMATIONS,
    ZONE_CHART_CONFIG,
    ZONE_COLORS,
} from "@/components/RecordingCarousel/constants";
import { Text } from "@/components/ui/text";
import { formatDurationCompactMs } from "@repo/core";
import React from "react";
import { Animated, View } from "react-native";

interface ZoneChartProps {
  zones: Record<string, number>; // Zone time in seconds
  maxZones?: number; // Limit number of zones to display (default: 7 for power, 5 for HR)
  title?: string;
}

export const ZoneChart: React.FC<ZoneChartProps> = ({
  zones,
  maxZones = 7,
  title = "Zone Distribution"
}) => {
  // Calculate max time for proportional heights
  const zoneEntries = Object.entries(zones).slice(0, maxZones);
  const maxZoneTime = Math.max(...zoneEntries.map(([_, time]) => time));

  return (
    <View className="gap-4">
      <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        {title}
      </Text>
      <View
        className="flex-row gap-2 items-end"
        style={{ height: ZONE_CHART_CONFIG.maxBarHeight + 50 }}
      >
        {zoneEntries.map(([zone, timeSeconds], index) => {
          const minutes = formatDurationCompactMs(timeSeconds);

          // Calculate proportional height
          const barHeight =
            maxZoneTime > 0
              ? Math.max(
                  (timeSeconds / maxZoneTime) * ZONE_CHART_CONFIG.maxBarHeight,
                  timeSeconds > 0
                    ? ZONE_CHART_CONFIG.minBarHeight
                    : ZONE_CHART_CONFIG.minBarHeight,
                )
              : ZONE_CHART_CONFIG.minBarHeight;

          return (
            <View key={zone} className="flex-1 items-center justify-end">
              <Animated.View
                style={{
                  height: barHeight,
                  width: "100%",
                }}
                className={`rounded mb-1 ${
                  timeSeconds > 0
                    ? ZONE_COLORS.active[index]
                    : ZONE_COLORS.inactive[index]
                } ${ANIMATIONS.barGrowth}`}
              />
              <Text
                className={`text-xs font-medium ${
                  timeSeconds > 0 ? "" : "text-muted-foreground/50"
                }`}
              >
                Z{index + 1}
              </Text>
              <Text
                className={`text-xs ${
                  timeSeconds > 0
                    ? "text-muted-foreground"
                    : "text-muted-foreground/30"
                }`}
              >
                {minutes}&apos;
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};
