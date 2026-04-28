import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

export function RouteProgressInsightCard({ mode, service, stats }: InsightCardProps) {
  const recordedDistanceMeters = stats.distance ?? 0;
  const routeDistanceMeters = service?.routeDistance ?? 0;
  const routeProgress = service?.routeProgress ?? 0;
  const currentRouteDistanceMeters = service?.currentRouteDistance ?? recordedDistanceMeters;
  const remainingMeters = Math.max(0, routeDistanceMeters - currentRouteDistanceMeters);
  const distanceLabel = `${(currentRouteDistanceMeters / 1000).toFixed(2)} km`;
  const remainingLabel =
    routeDistanceMeters > 0 ? `${(remainingMeters / 1000).toFixed(1)} km` : "--";
  const progressLabel = routeDistanceMeters > 0 ? `${Math.round(routeProgress)}%` : "--";

  if (mode === "compact") {
    return (
      <View className="h-full justify-center gap-3" testID="route-progress-insight-card">
        <View className="h-3 overflow-hidden rounded-full bg-muted">
          <View
            className="h-full rounded-full bg-foreground"
            style={{ width: `${Math.max(0, Math.min(100, routeProgress))}%` }}
          />
        </View>
        <View className="flex-1 flex-row items-stretch gap-2">
          <MetricTile compact label="Along" value={distanceLabel} />
          <MetricTile compact label="Left" value={remainingLabel} />
          <MetricTile compact label="Route" value={progressLabel} />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-5" testID="route-progress-insight-card">
      <View className="rounded-[32px] bg-muted/45 p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Route Progress
        </Text>
        <Text className="mt-2 text-4xl font-black text-foreground">{progressLabel}</Text>
        <Text className="mt-2 text-base font-semibold text-muted-foreground">
          {distanceLabel} covered • {remainingLabel} remaining
        </Text>
      </View>
      <View className="h-5 overflow-hidden rounded-full bg-muted">
        <View
          className="h-full rounded-full bg-foreground"
          style={{ width: `${Math.max(0, Math.min(100, routeProgress))}%` }}
        />
      </View>
      <View className="flex-row gap-3">
        <MetricTile label="Along" value={distanceLabel} />
        <MetricTile label="Left" value={remainingLabel} />
        <MetricTile label="Route" value={progressLabel} />
      </View>
    </View>
  );
}
