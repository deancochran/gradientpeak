import React from "react";
import { View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import {
  Mountain,
  TrendingUp,
  TrendingDown,
  Activity,
  Navigation,
  CheckCircle,
} from "lucide-react-native";
import {
  useElevationMetrics,
  useDistanceMetrics,
} from "@/lib/hooks/useLiveMetrics";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { useRecordingState } from "@/lib/hooks/useActivityRecorderEvents";

interface ElevationCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const ElevationCard: React.FC<ElevationCardProps> = ({
  service,
  screenWidth,
}) => {
  const elevationMetrics = useElevationMetrics(service);
  const distanceMetrics = useDistanceMetrics(service);
  const recordingState = useRecordingState(service);
  const isPrepared = recordingState === "pending" || recordingState === "ready";

  // Show prepared state before recording starts
  if (isPrepared) {
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
              <View className="flex-row items-center">
                <Icon
                  as={CheckCircle}
                  size={16}
                  className="text-green-500 mr-1"
                />
                <Text className="text-xs text-muted-foreground">READY</Text>
              </View>
            </View>

            {/* Current Elevation - Large Display with Placeholder */}
            <View className="items-center mb-8">
              <Text className="text-4xl font-bold text-muted-foreground/30">
                ---
              </Text>
              <Text className="text-sm text-muted-foreground">
                current elevation
              </Text>
              <Text className="text-xs text-muted-foreground mt-2">
                Waiting to start
              </Text>
            </View>

            {/* Elevation Statistics - Placeholders */}
            <View className="flex-row justify-around mb-6">
              <View className="items-center">
                <View className="flex-row items-center mb-1">
                  <Icon
                    as={TrendingUp}
                    size={16}
                    className="text-green-500 mr-1"
                  />
                </View>
                <Text className="text-xl font-semibold text-muted-foreground/30">
                  --
                </Text>
                <Text className="text-xs text-muted-foreground">Ascent</Text>
              </View>
              <View className="items-center">
                <View className="flex-row items-center mb-1">
                  <Icon
                    as={TrendingDown}
                    size={16}
                    className="text-orange-500 mr-1"
                  />
                </View>
                <Text className="text-xl font-semibold text-muted-foreground/30">
                  --
                </Text>
                <Text className="text-xs text-muted-foreground">Descent</Text>
              </View>
            </View>

            {/* Ready State Message */}
            <View className="p-4 bg-muted/10 rounded-lg items-center">
              <Icon
                as={Mountain}
                size={32}
                className="text-green-600/50 mb-2"
              />
              <Text className="text-sm font-medium text-center mb-1">
                Elevation Tracking Ready
              </Text>
              <Text className="text-xs text-muted-foreground text-center">
                GPS elevation data will be tracked once you start recording
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  }

  if (!elevationMetrics) {
    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-6 flex-1 items-center justify-center">
            <Icon
              as={Mountain}
              size={48}
              className="text-muted-foreground/20 mb-4"
            />
            <Text className="text-muted-foreground text-center">
              No elevation data
            </Text>
            <Text className="text-sm text-muted-foreground/70 text-center mt-2">
              GPS data required for elevation tracking
            </Text>
          </CardContent>
        </Card>
      </View>
    );
  }

  const hasDistance = distanceMetrics && distanceMetrics.distance > 0;
  const hasElevationData =
    elevationMetrics.totalAscent > 0 || elevationMetrics.totalDescent > 0;
  const hasCurrentElevation = elevationMetrics.current !== undefined;

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
            <Text className="text-4xl font-bold text-green-600">
              {hasCurrentElevation
                ? formatElevation(elevationMetrics.current!)
                : "---"}
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
              <Text className="text-xl font-semibold text-green-500">
                {Math.round(elevationMetrics.totalAscent)}m
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
              <Text className="text-xl font-semibold text-blue-500">
                {Math.round(elevationMetrics.totalDescent)}m
              </Text>
              <Text className="text-xs text-muted-foreground">Descent</Text>
            </View>

            <View className="items-center">
              <Text
                className={`text-xl font-semibold ${getGradeColor(elevationMetrics.avgGrade)}`}
              >
                {elevationMetrics.avgGrade > 0 ? "+" : ""}
                {elevationMetrics.avgGrade.toFixed(1)}%
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
                  className={`text-lg font-semibold ${getGradeColor(elevationMetrics.avgGrade)}`}
                >
                  {elevationMetrics.avgGrade > 0 ? "+" : ""}
                  {elevationMetrics.avgGrade.toFixed(1)}%
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {getGradeDescription(elevationMetrics.avgGrade)}
              </Text>

              {/* Grade visual indicator */}
              <View className="mt-3">
                <View className="h-2 bg-muted rounded-full overflow-hidden">
                  <View
                    className={`h-full rounded-full ${
                      elevationMetrics.avgGrade > 0
                        ? "bg-green-500"
                        : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.abs(elevationMetrics.avgGrade) * 10)}%`,
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
            {hasDistance && elevationMetrics.elevationGainPerKm > 0 && (
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
                  {Math.round(elevationMetrics.elevationGainPerKm)}m/km
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
                  elevationMetrics.totalAscent - elevationMetrics.totalDescent >
                  0
                    ? "text-green-600"
                    : "text-blue-600"
                }`}
              >
                {elevationMetrics.totalAscent - elevationMetrics.totalDescent >
                0
                  ? "+"
                  : ""}
                {Math.round(
                  elevationMetrics.totalAscent - elevationMetrics.totalDescent,
                )}
                m
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
            {elevationMetrics.totalAscent > 50 &&
              distanceMetrics &&
              distanceMetrics.movingTime > 0 && (
                <View className="p-3 bg-orange-500/10 rounded-lg">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs text-muted-foreground mb-1">
                        VAM
                      </Text>
                      <Text className="text-lg font-semibold text-orange-600">
                        {Math.round(
                          (elevationMetrics.totalAscent /
                            distanceMetrics.movingTime) *
                            3600,
                        )}
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
              {hasCurrentElevation
                ? "Elevation data from GPS with smoothing applied"
                : "GPS signal required for elevation tracking"}
            </Text>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
