import type {
  ActivityPlanDuration,
  ActivityPlanIntervalStep,
  ActivityPlanPresentationModel,
  ActivityPlanStructure,
  ActivityPlanTarget,
} from "@repo/core";
import { deriveActivityPlanPresentation } from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";

type ActivityPlanPreviewLike = {
  estimated_duration_minutes?: number | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    estimated_distance?: number | null;
  } | null;
  structure?: unknown;
};

type ActivityPlanContentPreviewProps = {
  compact?: boolean;
  plan: ActivityPlanPreviewLike | null | undefined;
  presentation?: ActivityPlanPresentationModel | null;
  size?: "small" | "medium" | "large";
  testIDPrefix?: string;
};

function flattenSteps(structure: ActivityPlanStructure | null): ActivityPlanIntervalStep[] {
  if (!structure) return [];
  const steps: ActivityPlanIntervalStep[] = [];
  for (const segment of structure.segments) {
    if (segment.role !== "activity") continue;
    for (const interval of segment.intervals) {
      for (let iteration = 0; iteration < interval.repetitions; iteration += 1) {
        steps.push(...interval.steps);
      }
    }
  }
  return steps;
}

function formatStepDuration(duration: ActivityPlanDuration): string | null {
  if (duration.type === "time" && typeof duration.seconds === "number") {
    return formatDurationSec(duration.seconds);
  }

  if (duration.type === "distance" && typeof duration.meters === "number") {
    return `${(duration.meters / 1000).toFixed(2)} km`;
  }

  if (duration.type === "repetitions" && typeof duration.count === "number") {
    return `${duration.count} reps`;
  }

  if (duration.type === "untilFinished") {
    return "Until finished";
  }

  return null;
}

function formatTarget(target: ActivityPlanTarget): string {
  switch (target.type) {
    case "RPE":
      return `RPE ${target.intensity}`;
    case "%FTP":
      return `${target.intensity}% FTP`;
    case "%MaxHR":
      return `${target.intensity}% max HR`;
    case "%ThresholdHR":
      return `${target.intensity}% threshold HR`;
    case "watts":
      return `${target.intensity} W`;
    case "cadence":
      return `${target.intensity} rpm`;
    case "speed":
      return `${target.intensity} km/h`;
    default:
      return `${target.intensity} ${target.type}`;
  }
}

function normalizeLabel(value: string | null | undefined): string {
  return (
    value
      ?.trim()
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
      .trim() ?? ""
  );
}

function getDistinctLabel(
  value: string | null | undefined,
  parentLabels: Array<string | null | undefined>,
): string | null {
  const normalizedValue = normalizeLabel(value);
  if (!normalizedValue) return null;

  const duplicatesParent = parentLabels.some(
    (parentLabel) => normalizeLabel(parentLabel) === normalizedValue,
  );
  return duplicatesParent ? null : value?.trim() || null;
}

function labelContainsSemantic(value: string, semantic: string): boolean {
  const labelWords = normalizeLabel(value).split(" ");
  return labelWords.includes(normalizeLabel(semantic));
}

function formatSemanticLabel(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

export function ActivityPlanContentPreview({
  compact = false,
  plan,
  presentation,
  size,
  testIDPrefix,
}: ActivityPlanContentPreviewProps) {
  const resolvedSize = size ?? (compact ? "small" : "large");
  const presentationModel = useMemo(
    () => presentation ?? deriveActivityPlanPresentation(plan?.structure),
    [plan?.structure, presentation],
  );
  const structure = presentationModel?.structure ?? null;
  const steps = useMemo(() => flattenSteps(structure), [structure]);
  const hasTimeline = Boolean(presentationModel?.occurrences.length);
  const maxVisibleSteps = resolvedSize === "small" ? 2 : resolvedSize === "medium" ? 3 : 4;
  const visibleSteps = steps.slice(0, maxVisibleSteps);
  const hasSessionFlow = visibleSteps.length > 0 && resolvedSize === "large";

  if (!plan || (!hasTimeline && !hasSessionFlow)) {
    return null;
  }

  return (
    <View className={resolvedSize === "small" ? "gap-3" : "gap-4"} testID={testIDPrefix}>
      {hasTimeline ? (
        <View
          className="overflow-hidden rounded-xl"
          testID={testIDPrefix ? `${testIDPrefix}-timeline` : undefined}
        >
          {structure ? (
            <TimelineChart
              presentation={presentationModel}
              height={resolvedSize === "small" ? 72 : resolvedSize === "medium" ? 92 : 104}
              compact={resolvedSize !== "large"}
            />
          ) : null}
        </View>
      ) : null}

      {hasSessionFlow ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session Flow
          </Text>
          <View className="mt-2">
            {structure?.segments.map((segment, index) => {
              const segmentTitle = segment.name?.trim() || `Segment ${index + 1}`;
              const semantic =
                segment.role === "activity" ? segment.activity_category : segment.role;
              const showSemantic = !labelContainsSemantic(segmentTitle, semantic);

              return (
                <View
                  key={segment.id}
                  className={index === 0 ? "py-2" : "border-t border-border/60 py-3"}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold text-foreground">{segmentTitle}</Text>
                      {showSemantic ? (
                        <Text className="text-xs text-muted-foreground">
                          {formatSemanticLabel(semantic)}
                        </Text>
                      ) : null}
                      {segment.notes ? (
                        <Text className="text-xs leading-4 text-muted-foreground">
                          {segment.notes}
                        </Text>
                      ) : null}
                    </View>
                    {segment.role !== "activity" ? (
                      <Text className="text-xs font-medium text-foreground/80">
                        {formatStepDuration(segment.duration)}
                      </Text>
                    ) : null}
                  </View>
                  {segment.role === "activity"
                    ? segment.intervals.map((interval) => {
                        const intervalLabel = getDistinctLabel(interval.name, [segmentTitle]);
                        const showIntervalHeader = Boolean(
                          intervalLabel || interval.repetitions > 1,
                        );

                        return (
                          <View key={interval.id} className="mt-2 gap-2.5">
                            {showIntervalHeader ? (
                              <Text className="text-xs font-semibold text-muted-foreground">
                                {intervalLabel}
                                {interval.repetitions > 1 ? ` · ${interval.repetitions}x` : ""}
                              </Text>
                            ) : null}
                            {interval.steps.map((step, stepIndex) => {
                              const stepLabel = getDistinctLabel(step.name, [
                                segmentTitle,
                                interval.name,
                              ]);
                              const detailSummary = [
                                ...(step.targets?.map((target) => formatTarget(target)) ?? []),
                                formatStepDuration(step.duration),
                              ]
                                .filter((value): value is string => Boolean(value))
                                .join(" · ");

                              return (
                                <View
                                  key={step.id || `${interval.id}-${stepIndex}`}
                                  className="gap-1.5"
                                >
                                  {stepLabel ? (
                                    <Text className="text-sm font-medium text-foreground">
                                      {stepLabel}
                                    </Text>
                                  ) : null}
                                  {detailSummary ? (
                                    <Text className="text-xs font-medium text-foreground/80">
                                      {detailSummary}
                                    </Text>
                                  ) : null}
                                  {step.description ? (
                                    <Text className="text-xs leading-4 text-muted-foreground">
                                      {step.description}
                                    </Text>
                                  ) : null}
                                  {step.notes ? (
                                    <Text className="text-xs leading-4 text-muted-foreground">
                                      {step.notes}
                                    </Text>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })
                    : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
