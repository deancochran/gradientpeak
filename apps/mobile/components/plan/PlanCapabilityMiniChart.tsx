import { Text } from "@/components/ui/text";
import { View } from "react-native";

interface PlanCapabilityMiniChartProps {
  currentCapability?: number | null;
  projectedCapability?: number | null;
  confidence?: number;
  category?: string;
}

function confidenceTint(confidence?: number) {
  if (confidence === undefined || confidence === null) {
    return "bg-muted";
  }

  if (confidence >= 0.7) {
    return "bg-emerald-500";
  }

  if (confidence >= 0.4) {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

function normalizePosition(value: number, min: number, max: number) {
  if (max <= min) {
    return 50;
  }

  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function PlanCapabilityMiniChart({
  currentCapability,
  projectedCapability,
  confidence,
  category,
}: PlanCapabilityMiniChartProps) {
  const hasCurrent =
    currentCapability !== null && currentCapability !== undefined;
  const hasProjected =
    projectedCapability !== null && projectedCapability !== undefined;
  const latestCurrent = hasCurrent ? Number(currentCapability) : 0;
  const latestProjected = hasProjected
    ? Number(projectedCapability)
    : latestCurrent;

  const min = Math.min(latestCurrent, latestProjected, 0);
  const max = Math.max(latestCurrent, latestProjected, 1);
  const currentX = hasCurrent ? normalizePosition(latestCurrent, min, max) : 18;
  const projectedX = hasProjected
    ? normalizePosition(latestProjected, min, max)
    : Math.min(92, currentX + 30);

  return (
    <View className="bg-card border border-border rounded-lg p-3 flex-1 min-h-40">
      <Text className="text-sm font-semibold mb-1">Capability</Text>
      <Text className="text-[11px] text-muted-foreground mb-2">
        {category
          ? `${category.toUpperCase()} projection`
          : "Goal-date projection"}
      </Text>

      <View className="mt-2 mb-4 h-16 justify-center">
        <View className="h-1.5 rounded-full bg-muted" />

        <View
          className="absolute -mt-1.5 items-center"
          style={{ left: `${currentX}%`, marginLeft: -8 }}
        >
          <View className="w-4 h-4 rounded-full bg-blue-500 border border-background" />
          <Text className="text-[10px] text-muted-foreground mt-1">Now</Text>
        </View>

        <View
          className="absolute -mt-1.5 items-center"
          style={{ left: `${projectedX}%`, marginLeft: -8 }}
        >
          <View
            className={`w-4 h-4 rounded-full border border-background ${confidenceTint(confidence)}`}
          />
          <Text className="text-[10px] text-muted-foreground mt-1">Goal</Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-auto">
        <View>
          <Text className="text-[11px] text-muted-foreground">Current</Text>
          <Text className="text-xs font-medium">
            {hasCurrent ? latestCurrent.toFixed(1) : "--"}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[11px] text-muted-foreground">Projected</Text>
          <Text className="text-xs font-medium">
            {hasProjected ? latestProjected.toFixed(1) : "--"}
          </Text>
        </View>
      </View>
    </View>
  );
}
