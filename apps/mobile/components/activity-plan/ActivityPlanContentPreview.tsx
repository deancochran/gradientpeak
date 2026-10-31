import type {
  ActivityPlanDraftRepeat,
  ActivityPlanDraftStep,
  ActivityPlanDuration,
  ActivityPlanPresentationModel,
  ActivityPlanStep,
  ActivityPlanStructure,
  ActivityPlanTarget,
  AthletePerformanceTargetFacts,
  CanonicalActivityCategory,
} from "@repo/core";
import {
  activityPlanTargetSchema,
  consolidateActivityPlanText,
  deriveActivityPlanPresentation,
  deriveEffectiveActivityPlanStepLabel,
  getActivityPlanSessionFlowTargetPresentations,
  kilometersPerHourToPaceSeconds,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanSessionFlow,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { formatPace } from "@repo/core/calculations";
import { formatDistance } from "@repo/core/units";
import { formatDurationSec } from "@repo/core/utils/dates";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { TimelineChart } from "@/components/activity-plan/activity/TimelineChart";

type ActivityPlanPreviewLike = {
  structure?: unknown;
};

type ActivityPlanContentPreviewProps = {
  compact?: boolean;
  plan: ActivityPlanPreviewLike | null | undefined;
  presentation?: ActivityPlanPresentationModel | null;
  personalizeTargets?: boolean;
  personalizationAvailable?: boolean;
  personalizationFactsLoading?: boolean;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  onPersonalizeTargetsChange?: (enabled: boolean) => void;
  showPersonalizationControl?: boolean;
  size?: "small" | "medium" | "large";
  testIDPrefix?: string;
};

function resolvedTargets(targets: readonly unknown[]): ActivityPlanTarget[] {
  return targets.flatMap((target) => {
    const parsed = activityPlanTargetSchema.safeParse(target);
    return parsed.success ? [parsed.data] : [];
  });
}

function flattenSteps(structure: ActivityPlanStructure | null): ActivityPlanStep[] {
  if (!structure) return [];
  const steps: ActivityPlanStep[] = [];
  for (const item of structure.items) {
    if (item.type === "step") steps.push(item);
    else
      for (let iteration = 0; iteration < item.count; iteration += 1) {
        steps.push(...item.steps);
      }
  }
  return steps;
}

function formatStepDuration(duration: ActivityPlanDuration | null | undefined): string | null {
  if (!duration) return null;
  if (duration.type === "time" && typeof duration.seconds === "number") {
    return formatDurationSec(duration.seconds);
  }

  if (duration.type === "distance" && typeof duration.meters === "number") {
    return formatDistance(duration.meters);
  }

  if (duration.type === "repetitions" && typeof duration.count === "number") {
    return `${duration.count} reps`;
  }

  if (duration.type === "untilFinished") {
    return "Until finished";
  }

  return null;
}

/** Compact canonical V5 step readout used by both the authoring outline and previews. */
export function ActivityPlanStepPreview({
  step,
  activityCategory,
  personalizeTargets = false,
  performanceTargets,
  asOf = new Date().toISOString(),
}: {
  step: Pick<
    ActivityPlanStep | ActivityPlanDraftStep,
    "instructions" | "name" | "duration" | "targets"
  >;
  activityCategory: CanonicalActivityCategory;
  personalizeTargets?: boolean;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  asOf?: string;
}) {
  const label = step.name ?? "Step";
  const duration = formatStepDuration(step.duration);
  const targetLabels = orderActivityPlanTargetsForPresentation(
    resolvedTargets(step.targets ?? []),
  ).map((target) =>
    formatPresentedTarget({
      target,
      activityCategory,
      fallback: formatTarget({
        target,
        activityCategory,
        personalizeTargets,
        ...(performanceTargets !== undefined ? { performanceTargets } : {}),
        asOf,
      }),
    }),
  );
  const detailSummary = [
    duration,
    targetLabels.length > 0 ? `at ${targetLabels.join(" · ")}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return (
    <View className="gap-1">
      <Text className="font-medium text-foreground">{label}</Text>
      {detailSummary ? (
        <Text className="text-sm text-muted-foreground">{detailSummary}</Text>
      ) : (
        <Text className="text-sm text-destructive">Duration required</Text>
      )}
      {step.instructions ? (
        <Text className="text-sm text-muted-foreground">{step.instructions}</Text>
      ) : null}
    </View>
  );
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

/** Running prescriptions use the editor's whole-second pace notation. */
function formatPresentedTarget(input: {
  target: ActivityPlanTarget;
  activityCategory: CanonicalActivityCategory;
  fallback: string;
}): string {
  if (input.activityCategory !== "run" || input.target.type !== "speed") return input.fallback;
  return `${formatPace(kilometersPerHourToPaceSeconds(input.target.intensity))}/km`;
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

type ActivityPlanRepeatStepsProps = {
  activityCategory: CanonicalActivityCategory;
  asOf?: string;
  repeat: ActivityPlanDraftRepeat;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalizeTargets?: boolean;
  onStepPress?: (stepId: string) => void;
  onDurationPress?: (stepId: string) => void;
  onTargetPress?: (stepId: string, targetIndex: number) => void;
  /** A parent interval heading already provides the sole-step identity. */
  suppressStepLabel?: string;
};

/**
 * The single app-owned seam for readable authored steps. Detail and authoring
 * both use it so targets, units, and optional instructions stay in parity.
 */
export function ActivityPlanRepeatSteps({
  activityCategory,
  asOf = new Date().toISOString(),
  repeat,
  performanceTargets,
  personalizeTargets = false,
  onStepPress,
  onDurationPress,
  onTargetPress,
  suppressStepLabel,
}: ActivityPlanRepeatStepsProps) {
  const sessionFlowResolution = useMemo(
    () =>
      resolveActivityPlanSessionFlow({
        structure: {
          version: 5,
          activity_category: activityCategory,
          items: [repeat],
        },
        ...(personalizeTargets && performanceTargets ? { performanceTargets } : {}),
        personalize: personalizeTargets,
      }),
    [activityCategory, repeat, performanceTargets, personalizeTargets],
  );

  return (
    <View className="gap-2">
      {repeat.steps.map((step, stepIndex) => {
        const effectiveStepLabel = deriveEffectiveActivityPlanStepLabel({
          activityCategory,
          step: {
            name: step.name,
            targets: resolvedTargets(step.targets ?? []),
          },
        });
        const stepLabel =
          normalizeLabel(effectiveStepLabel) === normalizeLabel(suppressStepLabel)
            ? null
            : effectiveStepLabel;
        const targetLabels = getActivityPlanSessionFlowTargetPresentations(
          sessionFlowResolution,
          step.id,
        );
        // Display order is semantic, while the draft editor is addressed by its
        // authored array index. Preserve that identity before sorting so a tap
        // always repairs the exact target the athlete selected.
        const resolvedTargetEntries = (step.targets ?? []).flatMap((rawTarget, rawIndex) => {
          const parsed = activityPlanTargetSchema.safeParse(rawTarget);
          return parsed.success ? [{ rawIndex, rawTarget, target: parsed.data }] : [];
        });
        const resolvedTargetEntryByReference = new Map(
          resolvedTargetEntries.map((entry) => [entry.target, entry]),
        );
        const targets = orderActivityPlanTargetsForPresentation(
          resolvedTargetEntries.map((entry) => entry.target),
        )
          .map((target, presentationIndex) => {
            const entry = resolvedTargetEntryByReference.get(target);
            if (!entry) return null;
            return {
              label: formatPresentedTarget({
                target,
                activityCategory,
                fallback:
                  targetLabels[presentationIndex]?.label ??
                  formatTarget({
                    target,
                    activityCategory,
                    personalizeTargets,
                    ...(performanceTargets !== undefined ? { performanceTargets } : {}),
                    asOf,
                  }),
              }),
              rawIndex: entry.rawIndex,
              rawTarget: entry.rawTarget,
            };
          })
          .filter(
            (
              target,
            ): target is { label: string; rawIndex: number; rawTarget: ActivityPlanTarget } =>
              target !== null,
          );
        const duration = formatStepDuration(step.duration);
        const detailSummary = [
          duration,
          targets.length > 0 ? `at ${targets.map((target) => target.label).join(" · ")}` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ");
        const instructions = consolidateActivityPlanText(
          step.instructions,
          undefined,
          "Instructions",
        );

        return (
          <View
            key={step.id || `${repeat.id}-${stepIndex}`}
            className={stepIndex > 0 ? "mt-3 gap-1.5" : "gap-1.5"}
          >
            {stepLabel ? (
              <Pressable
                accessibilityRole={onStepPress ? "button" : undefined}
                accessibilityLabel={onStepPress ? `Edit step ${stepLabel}` : undefined}
                onPress={onStepPress ? () => onStepPress(step.id) : undefined}
              >
                <Text className="text-base font-semibold leading-5 text-foreground">
                  {stepLabel}
                </Text>
              </Pressable>
            ) : null}
            {detailSummary ? (
              onDurationPress || onTargetPress ? (
                <View className="flex-row flex-wrap gap-1">
                  {duration ? (
                    <Pressable
                      accessibilityRole={onDurationPress ? "button" : undefined}
                      accessibilityLabel={
                        onDurationPress ? `Edit duration for ${stepLabel ?? "step"}` : undefined
                      }
                      onPress={onDurationPress ? () => onDurationPress(step.id) : undefined}
                    >
                      <Text className="text-sm leading-5 text-foreground">{duration}</Text>
                    </Pressable>
                  ) : null}
                  {targets.map((target, targetIndex) => (
                    <Pressable
                      key={`${step.id}-${target.rawIndex}`}
                      accessibilityRole={onTargetPress ? "button" : undefined}
                      accessibilityLabel={
                        onTargetPress
                          ? `Edit ${target.label} for ${stepLabel ?? "step"}`
                          : undefined
                      }
                      onPress={
                        onTargetPress
                          ? () => {
                              const authoredTarget = step.targets?.[target.rawIndex];
                              // A presentation sort must never turn into a stale or
                              // positional editor address. The raw target reference and
                              // its type must still identify this exact authored slot.
                              if (
                                authoredTarget !== target.rawTarget ||
                                authoredTarget.type !== target.rawTarget.type
                              )
                                return;
                              onTargetPress(step.id, target.rawIndex);
                            }
                          : undefined
                      }
                    >
                      <Text className="text-sm leading-5 text-foreground">
                        {targetIndex === 0 ? "at" : "·"}
                        {target.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text className="text-sm leading-5 text-foreground">{detailSummary}</Text>
              )
            ) : null}
            {instructions ? (
              <Text className="text-sm leading-5 text-muted-foreground">{instructions}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function ActivityPlanContentPreview({
  compact = false,
  plan,
  personalizeTargets = false,
  personalizationAvailable = true,
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
        ...(personalizeTargets && performanceTargets ? { performanceTargets } : {}),
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
  const personalizationDisabled =
    factsPending || !personalizationAvailable || !sessionFlowResolution.eligibility.eligible;

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
            {structure?.items.map((item, index) => {
              const isRepeat = item.type === "repeat";
              return (
                <View
                  key={item.id}
                  className={index === 0 ? "py-2" : "border-t border-border/60 py-3"}
                >
                  {isRepeat ? (
                    <Text className="text-sm font-semibold text-muted-foreground">
                      Repeat × {item.count}
                    </Text>
                  ) : null}
                  <View
                    className={`${isRepeat ? "mt-2 border-l-2 border-primary/30 pl-3" : ""} gap-2`}
                  >
                    {isRepeat ? (
                      <ActivityPlanRepeatSteps
                        activityCategory={structure.activity_category}
                        asOf={asOf}
                        repeat={item}
                        {...(performanceTargets !== undefined ? { performanceTargets } : {})}
                        personalizeTargets={personalizeTargets}
                      />
                    ) : (
                      <ActivityPlanStepPreview
                        activityCategory={structure.activity_category}
                        step={item}
                        asOf={asOf}
                        {...(performanceTargets !== undefined ? { performanceTargets } : {})}
                        personalizeTargets={personalizeTargets}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
