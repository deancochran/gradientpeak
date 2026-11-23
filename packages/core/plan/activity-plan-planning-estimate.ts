import { getActivityCategorySecondsPerRep } from "../activity-categories";
import {
  type ActivityPlanTarget,
  type CompiledActivityPlan,
  type CompiledActivityStepOccurrence,
  compileActivityPlan,
} from "../activity-plan";
import { ACTIVITY_PLAN_LIMITS } from "../activity-plan/structure-validation";
import {
  type ActivityDistance,
  type ActivityNativeIntensityValue,
  type ActivityPlanPrescriptionQuantificationBundle,
  type ActivityPlanProjection,
  type ActivityPrescriptionStage,
  type ActivityQuantificationEvidenceIdentity,
  type ActivityQuantificationPlanOccurrenceParentSubjectIdentity,
  type ActivityQuantificationStablePlanSubjectIdentity,
  activityDistanceSchema,
  activityDurationSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityPlanProjection,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  createScheduledEventActivityQuantificationSubjectIdentity,
  fingerprintActivityQuantification,
  type PrescribedActivityIntensity,
  prescribedActivityIntensitySchema,
} from "../activity-quantification";
import {
  type ActivityPlanDurationEstimate,
  activityPlanDurationEstimateSchema,
  summarizeActivityPlanDuration,
  unavailableActivityPlanDurationEstimate,
} from "../duration";
import {
  adaptPlannedCommonLoadDoses,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  type CommonLoadMethod,
  type CommonLoadResult,
  type CommonThresholdEvidence,
  commonLoadResultSchema,
  commonThresholdEvidenceSchema,
  type PlannedCommonLoadDose,
  type PlannedCommonLoadTarget,
} from "../load";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  type PerformanceThresholdFact,
} from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { resolveObjectiveIntensityTarget } from "../targets";
import {
  kphToMps,
  mphToMps,
  secondsPer100MetersToMetersPerSecond,
  secondsPerKilometerToMetersPerSecond,
  secondsPerMileToMetersPerSecond,
} from "../units";

export type ActivityPlanAuthoredTargetEvidence = {
  occurrenceId: string;
  targets: ActivityPlanTarget[];
};

export type ActivityPlanCategoryPlanningDose = {
  activity_category: CanonicalActivityCategory;
  timedActiveSeconds: number;
  restSeconds?: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
  commonLoad: CommonLoadResult | CommonLoadAggregate;
  evidence: "common_load" | "partial_common_load" | "unsupported";
  evidenceCoverage: number | null;
};

export type ActivityPlanPlanningEstimate = {
  stage: ActivityPrescriptionStage;
  prescriptionQuantification: ActivityPlanPrescriptionQuantificationBundle;
  /** Authored plan quantities projected before completion-policy lanes are erased by aggregation. */
  planProjection?: ActivityPlanProjection;
  authoredTargets: ActivityPlanAuthoredTargetEvidence[];
  durationEstimate: ActivityPlanDurationEstimate;
  durationProvenance: "estimated" | "prescribed" | "measured" | "unknown" | null;
  restSeconds: number;
  distanceProvenance: "estimated" | "prescribed" | "measured" | "unknown" | null;
  hasOpenCompletion: boolean;
  categoryDoses: ActivityPlanCategoryPlanningDose[];
  factors: string[];
  warnings: string[];
};

export type ActivityPlanPlanningEstimateInput = {
  structure?: unknown;
  performanceTargets: AthletePerformanceTargetFacts;
  asOf: string;
  stage?: ActivityPrescriptionStage | undefined;
  planId?: string | undefined;
  scheduledEventId?: string | undefined;
  activityCategoryFallback?: CanonicalActivityCategory | undefined;
};

export type PrescriptionSpeedResolution =
  | {
      status: "available";
      value: number;
      unit: "meters_per_second";
      source: "authored_absolute" | "relative_category_calibration";
    }
  | {
      status: "unavailable";
      value: null;
      unit: "meters_per_second";
      reason:
        | "not_authored"
        | "invalid_target"
        | "ambiguous_target"
        | "range_requires_policy"
        | "category_calibration_required"
        | "unsupported_relative_reference";
    };

type OccurrenceResolution = {
  occurrence: CompiledActivityStepOccurrence;
  prescribedIntensity: PrescribedActivityIntensity;
  speed: PrescriptionSpeedResolution;
  activeSeconds: number | null;
  restSeconds: number;
  durationEvidenceRole: "prescribed" | "estimated" | "derived";
  distance: ActivityDistance;
};

type RelativeThresholdIntensity = Extract<
  ActivityNativeIntensityValue,
  { metric: "relative_threshold" }
>;

function durationFingerprint(duration: CompiledActivityStepOccurrence["duration"]): {
  type: CompiledActivityStepOccurrence["duration"]["type"];
  seconds: number | null;
  meters: number | null;
  count: number | null;
} {
  return {
    type: duration.type,
    seconds: duration.type === "time" ? duration.seconds : null,
    meters: duration.type === "distance" ? duration.meters : null,
    count: duration.type === "repetitions" ? duration.count : null,
  };
}

function targetFingerprint(target: ActivityPlanTarget): { type: string; intensity?: number } {
  return target.type === "rest"
    ? { type: target.type }
    : { type: target.type, intensity: target.intensity };
}

function targetFingerprints(targets: readonly ActivityPlanTarget[]) {
  return targets
    .map(targetFingerprint)
    .sort((left, right) =>
      left.type === right.type
        ? (left.intensity ?? 0) - (right.intensity ?? 0)
        : left.type.localeCompare(right.type),
    );
}

export type ActivityPlanQuantificationIdentities = {
  subjectIdentity: ActivityQuantificationPlanOccurrenceParentSubjectIdentity;
  planSubjectIdentity: ActivityQuantificationStablePlanSubjectIdentity;
  evidenceIdentity: ActivityQuantificationEvidenceIdentity;
};

function scheduledEventId(input: {
  stage: ActivityPrescriptionStage;
  scheduledEventId?: string;
}): string | null {
  if (input.stage !== "scheduled") return null;
  const eventId = input.scheduledEventId;
  if (eventId === undefined || eventId.trim().length === 0) {
    throw new Error("A scheduled prescription requires its persisted or local event ID");
  }
  return eventId;
}

function compiledPlanIdentities(
  compiled: CompiledActivityPlan,
  input: {
    stage: ActivityPrescriptionStage;
    planId?: string;
    scheduledEventId?: string;
  },
): ActivityPlanQuantificationIdentities {
  const revisionEvidence = {
    purpose: "activity-plan-revision",
    compilerVersion: compiled.compilerVersion,
    structureVersion: compiled.structureVersion,
    activityCategory: compiled.activity_category,
    occurrences: compiled.occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      ordinal: occurrence.globalOrdinal,
      role: occurrence.role,
      activityCategory: occurrence.activity_category,
      duration: durationFingerprint(occurrence.duration),
      targets: targetFingerprints(occurrence.targets),
    })),
  };
  const revisionFingerprint = fingerprintActivityQuantification(revisionEvidence);
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType: "plan_revision",
    sourceIds: [input.planId ?? `preview:${revisionFingerprint}`],
    revisionFingerprint,
    details: revisionEvidence,
  });
  const planSubjectIdentity = createPlanActivityQuantificationSubjectIdentity({
    ...(input.planId === undefined ? { previewId: revisionFingerprint } : { planId: input.planId }),
  });
  const eventId = scheduledEventId(input);
  const subjectIdentity =
    eventId === null
      ? planSubjectIdentity
      : createScheduledEventActivityQuantificationSubjectIdentity({
          eventId,
          planSubjectIdentity,
        });
  return {
    subjectIdentity,
    planSubjectIdentity,
    evidenceIdentity,
  };
}

/** Core-owned identities used by both direct planning and API adapters. */
export function createActivityPlanQuantificationIdentities(input: {
  structure: unknown;
  stage?: ActivityPrescriptionStage;
  planId?: string;
  scheduledEventId?: string;
}): ActivityPlanQuantificationIdentities {
  return compiledPlanIdentities(compileActivityPlan(input.structure), {
    stage: input.stage ?? "plan",
    ...(input.planId === undefined ? {} : { planId: input.planId }),
    ...(input.scheduledEventId === undefined ? {} : { scheduledEventId: input.scheduledEventId }),
  });
}

function pointMagnitude(value: ActivityNativeIntensityValue): number | null {
  if (value.metric === "zone" || value.magnitude.kind !== "point") return null;
  return value.magnitude.value;
}

function absoluteSpeed(value: ActivityNativeIntensityValue): number | null {
  const magnitude = pointMagnitude(value);
  if (magnitude === null || magnitude <= 0) return null;
  if (value.metric === "speed") {
    if (value.unit === "meters_per_second") return magnitude;
    if (value.unit === "kilometers_per_hour") return kphToMps(magnitude);
    return mphToMps(magnitude);
  }
  if (value.metric !== "pace") return null;
  if (value.unit === "seconds_per_kilometer") {
    return secondsPerKilometerToMetersPerSecond(magnitude);
  }
  if (value.unit === "seconds_per_mile") return secondsPerMileToMetersPerSecond(magnitude);
  return secondsPer100MetersToMetersPerSecond(magnitude);
}

function relativeSpeedCalibration(input: {
  activityCategory: CanonicalActivityCategory;
  performanceTargets: AthletePerformanceTargetFacts | null;
  value: ActivityNativeIntensityValue;
}): number | null {
  if (input.value.metric !== "relative_threshold") return null;
  const magnitude = pointMagnitude(input.value);
  if (magnitude === null) return null;
  const ratio = input.value.unit === "percent" ? magnitude / 100 : magnitude;
  if (!Number.isFinite(ratio) || ratio <= 0 || input.performanceTargets === null) return null;

  if (
    (input.activityCategory === "run" || input.activityCategory === "swim") &&
    input.value.reference === "threshold_speed"
  ) {
    const fact = input.performanceTargets.thresholds[input.activityCategory];
    return fact.status === "available" ? fact.value * ratio : null;
  }
  return null;
}

/**
 * Absolute authored speed/pace wins without calibration. Relative pace can only
 * resolve through the matching canonical run or swim speed threshold.
 */
export function resolvePrescriptionSpeedMetersPerSecond(input: {
  activityCategory: CanonicalActivityCategory;
  prescribedIntensity: PrescribedActivityIntensity;
  performanceTargets?: AthletePerformanceTargetFacts | null;
}): PrescriptionSpeedResolution {
  if (input.prescribedIntensity.status === "unavailable") {
    return {
      status: "unavailable",
      value: null,
      unit: "meters_per_second",
      reason: "not_authored",
    };
  }

  const absoluteTargets = input.prescribedIntensity.values.filter(
    (value) => value.metric === "speed" || value.metric === "pace",
  );
  if (absoluteTargets.length > 0) {
    if (absoluteTargets.some((target) => target.magnitude.kind === "range")) {
      return {
        status: "unavailable",
        value: null,
        unit: "meters_per_second",
        reason: "range_requires_policy",
      };
    }
    const values = absoluteTargets.map(absoluteSpeed);
    if (values.some((value) => value === null || !Number.isFinite(value) || value <= 0)) {
      return {
        status: "unavailable",
        value: null,
        unit: "meters_per_second",
        reason: "invalid_target",
      };
    }
    const first = values[0] as number;
    const ambiguous = values.some(
      (value) => Math.abs((value as number) - first) > Math.max(1e-9, first * 1e-9),
    );
    return ambiguous
      ? {
          status: "unavailable",
          value: null,
          unit: "meters_per_second",
          reason: "ambiguous_target",
        }
      : {
          status: "available",
          value: first,
          unit: "meters_per_second",
          source: "authored_absolute",
        };
  }

  const relativeTargets = input.prescribedIntensity.values.filter(
    (value): value is RelativeThresholdIntensity =>
      value.metric === "relative_threshold" && value.reference === "threshold_speed",
  );
  if (relativeTargets.length === 0) {
    return {
      status: "unavailable",
      value: null,
      unit: "meters_per_second",
      reason: "not_authored",
    };
  }
  if (relativeTargets.some((target) => target.magnitude.kind === "range")) {
    return {
      status: "unavailable",
      value: null,
      unit: "meters_per_second",
      reason: "range_requires_policy",
    };
  }
  const compatible = input.activityCategory === "run" || input.activityCategory === "swim";
  if (!compatible) {
    return {
      status: "unavailable",
      value: null,
      unit: "meters_per_second",
      reason: "unsupported_relative_reference",
    };
  }
  const values = relativeTargets.map((target) =>
    relativeSpeedCalibration({
      activityCategory: input.activityCategory,
      performanceTargets: input.performanceTargets ?? null,
      value: target,
    }),
  );
  if (values.some((value) => value === null || !Number.isFinite(value) || value <= 0)) {
    return {
      status: "unavailable",
      value: null,
      unit: "meters_per_second",
      reason: "category_calibration_required",
    };
  }
  const first = values[0] as number;
  const ambiguous = values.some(
    (value) => Math.abs((value as number) - first) > Math.max(1e-9, first * 1e-9),
  );
  return ambiguous
    ? {
        status: "unavailable",
        value: null,
        unit: "meters_per_second",
        reason: "ambiguous_target",
      }
    : {
        status: "available",
        value: first,
        unit: "meters_per_second",
        source: "relative_category_calibration",
      };
}

function nativeIntensityForTarget(target: ActivityPlanTarget): ActivityNativeIntensityValue | null {
  switch (target.type) {
    case "rest":
      return null;
    default: {
      const magnitude = { kind: "point" as const, value: target.intensity };
      switch (target.type) {
        case "%FTP":
          return {
            metric: "relative_threshold",
            reference: "ftp",
            unit: "percent",
            magnitude,
          };
        case "%MaxHR":
          return {
            metric: "relative_threshold",
            reference: "unspecified_threshold",
            unit: "percent",
            magnitude,
          };
        case "%ThresholdHR":
          return {
            metric: "relative_threshold",
            reference: "lthr",
            unit: "percent",
            magnitude,
          };
        case "watts":
          return { metric: "power", unit: "watts", magnitude };
        case "bpm":
          return { metric: "heart_rate", unit: "beats_per_minute", magnitude };
        case "speed":
          return { metric: "speed", unit: "kilometers_per_hour", magnitude };
        case "RPE":
          return { metric: "perceived_exertion", unit: "rpe_0_10", magnitude };
        case "cadence":
          return { metric: "cadence", unit: "revolutions_per_minute", magnitude };
      }
    }
  }
}

function prescribedIntensityForOccurrence(
  occurrence: CompiledActivityStepOccurrence,
): PrescribedActivityIntensity {
  const values = occurrence.targets.flatMap((target) => {
    const value = nativeIntensityForTarget(target);
    return value === null ? [] : [value];
  });
  if (values.length === 0) {
    return prescribedActivityIntensitySchema.parse({
      status: "unavailable",
      evidenceRole: "prescribed",
      values: [],
      reason: occurrence.targets.length === 0 ? "not_authored" : "unsupported",
    });
  }
  return prescribedActivityIntensitySchema.parse(
    values.length === occurrence.targets.length
      ? { status: "available", evidenceRole: "prescribed", values }
      : {
          status: "partial",
          evidenceRole: "prescribed",
          values,
          reason: "source_incomplete",
        },
  );
}

function resolveOccurrence(
  occurrence: CompiledActivityStepOccurrence,
  performanceTargets: AthletePerformanceTargetFacts,
): OccurrenceResolution {
  const prescribedIntensity = prescribedIntensityForOccurrence(occurrence);
  const speed = resolvePrescriptionSpeedMetersPerSecond({
    activityCategory: occurrence.activity_category,
    prescribedIntensity,
    performanceTargets,
  });
  if (occurrence.duration.type === "time" && occurrence.targets[0]?.type === "rest") {
    return {
      occurrence,
      prescribedIntensity,
      speed,
      activeSeconds: 0,
      restSeconds: occurrence.duration.seconds,
      durationEvidenceRole: "prescribed",
      distance: activityDistanceSchema.parse({
        status: "unavailable",
        evidenceRole: "prescribed",
        value: null,
        unit: "meters",
        reason: "not_applicable",
      }),
    };
  }
  if (occurrence.duration.type === "time") {
    return {
      occurrence,
      prescribedIntensity,
      speed,
      activeSeconds: occurrence.duration.seconds,
      restSeconds: 0,
      durationEvidenceRole: "prescribed",
      distance: activityDistanceSchema.parse(
        speed.status === "available"
          ? {
              status: "available",
              evidenceRole: "derived",
              value: occurrence.duration.seconds * speed.value,
              unit: "meters",
            }
          : {
              status: "unavailable",
              evidenceRole: "prescribed",
              value: null,
              unit: "meters",
              reason:
                speed.reason === "invalid_target"
                  ? "invalid_data"
                  : speed.reason === "ambiguous_target"
                    ? "ambiguous_target"
                    : "not_prescribed",
            },
      ),
    };
  }
  if (occurrence.duration.type === "distance") {
    return {
      occurrence,
      prescribedIntensity,
      speed,
      activeSeconds: speed.status === "available" ? occurrence.duration.meters / speed.value : null,
      restSeconds: 0,
      durationEvidenceRole: "derived",
      distance: activityDistanceSchema.parse({
        status: "available",
        evidenceRole: "prescribed",
        value: occurrence.duration.meters,
        unit: "meters",
      }),
    };
  }
  if (occurrence.duration.type === "repetitions" && occurrence.activity_category === "strength") {
    return {
      occurrence,
      prescribedIntensity,
      speed,
      activeSeconds:
        occurrence.duration.count * getActivityCategorySecondsPerRep(occurrence.activity_category),
      restSeconds: 0,
      durationEvidenceRole: "estimated",
      distance: activityDistanceSchema.parse({
        status: "unavailable",
        evidenceRole: "prescribed",
        value: null,
        unit: "meters",
        reason: "not_applicable",
      }),
    };
  }
  return {
    occurrence,
    prescribedIntensity,
    speed,
    activeSeconds: null,
    restSeconds: 0,
    durationEvidenceRole: "prescribed",
    distance: activityDistanceSchema.parse({
      status: "unavailable",
      evidenceRole: "prescribed",
      value: null,
      unit: "meters",
      reason: occurrence.duration.type === "untilFinished" ? "not_prescribed" : "not_applicable",
    }),
  };
}

type SelectedPerformanceFact = {
  status: "available" | "partial" | "unavailable";
  value: number | null;
  unit: string;
  calculationVersion: string | null;
  sourceEvidenceIds: string[];
  confidence: "high" | "medium" | "low" | "unavailable";
  expiresAt: string | null;
  reasons: string[];
  source: CommonThresholdEvidence["source"];
  observedFrom: string | null;
  observedAt: string | null;
  computedAt: string;
};

type CommonLoadSelection = {
  target: PlannedCommonLoadTarget | null;
  method: CommonLoadMethod | null;
  fact: SelectedPerformanceFact | null;
  thresholdType: CommonThresholdEvidence["type"] | null;
  thresholdValue: number | null;
  unavailableReason: "ambiguous_target" | "threshold_missing" | null;
  normalizationBasis?: {
    type: "max_hr_to_lthr";
    authoredPercent: number;
    maxHeartRateBpm: number;
    maxHeartRateCalculationVersion: string | null;
    maxHeartRateEvidenceIds: string[];
    maxHeartRateObservedAt: string | null;
  };
};

type LoadDrivingTarget = {
  target: ActivityPlanTarget;
  domain: "heart_rate" | "power" | "speed";
  priority: number;
};

function loadDrivingCandidates(occurrence: CompiledActivityStepOccurrence): LoadDrivingTarget[] {
  const category = occurrence.activity_category;
  const domainPriority =
    category === "bike"
      ? { power: 30, heart_rate: 20, speed: 0 }
      : category === "run" || category === "swim"
        ? { speed: 30, heart_rate: 20, power: 0 }
        : { heart_rate: category === "other" ? 20 : 0, power: 0, speed: 0 };

  return occurrence.targets.flatMap((target): LoadDrivingTarget[] => {
    const domain =
      target.type === "%FTP" || target.type === "watts"
        ? "power"
        : target.type === "%ThresholdHR" || target.type === "%MaxHR" || target.type === "bpm"
          ? "heart_rate"
          : target.type === "speed"
            ? "speed"
            : null;
    if (domain === null || domainPriority[domain] === 0) return [];
    const relative =
      target.type === "%FTP" || target.type === "%ThresholdHR" || target.type === "%MaxHR";
    return [{ target, domain, priority: domainPriority[domain] + (relative ? 2 : 1) }];
  });
}

function selectLoadDrivingTarget(
  occurrence: CompiledActivityStepOccurrence,
): { status: "selected"; target: ActivityPlanTarget } | { status: "none" | "ambiguous" } {
  const candidates = loadDrivingCandidates(occurrence);
  const highestPriority = candidates.reduce(
    (highest, candidate) => Math.max(highest, candidate.priority),
    Number.NEGATIVE_INFINITY,
  );
  const finalists = candidates.filter((candidate) => candidate.priority === highestPriority);
  const first = finalists[0];
  if (!first) return { status: "none" };
  const equivalent = finalists.every(
    (candidate) =>
      (candidate.domain === first.domain &&
        candidate.target.type === first.target.type &&
        candidate.target.type === "rest" &&
        first.target.type === "rest") ||
      ("intensity" in candidate.target &&
        "intensity" in first.target &&
        candidate.target.intensity === first.target.intensity),
  );
  return equivalent ? { status: "selected", target: first.target } : { status: "ambiguous" };
}

function selectedTargetFact(
  fact: PerformanceThresholdFact,
  computedAt: string,
): SelectedPerformanceFact {
  const status = fact.status;
  return {
    status,
    value: fact.value,
    unit: fact.unit,
    calculationVersion: fact.calculationVersion,
    sourceEvidenceIds: fact.sourceEvaluationIds,
    confidence:
      fact.status === "unavailable"
        ? "unavailable"
        : fact.confidence >= 0.85
          ? "high"
          : fact.confidence >= 0.7
            ? "medium"
            : "low",
    expiresAt: null,
    reasons:
      fact.status === "available" && fact.freshness === "stale"
        ? ["stale_threshold"]
        : fact.status === "unavailable"
          ? [fact.reason]
          : [],
    source: status === "available" ? "observed_effort" : "unknown",
    observedFrom: fact.effectiveAt,
    observedAt: fact.effectiveAt,
    computedAt,
  };
}

function selectedHeartRateFact(
  fact: AthletePerformanceTargetFacts["heartRate"]["bike"]["lthr"],
  computedAt: string,
): SelectedPerformanceFact {
  return {
    status: fact.status,
    value: fact.valueBpm,
    unit: "beats_per_minute",
    calculationVersion: fact.calculationVersion,
    sourceEvidenceIds: fact.sourceEvidenceId === null ? [] : [fact.sourceEvidenceId],
    confidence: fact.status === "available" ? "high" : "unavailable",
    expiresAt: fact.expiresAt,
    reasons: fact.reason === null ? [] : [fact.reason],
    source: fact.status === "available" ? "observed_effort" : "unknown",
    observedFrom: fact.observedAt,
    observedAt: fact.observedAt,
    computedAt,
  };
}

function commonLoadSelection(
  occurrence: CompiledActivityStepOccurrence,
  performanceTargets: AthletePerformanceTargetFacts,
): CommonLoadSelection {
  const resolvedTarget = selectLoadDrivingTarget(occurrence);
  if (resolvedTarget.status !== "selected") {
    return {
      target: null,
      method: null,
      fact: null,
      thresholdType: null,
      thresholdValue: null,
      unavailableReason: resolvedTarget.status === "ambiguous" ? "ambiguous_target" : null,
    };
  }
  const target = resolvedTarget.target;
  if (target.type === "rest") {
    return {
      target: null,
      method: null,
      fact: null,
      thresholdType: null,
      thresholdValue: null,
      unavailableReason: null,
    };
  }
  if (
    occurrence.activity_category !== "bike" &&
    occurrence.activity_category !== "run" &&
    occurrence.activity_category !== "swim"
  ) {
    return {
      target: null,
      method: null,
      fact: null,
      thresholdType: null,
      thresholdValue: null,
      unavailableReason: null,
    };
  }

  if (target.type === "%ThresholdHR") {
    return {
      target: { type: "percent_threshold", thresholdRatio: target.intensity / 100 },
      method: "heart_rate_zones",
      fact: null,
      thresholdType: null,
      thresholdValue: null,
      unavailableReason: null,
    };
  }

  if (target.type === "%MaxHR") {
    const lthr = selectedHeartRateFact(
      performanceTargets.heartRate[occurrence.activity_category].lthr,
      performanceTargets.asOf,
    );
    const maxHeartRate = selectedHeartRateFact(
      performanceTargets.heartRate[occurrence.activity_category].maxHr,
      performanceTargets.asOf,
    );
    if (
      lthr.status !== "available" ||
      lthr.value === null ||
      lthr.value <= 0 ||
      maxHeartRate.status !== "available" ||
      maxHeartRate.value === null ||
      maxHeartRate.value <= 0
    ) {
      return {
        target: null,
        method: "heart_rate_zones",
        fact: lthr.status === "available" ? maxHeartRate : lthr,
        thresholdType: null,
        thresholdValue: null,
        unavailableReason: "threshold_missing",
      };
    }
    return {
      target: { type: "heart_rate_bpm", value: maxHeartRate.value * (target.intensity / 100) },
      method: "heart_rate_zones",
      fact: lthr,
      thresholdType: "lthr_bpm",
      thresholdValue: lthr.value,
      unavailableReason: null,
      normalizationBasis: {
        type: "max_hr_to_lthr",
        authoredPercent: target.intensity,
        maxHeartRateBpm: maxHeartRate.value,
        maxHeartRateCalculationVersion: maxHeartRate.calculationVersion,
        maxHeartRateEvidenceIds: maxHeartRate.sourceEvidenceIds,
        maxHeartRateObservedAt: maxHeartRate.observedAt,
      },
    };
  }

  if (target.type === "bpm") {
    const lthr = selectedHeartRateFact(
      performanceTargets.heartRate[occurrence.activity_category].lthr,
      performanceTargets.asOf,
    );
    return {
      target: { type: "heart_rate_bpm", value: target.intensity },
      method: "heart_rate_zones",
      fact: lthr,
      thresholdType: "lthr_bpm",
      thresholdValue: lthr.value,
      unavailableReason: null,
    };
  }

  if (occurrence.activity_category === "bike") {
    if (target.type === "%FTP") {
      return {
        target: { type: "percent_threshold", thresholdRatio: target.intensity / 100 },
        method: "power_threshold",
        fact: null,
        thresholdType: null,
        thresholdValue: null,
        unavailableReason: null,
      };
    }
    const fact = selectedTargetFact(performanceTargets.thresholds.bike, performanceTargets.asOf);
    return {
      target: { type: "power_watts", value: target.intensity },
      method: "power_threshold",
      fact,
      thresholdType: "ftp_watts",
      thresholdValue: fact.status === "available" ? fact.value : null,
      unavailableReason: null,
    };
  }

  const fact =
    occurrence.activity_category === "run"
      ? selectedTargetFact(performanceTargets.thresholds.run, performanceTargets.asOf)
      : selectedTargetFact(performanceTargets.thresholds.swim, performanceTargets.asOf);
  return {
    target: { type: "speed_mps", value: target.intensity / 3.6 },
    method: occurrence.activity_category === "run" ? "run_pace_threshold" : "swim_pace_threshold",
    fact,
    thresholdType:
      occurrence.activity_category === "run" ? "threshold_speed_mps" : "swim_threshold_speed_mps",
    thresholdValue: fact.status === "available" ? fact.value : null,
    unavailableReason: null,
  };
}

function performanceTargetUnavailableReason(
  fact: SelectedPerformanceFact | null,
): PlannedCommonLoadDose["calibrationUnavailableReason"] | undefined {
  if (fact === null || fact.status !== "available") {
    if (fact?.reasons.some((reason) => reason.includes("truncated"))) return "evidence_truncated";
    if (fact?.reasons.some((reason) => reason.includes("stale"))) return "stale_threshold";
    return "threshold_missing";
  }
  return undefined;
}

function buildPlannedDose(input: {
  sourceIdentity: ActivityQuantificationEvidenceIdentity;
  resolution: OccurrenceResolution;
  performanceTargets: AthletePerformanceTargetFacts;
}): PlannedCommonLoadDose {
  const selection = commonLoadSelection(input.resolution.occurrence, input.performanceTargets);
  const fact = selection.fact;
  const calibratedSourceFingerprint =
    fact !== null && selection.thresholdValue !== null && fact.observedAt !== null
      ? fingerprintActivityQuantification({
          purpose: "planned-common-load-performance-target",
          activityCategory: input.resolution.occurrence.activity_category,
          thresholdType: selection.thresholdType,
          value: selection.thresholdValue,
          unit: fact.unit,
          source: fact.source,
          observedFrom: fact.observedFrom,
          observedAt: fact.observedAt,
          calculationVersion: fact.calculationVersion,
          sourceEvidenceIds: fact.sourceEvidenceIds,
          normalizationBasis: selection.normalizationBasis ?? null,
        })
      : null;
  const planIntentFingerprint =
    selection.target?.type === "percent_threshold" && selection.fact === null
      ? fingerprintActivityQuantification({
          purpose: "planned-common-load-plan-intent",
          sourceFingerprint: input.sourceIdentity.fingerprint,
          occurrenceId: input.resolution.occurrence.occurrenceId,
          thresholdRatio: selection.target.thresholdRatio,
          method: selection.method,
        })
      : null;
  const sourceFingerprint = calibratedSourceFingerprint ?? planIntentFingerprint;
  const thresholdEvidence =
    fact !== null &&
    fact.status === "available" &&
    selection.thresholdType !== null &&
    selection.thresholdValue !== null &&
    fact.observedAt !== null &&
    fact.calculationVersion !== null &&
    sourceFingerprint !== null
      ? commonThresholdEvidenceSchema.parse({
          type: selection.thresholdType,
          value: selection.thresholdValue,
          unit:
            selection.thresholdType === "ftp_watts"
              ? "watts"
              : selection.thresholdType === "lthr_bpm"
                ? "beats_per_minute"
                : "meters_per_second",
          source: fact.source,
          observedAt: fact.observedAt,
          validAt: fact.computedAt,
          freshness: fact.reasons.some((reason) => reason.includes("stale")) ? "stale" : "current",
          calculationVersion: fact.calculationVersion,
          sourceFingerprint,
        })
      : null;
  const evidenceFingerprint =
    sourceFingerprint === null
      ? null
      : fingerprintActivityQuantification({
          purpose: "planned-common-load-dose",
          sourceFingerprint: input.sourceIdentity.fingerprint,
          occurrenceId: input.resolution.occurrence.occurrenceId,
          durationSeconds: input.resolution.activeSeconds,
          target:
            selection.target === null
              ? null
              : selection.target.type === "percent_threshold"
                ? {
                    type: selection.target.type,
                    thresholdRatio: selection.target.thresholdRatio,
                    value: null,
                  }
                : {
                    type: selection.target.type,
                    thresholdRatio: null,
                    value: selection.target.value,
                  },
          method: selection.method,
          thresholdFingerprint: sourceFingerprint,
        });
  const unavailableReason =
    selection.unavailableReason ??
    (selection.target?.type === "percent_threshold" && selection.fact === null
      ? undefined
      : performanceTargetUnavailableReason(fact));

  return {
    activity_category: input.resolution.occurrence.activity_category,
    durationSeconds: input.resolution.activeSeconds,
    target: selection.target,
    method: selection.method,
    thresholdEvidence,
    quality:
      thresholdEvidence === null && planIntentFingerprint === null
        ? null
        : thresholdEvidence === null
          ? {
              source: "unknown",
              observed_at: null,
              valid_at: input.performanceTargets.asOf,
              confidence: "unknown",
              stale: false,
              estimate: true,
              calculation_version: COMMON_RELATIVE_LOAD_VERSION,
              evidence_fingerprint: planIntentFingerprint,
            }
          : {
              source: thresholdEvidence.source,
              observed_at: thresholdEvidence.observedAt,
              valid_at: thresholdEvidence.validAt,
              confidence:
                thresholdEvidence.source === "manual" ||
                thresholdEvidence.source === "validated_test"
                  ? "high"
                  : thresholdEvidence.source === "unknown"
                    ? "low"
                    : "medium",
              stale: thresholdEvidence.freshness === "stale",
              estimate:
                thresholdEvidence.source === "estimated" || thresholdEvidence.source === "modeled",
              calculation_version: thresholdEvidence.calculationVersion,
              evidence_fingerprint: sourceFingerprint,
            },
    evidenceFingerprint,
    ...(unavailableReason === undefined ? {} : { calibrationUnavailableReason: unavailableReason }),
  };
}

function occurrenceDuration(resolution: OccurrenceResolution) {
  const open = resolution.occurrence.duration.type === "untilFinished";
  const unavailableReason = open
    ? "open_ended"
    : resolution.speed.status === "unavailable" && resolution.speed.reason === "ambiguous_target"
      ? "ambiguous_target"
      : "source_missing";
  const active =
    resolution.activeSeconds === null
      ? {
          status: "unavailable" as const,
          evidenceRole: resolution.durationEvidenceRole,
          value: null,
          unit: "seconds" as const,
          reason: unavailableReason,
        }
      : {
          status: "available" as const,
          evidenceRole: resolution.durationEvidenceRole,
          value: resolution.activeSeconds,
          unit: "seconds" as const,
        };
  const elapsed =
    resolution.activeSeconds !== null
      ? {
          status: "available" as const,
          evidenceRole: resolution.durationEvidenceRole,
          value: resolution.activeSeconds + resolution.restSeconds,
          unit: "seconds" as const,
        }
      : resolution.restSeconds > 0
        ? {
            status: "partial" as const,
            evidenceRole: "prescribed" as const,
            value: resolution.restSeconds,
            unit: "seconds" as const,
            reason: open ? ("open_ended" as const) : ("source_incomplete" as const),
          }
        : {
            status: "unavailable" as const,
            evidenceRole: resolution.durationEvidenceRole,
            value: null,
            unit: "seconds" as const,
            reason: unavailableReason,
          };

  return activityDurationSchema.parse({
    elapsed,
    active,
    moving: {
      status: "unavailable",
      evidenceRole: "prescribed",
      value: null,
      unit: "seconds",
      reason: "not_prescribed",
    },
  });
}

function buildRecomputedDurationEstimate(input: {
  resolutions: readonly OccurrenceResolution[];
  restSeconds: number;
}): ActivityPlanDurationEstimate {
  const allResolved = input.resolutions.every((resolution) => resolution.activeSeconds !== null);
  if (allResolved) {
    const total = boundedDurationSeconds(
      input.restSeconds +
        input.resolutions.reduce(
          (sum, resolution) =>
            sum + (resolution.activeSeconds === null ? 0 : resolution.activeSeconds),
          0,
        ),
    );
    if (total !== null) {
      const completionTypes = new Set(
        input.resolutions.map((resolution) => resolution.occurrence.duration.type),
      );
      if (completionTypes.size === 1 && completionTypes.has("time")) {
        return activityPlanDurationEstimateSchema.parse({
          valueSeconds: total,
          status: "exact",
          basis: "compiled_time",
          confidence: "high",
        });
      }
      if (completionTypes.has("distance")) {
        return activityPlanDurationEstimateSchema.parse({
          valueSeconds: total,
          status: "estimated",
          basis: "distance_and_pace",
          confidence: "medium",
        });
      }
      if (completionTypes.has("repetitions")) {
        return activityPlanDurationEstimateSchema.parse({
          valueSeconds: total,
          status: "estimated",
          basis: "repetitions",
          confidence: "low",
        });
      }
    }
  }
  return unavailableActivityPlanDurationEstimate();
}

function recomputedDurationProvenance(
  duration: ActivityPlanDurationEstimate,
): ActivityPlanPlanningEstimate["durationProvenance"] {
  if (duration.basis === "compiled_time") return "prescribed";
  if (duration.basis === "distance_and_pace" || duration.basis === "repetitions") {
    return "estimated";
  }
  return null;
}

function buildDurationEstimate(input: {
  resolutions: readonly OccurrenceResolution[];
  restSeconds: number;
}): {
  duration: ActivityPlanDurationEstimate;
  provenance: ActivityPlanPlanningEstimate["durationProvenance"];
} {
  const duration = buildRecomputedDurationEstimate(input);
  return { duration, provenance: recomputedDurationProvenance(duration) };
}

function boundedDurationSeconds(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  return rounded <= ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds ? rounded : null;
}

function unavailableCommonLoad(input: {
  asOf: string;
  activityCategory: CanonicalActivityCategory;
}): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: input.activityCategory,
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: input.asOf,
    contributingDurationSeconds: null,
    reason: "activity_data_missing",
  });
}

export function createUnavailableActivityPlanPlanningEstimate(input: {
  asOf: string;
  stage?: ActivityPrescriptionStage | undefined;
  planId?: string | undefined;
  scheduledEventId?: string | undefined;
  activityCategory?: CanonicalActivityCategory | undefined;
  reason?: "source_missing" | "invalid_data" | undefined;
}): ActivityPlanPlanningEstimate {
  const stage = input.stage ?? "plan";
  const activityCategory = input.activityCategory ?? "other";
  const duration = unavailableActivityPlanDurationEstimate();
  const commonLoad = unavailableCommonLoad({ asOf: input.asOf, activityCategory });
  const unavailableEvidence = {
    purpose: "unavailable-activity-plan-revision",
    sourceId: input.planId ?? null,
    activityCategory,
    reason: input.reason ?? "source_missing",
  };
  const revisionFingerprint = fingerprintActivityQuantification(unavailableEvidence);
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType: "plan_revision",
    sourceIds: [input.planId ?? `preview:${revisionFingerprint}`],
    revisionFingerprint,
    details: unavailableEvidence,
  });
  const planSubjectIdentity = createPlanActivityQuantificationSubjectIdentity({
    ...(input.planId === undefined ? { previewId: revisionFingerprint } : { planId: input.planId }),
  });
  const eventId = scheduledEventId({
    stage,
    ...(input.scheduledEventId === undefined ? {} : { scheduledEventId: input.scheduledEventId }),
  });
  const subjectIdentity =
    eventId === null
      ? planSubjectIdentity
      : createScheduledEventActivityQuantificationSubjectIdentity({
          eventId,
          planSubjectIdentity,
        });
  const quantification = activityPrescriptionQuantificationSchema.parse({
    kind: "prescription",
    stage,
    subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: `unavailable:${revisionFingerprint}`,
      parentSubjectIdentity: subjectIdentity,
    }),
    evidenceIdentity,
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: activityCategory,
    duration: activityDurationSchema.parse({
      elapsed: {
        status: "unavailable",
        evidenceRole: "estimated",
        value: null,
        unit: "seconds",
        reason: input.reason ?? "source_missing",
      },
      active: {
        status: "unavailable",
        evidenceRole: "estimated",
        value: null,
        unit: "seconds",
        reason: input.reason ?? "source_missing",
      },
      moving: {
        status: "unavailable",
        evidenceRole: "estimated",
        value: null,
        unit: "seconds",
        reason: input.reason ?? "source_missing",
      },
    }),
    distance: activityDistanceSchema.parse({
      status: "unavailable",
      evidenceRole: "estimated",
      value: null,
      unit: "meters",
      reason: input.reason ?? "source_missing",
    }),
    intensity: {
      prescribed: prescribedActivityIntensitySchema.parse({
        status: "unavailable",
        evidenceRole: "prescribed",
        values: [],
        reason: input.reason ?? "source_missing",
      }),
    },
    commonLoad,
  });
  const prescriptionQuantification = createActivityPlanPrescriptionQuantificationBundle({
    members: [quantification],
  });
  const planProjection = createActivityPlanProjection({
    revisionFingerprint: evidenceIdentity.revisionFingerprint ?? revisionFingerprint,
    occurrences: [],
  });

  return {
    stage,
    prescriptionQuantification,
    planProjection,
    authoredTargets: [],
    durationEstimate: duration,
    durationProvenance: null,
    restSeconds: 0,
    distanceProvenance: null,
    hasOpenCompletion: false,
    categoryDoses: [],
    factors: [],
    warnings: ["A validated activity-plan structure is required for prescription quantification."],
  };
}

/**
 * Assigns a scheduled-event subject without recalculating occurrence metrics,
 * evidence, Common Load, or member calculation identity.
 */
export function bindActivityPlanPlanningEstimateToScheduledEvent(input: {
  estimate: ActivityPlanPlanningEstimate;
  eventId: string;
}): ActivityPlanPlanningEstimate {
  const prescriptionQuantification = bindPrescriptionQuantificationToScheduledEvent({
    prescriptionQuantification: input.estimate.prescriptionQuantification,
    eventId: input.eventId,
  });
  return {
    ...input.estimate,
    stage: "scheduled",
    prescriptionQuantification,
  };
}

/**
 * Binds a persisted schedule occurrence to already-calculated plan members.
 * API collection adapters use this narrower form so repeated events never share
 * the underlying plan subject while evidence and calculation identity stay intact.
 */
export function bindPrescriptionQuantificationToScheduledEvent(input: {
  prescriptionQuantification: unknown;
  eventId: string;
}): ActivityPlanPrescriptionQuantificationBundle {
  const planBundle = activityPlanPrescriptionQuantificationBundleSchema.parse(
    input.prescriptionQuantification,
  );
  const parentSubjectIdentity = planBundle.summary.subjectIdentity;
  if (
    parentSubjectIdentity.subjectType !== "plan" &&
    parentSubjectIdentity.subjectType !== "plan_preview"
  ) {
    throw new Error("Only an unbound plan component bundle can bind to a scheduled event");
  }
  const scheduledSubjectIdentity = createScheduledEventActivityQuantificationSubjectIdentity({
    eventId: input.eventId,
    planSubjectIdentity: parentSubjectIdentity,
  });
  const members = planBundle.members.map((quantification) => {
    if (quantification.subjectIdentity.subjectType !== "plan_occurrence") {
      throw new Error("A plan component bundle lost its occurrence subject");
    }
    return activityPrescriptionQuantificationSchema.parse({
      ...quantification,
      stage: "scheduled",
      subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
        occurrenceId: quantification.subjectIdentity.occurrenceId,
        parentSubjectIdentity: scheduledSubjectIdentity,
      }),
    });
  });
  return createActivityPlanPrescriptionQuantificationBundle({ members });
}

/** Quantifies a plan/template/scheduled prescription through Stage 1 contracts. */
export function estimateActivityPlanForTrainingContext(
  input: ActivityPlanPlanningEstimateInput,
): ActivityPlanPlanningEstimate {
  const performanceTargets = athletePerformanceTargetFactsSchema.parse(input.performanceTargets);
  if (performanceTargets.asOf !== input.asOf) {
    throw new Error("Activity-plan quantification asOf must match its performance targets");
  }
  if (input.structure === undefined) {
    return createUnavailableActivityPlanPlanningEstimate({
      asOf: input.asOf,
      stage: input.stage,
      planId: input.planId,
      scheduledEventId: input.scheduledEventId,
      activityCategory: input.activityCategoryFallback,
    });
  }

  const stage = input.stage ?? "plan";
  const compiled = compileActivityPlan(input.structure);
  const identities = compiledPlanIdentities(compiled, {
    stage,
    ...(input.planId === undefined ? {} : { planId: input.planId }),
    ...(input.scheduledEventId === undefined ? {} : { scheduledEventId: input.scheduledEventId }),
  });
  const activities: readonly CompiledActivityStepOccurrence[] = compiled.occurrences;
  const resolutions = activities.map((occurrence) =>
    resolveOccurrence(occurrence, performanceTargets),
  );
  const durationSummary = summarizeActivityPlanDuration(compiled);
  const doseInputs = resolutions.map((resolution) =>
    buildPlannedDose({
      sourceIdentity: identities.evidenceIdentity,
      resolution,
      performanceTargets,
    }),
  );
  const envelope = adaptPlannedCommonLoadDoses({
    computedAsOf: input.asOf,
    doses: doseInputs,
  });
  const occurrenceQuantifications = resolutions.map((resolution, index) => {
    const commonLoad = envelope.doses[index];
    if (!commonLoad) throw new Error("Missing planned Common Load result for compiled occurrence");
    const subjectIdentity = createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: resolution.occurrence.occurrenceId,
      parentSubjectIdentity: identities.subjectIdentity,
    });
    const occurrenceEvidence = {
      purpose: "activity-plan-prescription-occurrence",
      planRevisionFingerprint: identities.evidenceIdentity.revisionFingerprint,
      occurrenceId: resolution.occurrence.occurrenceId,
      duration: durationFingerprint(resolution.occurrence.duration),
      targets: targetFingerprints(resolution.occurrence.targets),
    };
    const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
      evidenceType: "plan_revision",
      sourceIds: [identities.evidenceIdentity.fingerprint, resolution.occurrence.occurrenceId],
      revisionFingerprint: identities.evidenceIdentity.revisionFingerprint,
      details: occurrenceEvidence,
    });
    return activityPrescriptionQuantificationSchema.parse({
      kind: "prescription",
      stage,
      subjectIdentity,
      evidenceIdentity,
      calculationIdentity: createActivityQuantificationCalculationIdentity({
        model: commonLoad.model,
        version: commonLoad.version,
        computedAt: commonLoad.computedAsOf,
        calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
      }),
      activity_category: resolution.occurrence.activity_category,
      duration: occurrenceDuration(resolution),
      distance: resolution.distance,
      intensity: {
        prescribed: resolution.prescribedIntensity,
      },
      commonLoad,
    });
  });
  const prescriptionQuantification = createActivityPlanPrescriptionQuantificationBundle({
    members: occurrenceQuantifications,
  });
  const planProjection = createActivityPlanProjection({
    revisionFingerprint:
      identities.evidenceIdentity.revisionFingerprint ??
      (() => {
        throw new Error("Compiled plan revision identity requires a revision fingerprint");
      })(),
    occurrences: resolutions.map((resolution) => ({
      occurrenceId: resolution.occurrence.occurrenceId,
      completionPolicy: resolution.occurrence.completionPolicy,
      weight:
        resolution.occurrence.duration.type === "time"
          ? resolution.occurrence.duration.seconds
          : resolution.occurrence.duration.type === "distance"
            ? resolution.occurrence.duration.meters
            : resolution.occurrence.duration.type === "repetitions"
              ? resolution.occurrence.duration.count
              : null,
      objectiveIntensity: resolveObjectiveIntensityTarget({
        activityCategory: resolution.occurrence.activity_category,
        performanceTargets,
        targets: resolution.occurrence.targets,
      }),
      distance:
        resolution.distance.status === "unavailable" || resolution.distance.value === null
          ? null
          : {
              value: resolution.distance.value,
              provenance:
                resolution.distance.evidenceRole === "prescribed" ? "authored" : "derived",
            },
    })),
  });
  const commonLoad = prescriptionQuantification.summary.commonLoad;
  const durationResolution = buildDurationEstimate({
    resolutions,
    restSeconds: durationSummary.restSeconds,
  });
  const duration = durationResolution.duration;
  const quantifiedDistance =
    prescriptionQuantification.summary.distance.status === "complete"
      ? prescriptionQuantification.summary.distance.value
      : null;
  const contributingDistances = resolutions.filter(
    (resolution) => resolution.distance.status !== "unavailable",
  );
  const calculatedDistanceProvenance =
    quantifiedDistance === null
      ? null
      : contributingDistances.every(
            (resolution) => resolution.distance.evidenceRole === "prescribed",
          )
        ? "prescribed"
        : "estimated";
  const supportedSeconds = resolutions.reduce((sum, resolution, index) => {
    const dose = doseInputs[index];
    return (
      sum +
      (dose?.target !== null && resolution.activeSeconds !== null ? resolution.activeSeconds : 0)
    );
  }, 0);
  const knownActiveSeconds = resolutions.reduce(
    (sum, resolution) => sum + (resolution.activeSeconds === null ? 0 : resolution.activeSeconds),
    0,
  );
  const hasSupportedTarget = doseInputs.some((dose) => dose.target !== null);
  const categoryDose: ActivityPlanCategoryPlanningDose = {
    activity_category: compiled.activity_category,
    timedActiveSeconds: durationSummary.timedActiveSeconds,
    restSeconds: durationSummary.restSeconds,
    distanceMeters: durationSummary.distanceMeters,
    repetitionCount: durationSummary.repetitionCount,
    openOccurrenceCount: durationSummary.openOccurrenceCount,
    commonLoad,
    evidence:
      commonLoad.status === "complete"
        ? "common_load"
        : hasSupportedTarget
          ? "partial_common_load"
          : "unsupported",
    evidenceCoverage: knownActiveSeconds > 0 ? supportedSeconds / knownActiveSeconds : null,
  };
  const unavailableReasons = [
    ...new Set(
      envelope.doses.flatMap((dose) =>
        dose.status === "unavailable" || dose.status === "partial" ? [dose.reason] : [],
      ),
    ),
  ];

  return {
    stage,
    prescriptionQuantification,
    planProjection,
    authoredTargets: activities.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      targets: occurrence.targets.map((target) => ({ ...target })),
    })),
    durationEstimate: duration,
    durationProvenance: durationResolution.provenance,
    restSeconds: durationSummary.restSeconds,
    distanceProvenance: calculatedDistanceProvenance,
    hasOpenCompletion: durationSummary.openOccurrenceCount > 0,
    categoryDoses: [categoryDose],
    factors: [
      "canonical prescription quantification",
      `duration:${duration.basis ?? "unavailable"}`,
      `common-load:${commonLoad.status}`,
    ],
    warnings: [
      ...(duration.status === "unavailable"
        ? ["Elapsed duration is unavailable without a prescribed completion rate."]
        : []),
      ...unavailableReasons.map((reason) => `Common Load unavailable: ${reason}.`),
    ],
  };
}
