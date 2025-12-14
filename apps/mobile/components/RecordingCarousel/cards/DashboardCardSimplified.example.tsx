/**
 * DashboardCardSimplified - Example using the new useSimplifiedMetrics hook
 *
 * This is an example showing how components can optionally migrate to the
 * new SimplifiedMetrics API for an even cleaner implementation.
 *
 * Benefits over the current approach:
 * 1. Single hook instead of two (useCurrentReadings + useSessionStats)
 * 2. More organized metric structure (current, totals, avg, max)
 * 3. Zone arrays already available without manual assembly
 *
 * NOTE: This is OPTIONAL. The existing implementation works perfectly fine.
 */

import {
    ANIMATIONS,
    CARD_STYLES,
} from "@/components/RecordingCarousel/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSimplifiedMetrics } from "@/lib/hooks/useSimplifiedMetrics";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDuration } from "@repo/core";
import { Clock } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface DashboardCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const DashboardCardSimplified: React.FC<DashboardCardProps> = ({
  service,
  screenWidth,
}) => {
  // Single hook for all metrics - cleaner than useCurrentReadings + useSessionStats
  const metrics = useSimplifiedMetrics(service);

  // Early return if no metrics
  if (!metrics) {
    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className={CARD_STYLES.wrapper}>
          <CardContent className={CARD_STYLES.content}>
            <Text className="text-muted-foreground">Loading...</Text>
          </CardContent>
        </Card>
      </View>
    );
  }

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
              {formatDuration(metrics.totals.elapsed)}
            </Text>
            <Text className="text-sm text-muted-foreground">elapsed time</Text>
          </View>

          {/* Live Metrics Section */}
          <View className="mb-6">
            <Text className={CARD_STYLES.sectionHeader}>Live Metrics</Text>
            <View className="gap-3">
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
                    {metrics.current.power ?? "--"}
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
                    {metrics.current.heartRate ?? "--"}
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
                    {metrics.current.cadence ?? "--"}
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
                    {metrics.current.speed
                      ? (metrics.current.speed * 3.6).toFixed(1)
                      : "--"}
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
                    {(metrics.totals.distance / 1000).toFixed(2)}
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
                    {metrics.totals.calories}
                  </Text>
                  <Text className="text-xs text-muted-foreground">kcal</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Optional: Show advanced metrics if available */}
          {metrics.advanced && (
            <View className="mt-4 pt-4 border-t border-border">
              <Text className={CARD_STYLES.sectionHeader}>
                Advanced Metrics
              </Text>
              <View className="flex-row justify-around mt-2">
                <View className="items-center">
                  <Text className="text-lg font-semibold">
                    {Math.round(metrics.advanced.normalizedPower)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">NP</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-semibold">
                    {Math.round(metrics.advanced.tss)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">TSS</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-semibold">
                    {metrics.advanced.intensityFactor.toFixed(2)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">IF</Text>
                </View>
              </View>
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
};

/**
 * Comparison: Old vs New Approach
 *
 * OLD (current approach):
 * ```typescript
 * const current = useCurrentReadings(service);
 * const stats = useSessionStats(service);
 *
 * <Text>{current.power ?? "--"}</Text>
 * <Text>{stats.distance / 1000}</Text>
 * <Text>{stats.calories}</Text>
 * ```
 *
 * NEW (simplified approach):
 * ```typescript
 * const metrics = useSimplifiedMetrics(service);
 *
 * <Text>{metrics.current.power ?? "--"}</Text>
 * <Text>{metrics.totals.distance / 1000}</Text>
 * <Text>{metrics.totals.calories}</Text>
 * ```
 *
 * Benefits:
 * - Single hook call (cleaner)
 * - More organized structure (current vs totals vs avg vs max)
 * - Zone arrays already available: metrics.zones.power, metrics.zones.hr
 * - Advanced metrics check: if (metrics.advanced) { ... }
 * - Plan adherence: metrics.plan?.adherence
 */
