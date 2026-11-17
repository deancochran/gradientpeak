import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityTarget, ActivityTargetType } from "../targets/schema";
import { type CompiledActivityPlan, compileValidatedActivityPlan } from "./compile";
import type { ActivityPlanDuration, ActivityPlanStructure } from "./structure-schema";
import { activityPlanStructureSchema } from "./structure-schema";

export type ActivityPlanIntensityBasis =
  | "threshold_percent"
  | "perceived_effort"
  | "relative_within_plan"
  | "unavailable";

export type ActivityPlanPresentationOccurrence = {
  activity_category: CanonicalActivityCategory;
  duration: ActivityPlanDuration;
  globalOrdinal: number;
  intensityBasis: ActivityPlanIntensityBasis;
  intensityLabel: string | null;
  repeatId?: string;
  stepId: string;
  visualIntensity: number | null;
  occurrenceId: string;
  role: "activity";
};

export type ActivityPlanPresentationModel = {
  compiled: CompiledActivityPlan;
  occurrences: readonly ActivityPlanPresentationOccurrence[];
  activity_category: CanonicalActivityCategory;
  stepCount: number;
  structure: ActivityPlanStructure;
};

export type ActivityPlanBlockSummary = {
  hasOpenDuration: boolean;
  hasPartialQuantities: boolean;
  perRepeat: { distanceMeters: number; repetitionCount: number; timedSeconds: number };
  repetitions: number;
  total: { distanceMeters: number; repetitionCount: number; timedSeconds: number };
};

const thresholdPercentTypes = new Set<ActivityTargetType>(["%FTP", "%MaxHR", "%ThresholdHR"]);
const relativeEffortTypes = new Set<ActivityTargetType>(["watts", "bpm", "speed"]);
const targetPriority: Record<ActivityTargetType, number> = {
  rest: 0,
  RPE: 1,
  "%FTP": 2,
  "%ThresholdHR": 3,
  "%MaxHR": 4,
  watts: 5,
  bpm: 6,
  speed: 7,
  cadence: 8,
};

type TargetRange = { maximum: number; minimum: number };
type RelativeTargetOccurrence = {
  activity_category: CanonicalActivityCategory | null;
  targets: readonly ActivityTarget[];
};

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function selectEffortTarget(targets: readonly ActivityTarget[]): ActivityTarget | null {
  const candidates = targets.filter((target) => target.type !== "cadence");
  const highestPriority = candidates.reduce(
    (highest, target) => Math.min(highest, targetPriority[target.type]),
    Number.POSITIVE_INFINITY,
  );
  const finalists = candidates.filter((target) => targetPriority[target.type] === highestPriority);
  const first = finalists[0];
  if (!first) return null;
  return finalists.every((target) => {
    if (target.type !== first.type) return false;
    return (
      target.type === "rest" ||
      ("intensity" in target && "intensity" in first && target.intensity === first.intensity)
    );
  })
    ? first
    : null;
}

function formatTarget(target: ActivityTarget): string {
  return target.type === "rest" ? "Rest" : `${target.type} ${target.intensity}`;
}

function relativeRangeKey(
  activity_category: CanonicalActivityCategory | null,
  targetType: ActivityTargetType,
): string {
  return `${activity_category ?? "none"}:${targetType}`;
}

function collectRelativeRanges(
  occurrences: readonly RelativeTargetOccurrence[],
): Map<string, TargetRange> {
  const ranges = new Map<string, TargetRange>();
  for (const occurrence of occurrences) {
    const target = selectEffortTarget(occurrence.targets);
    if (!target || target.type === "rest" || !relativeEffortTypes.has(target.type)) continue;
    const key = relativeRangeKey(occurrence.activity_category, target.type);
    const current = ranges.get(key);
    ranges.set(key, {
      minimum: current ? Math.min(current.minimum, target.intensity) : target.intensity,
      maximum: current ? Math.max(current.maximum, target.intensity) : target.intensity,
    });
  }
  return ranges;
}

function normalizeTarget(
  target: ActivityTarget | null,
  activity_category: CanonicalActivityCategory | null,
  ranges: ReadonlyMap<string, TargetRange>,
): Pick<
  ActivityPlanPresentationOccurrence,
  "intensityBasis" | "intensityLabel" | "visualIntensity"
> {
  if (!target) {
    return { intensityBasis: "unavailable", intensityLabel: null, visualIntensity: null };
  }

  if (target.type === "rest") {
    return { intensityBasis: "unavailable", intensityLabel: "Rest", visualIntensity: null };
  }

  if (target.type === "RPE") {
    return {
      intensityBasis: "perceived_effort",
      intensityLabel: formatTarget(target),
      visualIntensity: clampUnitInterval(target.intensity / 10),
    };
  }

  if (thresholdPercentTypes.has(target.type)) {
    return {
      intensityBasis: "threshold_percent",
      intensityLabel: formatTarget(target),
      visualIntensity: clampUnitInterval(target.intensity / 100),
    };
  }

  const range = ranges.get(relativeRangeKey(activity_category, target.type));
  if (!range) {
    return {
      intensityBasis: "unavailable",
      intensityLabel: formatTarget(target),
      visualIntensity: null,
    };
  }

  const relativePosition =
    range.maximum === range.minimum
      ? 0.5
      : (target.intensity - range.minimum) / (range.maximum - range.minimum);
  return {
    intensityBasis: "relative_within_plan",
    intensityLabel: formatTarget(target),
    visualIntensity: 0.2 + clampUnitInterval(relativePosition) * 0.8,
  };
}

/**
 * Parses and compiles an activity-plan structure once into a deterministic model for visual consumers.
 * Absolute targets without an athlete threshold are shown only relative to matching targets in this plan.
 */
export function deriveActivityPlanPresentation(
  input: unknown,
): ActivityPlanPresentationModel | null {
  const parsed = activityPlanStructureSchema.safeParse(input);
  if (!parsed.success) return null;

  const compiled = compileValidatedActivityPlan(parsed.data);
  const ranges = collectRelativeRanges(compiled.occurrences);
  const occurrences = compiled.occurrences.map<ActivityPlanPresentationOccurrence>((occurrence) => {
    const intensity = normalizeTarget(
      selectEffortTarget(occurrence.targets),
      occurrence.activity_category,
      ranges,
    );
    return {
      activity_category: occurrence.activity_category,
      duration: occurrence.duration,
      globalOrdinal: occurrence.globalOrdinal,
      ...(occurrence.repeatId ? { repeatId: occurrence.repeatId } : {}),
      stepId: occurrence.stepId,
      occurrenceId: occurrence.occurrenceId,
      role: "activity",
      ...intensity,
    };
  });

  return {
    compiled,
    occurrences,
    activity_category: compiled.activity_category,
    stepCount: occurrences.length,
    structure: parsed.data,
  };
}

/** Summarizes compiler-expanded work without converting distance or open work into time. */
export function summarizeCompiledActivityPlanRepeat(
  compiled: CompiledActivityPlan,
  repeatId: string,
): ActivityPlanBlockSummary | null {
  const occurrences = compiled.occurrences.filter((occurrence) => occurrence.repeatId === repeatId);
  const firstOccurrence = occurrences[0];
  if (!firstOccurrence) return null;

  const repetitions = occurrences.reduce(
    (maximum, occurrence) => Math.max(maximum, (occurrence.repeatIteration ?? -1) + 1),
    0,
  );
  const summarize = (values: readonly (typeof occurrences)[number][]) => {
    let distanceMeters = 0;
    let repetitionCount = 0;
    let timedSeconds = 0;
    let hasOpenDuration = false;
    for (const occurrence of values) {
      if (occurrence.duration.type === "time") timedSeconds += occurrence.duration.seconds;
      else if (occurrence.duration.type === "distance")
        distanceMeters += occurrence.duration.meters;
      else if (occurrence.duration.type === "repetitions")
        repetitionCount += occurrence.duration.count;
      else hasOpenDuration = true;
    }
    return {
      distanceMeters,
      repetitionCount,
      timedSeconds,
      hasOpenDuration,
      hasPartialQuantities:
        hasOpenDuration || new Set(values.map((item) => item.duration.type)).size > 1,
    };
  };

  const perRepeat = summarize(occurrences.filter((occurrence) => occurrence.repeatIteration === 0));
  const total = summarize(occurrences);
  return {
    hasOpenDuration: total.hasOpenDuration,
    hasPartialQuantities: total.hasPartialQuantities,
    perRepeat: {
      distanceMeters: perRepeat.distanceMeters,
      repetitionCount: perRepeat.repetitionCount,
      timedSeconds: perRepeat.timedSeconds,
    },
    repetitions,
    total: {
      distanceMeters: total.distanceMeters,
      repetitionCount: total.repetitionCount,
      timedSeconds: total.timedSeconds,
    },
  };
}
