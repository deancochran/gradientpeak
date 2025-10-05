import React from "react";
import { View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Zap, Target } from "lucide-react-native";
import { usePowerMetrics } from "@/lib/hooks/useLiveMetrics";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

interface PowerCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const PowerCard: React.FC<PowerCardProps> = ({
  service,
  screenWidth,
}) => {
  const powerMetrics = usePowerMetrics(service);

  if (!powerMetrics) {
    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-6 flex-1 items-center justify-center">
            <Icon
              as={Zap}
              size={48}
              className="text-muted-foreground/20 mb-4"
            />
            <Text className="text-muted-foreground text-center">
              No power data available
            </Text>
            <Text className="text-sm text-muted-foreground/70 text-center mt-2">
              Connect a power meter to see live metrics
            </Text>
          </CardContent>
        </Card>
      </View>
    );
  }

  const hasCurrentPower = powerMetrics.current !== undefined;
  const totalWorkKJ = Math.round(powerMetrics.totalWork / 1000);

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1">
        <CardContent className="p-6">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Icon as={Zap} size={24} className="text-yellow-500 mr-2" />
              <Text className="text-lg font-semibold">Power</Text>
            </View>
            {hasCurrentPower && (
              <View className="flex-row items-center">
                <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                <Text className="text-xs text-muted-foreground">LIVE</Text>
              </View>
            )}
          </View>

          {/* Current Power - Large Display */}
          <View className="items-center mb-8">
            <Text className="text-5xl font-bold text-yellow-500">
              {hasCurrentPower
                ? Math.round(powerMetrics.current!).toString()
                : "---"}
            </Text>
            <Text className="text-sm text-muted-foreground">watts</Text>
          </View>

          {/* Power Metrics Grid */}
          <View className="flex-row justify-around mb-6">
            <View className="items-center">
              <Text className="text-2xl font-semibold">
                {Math.round(powerMetrics.avg)}
              </Text>
              <Text className="text-xs text-muted-foreground">Avg</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-semibold">
                {Math.round(powerMetrics.max)}
              </Text>
              <Text className="text-xs text-muted-foreground">Max</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-semibold text-orange-500">
                {Math.round(powerMetrics.normalized)}
              </Text>
              <Text className="text-xs text-muted-foreground">NP</Text>
            </View>
          </View>

          {/* Work & Power Zones */}
          <View className="gap-4">
            <View className="flex-row items-center justify-between p-3 bg-muted/10 rounded-lg">
              <Text className="text-sm font-medium">Total Work</Text>
              <Text className="font-semibold">{totalWorkKJ} kJ</Text>
            </View>

            {/* Zone Time Display */}
            <View>
              <Text className="text-sm font-medium text-muted-foreground mb-3">
                Zone Distribution
              </Text>
              <View className="flex-row gap-2">
                {Object.entries(powerMetrics.zones).map(
                  ([zone, timeSeconds], index) => {
                    const minutes = Math.floor(timeSeconds / 60);
                    const zoneColors = [
                      "bg-gray-400", // Z1
                      "bg-blue-400", // Z2
                      "bg-green-400", // Z3
                      "bg-yellow-400", // Z4
                      "bg-orange-400", // Z5
                      "bg-red-400", // Z6
                      "bg-purple-400", // Z7
                    ];

                    return (
                      <View key={zone} className="flex-1 items-center">
                        <View
                          className={`w-full h-3 rounded mb-1 ${zoneColors[index]}`}
                        />
                        <Text className="text-xs font-medium">
                          Z{index + 1}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {minutes}&apos;
                        </Text>
                      </View>
                    );
                  },
                )}
              </View>
            </View>

            {/* Additional Metrics */}
            {powerMetrics.normalized > 0 && (
              <View className="flex-row justify-between items-center p-3 bg-orange-500/10 rounded-lg">
                <View className="flex-row items-center">
                  <Icon
                    as={Target}
                    size={16}
                    className="text-orange-500 mr-2"
                  />
                  <Text className="text-sm font-medium">Normalized Power</Text>
                </View>
                <Text className="font-semibold text-orange-600">
                  {Math.round(powerMetrics.normalized)}W
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
