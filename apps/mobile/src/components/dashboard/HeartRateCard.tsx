import React from "react";
import { View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Heart, Activity, Target, TrendingUp } from "lucide-react-native";
import { useHeartRateMetrics } from "@/lib/hooks/useLiveMetrics";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

interface HeartRateCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const HeartRateCard: React.FC<HeartRateCardProps> = ({
  service,
  screenWidth,
}) => {
  const hrMetrics = useHeartRateMetrics(service);

  // Default to zero values when no metrics available
  const hasCurrentHR = hrMetrics?.current !== undefined;
  const current = hasCurrentHR ? Math.round(hrMetrics!.current!) : 0;
  const avg = hrMetrics ? Math.round(hrMetrics.avg) : 0;
  const max = hrMetrics ? Math.round(hrMetrics.max) : 0;
  const hasThresholdData = hrMetrics ? hrMetrics.maxPctThreshold > 0 : false;
  const maxPctThreshold = hrMetrics ? Math.round(hrMetrics.maxPctThreshold) : 0;
  const zones = hrMetrics?.zones || { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  // Heart rate zone colors
  const getHRZoneColor = (zone: number) => {
    const colors = [
      "bg-gray-400", // Z1 - Recovery
      "bg-blue-400", // Z2 - Aerobic
      "bg-green-400", // Z3 - Tempo
      "bg-yellow-400", // Z4 - Lactate Threshold
      "bg-red-400", // Z5 - VO2 Max
    ];
    return colors[zone] || "bg-gray-400";
  };

  const getHRZoneLabel = (zone: number) => {
    const labels = ["Recovery", "Aerobic", "Tempo", "Threshold", "VO2 Max"];
    return labels[zone] || "Unknown";
  };

  // Get current HR zone
  const getCurrentZone = () => {
    if (!hasCurrentHR || !hrMetrics.current) return null;

    // Simple zone calculation - would use actual thresholds in real implementation
    if (hrMetrics.current < 120) return 0;
    if (hrMetrics.current < 140) return 1;
    if (hrMetrics.current < 160) return 2;
    if (hrMetrics.current < 180) return 3;
    return 4;
  };

  const currentZone = getCurrentZone();

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Heart} size={24} className="text-red-500 mr-2" />
              <Text className="text-lg font-semibold">Heart Rate</Text>
            </View>
            {hasCurrentHR && (
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                <Text className="text-xs text-muted-foreground">LIVE</Text>
              </View>
            )}
          </View>

          {/* Current HR - Large Display */}
          <View className="items-center mb-6">
            <Text
              className={`text-5xl font-bold ${hasCurrentHR ? "text-red-500" : "text-red-500/30"}`}
            >
              {current}
            </Text>
            <Text className="text-sm text-muted-foreground">bpm</Text>
            {currentZone !== null && (
              <View className="flex-row items-center mt-2">
                <View
                  className={`w-3 h-3 rounded-full mr-2 ${getHRZoneColor(currentZone)}`}
                />
                <Text className="text-xs text-muted-foreground">
                  Zone {currentZone + 1} - {getHRZoneLabel(currentZone)}
                </Text>
              </View>
            )}
          </View>

          {/* HR Statistics */}
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

          {/* HR Zone Distribution */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-muted-foreground mb-3">
              Zone Distribution
            </Text>
            <View className="gap-2">
              {Object.entries(zones).map(([zoneKey, timeSeconds], index) => {
                const minutes = Math.floor(timeSeconds / 60);
                const totalZoneTime = Object.values(zones).reduce(
                  (sum, t) => sum + t,
                  0,
                );
                const percentage =
                  totalZoneTime > 0 ? (timeSeconds / totalZoneTime) * 100 : 0;

                return (
                  <View key={zoneKey} className="flex-row items-center">
                    <View
                      className={`w-4 h-4 rounded mr-3 ${timeSeconds > 0 ? getHRZoneColor(index) : `${getHRZoneColor(index)}/20`}`}
                    />
                    <Text
                      className={`text-xs font-medium w-16 ${timeSeconds > 0 ? "" : "text-muted-foreground/50"}`}
                    >
                      Z{index + 1}
                    </Text>
                    <View className="flex-1 mx-3">
                      <View className="h-2 bg-muted rounded-full overflow-hidden">
                        <View
                          className={`h-full rounded-full ${getHRZoneColor(index)}`}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </View>
                    </View>
                    <Text
                      className={`text-xs w-12 text-right ${timeSeconds > 0 ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                    >
                      {minutes > 0 ? `${minutes}m` : "<1m"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Additional Metrics */}
          <View className="gap-3">
            {hasThresholdData && (
              <View className="flex-row justify-between items-center p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Icon
                    as={Target}
                    size={16}
                    className="text-orange-500 mr-2"
                  />
                  <Text className="text-sm font-medium">Threshold %</Text>
                </View>
                <Text className="font-semibold text-orange-600">
                  {maxPctThreshold}%
                </Text>
              </View>
            )}

            {avg > 0 && (
              <View className="flex-row justify-between items-center p-3 bg-red-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Icon as={Activity} size={16} className="text-red-500 mr-2" />
                  <Text className="text-sm font-medium">HR Reserve</Text>
                </View>
                <Text className="font-semibold text-red-600">
                  {Math.round(
                    (((hrMetrics.current || hrMetrics.avg) - 60) /
                      (hrMetrics.max - 60)) *
                      100,
                  )}
                  %
                </Text>
              </View>
            )}

            {current === 0 && avg === 0 && (
              <View className="p-3 bg-muted/10 rounded-lg items-center">
                <Text className="text-xs text-muted-foreground text-center">
                  Connect a heart rate monitor to see live data
                </Text>
              </View>
            )}

            {/* HR Trend Indicator */}
            <View className="p-3 bg-muted/10 rounded-lg">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xs text-muted-foreground mb-1">
                    Current Effort
                  </Text>
                  <Text className="text-lg font-semibold">
                    {current === 0
                      ? "Unknown"
                      : current < 100
                        ? "Very Light"
                        : current < 120
                          ? "Light"
                          : current < 140
                            ? "Moderate"
                            : current < 160
                              ? "Hard"
                              : current < 180
                                ? "Very Hard"
                                : "Maximum"}
                  </Text>
                </View>
                <Icon
                  as={TrendingUp}
                  size={20}
                  className="text-muted-foreground"
                />
              </View>
            </View>
          </View>

          {/* Footer */}
          <View className="mt-6 pt-4 border-t border-muted/20">
            <Text className="text-xs text-muted-foreground text-center">
              Heart rate zones based on threshold and age estimates
            </Text>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
