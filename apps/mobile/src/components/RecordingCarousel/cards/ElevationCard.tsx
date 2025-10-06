import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLiveMetrics } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import {
  Activity,
  Mountain,
  Navigation,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ElevationCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const ElevationCard: React.FC<ElevationCardProps> = ({
  service,
  screenWidth,
}) => {
  const metrics = useLiveMetrics(service);

  // Default to zero values when no metrics available
  const hasDistance = metrics.distance && metrics.distance > 0;
  const hasElevationData = metrics.totalAscent > 0 || metrics.totalDescent > 0;
  const hasCurrentElevation = metrics.current !== undefined;
  const current = hasCurrentElevation ? metrics.current! : 0;
  const totalAscent = metrics.totalAscent;
  const totalDescent = metrics.totalDescent;
  const avgGrade = metrics.avgGrade;
  const elevationGainPerKm = metrics.elevationGainPerKm;

  // Format elevation values
  const formatElevation = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  // Get grade color based on steepness
  const getGradeColor = (grade: number) => {
    const absGrade = Math.abs(grade);
    if (absGrade < 2) return "text-green-500";
    if (absGrade < 5) return "text-yellow-500";
    if (absGrade < 8) return "text-orange-500";
    return "text-red-500";
  };

  const getGradeDescription = (grade: number) => {
    const absGrade = Math.abs(grade);
    if (absGrade < 2) return "Flat";
    if (absGrade < 5) return grade > 0 ? "Gentle climb" : "Gentle descent";
    if (absGrade < 8) return grade > 0 ? "Moderate climb" : "Moderate descent";
    if (absGrade < 12) return grade > 0 ? "Steep climb" : "Steep descent";
    return grade > 0 ? "Very steep climb" : "Very steep descent";
  };

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Mountain} size={24} className="text-green-600 mr-2" />
              <Text className="text-lg font-semibold">Elevation</Text>
            </View>
            {hasCurrentElevation && (
              <View className="flex-row items-center">
                <Icon
                  as={Navigation}
                  size={16}
                  className="text-green-600 mr-1"
                />
                <Text className="text-xs text-muted-foreground">GPS</Text>
              </View>
            )}
          </View>

          {/* Current Elevation - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-4xl font-bold ${hasCurrentElevation ? "text-green-600" : "text-green-600/30"}`}
            >
              {hasCurrentElevation ? formatElevation(current) : "0m"}
            </Text>
            <Text className="text-sm text-muted-foreground">
              current elevation
            </Text>
          </View>

          {/* Elevation Statistics */}
          <View className="flex-row justify-around mb-6">
            <View className="items-center">
              <View className="flex-row items-center mb-1">
                <Icon
                  as={TrendingUp}
                  size={16}
                  className="text-green-500 mr-1"
                />
              </View>
              <Text
                className={`text-xl font-semibold ${totalAscent > 0 ? "text-green-500" : "text-green-500/30"}`}
              >
                {Math.round(totalAscent)}m
              </Text>
              <Text className="text-xs text-muted-foreground">Ascent</Text>
            </View>

            <View className="items-center">
              <View className="flex-row items-center mb-1">
                <Icon
                  as={TrendingDown}
                  size={16}
                  className="text-blue-500 mr-1"
                />
              </View>
              <Text
                className={`text-xl font-semibold ${totalDescent > 0 ? "text-blue-500" : "text-blue-500/30"}`}
              >
                {Math.round(totalDescent)}m
              </Text>
              <Text className="text-xs text-muted-foreground">Descent</Text>
            </View>

            <View className="items-center">
              <Text
                className={`text-xl font-semibold ${hasElevationData ? getGradeColor(avgGrade) : "text-muted-foreground/30"}`}
              >
                {avgGrade > 0 ? "+" : ""}
                {avgGrade.toFixed(1)}%
              </Text>
              <Text className="text-xs text-muted-foreground">Avg Grade</Text>
            </View>
          </View>

          {/* Grade Information */}
          <View className="mb-6">
            <View className="p-4 bg-muted/10 rounded-lg">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium">Current Grade</Text>
                <Text
                  className={`text-lg font-semibold ${hasElevationData ? getGradeColor(avgGrade) : "text-muted-foreground/30"}`}
                >
                  {avgGrade > 0 ? "+" : ""}
                  {avgGrade.toFixed(1)}%
                </Text>
              </View>
              <Text
                className={`text-xs ${hasElevationData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
              >
                {hasElevationData ? getGradeDescription(avgGrade) : "No data"}
              </Text>

              {/* Grade visual indicator */}
              <View className="mt-3">
                <View className="h-2 bg-muted rounded-full overflow-hidden">
                  <View
                    className={`h-full rounded-full ${
                      avgGrade > 0 ? "bg-green-500" : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.abs(avgGrade) * 10)}%`,
                    }}
                  />
                </View>
                <View className="flex-row justify-between mt-1">
                  <Text className="text-xs text-muted-foreground">-20%</Text>
                  <Text className="text-xs text-muted-foreground">0%</Text>
                  <Text className="text-xs text-muted-foreground">+20%</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Additional Metrics */}
          <View className="gap-3">
            {hasDistance && elevationGainPerKm > 0 && (
              <View className="flex-row justify-between items-center p-3 bg-green-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Icon
                    as={TrendingUp}
                    size={16}
                    className="text-green-500 mr-2"
                  />
                  <Text className="text-sm font-medium">Climb Rate</Text>
                </View>
                <Text className="font-semibold text-green-600">
                  {Math.round(elevationGainPerKm)}m/km
                </Text>
              </View>
            )}

            {/* Net elevation change */}
            <View className="flex-row justify-between items-center p-3 bg-muted/10 rounded-lg">
              <View className="flex-row items-center">
                <Icon
                  as={Activity}
                  size={16}
                  className="text-muted-foreground mr-2"
                />
                <Text className="text-sm font-medium">Net Change</Text>
              </View>
              <Text
                className={`font-semibold ${
                  hasElevationData
                    ? totalAscent - totalDescent > 0
                      ? "text-green-600"
                      : "text-blue-600"
                    : "text-muted-foreground/30"
                }`}
              >
                {totalAscent - totalDescent > 0 ? "+" : ""}
                {Math.round(totalAscent - totalDescent)}m
              </Text>
            </View>

            {/* Elevation profile visualization */}
            {hasElevationData && (
              <View className="p-3 bg-muted/10 rounded-lg">
                <Text className="text-xs text-muted-foreground mb-3">
                  Elevation Profile
                </Text>
                <View className="flex-row items-end justify-between h-20">
                  {/* Simple elevation bars visualization */}
                  {Array.from({ length: 10 }, (_, i) => {
                    // Mock elevation data for visualization
                    const height = 20 + Math.random() * 60;
                    return (
                      <View
                        key={i}
                        className="bg-green-400 rounded-t flex-1 mx-0.5"
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
                </View>
                <View className="flex-row justify-between mt-2">
                  <Text className="text-xs text-muted-foreground">Start</Text>
                  <Text className="text-xs text-muted-foreground">Current</Text>
                </View>
              </View>
            )}

            {/* VAM (if climbing) */}
            {totalAscent > 50 && metrics.movingTime > 0 && (
              <View className="p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs text-muted-foreground mb-1">
                      VAM
                    </Text>
                    <Text className="text-lg font-semibold text-orange-600">
                      {Math.round((totalAscent / metrics.movingTime) * 3600)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">m/h</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-muted-foreground text-right">
                      Vertical Ascent Rate
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Footer */}
          <View className="mt-6 pt-4 border-t border-muted/20">
            <Text className="text-xs text-muted-foreground text-center">
              Elevation data from GPS with smoothing applied
            </Text>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
