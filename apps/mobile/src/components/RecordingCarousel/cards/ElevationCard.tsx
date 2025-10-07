import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
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
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);

  const hasDistance = stats?.distance && stats.distance > 0;
  const hasElevationData =
    (stats?.ascent ?? 0) > 0 || (stats?.descent ?? 0) > 0;
  const hasCurrentElevation = current?.position?.altitude !== undefined;
  const currentAltitude = hasCurrentElevation ? current.position!.altitude! : 0;
  const totalAscent = stats?.ascent ?? 0;
  const totalDescent = stats?.descent ?? 0;
  const avgGrade = stats?.avgGrade ?? 0;
  const elevationGainPerKm = stats?.elevationGainPerKm ?? 0;

  const formatElevation = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

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
        <CardContent>
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

          {/* Current Elevation */}
          <View className="items-center mb-8">
            <Text
              className={`text-5xl font-bold ${hasCurrentElevation ? "text-blue-500" : "text-blue-500/30"}`}
            >
              {formatElevation(currentAltitude)}
            </Text>
            <Text className="text-sm text-muted-foreground">
              current elevation
            </Text>
          </View>

          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1 items-center p-3 bg-green-500/10 rounded-lg">
                <Icon
                  as={TrendingUp}
                  size={16}
                  className="text-green-500 mb-1"
                />
                <Text
                  className={`text-xl font-semibold ${totalAscent > 0 ? "text-green-500" : "text-green-500/30"}`}
                >
                  {`${Math.round(totalAscent ?? 0)}m`}
                </Text>
                <Text className="text-xs text-muted-foreground">Ascent</Text>
              </View>

              <View className="flex-1 items-center p-3 bg-blue-500/10 rounded-lg">
                <Icon
                  as={TrendingDown}
                  size={16}
                  className="text-blue-500 mb-1"
                />
                <Text
                  className={`text-xl font-semibold ${totalDescent > 0 ? "text-blue-500" : "text-blue-500/30"}`}
                >
                  {`${Math.round(totalDescent ?? 0)}m`}
                </Text>
                <Text className="text-xs text-muted-foreground">Descent</Text>
              </View>
            </View>

            {/* Grade Card */}
            <View className="p-4 bg-muted/10 rounded-lg">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium">Average Grade</Text>
                <Text
                  className={`text-2xl font-semibold ${hasElevationData ? getGradeColor(avgGrade) : "text-muted-foreground/30"}`}
                >
                  {`${avgGrade > 0 ? "+" : ""}${(avgGrade ?? 0).toFixed(1)}%`}
                </Text>
              </View>
              <Text
                className={`text-xs ${hasElevationData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
              >
                {hasElevationData ? getGradeDescription(avgGrade) : "No data"}
              </Text>

              {/* Grade Visual Indicator */}
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

            {/* Climb Rate */}
            {!!hasDistance && elevationGainPerKm > 0 && (
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
                  {`${Math.round(elevationGainPerKm ?? 0)}m/km`}
                </Text>
              </View>
            )}

            {/* Net Change */}
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
                {`${totalAscent - totalDescent > 0 ? "+" : ""}${Math.round((totalAscent ?? 0) - (totalDescent ?? 0))}m`}
              </Text>
            </View>

            {/* VAM */}
            {(totalAscent ?? 0) > 50 && (stats?.movingTime ?? 0) > 0 && (
              <View className="flex-row justify-between items-center p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Text className="text-sm font-medium mr-2">VAM</Text>
                  <Text className="text-xs text-muted-foreground">
                    (Vertical Ascent Rate)
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-lg font-semibold text-orange-600">
                    {`${Math.round(
                      ((totalAscent ?? 0) / (stats?.movingTime ?? 1)) * 3600,
                    )}`}
                  </Text>
                  <Text className="text-xs text-muted-foreground">m/h</Text>
                </View>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
