import { compileActivityPlanV3 } from "../activity-plan";
import { calculateActivityPlanStats } from "../activity-plan-calculations";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export type PlanningEstimateConfidence = "high" | "medium" | "low";

export type ActivityPlanCategoryPlanningDose = {
  activity_category: CanonicalActivityCategory;
  timedActiveSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
  intensityFactor: number | null;
  tss: number | null;
  evidence: "cycling_power" | "partial_cycling_power" | "unsupported";
  evidenceCoverage: number | null;
};

export type ActivityPlanPlanningEstimate = {
  durationSeconds: number | null;
  activeSeconds?: number;
  restSeconds?: number;
  distanceMeters: number | null;
  hasOpenCompletion?: boolean;
  categoryDoses?: ActivityPlanCategoryPlanningDose[];
  /** Present only for a single supported activity_category; never aggregated across activity_categories. */
  intensityFactor: number | null;
  /** Present only for a single supported activity_category; never aggregated across activity_categories. */
  tss: number | null;
  confidence: PlanningEstimateConfidence;
  factors: string[];
  warnings: string[];
};

export type ActivityPlanPlanningEstimateInput = {
  structure?: unknown;
  activityCategory?: CanonicalActivityCategory | null;
  authoritativeMetrics?: unknown;
  athleteContext?: {
    cyclingFtpWatts?: number | null;
    ftpWatts?: number | null;
    thresholdPaceSecondsPerKm?: number | null;
    cssSecondsPer100m?: number | null;
  } | null;
};

/** Estimates only evidence supported by each activity segment's own activity_category domain. */
export function estimateActivityPlanForTrainingContext({
  athleteContext,
  structure,
}: ActivityPlanPlanningEstimateInput): ActivityPlanPlanningEstimate {
  if (!structure) {
    return {
      durationSeconds: null,
      activeSeconds: 0,
      restSeconds: 0,
      distanceMeters: 0,
      hasOpenCompletion: false,
      categoryDoses: [],
      intensityFactor: null,
      tss: null,
      confidence: "low",
      factors: [],
      warnings: ["A validated activity-plan V3 structure is required for planning estimates."],
    };
  }
  const compiled = compileActivityPlanV3(structure);
  const stats = calculateActivityPlanStats(compiled, {
    cyclingFtpWatts: athleteContext?.cyclingFtpWatts ?? athleteContext?.ftpWatts ?? undefined,
  });
  const warnings: string[] = [];
  const categoryDoses = stats.categoryDoses.map<ActivityPlanCategoryPlanningDose>((dose) => {
    if (!dose.cyclingPower) {
      warnings.push(`No supported planning-load evidence for ${dose.activity_category} segments.`);
      return {
        activity_category: dose.activity_category,
        timedActiveSeconds: dose.timedActiveSeconds,
        distanceMeters: dose.distanceMeters,
        repetitionCount: dose.repetitionCount,
        openOccurrenceCount: dose.openOccurrenceCount,
        intensityFactor: null,
        tss: null,
        evidence: "unsupported",
        evidenceCoverage: null,
      };
    }
    if (!dose.cyclingPower.complete) {
      warnings.push(
        `Cycling power evidence covers ${Math.round(dose.cyclingPower.evidenceCoverage * 100)}% of eligible timed ${dose.activity_category} dose; aggregate load is unavailable.`,
      );
    }
    return {
      activity_category: dose.activity_category,
      timedActiveSeconds: dose.timedActiveSeconds,
      distanceMeters: dose.distanceMeters,
      repetitionCount: dose.repetitionCount,
      openOccurrenceCount: dose.openOccurrenceCount,
      intensityFactor: dose.cyclingPower.complete
        ? roundMetric(dose.cyclingPower.averageFtpPercent / 100, 2)
        : null,
      tss: dose.cyclingPower.complete ? roundMetric(dose.cyclingPower.estimatedTss) : null,
      evidence: dose.cyclingPower.complete ? "cycling_power" : "partial_cycling_power",
      evidenceCoverage: roundMetric(dose.cyclingPower.evidenceCoverage, 3),
    };
  });

  if (stats.duration.exactElapsedSeconds === null) {
    warnings.push(
      "Elapsed duration is unknown because the plan contains non-time completion policies.",
    );
  }

  const completeCount = categoryDoses.filter((dose) => dose.evidence === "cycling_power").length;
  const soleDose = categoryDoses.length === 1 ? categoryDoses[0] : undefined;
  return {
    durationSeconds: stats.duration.exactElapsedSeconds,
    activeSeconds: stats.duration.timedActiveSeconds,
    restSeconds: stats.duration.restSeconds,
    distanceMeters: stats.duration.distanceMeters,
    hasOpenCompletion: stats.duration.openOccurrenceCount > 0,
    categoryDoses,
    intensityFactor: soleDose?.intensityFactor ?? null,
    tss: soleDose?.tss ?? null,
    confidence:
      completeCount === categoryDoses.length && stats.duration.exactElapsedSeconds !== null
        ? "high"
        : categoryDoses.some((dose) => dose.evidence !== "unsupported")
          ? "medium"
          : "low",
    factors: [
      "compiled V3 occurrences",
      ...(categoryDoses.some((dose) => dose.evidence !== "unsupported")
        ? ["cycling power targets"]
        : []),
    ],
    warnings,
  };
}

function roundMetric(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
