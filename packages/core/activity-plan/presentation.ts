import type { CanonicalSport } from "../schemas/sport";
import type { ActivityTarget, ActivityTargetType } from "../targets/schema";
import { type CompiledActivityPlan, compileValidatedActivityPlanV3 } from "./compile";
import type { ActivityPlanDuration, ActivityPlanStructureV3 } from "./v3-schema";
import { activityPlanStructureSchemaV3 } from "./v3-schema";

export type ActivityPlanIntensityBasis =
  | "threshold_percent"
  | "perceived_effort"
  | "relative_within_plan"
  | "unavailable";

export type ActivityPlanPresentationOccurrence = {
  category: CanonicalSport | null;
  duration: ActivityPlanDuration;
  globalOrdinal: number;
  intensityBasis: ActivityPlanIntensityBasis;
  intensityLabel: string | null;
  intervalId: string | null;
  normalizedIntensity: number | null;
  occurrenceId: string;
  role: "activity" | "rest" | "transition";
};

export type ActivityPlanPresentationModel = {
  categories: readonly CanonicalSport[];
  compiled: CompiledActivityPlan;
  occurrences: readonly ActivityPlanPresentationOccurrence[];
  stepCount: number;
  structure: ActivityPlanStructureV3;
};

const thresholdPercentTypes = new Set<ActivityTargetType>(["%FTP", "%MaxHR", "%ThresholdHR"]);
const relativeEffortTypes = new Set<ActivityTargetType>(["watts", "bpm", "speed"]);
const targetPriority: Record<ActivityTargetType, number> = {
  RPE: 0,
  "%FTP": 1,
  "%ThresholdHR": 2,
  "%MaxHR": 3,
  watts: 4,
  bpm: 5,
  speed: 6,
  cadence: 7,
};

type TargetRange = { maximum: number; minimum: number };
type RelativeTargetOccurrence = {
  category: CanonicalSport | null;
  targets: readonly ActivityTarget[];
};

function clampUnitInterval(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function selectEffortTarget(targets: readonly ActivityTarget[]): ActivityTarget | null {
  return (
    [...targets]
      .filter((target) => target.type !== "cadence")
      .sort((left, right) => targetPriority[left.type] - targetPriority[right.type])[0] ?? null
  );
}

function formatTarget(target: ActivityTarget): string {
  return `${target.type} ${target.intensity}`;
}

function relativeRangeKey(category: CanonicalSport | null, targetType: ActivityTargetType): string {
  return `${category ?? "none"}:${targetType}`;
}

function collectRelativeRanges(
  occurrences: readonly RelativeTargetOccurrence[],
): Map<string, TargetRange> {
  const ranges = new Map<string, TargetRange>();
  for (const occurrence of occurrences) {
    const target = selectEffortTarget(occurrence.targets);
    if (!target || !relativeEffortTypes.has(target.type)) continue;
    const key = relativeRangeKey(occurrence.category, target.type);
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
  category: CanonicalSport | null,
  ranges: ReadonlyMap<string, TargetRange>,
): Pick<
  ActivityPlanPresentationOccurrence,
  "intensityBasis" | "intensityLabel" | "normalizedIntensity"
> {
  if (!target) {
    return { intensityBasis: "unavailable", intensityLabel: null, normalizedIntensity: null };
  }

  if (target.type === "RPE") {
    return {
      intensityBasis: "perceived_effort",
      intensityLabel: formatTarget(target),
      normalizedIntensity: clampUnitInterval(target.intensity / 10),
    };
  }

  if (thresholdPercentTypes.has(target.type)) {
    return {
      intensityBasis: "threshold_percent",
      intensityLabel: formatTarget(target),
      normalizedIntensity: clampUnitInterval(target.intensity / 100),
    };
  }

  const range = ranges.get(relativeRangeKey(category, target.type));
  if (!range) {
    return {
      intensityBasis: "unavailable",
      intensityLabel: formatTarget(target),
      normalizedIntensity: null,
    };
  }

  const relativePosition =
    range.maximum === range.minimum
      ? 0.5
      : (target.intensity - range.minimum) / (range.maximum - range.minimum);
  return {
    intensityBasis: "relative_within_plan",
    intensityLabel: formatTarget(target),
    normalizedIntensity: 0.2 + clampUnitInterval(relativePosition) * 0.8,
  };
}

/**
 * Parses and compiles an activity-plan structure once into a deterministic model for visual consumers.
 * Absolute targets without an athlete threshold are shown only relative to matching targets in this plan.
 */
export function deriveActivityPlanPresentation(
  input: unknown,
): ActivityPlanPresentationModel | null {
  const parsed = activityPlanStructureSchemaV3.safeParse(input);
  if (!parsed.success) return null;

  const compiled = compileValidatedActivityPlanV3(parsed.data);
  const ranges = collectRelativeRanges(compiled.occurrences);
  const occurrences = compiled.occurrences.map<ActivityPlanPresentationOccurrence>((occurrence) => {
    const intensity = normalizeTarget(
      selectEffortTarget(occurrence.targets),
      occurrence.category,
      ranges,
    );
    return {
      category: occurrence.category,
      duration: occurrence.duration,
      globalOrdinal: occurrence.globalOrdinal,
      intervalId: occurrence.intervalId,
      occurrenceId: occurrence.occurrenceId,
      role: occurrence.role,
      ...intensity,
    };
  });

  return {
    categories: compiled.categories,
    compiled,
    occurrences,
    stepCount: occurrences.length,
    structure: parsed.data,
  };
}
