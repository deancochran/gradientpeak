import type { IntervalV2 } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Info, Plus, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";

interface StructureStats {
  durationMs: number;
  stepCount: number;
  estimatedTSS: number;
  distanceMeters: number;
}

interface StructureBuilderCardProps {
  structure: { version: 2; intervals: IntervalV2[] };
  intervals: IntervalV2[];
  structureStats: StructureStats;
  validationErrors: Record<string, string | undefined>;
  selectedIntervalId: string | null;
  showChartCoachmark: boolean;
  onAddInterval: () => void;
  onDismissChartCoachmark: () => void;
  onTimelineIntervalPress: (intervalId: string) => void;
}

export function StructureBuilderCard({
  structure,
  intervals,
  structureStats,
  validationErrors,
  selectedIntervalId,
  showChartCoachmark,
  onAddInterval,
  onDismissChartCoachmark,
  onTimelineIntervalPress,
}: StructureBuilderCardProps) {
  const durationMinutes = Math.round(structureStats.durationMs / 60000);
  const roundedTSS = Math.round(structureStats.estimatedTSS);
  const distanceKm = structureStats.distanceMeters / 1000;
  const formattedDistance =
    distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString();

  return (
    <Card>
      <CardContent className="px-4 py-0 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold">Structure Builder</Text>
          <Button variant="outline" size="sm" onPress={onAddInterval}>
            <Icon as={Plus} size={16} className="text-foreground" />
            <Text className="ml-1">Add Interval</Text>
          </Button>
        </View>

        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <Text className="text-sm text-muted-foreground">Duration: {durationMinutes} min</Text>
          <Text className="text-sm text-muted-foreground">TSS: {roundedTSS}</Text>
          {structureStats.distanceMeters > 0 ? (
            <Text className="text-sm text-muted-foreground">Distance: {formattedDistance} km</Text>
          ) : null}
          <Text className="text-sm text-muted-foreground">Steps: {structureStats.stepCount}</Text>
        </View>

        {intervals.length > 0 ? (
          <View className="gap-0.5">
            <TimelineChart
              structure={structure}
              height={168}
              compact
              selectedIntervalId={selectedIntervalId}
              onIntervalPress={onTimelineIntervalPress}
            />
            {showChartCoachmark ? (
              <Pressable
                onPress={onDismissChartCoachmark}
                className="mt-1 min-h-11 flex-row items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
                accessibilityRole="button"
                accessibilityLabel="Dismiss chart tip"
                accessibilityHint="Hides this onboarding tip"
              >
                <View className="flex-1 flex-row items-center gap-2 pr-2">
                  <Info size={13} color="#2563EB" />
                  <Text className="text-[11px] text-muted-foreground">
                    Tip: Tap interval regions directly on the chart to edit.
                  </Text>
                </View>
                <Icon as={X} size={14} className="text-muted-foreground" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {validationErrors.intervals ? (
          <Text className="text-xs text-destructive">{validationErrors.intervals}</Text>
        ) : null}

        {intervals.length === 0 ? (
          <View className="border border-dashed border-border rounded-lg p-4">
            <Text className="text-sm text-muted-foreground text-center">
              Add your first interval to start building this plan.
            </Text>
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}
