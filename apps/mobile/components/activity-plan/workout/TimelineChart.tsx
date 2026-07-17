import {
  type ActivityPlanStructureV3,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
  extractActivityProfile,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";

interface TimelineChartProps {
  structure: ActivityPlanStructureV3 | unknown;
  height?: number;
  compact?: boolean;
  selectedIntervalId?: string | null;
  onIntervalPress?: (intervalId: string) => void;
}

function targetHeight(targets: readonly { intensity: number }[]): number {
  const intensity = targets[0]?.intensity ?? 20;
  return Math.max(12, Math.min(64, intensity > 10 ? intensity * 0.5 : intensity * 8));
}

export function TimelineChart({
  structure,
  height = 120,
  compact = false,
  selectedIntervalId,
  onIntervalPress,
}: TimelineChartProps) {
  const timeline = useMemo(() => {
    const parsed = activityPlanStructureSchemaV3.safeParse(structure);
    if (!parsed.success) return [];
    const compiled = compileActivityPlanV3(parsed.data);
    return extractActivityProfile(compiled).map((point) => {
      const occurrence = compiled.occurrences[point.globalOrdinal];
      return { point, occurrence };
    });
  }, [structure]);

  if (timeline.length === 0) {
    return (
      <View style={{ height }} className="items-center justify-center bg-muted/20">
        <Text className="text-xs text-muted-foreground">No segments</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height }}>
      <View className="flex-row items-end gap-1 px-2 py-2">
        {timeline.map(({ point, occurrence }) => {
          const isBoundary = point.role !== "activity";
          const selected = occurrence?.intervalId === selectedIntervalId;
          return (
            <Pressable
              key={point.occurrenceId}
              onPress={() => occurrence?.intervalId && onIntervalPress?.(occurrence.intervalId)}
              disabled={!occurrence?.intervalId || !onIntervalPress}
              accessibilityLabel={`${point.role} segment ${point.globalOrdinal + 1}`}
              className={`justify-end rounded-md border ${selected ? "border-primary" : "border-border"} ${isBoundary ? "bg-muted" : "bg-primary/20"}`}
              style={{
                height: isBoundary ? 28 : targetHeight(point.targets) + (compact ? 12 : 28),
                width: Math.max(34, Math.min(110, (point.durationSeconds ?? 60) / 8)),
              }}
            >
              {!compact ? (
                <Text className="px-1 pb-1 text-[9px] text-foreground" numberOfLines={1}>
                  {isBoundary ? point.role : point.category}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
