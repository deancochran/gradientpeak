import {
  ANIMATIONS,
  CARD_STYLES,
} from "@/components/RecordingCarousel/constants";
import { ZoneChart } from "@/components/RecordingCarousel/shared/ZoneChart";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
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

  // Threshold calculations
  const hasThresholdData = max > 0 && avg > 0;
  const maxPctThreshold =
    hasThresholdData && max > 0 ? Math.round((max / 220) * 100) : 0;

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1 py-0">
        <CardContent className={CARD_STYLES.content}>
          {/* Current HR - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-5xl font-bold ${hasCurrentHR ? "text-red-500" : "text-red-500/30"} ${ANIMATIONS.valueChange}`}
            >
              {currentHR}
            </Text>
            <Text className="text-sm text-muted-foreground">bpm</Text>
          </View>

          {/* HR Metrics Grid */}
          <View className="flex-row justify-around mb-6">
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${avg > 0 ? "" : "text-muted-foreground/30"} ${ANIMATIONS.valueChange}`}
              >
                {avg}
              </Text>
              <Text className="text-xs text-muted-foreground">Avg</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${max > 0 ? "" : "text-muted-foreground/30"} ${ANIMATIONS.valueChange}`}
              >
                {max}
              </Text>
              <Text className="text-xs text-muted-foreground">Max</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${hasThresholdData ? "text-orange-500" : "text-orange-500/30"} ${ANIMATIONS.valueChange}`}
              >
                {maxPctThreshold}%
              </Text>
              <Text className="text-xs text-muted-foreground">Max %</Text>
            </View>
          </View>

          {/* Zone Distribution */}
          <View className="gap-4">
            <ZoneChart zones={zones} maxZones={5} />
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
