import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

export function ClimbInsightCard({ mode, service, stats }: InsightCardProps) {
  const grade = service?.currentRouteGrade ?? 0;
  const routeDistanceMeters = service?.routeDistance ?? 0;
  const currentRouteDistanceMeters = service?.currentRouteDistance ?? stats.distance ?? 0;
  const remainingMeters = Math.max(0, routeDistanceMeters - currentRouteDistanceMeters);
  const gradeLabel = grade === 0 ? "0%" : `${grade > 0 ? "+" : ""}${grade.toFixed(1)}%`;
  const effortLabel = grade > 2 ? "Climbing" : grade < -2 ? "Descending" : "Rolling";

  if (mode === "compact") {
    return (
      <View className="h-full flex-row items-stretch gap-2" testID="climb-insight-card">
        <MetricTile compact label="Grade" value={gradeLabel} />
        <MetricTile compact label="Terrain" value={effortLabel} />
        <MetricTile
          compact
          label="Left"
          value={routeDistanceMeters > 0 ? `${(remainingMeters / 1000).toFixed(1)} km` : "--"}
        />
      </View>
    );
  }

  return (
    <View className="gap-5" testID="climb-insight-card">
      <View className="rounded-[32px] bg-muted/45 p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Terrain
        </Text>
        <Text className="mt-2 text-3xl font-black text-foreground">{effortLabel}</Text>
        <Text className="mt-2 text-base font-semibold text-muted-foreground">
          Current grade {gradeLabel}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <MetricTile label="Grade" value={gradeLabel} />
        <MetricTile label="Terrain" value={effortLabel} />
        <MetricTile
          label="Left"
          value={routeDistanceMeters > 0 ? `${(remainingMeters / 1000).toFixed(1)} km` : "--"}
        />
      </View>
    </View>
  );
}
