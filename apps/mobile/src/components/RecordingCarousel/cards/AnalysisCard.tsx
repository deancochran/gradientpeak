import React from "react";
import { View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import {
  BarChart3,
  TrendingUp,
  Target,
  Activity,
  Timer,
} from "lucide-react-native";
import {
  useAnalysisMetrics,
  useDistanceMetrics,
} from "@/lib/hooks/useLiveMetrics";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { formatDuration } from "@repo/core";

interface AnalysisCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({
  service,
  screenWidth,
}) => {
  const analysisMetrics = useAnalysisMetrics(service);
  const distanceMetrics = useDistanceMetrics(service);

  // Default to zero values when no metrics available
  const hasPowerData = analysisMetrics
    ? analysisMetrics.normalizedPower > 0
    : false;
  const hasValidTSS = analysisMetrics ? analysisMetrics.tss > 0 : false;
  const tss = analysisMetrics ? Math.round(analysisMetrics.tss) : 0;
  const intensityFactor = analysisMetrics ? analysisMetrics.intensityFactor : 0;
  const variabilityIndex = analysisMetrics
    ? analysisMetrics.variabilityIndex
    : 0;
  const efficiencyFactor = analysisMetrics
    ? analysisMetrics.efficiencyFactor
    : 0;
  const adherence = analysisMetrics ? analysisMetrics.adherence : 0;
  const decoupling = analysisMetrics ? analysisMetrics.decoupling : 0;

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={BarChart3} size={24} className="text-blue-500 mr-2" />
              <Text className="text-lg font-semibold">Analysis</Text>
            </View>
            <View className="flex-row items-center">
              <Icon as={Activity} size={16} className="text-blue-500 mr-1" />
              <Text className="text-xs text-muted-foreground">LIVE CALC</Text>
            </View>
          </View>

          {/* TSS - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-4xl font-bold ${hasValidTSS ? "text-blue-500" : "text-blue-500/30"}`}
            >
              {tss}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Training Stress Score
            </Text>
            <View className="flex-row items-center mt-2">
              <View
                className={`w-2 h-2 rounded-full mr-2 ${
                  hasValidTSS
                    ? tss < 50
                      ? "bg-green-500"
                      : tss < 100
                        ? "bg-yellow-500"
                        : tss < 150
                          ? "bg-orange-500"
                          : "bg-red-500"
                    : "bg-gray-500/30"
                }`}
              />
              <Text className="text-xs text-muted-foreground">
                {hasValidTSS
                  ? tss < 50
                    ? "Light"
                    : tss < 100
                      ? "Moderate"
                      : tss < 150
                        ? "Hard"
                        : "Very Hard"
                  : "No data"}
              </Text>
            </View>
          </View>

          {/* Power Analysis Section */}
          {hasPowerData && (
            <View className="mb-6">
              <Text className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Power Analysis
              </Text>
              <View className="gap-3">
                {/* IF & VI */}
                <View className="flex-row gap-3">
                  <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                    <Text className="text-xs text-muted-foreground mb-1">
                      Intensity Factor
                    </Text>
                    <Text
                      className={`text-xl font-semibold ${hasPowerData ? "" : "text-muted-foreground/30"}`}
                    >
                      {intensityFactor.toFixed(2)}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <View
                        className={`w-1.5 h-1.5 rounded-full mr-1 ${
                          hasPowerData
                            ? intensityFactor < 0.6
                              ? "bg-green-500"
                              : intensityFactor < 0.8
                                ? "bg-yellow-500"
                                : intensityFactor < 1.0
                                  ? "bg-orange-500"
                                  : "bg-red-500"
                            : "bg-gray-500/30"
                        }`}
                      />
                      <Text
                        className={`text-xs ${hasPowerData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                      >
                        {(intensityFactor * 100).toFixed(0)}% FTP
                      </Text>
                    </View>
                  </View>

                  <View className="flex-1 p-3 bg-muted/10 rounded-lg">
                    <Text className="text-xs text-muted-foreground mb-1">
                      Variability
                    </Text>
                    <Text
                      className={`text-xl font-semibold ${hasPowerData ? "" : "text-muted-foreground/30"}`}
                    >
                      {variabilityIndex.toFixed(2)}
                    </Text>
                    <Text
                      className={`text-xs mt-1 ${hasPowerData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                    >
                      {hasPowerData
                        ? variabilityIndex < 1.05
                          ? "Steady"
                          : variabilityIndex < 1.15
                            ? "Variable"
                            : "Highly Variable"
                        : "No data"}
                    </Text>
                  </View>
                </View>

                {/* Efficiency Factor */}
                <View className="p-3 bg-muted/10 rounded-lg">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs text-muted-foreground mb-1">
                        Efficiency Factor
                      </Text>
                      <Text
                        className={`text-xl font-semibold ${hasPowerData ? "" : "text-muted-foreground/30"}`}
                      >
                        {efficiencyFactor.toFixed(1)}
                      </Text>
                      <Text
                        className={`text-xs ${hasPowerData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                      >
                        watts/bpm
                      </Text>
                    </View>
                    <Icon
                      as={TrendingUp}
                      size={20}
                      className="text-muted-foreground"
                    />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Workout Progress Section */}
          <View className="gap-3">
            <Text className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Workout Progress
            </Text>

            {/* Time & Distance */}
            <View className="flex-row gap-3">
              <View className="flex-1 p-3 bg-blue-500/10 rounded-lg">
                <View className="flex-row items-center mb-2">
                  <Icon as={Timer} size={16} className="text-blue-500 mr-2" />
                  <Text className="text-xs text-muted-foreground">
                    Duration
                  </Text>
                </View>
                <Text className="text-lg font-semibold">
                  {distanceMetrics
                    ? formatDuration(distanceMetrics.elapsedTime)
                    : "00:00:00"}
                </Text>
                {distanceMetrics &&
                  distanceMetrics.movingTime !==
                    distanceMetrics.elapsedTime && (
                    <Text className="text-xs text-muted-foreground">
                      {formatDuration(distanceMetrics.movingTime)} moving
                    </Text>
                  )}
              </View>

              {distanceMetrics && distanceMetrics.distance > 0 && (
                <View className="flex-1 p-3 bg-green-500/10 rounded-lg">
                  <Text className="text-xs text-muted-foreground mb-2">
                    Distance
                  </Text>
                  <Text className="text-lg font-semibold">
                    {(distanceMetrics.distance / 1000).toFixed(1)} km
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {(distanceMetrics.avgSpeed * 3.6).toFixed(1)} km/h avg
                  </Text>
                </View>
              )}
            </View>

            {/* Plan Adherence */}
            {adherence > 0 && (
              <View className="p-4 bg-green-500/10 rounded-lg">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Icon
                      as={Target}
                      size={16}
                      className="text-green-500 mr-2"
                    />
                    <Text className="text-sm font-medium">Plan Adherence</Text>
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    Current Step
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-3xl font-bold text-green-500">
                    {Math.round(adherence * 100)}%
                  </Text>

                  {/* Progress bar */}
                  <View className="flex-1 ml-4">
                    <View className="h-2 bg-muted rounded-full overflow-hidden">
                      <View
                        className="h-full bg-green-500 rounded-full"
                        style={{
                          width: `${Math.min(100, adherence * 100)}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>

                <Text className="text-xs text-muted-foreground mt-2">
                  {adherence >= 0.9
                    ? "Excellent adherence"
                    : adherence >= 0.8
                      ? "Good adherence"
                      : adherence >= 0.7
                        ? "Fair adherence"
                        : "Work on staying in target"}
                </Text>
              </View>
            )}

            {/* Decoupling (if available) */}
            {decoupling > 0 && (
              <View className="p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs text-muted-foreground mb-1">
                      Decoupling
                    </Text>
                    <Text className="text-xl font-semibold text-orange-600">
                      {decoupling.toFixed(1)}%
                    </Text>
                  </View>
                  <Text className="text-xs text-muted-foreground">
                    {decoupling < 5
                      ? "Excellent"
                      : decoupling < 10
                        ? "Good"
                        : "High drift"}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Footer Note */}
          <View className="mt-6 pt-4 border-t border-muted/20">
            <Text className="text-xs text-muted-foreground text-center">
              {hasPowerData
                ? "Advanced metrics calculated in real-time from power data"
                : "Connect a power meter for detailed analysis"}
            </Text>
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
