import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLiveMetrics } from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { BarChart3, Target, TrendingUp } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface AnalysisCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({
  service,
  screenWidth,
}) => {
  const metrics = useLiveMetrics(service);

  const hasPowerData = metrics.normalizedPower > 0;
  const hasValidTSS = metrics.tss > 0;
  const tss = Math.round(metrics.tss);
  const intensityFactor = metrics.intensityFactor;
  const variabilityIndex = metrics.variabilityIndex;
  const efficiencyFactor = metrics.efficiencyFactor;
  const adherence = metrics.adherence;
  const decoupling = metrics.decoupling;

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent>
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={BarChart3} size={24} className="text-blue-500 mr-2" />
              <Text className="text-lg font-semibold">Analysis</Text>
            </View>
          </View>

          {/* TSS - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-4xl font-bold ${hasValidTSS ? "text-blue-500" : "text-blue-500/30"}`}
            >
              {hasValidTSS ? tss : "--"}
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
                    {hasPowerData ? intensityFactor.toFixed(2) : "--"}
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
                      {hasPowerData
                        ? `${(intensityFactor * 100).toFixed(0)}% FTP`
                        : "N/A"}
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
                    {hasPowerData ? variabilityIndex.toFixed(2) : "--"}
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
                      {hasPowerData ? efficiencyFactor.toFixed(1) : "--"}
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
                    className={`${hasPowerData ? "text-muted-foreground" : "text-muted-foreground/30"}`}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Additional Metrics */}
          <View className="gap-3">
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

            {/* Decoupling */}
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
        </CardContent>
      </Card>
    </View>
  );
};
