import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

interface Zone {
  zone: number;
  time: number;
  label: string;
}

interface ZoneDistributionCardProps {
  title: string;
  zones: Zone[];
  colors: string[];
  targetZones?: number[]; // Optional target times for each zone (for plan comparison)
  showToggle?: boolean; // Show time/percentage toggle
}

export function ZoneDistributionCard({
  title,
  zones,
  colors,
  targetZones,
  showToggle = true,
}: ZoneDistributionCardProps) {
  const [displayMode, setDisplayMode] = useState<"time" | "percentage">("time");

  const totalTime = zones.reduce((sum, z) => sum + z.time, 0);

  if (totalTime === 0) {
    return null;
  }

  const toggleDisplayMode = () => {
    setDisplayMode((prev) => (prev === "time" ? "percentage" : "time"));
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {showToggle && (
            <Pressable
              onPress={toggleDisplayMode}
              className="px-3 py-1 bg-muted rounded-full"
            >
              <Text className="text-xs font-medium">
                {displayMode === "time" ? "Time" : "%"}
              </Text>
            </Pressable>
          )}
        </View>
      </CardHeader>
      <CardContent className="gap-3">
        {zones.map((zone) => {
          const percentage = totalTime > 0 ? (zone.time / totalTime) * 100 : 0;
          const minutes = Math.floor(zone.time / 60);
          const seconds = zone.time % 60;

          // Calculate target comparison if provided
          const targetTime = targetZones?.[zone.zone - 1];
          const targetPercentage =
            targetTime && totalTime > 0 ? (targetTime / totalTime) * 100 : null;

          return (
            <View key={zone.zone}>
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm font-medium">{zone.label}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm text-muted-foreground">
                    {displayMode === "time"
                      ? `${minutes}:${seconds.toString().padStart(2, "0")}`
                      : `${percentage.toFixed(0)}%`}
                  </Text>
                  {targetPercentage != null && (
                    <Text className="text-xs text-muted-foreground">
                      (target: {targetPercentage.toFixed(0)}%)
                    </Text>
                  )}
                </View>
              </View>

              <View className="h-2 bg-muted rounded-full overflow-hidden">
                {/* Actual time bar */}
                <View
                  className={colors[zone.zone - 1]}
                  style={{ width: `${percentage}%`, height: "100%" }}
                />

                {/* Target overlay (semi-transparent) */}
                {targetPercentage != null && (
                  <View
                    className="absolute top-0 h-full border-2 border-dashed border-foreground/30"
                    style={{
                      width: `${targetPercentage}%`,
                      left: 0,
                    }}
                  />
                )}
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}
