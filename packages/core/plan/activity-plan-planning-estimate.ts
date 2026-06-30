import { calculateActivityStatsV2 } from "../calculations_v2";
import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";
import type { CanonicalSport } from "../schemas/sport";

export type PlanningEstimateConfidence = "high" | "medium" | "low";

export type ActivityPlanPlanningEstimate = {
  durationSeconds: number | null;
  distanceMeters: number | null;
  intensityFactor: number | null;
  tss: number | null;
  confidence: PlanningEstimateConfidence;
  factors: string[];
  warnings: string[];
};

export type ActivityPlanPlanningEstimateInput = {
  activityCategory: CanonicalSport | null | undefined;
  structure?: ActivityPlanStructureV2 | null;
  authoritativeMetrics?: {
    estimatedDurationSeconds?: number | null;
    estimatedTss?: number | null;
    intensityFactor?: number | null;
    distanceMeters?: number | null;
  } | null;
  athleteContext?: {
    ftpWatts?: number | null;
    thresholdPaceSecondsPerKm?: number | null;
    cssSecondsPer100m?: number | null;
  } | null;
};

const FALLBACK_IF_BY_SPORT: Partial<Record<CanonicalSport, number>> = {
  run: 0.72,
  bike: 0.7,
  swim: 0.7,
  strength: 0.55,
  other: 0.6,
};

export function estimateActivityPlanForTrainingContext({
  activityCategory,
  athleteContext,
  authoritativeMetrics,
  structure,
}: ActivityPlanPlanningEstimateInput): ActivityPlanPlanningEstimate {
  const factors: string[] = [];
  const warnings: string[] = [];
  const category = activityCategory ?? "other";

  const paceSecondsPerKm = resolvePaceSecondsPerKm(category, athleteContext);
  if (paceSecondsPerKm !== null) factors.push(`${category} threshold pace`);

  const structureStats = structure
    ? calculateActivityStatsV2(structure, {
        ftpWatts: athleteContext?.ftpWatts ?? undefined,
        paceSecondsPerKm: paceSecondsPerKm ?? undefined,
      })
    : null;

  const structureDistance = structure ? sumStructureDistanceMeters(structure) : 0;
  const durationSeconds =
    positiveOrNull(structureStats?.totalDuration) ??
    positiveOrNull(authoritativeMetrics?.estimatedDurationSeconds);
  const distanceMeters =
    positiveOrNull(structureDistance) ?? positiveOrNull(authoritativeMetrics?.distanceMeters);
  const structureIf =
    structureStats && structureStats.avgPower > 0 ? structureStats.avgPower / 100 : null;
  const intensityFactor = clampIf(
    positiveOrNull(authoritativeMetrics?.intensityFactor) ??
      structureIf ??
      FALLBACK_IF_BY_SPORT[category] ??
      0.6,
  );

  if (structureStats && structureStats.totalDuration > 0) {
    factors.push("activity plan structure");
  } else if (authoritativeMetrics?.estimatedDurationSeconds) {
    factors.push("saved duration estimate");
  } else if (distanceMeters !== null && paceSecondsPerKm === null) {
    warnings.push("Distance-based plan needs athlete pace context to estimate duration.");
  }

  if (structureIf !== null) {
    factors.push("activity plan intensity targets");
  } else if (authoritativeMetrics?.intensityFactor) {
    factors.push("saved intensity estimate");
  } else {
    warnings.push("Using category-level intensity fallback.");
  }

  const tss =
    durationSeconds !== null && intensityFactor !== null
      ? roundMetric((durationSeconds / 3600) * intensityFactor ** 2 * 100)
      : positiveOrNull(authoritativeMetrics?.estimatedTss);

  const confidence: PlanningEstimateConfidence =
    structureStats && structureStats.totalDuration > 0 && structureIf !== null
      ? "high"
      : durationSeconds !== null && intensityFactor !== null && warnings.length <= 1
        ? "medium"
        : "low";

  return {
    durationSeconds,
    distanceMeters,
    intensityFactor: intensityFactor !== null ? roundMetric(intensityFactor, 2) : null,
    tss,
    confidence,
    factors,
    warnings,
  };
}

function resolvePaceSecondsPerKm(
  activityCategory: CanonicalSport,
  athleteContext: ActivityPlanPlanningEstimateInput["athleteContext"],
) {
  if (activityCategory === "run") return positiveOrNull(athleteContext?.thresholdPaceSecondsPerKm);
  if (activityCategory === "swim" && athleteContext?.cssSecondsPer100m) {
    return athleteContext.cssSecondsPer100m * 10;
  }
  return null;
}

function sumStructureDistanceMeters(structure: ActivityPlanStructureV2) {
  return structure.intervals.reduce((total, interval) => {
    const intervalDistance = interval.steps.reduce((sum, step) => {
      return sum + (step.duration.type === "distance" ? step.duration.meters : 0);
    }, 0);
    return total + intervalDistance * interval.repetitions;
  }, 0);
}

function positiveOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function clampIf(value: number | null) {
  if (value === null) return null;
  return Math.max(0.1, Math.min(2, value));
}

function roundMetric(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
