import {
  type ActivityPlanInterval,
  type ActivityPlanSegment,
  deriveActivityPlanPresentation,
  summarizeCompiledActivityPlanInterval,
} from "@repo/core";
import { formatDurationCompact } from "@repo/core/duration/time-format";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { type AccessibilityActionEvent, Pressable, View } from "react-native";
import { NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";
import { ResourceMetricsRow } from "@/components/shared/ResourceCardPrimitives";
import type { ActivityPlanCopyResult } from "@/lib/stores/activityPlanCreation";

interface StructureStats {
  durationMs: number | null;
  hasOpenDuration: boolean;
  hasPartialDuration: boolean;
  stepCount: number;
  distanceMeters: number;
}

interface StructureBuilderCardProps {
  structure: { version: 3; segments: ActivityPlanSegment[] };
  segmentId: string;
  intervals: ActivityPlanInterval[];
  structureStats: StructureStats;
  validationErrors: Record<string, string | undefined>;
  selectedIntervalId: string | null;
  showChartCoachmark: boolean;
  onAddInterval: () => void;
  onDismissChartCoachmark: () => void;
  onDuplicateInterval: (intervalId: string) => ActivityPlanCopyResult;
  onDeleteInterval: (intervalId: string) => void;
  onReorderIntervals?: (intervals: ActivityPlanInterval[]) => void;
  onTimelineIntervalPress: (intervalId: string) => void;
}

function moveInterval(
  intervals: ActivityPlanInterval[],
  from: number,
  to: number,
): ActivityPlanInterval[] {
  if (from === to || from < 0 || to < 0 || from >= intervals.length || to >= intervals.length) {
    return intervals;
  }
  const reordered = [...intervals];
  const [interval] = reordered.splice(from, 1);
  if (!interval) return intervals;
  reordered.splice(to, 0, interval);
  return reordered;
}

function formatIntervalDose(
  interval: ActivityPlanInterval,
  summary: ReturnType<typeof summarizeCompiledActivityPlanInterval>,
) {
  if (!summary) return `${interval.repetitions}× · Details unavailable`;
  const quantities = [
    summary.total.timedSeconds > 0 ? `${Math.round(summary.total.timedSeconds / 60)} min` : null,
    summary.total.distanceMeters > 0
      ? `${(summary.total.distanceMeters / 1000).toFixed(1)} km`
      : null,
    summary.total.repetitionCount > 0 ? `${summary.total.repetitionCount} reps` : null,
  ].filter((value): value is string => value !== null);
  const dose = summary.hasOpenDuration ? "Open-ended" : quantities.join(" + ") || "Open-ended";
  return `${interval.repetitions}× · ${dose}`;
}

export function StructureBuilderCard({
  structure,
  segmentId,
  intervals,
  structureStats,
  validationErrors,
  selectedIntervalId,
  showChartCoachmark: _showChartCoachmark,
  onAddInterval,
  onDismissChartCoachmark: _onDismissChartCoachmark,
  onDuplicateInterval,
  onDeleteInterval,
  onReorderIntervals,
  onTimelineIntervalPress,
}: StructureBuilderCardProps) {
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [previewIntervals, setPreviewIntervals] = useState<ActivityPlanInterval[] | null>(null);
  const currentIntervalsRef = useRef(intervals);
  const dragStartIntervalsRef = useRef<ActivityPlanInterval[] | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);
  currentIntervalsRef.current = intervals;
  const displayedIntervals = previewIntervals ?? intervals;
  const chartStructure = useMemo(
    () =>
      previewIntervals
        ? {
            ...structure,
            segments: structure.segments.map((segment) =>
              segment.role === "activity" && segment.id === segmentId
                ? { ...segment, intervals: previewIntervals }
                : segment,
            ),
          }
        : structure,
    [previewIntervals, segmentId, structure],
  );
  const presentation = useMemo(
    () => deriveActivityPlanPresentation(chartStructure),
    [chartStructure],
  );

  useEffect(() => {
    // A draft update outside the drag gesture supersedes any transient preview.
    setPreviewIntervals(null);
    dragStartIntervalsRef.current = null;
    dragStartIndexRef.current = null;
  }, [intervals]);

  const reorderFromIndex = (from: number, to: number) => {
    const reordered = moveInterval(intervals, from, to);
    if (reordered === intervals) return;
    onReorderIntervals?.(reordered);
  };
  const durationLabel = structureStats.hasOpenDuration
    ? structureStats.hasPartialDuration
      ? "Partial duration"
      : "Open-ended"
    : structureStats.durationMs === null
      ? "Duration not specified"
      : formatDurationCompact(structureStats.durationMs / 1000);
  const distanceKm = structureStats.distanceMeters / 1000;
  const formattedDistance =
    distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString();
  const expectedMetrics = [
    {
      label: "Expected duration",
      value: durationLabel,
    },
    {
      label: "Steps",
      value: `${structureStats.stepCount}`,
    },
    ...(structureStats.distanceMeters > 0
      ? [
          {
            label: "Expected distance",
            value: `${formattedDistance} km`,
          },
        ]
      : []),
  ];

  return (
    <View
      className="gap-4 rounded-3xl border border-border bg-card p-4"
      testID="activity-plan-structure-card"
    >
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          Structure
        </Text>
        <ResourceMetricsRow metrics={expectedMetrics} testID="activity-plan-structure-metrics" />
      </View>

      {intervals.length > 0 ? (
        <TimelineChart
          presentation={presentation}
          height={156}
          compact
          selectedIntervalId={selectedIntervalId}
          onIntervalPress={onTimelineIntervalPress}
        />
      ) : null}

      {intervals.length > 0 ? (
        <NestableDraggableFlatList
          activationDistance={8}
          data={intervals}
          keyExtractor={(interval) => interval.id}
          onDragBegin={(index) => {
            dragStartIntervalsRef.current = intervals;
            dragStartIndexRef.current = index;
            setPreviewIntervals(intervals);
          }}
          onDragEnd={({ data, from, to }) => {
            const startedWithCurrentIntervals =
              dragStartIntervalsRef.current === currentIntervalsRef.current;
            setPreviewIntervals(null);
            dragStartIntervalsRef.current = null;
            dragStartIndexRef.current = null;
            if (startedWithCurrentIntervals && from !== to) onReorderIntervals?.(data);
          }}
          onPlaceholderIndexChange={(placeholderIndex) => {
            const startIntervals = dragStartIntervalsRef.current;
            const startIndex = dragStartIndexRef.current;
            if (startIntervals !== currentIntervalsRef.current || startIndex === null) return;
            setPreviewIntervals(moveInterval(startIntervals, startIndex, placeholderIndex));
          }}
          renderItem={({ item: interval, drag, isActive }) => {
            const intervalIndex = intervals.indexOf(interval);
            const accessibilityActions = [
              ...(intervalIndex > 0 ? [{ name: "increment", label: "Move interval earlier" }] : []),
              ...(intervalIndex < intervals.length - 1
                ? [{ name: "decrement", label: "Move interval later" }]
                : []),
            ];
            const onAccessibilityAction = (event: AccessibilityActionEvent) => {
              if (event.nativeEvent.actionName === "increment") {
                reorderFromIndex(intervalIndex, intervalIndex - 1);
              }
              if (event.nativeEvent.actionName === "decrement") {
                reorderFromIndex(intervalIndex, intervalIndex + 1);
              }
            };
            const summary = presentation
              ? summarizeCompiledActivityPlanInterval(presentation.compiled, interval.id)
              : null;
            return (
              <View className="flex-row items-center gap-2 border-t border-border pt-2">
                <Pressable
                  accessibilityHint="Double tap and hold, then drag to reorder this interval"
                  accessibilityLabel={`Reorder interval ${interval.name}`}
                  accessibilityRole="button"
                  accessibilityActions={accessibilityActions}
                  className="min-h-12 min-w-10 items-center justify-center"
                  disabled={isActive}
                  onAccessibilityAction={onAccessibilityAction}
                  onLongPress={drag}
                  testID={`reorder-interval-${interval.id}`}
                >
                  <Icon as={GripVertical} size={18} className="text-muted-foreground" />
                </Pressable>
                <Pressable
                  accessibilityHint="Opens interval editor"
                  accessibilityLabel={`Edit interval ${interval.name}`}
                  accessibilityRole="button"
                  className="min-h-12 flex-1 justify-center"
                  onPress={() => onTimelineIntervalPress(interval.id)}
                  testID={`interval-row-${interval.id}`}
                >
                  <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                    {interval.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {formatIntervalDose(interval, summary)}
                  </Text>
                </Pressable>
                <Button
                  accessibilityHint="Duplicates this interval after it"
                  accessibilityLabel={`Duplicate interval ${interval.name}`}
                  className="min-h-12 min-w-12"
                  onPress={(event) => {
                    event.stopPropagation();
                    const result = onDuplicateInterval(interval.id);
                    setDuplicateError(result.success ? null : result.error);
                  }}
                  size="sm"
                  testID={`duplicate-interval-${interval.id}`}
                  variant="ghost"
                >
                  <Icon as={Copy} size={14} className="text-primary" />
                </Button>
                <Button
                  accessibilityHint="Requests confirmation before deleting this interval"
                  accessibilityLabel={`Delete interval ${interval.name}`}
                  className="min-h-12 min-w-12"
                  onPress={(event) => {
                    event.stopPropagation();
                    onDeleteInterval(interval.id);
                  }}
                  size="sm"
                  testID={`delete-interval-${interval.id}`}
                  variant="ghost"
                >
                  <Icon as={Trash2} size={14} className="text-destructive" />
                </Button>
              </View>
            );
          }}
          scrollEnabled={false}
        />
      ) : null}

      {intervals.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={onAddInterval}
          className="min-h-12 self-start px-1"
        >
          <Icon as={Plus} size={15} className="text-primary" />
          <Text className="ml-1 text-primary">Add interval</Text>
        </Button>
      ) : null}

      {duplicateError ? <Text className="text-xs text-destructive">{duplicateError}</Text> : null}

      {validationErrors.intervals ? (
        <Text className="text-xs text-destructive">{validationErrors.intervals}</Text>
      ) : null}

      {intervals.length === 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={onAddInterval}
          className="min-h-12 self-start px-1"
        >
          <Icon as={Plus} size={15} className="text-primary" />
          <Text className="ml-1 text-primary">Add your first interval</Text>
        </Button>
      ) : null}
    </View>
  );
}
