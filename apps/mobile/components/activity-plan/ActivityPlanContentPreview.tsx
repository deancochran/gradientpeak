import type {
  ActivityPlanDuration,
  ActivityPlanIntervalStep,
  ActivityPlanPresentationModel,
  ActivityPlanStructure,
  ActivityPlanTarget,
  AthletePerformanceTargetFacts,
  CanonicalActivityCategory,
} from "@repo/core";
import {
  deriveActivityPlanPresentation,
  getActivityPlanSessionFlowTargetPresentations,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanSessionFlow,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { formatDurationSec } from "@repo/core/utils/dates";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";

type ActivityPlanPreviewLike = {
  structure?: unknown;
};

type ActivityPlanContentPreviewProps = {
  compact?: boolean;
  plan: ActivityPlanPreviewLike | null | undefined;
  presentation?: ActivityPlanPresentationModel | null;
  personalizeTargets?: boolean;
  personalizationFactsLoading?: boolean;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  onPersonalizeTargetsChange?: (enabled: boolean) => void;
  showPersonalizationControl?: boolean;
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

function formatTarget(input: {
  target: ActivityPlanTarget;
  activityCategory: CanonicalActivityCategory;
  personalizeTargets: boolean;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  asOf: string;
}): string {
  return resolveActivityPlanTargetPresentation({
    target: input.target,
    activityCategory: input.activityCategory,
    ...(input.personalizeTargets ? { performanceTargets: input.performanceTargets } : {}),
    asOf: input.asOf,
  }).label;
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

function getIntervalLabel(value: string | null | undefined, segmentTitle: string): string | null {
  const label = getDistinctLabel(value, [segmentTitle]);
  return label && !/^interval\s+\d+$/iu.test(label) ? label : null;
}

function isRedundantActivitySegmentLabel(value: string, activityCategory: string): boolean {
  const normalized = normalizeLabel(value);
  const category = normalizeLabel(activityCategory);
  return normalized === category || normalized === `${category} activity`;
}

export function ActivityPlanContentPreview({
  compact = false,
  plan,
  personalizeTargets = false,
  personalizationFactsLoading = false,
  performanceTargets,
  onPersonalizeTargetsChange,
  presentation,
  showPersonalizationControl = false,
  size,
  testIDPrefix,
}: ActivityPlanContentPreviewProps) {
  const resolvedSize = size ?? (compact ? "small" : "large");
  const sessionFlowResolution = useMemo(
    () =>
      resolveActivityPlanSessionFlow({
        structure: plan?.structure,
        ...(performanceTargets ? { performanceTargets } : {}),
        personalize: personalizeTargets,
      }),
    [performanceTargets, personalizeTargets, plan?.structure],
  );
  const timelinePresentation = useMemo(
    () =>
      sessionFlowResolution.authoredStructure
        ? deriveActivityPlanPresentation(sessionFlowResolution.authoredStructure)
        : (presentation ?? deriveActivityPlanPresentation(plan?.structure)),
    [plan?.structure, presentation, sessionFlowResolution.authoredStructure],
  );
  const structure = sessionFlowResolution.structure ?? presentation?.structure ?? null;
  const steps = useMemo(() => flattenSteps(structure), [structure]);
  const hasTimeline = Boolean(timelinePresentation?.occurrences.length);
  const maxVisibleSteps = resolvedSize === "small" ? 2 : resolvedSize === "medium" ? 3 : 4;
  const visibleSteps = steps.slice(0, maxVisibleSteps);
  const hasSessionFlow = visibleSteps.length > 0 && resolvedSize === "large";
  const asOf = performanceTargets?.asOf ?? new Date().toISOString();
  const factsPending = personalizationFactsLoading && !sessionFlowResolution.eligibility.eligible;
  const personalizationDisabled = factsPending || !sessionFlowResolution.eligibility.eligible;

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
              presentation={timelinePresentation}
              height={resolvedSize === "small" ? 72 : resolvedSize === "medium" ? 92 : 104}
              compact={resolvedSize !== "large"}
            />
          ) : null}
        </View>
      ) : null}

      {hasSessionFlow ? (
        <View className="rounded-2xl bg-muted/30 px-3 py-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Session Flow
              </Text>
            </View>
            {showPersonalizationControl && onPersonalizeTargetsChange ? (
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-medium text-foreground">Calculated targets</Text>
                <Switch
                  accessibilityLabel="Calculated targets"
                  checked={personalizeTargets && !personalizationDisabled}
                  disabled={personalizationDisabled}
                  onCheckedChange={onPersonalizeTargetsChange}
                  testID="activity-plan-personalize-targets"
                />
              </View>
            ) : null}
          </View>
          <View className="mt-2">
            {structure?.segments.map((segment, index) => {
              const segmentTitle = segment.name?.trim() || `Segment ${index + 1}`;
              const showSegmentTitle =
                segment.role !== "activity" ||
                !isRedundantActivitySegmentLabel(segmentTitle, structure.activity_category);
              return (
                <View
                  key={segment.id}
                  className={index === 0 ? "py-2" : "border-t border-border/60 py-3"}
                >
                  {showSegmentTitle || segment.notes || segment.role !== "activity" ? (
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        {showSegmentTitle ? (
                          <Text className="text-base font-semibold leading-5 text-foreground">
                            {segmentTitle}
                          </Text>
                        ) : null}
                        {segment.notes ? (
                          <Text className="text-sm leading-5 text-muted-foreground">
                            {segment.notes}
                          </Text>
                        ) : null}
                      </View>
                      {segment.role !== "activity" ? (
                        <Text className="text-sm font-medium text-foreground">
                          {formatStepDuration(segment.duration)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {segment.role === "activity"
                    ? segment.intervals.map((interval) => {
                        const intervalLabel = getIntervalLabel(interval.name, segmentTitle);
                        const showIntervalHeader = Boolean(
                          intervalLabel || interval.repetitions > 1,
                        );

                        return (
                          <View
                            key={interval.id}
                            className={`mt-4 gap-2 ${interval.repetitions > 1 ? "border-l-2 border-primary/30 pl-3" : ""}`}
                          >
                            {showIntervalHeader ? (
                              <Text className="text-base leading-5 text-foreground">
                                {[
                                  intervalLabel,
                                  interval.repetitions > 1
                                    ? `Repeat ${interval.repetitions}×`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            ) : null}
                            {interval.notes ? (
                              <Text className="text-xs leading-4 text-muted-foreground">
                                {interval.notes}
                              </Text>
                            ) : null}
                            {interval.steps.map((step, stepIndex) => {
                              const stepLabel = getDistinctLabel(step.name, [
                                segmentTitle,
                                interval.name,
                              ]);
                              const targetLabels = getActivityPlanSessionFlowTargetPresentations(
                                sessionFlowResolution,
                                step.id,
                              );
                              const targets =
                                targetLabels.length > 0
                                  ? targetLabels.map((target) => target.label)
                                  : orderActivityPlanTargetsForPresentation(step.targets ?? []).map(
                                      (target) =>
                                        formatTarget({
                                          target,
                                          activityCategory: structure?.activity_category ?? "other",
                                          personalizeTargets,
                                          ...(performanceTargets !== undefined
                                            ? { performanceTargets }
                                            : {}),
                                          asOf,
                                        }),
                                    );
                              const duration = formatStepDuration(step.duration);
                              const detailSummary = [
                                duration,
                                targets.length > 0 ? `at ${targets.join(" · ")}` : null,
                              ]
                                .filter((value): value is string => Boolean(value))
                                .join(" ");

                              return (
                                <View
                                  key={step.id || `${interval.id}-${stepIndex}`}
                                  className={`gap-1.5 ${stepIndex > 0 ? "mt-3" : ""}`}
                                >
                                  {stepLabel ? (
                                    <Text className="text-base font-semibold leading-5 text-foreground">
                                      {stepLabel}
                                    </Text>
                                  ) : null}
                                  {detailSummary ? (
                                    <Text className="text-sm leading-5 text-foreground">
                                      {detailSummary}
                                    </Text>
                                  ) : null}
                                  {step.description ? (
                                    <Text className="mt-1 text-sm leading-5 text-muted-foreground">
                                      {step.description}
                                    </Text>
                                  ) : null}
                                  {step.notes ? (
                                    <Text className="text-sm leading-5 text-muted-foreground">
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
