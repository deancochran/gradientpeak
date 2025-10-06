import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLiveMetrics } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDuration } from "@repo/core";
import { Clock } from "lucide-react-native";
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
  const metrics = useLiveMetrics(service);

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent>
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Clock} size={24} className="text-blue-500 mr-2" />
              <Text className="text-lg font-semibold">Dashboard</Text>
            </View>
          </View>

          {/* Live Metrics Section */}
          <View className="mb-6">
            <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              Live Metrics
            </Text>
            <View className="gap-3">
              {/* Row 1: Duration & Power */}
              <View className="flex-row gap-3">
                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Duration
                  </Text>
                  <Text className="text-xl font-semibold tabular-nums">
                    {formatDuration(metrics.elapsedTime || 0)}
                  </Text>
                </View>

                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Power
                  </Text>
                  <Text className="text-xl font-semibold">
                    {metrics.power ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">watts</Text>
                </View>
              </View>

              {/* Row 2: Heart Rate & Cadence */}
              <View className="flex-row gap-3">
                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Heart Rate
                  </Text>
                  <Text className="text-xl font-semibold">
                    {metrics.heartrate ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">bpm</Text>
                </View>

                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Cadence
                  </Text>
                  <Text className="text-xl font-semibold">
                    {metrics.cadence ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">rpm</Text>
                </View>
              </View>

              {/* Row 3: Distance (single item) */}
              <View className="flex-row gap-3">
                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Distance
                  </Text>
                  <Text className="text-xl font-semibold">
                    {metrics.distance?.toFixed(2) ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">km</Text>
                </View>

                {/* Empty space to maintain grid alignment */}
                <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-1">
                    Calories
                  </Text>
                  <Text className="text-xl font-semibold">
                    {metrics.calories ?? "--"}
                  </Text>
                  <Text className="text-xs text-muted-foreground">cal</Text>
                </View>
              </View>
            </View>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
