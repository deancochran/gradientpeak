import {
  ANIMATIONS,
  CARD_STYLES,
} from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";

import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDuration } from "@repo/core";
import { Clock } from "lucide-react-native";
import React from "react";
import { ScrollView, View } from "react-native";

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
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className={CARD_STYLES.wrapper}>
        <CardContent className={CARD_STYLES.content}>
          {/* Header */}
          <View className={CARD_STYLES.header}>
            <View className="flex-row items-center">
              <Icon
                as={Clock}
                size={CARD_STYLES.iconSize}
                className="text-blue-500 mr-2"
              />
              <Text className="text-lg font-semibold">Dashboard</Text>
            </View>
          </View>

          {/* Primary Metric - Elapsed Time */}
          <View className="items-center mb-8">
            <Text
              className={`text-5xl font-bold text-blue-500 ${ANIMATIONS.valueChange}`}
            >
              {formatDuration(stats.duration || 0)}
            </Text>
            <Text className="text-sm text-muted-foreground">elapsed time</Text>
          </View>

          {/* Live Metrics Section */}
          <View className="flex-1">
            <Text className={CARD_STYLES.sectionHeader}>Live Metrics</Text>
            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-3 pb-4"
            >
              {/* Row 1: Power & Heart Rate */}
              <View className="flex-row gap-3">
                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Power
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {current.power ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">watts</Text>
                </View>

                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Heart Rate
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {current.heartRate ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">bpm</Text>
                </View>
              </View>

              {/* Row 2: Cadence & Speed */}
              <View className="flex-row gap-3">
                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Cadence
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {current.cadence ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">rpm</Text>
                </View>

                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Speed
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {current.speed?.toFixed(1) ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">km/h</Text>
                </View>
              </View>

              {/* Row 3: Distance & Calories */}
              <View className="flex-row gap-3">
                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Distance
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {((stats.distance || 0) / 1000).toFixed(2)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">km</Text>
                </View>

                <View
                  className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                >
                  <Text className="text-xs text-muted-foreground mb-1">
                    Calories
                  </Text>
                  <Text
                    className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                  >
                    {stats.calories || 0}
                  </Text>
                  <Text className="text-xs text-muted-foreground">cal</Text>
                </View>
              </View>

              {/* Row 4: Elevation Gain & Loss (for outdoor activities) */}
              {(stats.ascent > 0 || stats.descent > 0) && (
                <View className="flex-row gap-3">
                  <View
                    className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                  >
                    <Text className="text-xs text-muted-foreground mb-1">
                      Elevation Gain
                    </Text>
                    <Text
                      className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                    >
                      {Math.round(stats.ascent || 0)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">m</Text>
                  </View>

                  <View
                    className={`flex-1 ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
                  >
                    <Text className="text-xs text-muted-foreground mb-1">
                      Elevation Loss
                    </Text>
                    <Text
                      className={`text-xl font-semibold ${ANIMATIONS.valueChange}`}
                    >
                      {Math.round(stats.descent || 0)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">m</Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
