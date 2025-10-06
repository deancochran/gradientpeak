import React, { memo } from "react";
import { View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useMetric } from "@/lib/hooks/useActivityRecorderEvents";
import { formatDuration } from "@repo/core";

interface DashboardCardProps {
  service: any;
  screenWidth: number;
}

interface MetricDisplayProps {
  label: string;
  value: number | undefined;
  unit: string;
  className?: string;
}

const MetricDisplay = memo(
  ({ label, value, unit, className = "" }: MetricDisplayProps) => (
    <View className={`items-center flex-1 ${className}`}>
      <Text className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
        {label}
      </Text>
      <View className="flex-row items-baseline">
        <Text className="text-2xl font-bold tabular-nums">{value ?? "--"}</Text>
        <Text className="text-xs text-muted-foreground ml-1">{unit}</Text>
      </View>
    </View>
  ),
);

MetricDisplay.displayName = "MetricDisplay";

const DurationDisplay = memo(
  ({ elapsedTime }: { elapsedTime: number | undefined }) => (
    <View className="items-center mb-8 pb-6 border-b border-border">
      <View className="flex-row items-center gap-2 mb-3">
        <Text className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Duration
        </Text>
      </View>
      <Text className="text-5xl font-bold tabular-nums">
        {formatDuration(elapsedTime)}
      </Text>
    </View>
  ),
);

DurationDisplay.displayName = "DurationDisplay";

export const DashboardCard = memo(
  ({ service, screenWidth }: DashboardCardProps) => {
    // Fetch all metrics
    const elapsedTime = useMetric(service, "elapsedTime");
    const power = useMetric(service, "power");
    const heartrate = useMetric(service, "heartrate");
    const cadence = useMetric(service, "cadence");
    const distance = useMetric(service, "distance");

    return (
      <View style={{ width: screenWidth }} className="flex-1 p-4">
        <Card className="flex-1">
          <CardContent className="p-6">
            {/* Large Time Display - Most Critical Metric */}
            <DurationDisplay elapsedTime={elapsedTime} />

            {/* Grid of Key Metrics */}
            <View className="flex-1 justify-center gap-6">
              {/* Top Row: Power, Heart Rate, Cadence */}
              <View className="flex-row justify-around">
                <MetricDisplay label="Power" value={power} unit="W" />
                <MetricDisplay
                  label="Heart Rate"
                  value={heartrate}
                  unit="bpm"
                />
                <MetricDisplay label="Cadence" value={cadence} unit="rpm" />
              </View>

              {/* Bottom Row: Distance (centered) */}
              <View className="flex-row justify-around">
                <View className="flex-1" /> {/* Left spacer */}
                <MetricDisplay label="Distance" value={distance} unit="km" />
                <View className="flex-1" /> {/* Right spacer */}
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    );
  },
);

DashboardCard.displayName = "DashboardCard";
