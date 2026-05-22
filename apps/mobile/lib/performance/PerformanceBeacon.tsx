import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";
import {
  getPerformanceMetricsSnapshot,
  isPerformanceTestingEnabled,
  subscribeToPerformanceMetrics,
} from "./performance-monitor";

export function PerformanceBeacon() {
  const metrics = React.useSyncExternalStore(
    subscribeToPerformanceMetrics,
    getPerformanceMetricsSnapshot,
    getPerformanceMetricsSnapshot,
  );

  if (!isPerformanceTestingEnabled()) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", bottom: 0, height: 1, opacity: 0.01, width: 1 }}
      testID="perf-beacon"
    >
      {metrics.map((metric) => (
        <Text
          className="text-foreground text-xs"
          key={metric.id}
          testID={`perf-metric-${metric.id}`}
        >
          {Math.round(metric.durationMs)}
        </Text>
      ))}
    </View>
  );
}
