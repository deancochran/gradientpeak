import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLiveMetrics } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { Heart, Target } from "lucide-react-native";
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
  const metrics = useLiveMetrics(service);

  // Default to zero values when no metrics available
  const hasCurrentHR = metrics.heartrate !== undefined;
  const current = hasCurrentHR ? Math.round(metrics.heartrate!) : 0;
  const avg = Math.round(metrics.hrAvg);
  const max = Math.round(metrics.hrMax);
  const hasThresholdData = metrics.maxPctThreshold > 0;
  const maxPctThreshold = Math.round(metrics.maxPctThreshold);
  const zones = metrics.hrZones;

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent>
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Heart} size={24} className="text-red-500 mr-2" />
              <Text className="text-lg font-semibold">Heart Rate</Text>
            </View>
            {hasCurrentHR && (
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                <Text className="text-xs text-muted-foreground">LIVE</Text>
              </View>
            )}
          </View>

          {/* Current HR - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-5xl font-bold ${hasCurrentHR ? "text-red-500" : "text-red-500/30"}`}
            >
              {current}
            </Text>
            <Text className="text-sm text-muted-foreground">bpm</Text>
          </View>

          {/* HR Metrics Grid */}
          <View className="flex-row justify-around mb-6">
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
          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-muted-foreground mb-3">
                Zone Distribution
              </Text>
              <View className="flex-row gap-2">
                {Object.entries(zones).map(([zone, timeSeconds], index) => {
                  const minutes = Math.floor(timeSeconds / 60);
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

                  return (
                    <View key={zone} className="flex-1 items-center">
                      <View
                        className={`w-full h-3 rounded mb-1 ${timeSeconds > 0 ? zoneColors[index] : zoneColorsInactive[index]}`}
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

            {/* Threshold Metric */}
            {hasThresholdData && (
              <View className="flex-row justify-between items-center p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Icon
                    as={Target}
                    size={16}
                    className="text-orange-500 mr-2"
                  />
                  <Text className="text-sm font-medium">Max Threshold</Text>
                </View>
                <Text className="font-semibold text-orange-600">
                  {maxPctThreshold}%
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
