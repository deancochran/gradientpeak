import {
  type ActivityPlanPresentationModel,
  deriveActivityPlanPresentation,
} from "@repo/core/activity-plan";
import { getIntensityZone, INTENSITY_ZONES } from "@repo/core/constants";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { ArrowRight } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { getActivityCategoryConfig } from "@/lib/constants/activities";

interface TimelineChartProps {
  presentation?: ActivityPlanPresentationModel | null;
  structure?: unknown;
  height?: number;
  compact?: boolean;
  selectedIntervalId?: string | null;
  onIntervalPress?: (intervalId: string) => void;
}

function intensityHeight(normalizedIntensity: number | null, chartHeight: number): number {
  const minimumHeight = Math.min(24, chartHeight);
  if (normalizedIntensity === null) return minimumHeight;
  return minimumHeight + normalizedIntensity * Math.max(0, chartHeight - minimumHeight);
}

function intensityColor(normalizedIntensity: number | null): string | undefined {
  if (normalizedIntensity === null) return undefined;
  return INTENSITY_ZONES[getIntensityZone(normalizedIntensity * 100)].color;
}

function occurrenceWeight(
  duration: ActivityPlanPresentationModel["occurrences"][number]["duration"],
): number {
  switch (duration.type) {
    case "time":
      return Math.max(1, Math.min(4, duration.seconds / 60));
    case "distance":
      return Math.max(1, Math.min(4, duration.meters / 500));
    case "repetitions":
      return Math.max(1, Math.min(4, duration.count / 5));
    case "untilFinished":
      return 1;
  }
}

function durationLabel(
  duration: ActivityPlanPresentationModel["occurrences"][number]["duration"],
): string {
  switch (duration.type) {
    case "time":
      return `${duration.seconds} seconds`;
    case "distance":
      return `${duration.meters} meters`;
    case "repetitions":
      return `${duration.count} repetitions`;
    case "untilFinished":
      return "until finished";
  }
}

function adjacentTransitionCategories(
  timeline: ActivityPlanPresentationModel["occurrences"],
  transitionIndex: number,
) {
  const previous = timeline
    .slice(0, transitionIndex)
    .reverse()
    .find((occurrence) => occurrence.role === "activity")?.category;
  const next = timeline
    .slice(transitionIndex + 1)
    .find((occurrence) => occurrence.role === "activity")?.category;
  return {
    from: getActivityCategoryConfig(previous ?? "other"),
    to: getActivityCategoryConfig(next ?? "other"),
  };
}

export function TimelineChart({
  structure,
  presentation,
  height = 120,
  compact = false,
  selectedIntervalId,
  onIntervalPress,
}: TimelineChartProps) {
  const model = useMemo(
    () => presentation ?? deriveActivityPlanPresentation(structure),
    [presentation, structure],
  );
  const timeline = model?.occurrences ?? [];

  if (timeline.length === 0) {
    return (
      <View style={{ height }} className="items-center justify-center bg-muted/20">
        <Text className="text-xs text-muted-foreground">No segments</Text>
      </View>
    );
  }

  return (
    <View style={{ height, width: "100%" }} testID="timeline-chart">
      <View className="h-full w-full flex-row items-end">
        {timeline.map((occurrence, index) => {
          const isBoundary = occurrence.role !== "activity";
          const isTransition = occurrence.role === "transition";
          const selected = occurrence.intervalId === selectedIntervalId;
          const transitionCategories = isTransition
            ? adjacentTransitionCategories(timeline, index)
            : null;
          const label = [
            `${occurrence.role} segment ${occurrence.globalOrdinal + 1}`,
            transitionCategories
              ? `${transitionCategories.from.name} to ${transitionCategories.to.name}`
              : null,
            occurrence.category,
            occurrence.intensityLabel,
            durationLabel(occurrence.duration),
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <Pressable
              key={occurrence.occurrenceId}
              testID={`timeline-occurrence-${index}`}
              onPress={() => occurrence.intervalId && onIntervalPress?.(occurrence.intervalId)}
              disabled={!occurrence.intervalId || !onIntervalPress}
              accessibilityLabel={label}
              accessibilityRole={occurrence.intervalId && onIntervalPress ? "button" : undefined}
              accessibilityState={selected ? { selected: true } : undefined}
              className={`justify-end rounded-md ${isTransition ? "" : `border ${selected ? "border-primary" : "border-border"} ${isBoundary || occurrence.normalizedIntensity === null ? "bg-muted" : ""}`}`}
              style={{
                backgroundColor: isBoundary
                  ? undefined
                  : intensityColor(occurrence.normalizedIntensity),
                height: isBoundary
                  ? isTransition
                    ? 52
                    : 28
                  : intensityHeight(occurrence.normalizedIntensity, height),
                flexBasis: 0,
                flexGrow: isTransition ? 1 : occurrenceWeight(occurrence.duration),
                minWidth: 0,
              }}
            >
              {transitionCategories ? (
                <>
                  <View
                    accessible={false}
                    className="mb-1 max-w-full flex-row items-center justify-center overflow-hidden"
                    testID={`timeline-transition-${index}`}
                  >
                    <Icon
                      as={transitionCategories.from.icon}
                      className={transitionCategories.from.color}
                      size={14}
                      testID={`timeline-transition-${index}-from`}
                    />
                    <Icon
                      as={ArrowRight}
                      className="text-muted-foreground"
                      size={12}
                      testID={`timeline-transition-${index}-arrow`}
                    />
                    <Icon
                      as={transitionCategories.to.icon}
                      className={transitionCategories.to.color}
                      size={14}
                      testID={`timeline-transition-${index}-to`}
                    />
                  </View>
                  <View className="h-5 rounded-md border border-border bg-muted" />
                </>
              ) : !compact && isBoundary ? (
                <Text className="px-1 pb-1 text-[9px] text-foreground" numberOfLines={1}>
                  {occurrence.role}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
