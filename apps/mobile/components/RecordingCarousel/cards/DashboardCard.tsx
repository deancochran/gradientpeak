import { CARD_STYLES } from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";

import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDuration } from "@repo/core";
import React from "react";
import { View } from "react-native";

interface DashboardCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  service,
  screenWidth,
}) => {
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);

  return (
    <View style={{ width: screenWidth }} className={CARD_STYLES.outerContainer}>
      <Card className="flex-1 py-0">
        <CardContent className={CARD_STYLES.content}>
          {/* Row 1: Elapsed Time - Spans 2 columns */}
          <View className={CARD_STYLES.primaryMetricContainer}>
            <Text
              className={CARD_STYLES.primaryMetric}
              style={{ color: "#3b82f6" }}
            >
              {formatDuration(stats.duration || 0)}
            </Text>
            <Text className="text-sm text-muted-foreground mt-1">
              elapsed time
            </Text>
          </View>

          {/* Row 2: Power | HR */}
          <View
            className={`flex-row ${CARD_STYLES.columnGap} ${CARD_STYLES.rowGap}`}
          >
            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">Power</Text>
              <Text className="text-3xl font-semibold">
                {current.power ?? "--"}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                watts
              </Text>
            </View>

            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">HR</Text>
              <Text className="text-3xl font-semibold">
                {current.heartRate ?? "--"}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">bpm</Text>
            </View>
          </View>

          {/* Row 3: Cadence | Speed */}
          <View
            className={`flex-row ${CARD_STYLES.columnGap} ${CARD_STYLES.rowGap}`}
          >
            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">
                Cadence
              </Text>
              <Text className="text-3xl font-semibold">
                {current.cadence ?? "--"}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">rpm</Text>
            </View>

            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">Speed</Text>
              <Text className="text-3xl font-semibold">
                {current.speed !== undefined
                  ? (current.speed * 3.6).toFixed(1)
                  : "--"}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">km/h</Text>
            </View>
          </View>

          {/* Row 4: Distance | Calories */}
          <View className={`flex-row ${CARD_STYLES.columnGap}`}>
            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">
                Distance
              </Text>
              <Text className="text-3xl font-semibold">
                {((stats.distance || 0) / 1000).toFixed(2)}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">km</Text>
            </View>

            <View className={`flex-1 ${CARD_STYLES.metricCard}`}>
              <Text className="text-xs text-muted-foreground mb-1">
                Calories
              </Text>
              <Text className="text-3xl font-semibold">
                {stats.calories || 0}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">cal</Text>
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
