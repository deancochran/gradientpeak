import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDurationCompactMs } from "@repo/core";
import { Heart } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface HeartRateCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const HeartRateCard: React.FC<HeartRateCardProps> = ({
  service,
  screenWidth,
}) => {
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);

  // Current HR
  const hasCurrentHR = current.heartRate !== undefined;
  const currentHR = hasCurrentHR ? Math.round(current.heartRate!) : 0;

  // Stats
  const avg = Math.round(stats.avgHeartRate);
  const max = Math.round(stats.maxHeartRate);

  const zones = {
    z1: stats.hrZones[0],
    z2: stats.hrZones[1],
    z3: stats.hrZones[2],
    z4: stats.hrZones[3],
    z5: stats.hrZones[4],
  };

  // Calculate max time for proportional heights
  const maxZoneTime = Math.max(...Object.values(zones));
  const MAX_BAR_HEIGHT = 80; // Maximum height in pixels

  // Threshold calculations
  // We can calculate the percentage if we have both current HR and profile threshold HR
  // For now, we'll check if we have max HR data to show threshold-related info
  const hasThresholdData = max > 0 && avg > 0;
  const maxPctThreshold =
    hasThresholdData && max > 0 ? Math.round((max / 220) * 100) : 0; // Using age-based max as fallback

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1  w-full h-full p-0 m-0">
        <CardContent className="flex-col items-center w-full h-full  p-4 justify-between">
          {/* Header */}
          <View className="flex-row w-full items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Heart} size={24} className="text-red-500 mr-2" />
              <Text className="text-lg font-semibold">Heart Rate</Text>
            </View>
          </View>

          {/* Current HR - Large Display */}
          <View className="w-full items-center mb-8">
            <Text
              className={`text-5xl font-bold ${hasCurrentHR ? "text-red-500" : "text-red-500/30"}`}
            >
              {currentHR}
            </Text>
            <Text className="text-sm text-muted-foreground">bpm</Text>
          </View>

          {/* HR Metrics Grid */}
          <View className="w-full flex-row justify-around mb-6">
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${avg > 0 ? "" : "text-muted-foreground/30"}`}
              >
                {avg}
              </Text>
              <Text className="text-xs text-muted-foreground">Avg</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${max > 0 ? "" : "text-muted-foreground/30"}`}
              >
                {max}
              </Text>
              <Text className="text-xs text-muted-foreground">Max</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${hasThresholdData ? "text-orange-500" : "text-orange-500/30"}`}
              >
                {maxPctThreshold}%
              </Text>
              <Text className="text-xs text-muted-foreground">Max %</Text>
            </View>
          </View>

          {/* Zone Distribution */}
          <View className="w-full gap-4">
            <View>
              <Text className="text-sm font-medium text-muted-foreground mb-3">
                Zone Distribution
              </Text>
              <View
                className="flex-row gap-2 items-end"
                style={{ height: MAX_BAR_HEIGHT + 50 }}
              >
                {Object.entries(zones).map(([zone, timeSeconds], index) => {
                  const minutes = formatDurationCompactMs(timeSeconds);
                  const zoneColors = [
                    "bg-gray-400", // Z1
                    "bg-blue-400", // Z2
                    "bg-green-400", // Z3
                    "bg-yellow-400", // Z4
                    "bg-red-400", // Z5
                  ];
                  const zoneColorsInactive = [
                    "bg-gray-400/20",
                    "bg-blue-400/20",
                    "bg-green-400/20",
                    "bg-yellow-400/20",
                    "bg-red-400/20",
                  ];

                  // Calculate proportional height
                  const barHeight =
                    maxZoneTime > 0
                      ? Math.max(
                          (timeSeconds / maxZoneTime) * MAX_BAR_HEIGHT,
                          timeSeconds > 0 ? 12 : 12,
                        )
                      : 12;

                  return (
                    <View
                      key={zone}
                      className="flex-1 items-center justify-end"
                    >
                      <View
                        style={{ height: barHeight }}
                        className={`w-full rounded mb-1 ${timeSeconds > 0 ? zoneColors[index] : zoneColorsInactive[index]}`}
                      />
                      <Text
                        className={`text-xs font-medium ${timeSeconds > 0 ? "" : "text-muted-foreground/50"}`}
                      >
                        Z{index + 1}
                      </Text>
                      <Text
                        className={`text-xs ${timeSeconds > 0 ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                      >
                        {minutes}&apos;
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
