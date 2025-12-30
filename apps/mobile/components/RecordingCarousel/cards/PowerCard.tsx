import {
  ANIMATIONS,
  CARD_STYLES,
} from "@/components/RecordingCarousel/constants";
import { ZoneChart } from "@/components/RecordingCarousel/shared/ZoneChart";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  useCurrentReadings,
  useSessionStats,
} from "@/lib/hooks/useActivityRecorder";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { Target } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface PowerCardProps {
  service: ActivityRecorderService | null;
  screenWidth: number;
}

export const PowerCard: React.FC<PowerCardProps> = ({
  service,
  screenWidth,
}) => {
  const current = useCurrentReadings(service);
  const stats = useSessionStats(service);

  // Current power
  const hasCurrentPower = current.power !== undefined;
  const currentPower = hasCurrentPower ? Math.round(current.power!) : 0;

  // Stats
  const avg = Math.round(stats.avgPower);
  const max = Math.round(stats.maxPower);
  const normalized = stats.normalizedPower
    ? Math.round(stats.normalizedPower)
    : 0;
  const totalWorkKJ = Math.round(stats.work / 1000);

  const zones = {
    z1: stats.powerZones[0],
    z2: stats.powerZones[1],
    z3: stats.powerZones[2],
    z4: stats.powerZones[3],
    z5: stats.powerZones[4],
    z6: stats.powerZones[5],
    z7: stats.powerZones[6],
  };

  // Calculate max time for proportional heights (unused but kept for zone chart)
  const maxZoneTime = Math.max(...Object.values(zones));

  return (
    <View style={{ width: screenWidth }} className="flex-1 p-4">
      <Card className="flex-1 py-0">
        <CardContent className={CARD_STYLES.content}>
          {/* Current Power - Large Display */}
          <View className="items-center mb-8">
            <Text
              className={`text-5xl font-bold ${hasCurrentPower ? "text-yellow-500" : "text-yellow-500/30"} ${ANIMATIONS.valueChange}`}
            >
              {currentPower}
            </Text>
            <Text className="text-sm text-muted-foreground">watts</Text>
          </View>

          {/* Power Metrics Grid */}
          <View className="flex-row justify-around mb-6">
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${avg > 0 ? "" : "text-muted-foreground/30"} ${ANIMATIONS.valueChange}`}
              >
                {avg}
              </Text>
              <Text className="text-xs text-muted-foreground">Avg</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${max > 0 ? "" : "text-muted-foreground/30"} ${ANIMATIONS.valueChange}`}
              >
                {max}
              </Text>
              <Text className="text-xs text-muted-foreground">Max</Text>
            </View>
            <View className="items-center">
              <Text
                className={`text-2xl font-semibold ${normalized > 0 ? "text-orange-500" : "text-orange-500/30"} ${ANIMATIONS.valueChange}`}
              >
                {normalized}
              </Text>
              <Text className="text-xs text-muted-foreground">NP</Text>
            </View>
          </View>

          {/* Work & Power Zones */}
          <View className="gap-4">
            <View
              className={`flex-row items-center justify-between ${CARD_STYLES.metricCard} ${ANIMATIONS.transition}`}
            >
              <Text className="text-sm font-medium">Total Work</Text>
              <Text className="font-semibold">{totalWorkKJ} kJ</Text>
            </View>

            {/* Zone Distribution */}
            <ZoneChart zones={zones} maxZones={7} />

            {/* Normalized Power Detail */}
            {normalized > 0 && (
              <View
                className={`flex-row justify-between items-center ${CARD_STYLES.metricCardColored("orange")} ${ANIMATIONS.transition}`}
              >
                <View className="flex-row items-center">
                  <Icon
                    as={Target}
                    size={16}
                    className="text-orange-500 mr-2"
                  />
                  <Text className="text-sm font-medium">Normalized Power</Text>
                </View>
                <Text className="font-semibold text-orange-600">
                  {normalized}W
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      </Card>
    </View>
  );
};
