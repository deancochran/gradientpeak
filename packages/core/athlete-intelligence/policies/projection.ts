import type { CanonicalSport } from "../../schemas/sport";
import {
  type CalculationResult,
  estimatedResult,
  observedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import { type FieldEvidenceEligibility, resolveFieldEvidenceEligibility } from "../eligibility";
import type { AthleteIntelligenceModelInput } from "../model-input-contracts";
import {
  ATHLETE_INTELLIGENCE_PROJECTION_VERSION,
  type AthleteIntelligenceProjection,
  athleteIntelligenceProjectionSchema,
} from "../projection-contracts";
import type { ActivityReadinessResults } from "./activity-readiness";
import type { DurationAwareEffortCurve } from "./effort-curves";
import { GOAL_DEMAND_POLICY_VERSION, type GoalDemandPolicyV1Result } from "./goal-demand";
import type { PhysiologyMetricsPolicyResult } from "./physiology-metrics";
import type { TrainingFeasibilityResults } from "./training-feasibility";

export const PROJECTION_DECISION_QUALITY_POLICY_VERSION = "projection-decision-quality-v1" as const;

/**
 * Conservative, versioned guidance boundary. Uncertainty is a decision-quality
 * measure, not a probability: values above one half are retained as coverage
 * evidence but cannot produce a training recommendation.
 */
export const PROJECTION_DECISION_QUALITY_POLICY = Object.freeze({
  version: PROJECTION_DECISION_QUALITY_POLICY_VERSION,
  maximumRecommendationUncertainty: 0.5,
});

export interface GoalProjectionInputs {
  goalSourceId: string;
  demand: GoalDemandPolicyV1Result;
  effortCurve?: DurationAwareEffortCurve;
}

export interface WholeAthleteProjectionInput {
  model: AthleteIntelligenceModelInput;
  physiology: PhysiologyMetricsPolicyResult;
  effortCurves: readonly GoalProjectionInputs[];
  activityReadiness: ActivityReadinessResults;
  calendarFeasibility: TrainingFeasibilityResults;
}

const insufficient = (
  reason: string,
  sources: readonly string[] = [],
  rejections: readonly Extract<FieldEvidenceEligibility, { eligible: false }>[] = [],
): CalculationResult =>
  unavailableResult({
    state: "insufficient_evidence",
    missingDataState: sources.length + rejections.length > 0 ? "partial" : "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reason, ...new Set(rejections.map(({ reasonCode }) => reasonCode))],
    contributingSourceIds: [
      ...new Set([...sources, ...rejections.map(({ sourceId }) => sourceId)]),
    ],
  });

function truncatedDomain(domain: "metrics" | "activities" | "efforts"): CalculationResult {
  const reason =
    domain === "metrics"
      ? "metrics_read_truncated"
      : domain === "activities"
        ? "activities_read_truncated"
        : "efforts_read_truncated";
  return unavailableResult({
    state: "insufficient_evidence",
    missingDataState: "partial",
    uncertainty: 1,
    reasonCodes: [reason],
  });
}

function hasTruncatedCoverage(
  model: AthleteIntelligenceModelInput,
  domain: "metrics" | "activities" | "efforts",
): boolean {
  return model.readCoverage?.[domain].state === "truncated";
}

function fieldEligibility(
  model: AthleteIntelligenceModelInput,
  evidenceSourceIds: readonly string[],
  targetSport: CanonicalSport,
) {
  const eligibility = evidenceSourceIds.flatMap((sourceId) => {
    const evidence = model.evidenceRegistry[sourceId];
    return evidence === undefined
      ? []
      : [
          resolveFieldEvidenceEligibility({
            evidence,
            asOf: model.assessmentAsOf,
            requiredSport: targetSport,
          }),
        ];
  });
  return {
    eligible: eligibility.length > 0 && eligibility.every((result) => result.eligible),
    sourceId: eligibility.find((result) => result.eligible)?.sourceId,
    rejections: eligibility.filter(
      (result): result is Extract<FieldEvidenceEligibility, { eligible: false }> =>
        !result.eligible,
    ),
  };
}

function activityCapabilities(
  model: AthleteIntelligenceModelInput,
  targetSport: CanonicalSport | null,
) {
  if (targetSport === null)
    return {
      distance: unavailableResult({
        state: "unsupported",
        missingDataState: "unsupported_input",
        uncertainty: 1,
        reasonCodes: ["goal_sport_missing"],
      }),
      duration: unavailableResult({
        state: "unsupported",
        missingDataState: "unsupported_input",
        uncertainty: 1,
        reasonCodes: ["goal_sport_missing"],
      }),
      frequency: unavailableResult({
        state: "unsupported",
        missingDataState: "unsupported_input",
        uncertainty: 1,
        reasonCodes: ["goal_sport_missing"],
      }),
    };
  if (hasTruncatedCoverage(model, "activities")) {
    const partial = truncatedDomain("activities");
    return { distance: partial, duration: partial, frequency: partial };
  }
  const evaluatedActivities = model.activities.map((activity) => ({
    activity,
    distance: fieldEligibility(
      model,
      activity.metrics.distanceMeters.evidenceSourceIds,
      targetSport,
    ),
    duration: fieldEligibility(
      model,
      activity.metrics.elapsedDurationSeconds.evidenceSourceIds,
      targetSport,
    ),
    frequency: fieldEligibility(
      model,
      activity.metrics.elapsedDurationSeconds.evidenceSourceIds,
      targetSport,
    ),
  }));
  const compatibleActivities = evaluatedActivities.filter(
    ({ activity }) => activity.sport === targetSport,
  );
  const distanceRejections = evaluatedActivities.flatMap(({ distance }) => distance.rejections);
  const durationRejections = evaluatedActivities.flatMap(({ duration }) => duration.rejections);
  const frequencyRejections = evaluatedActivities.flatMap(({ frequency }) => frequency.rejections);
  const longestDistance = [...compatibleActivities]
    .filter(
      ({ activity, distance }) =>
        activity.metrics.distanceMeters.value !== null && distance.eligible,
    )
    .sort(
      (a, b) =>
        (b.activity.metrics.distanceMeters.value ?? 0) -
        (a.activity.metrics.distanceMeters.value ?? 0),
    )[0];
  const longestDuration = [...compatibleActivities]
    .filter(
      ({ activity, duration }) =>
        activity.metrics.elapsedDurationSeconds.value !== null && duration.eligible,
    )
    .sort(
      (a, b) =>
        (b.activity.metrics.elapsedDurationSeconds.value ?? 0) -
        (a.activity.metrics.elapsedDurationSeconds.value ?? 0),
    )[0];
  const windowWeeks = Math.max(
    1 / 7,
    (Date.parse(model.activityWindow.through) - Date.parse(model.activityWindow.from)) /
      (7 * 86_400_000),
  );
  const frequencyActivities = compatibleActivities.filter(({ frequency }) => frequency.eligible);
  const frequencySources = frequencyActivities.flatMap(({ frequency }) =>
    frequency.sourceId === undefined ? [] : [frequency.sourceId],
  );
  return {
    distance: longestDistance
      ? observedResult({
          rawValue: longestDistance.activity.metrics.distanceMeters.value ?? 0,
          unit: "m",
          sourceId: longestDistance.distance.sourceId ?? longestDistance.activity.sourceId,
          uncertainty: 0,
        })
      : insufficient("observed_distance_missing", [], distanceRejections),
    duration: longestDuration
      ? observedResult({
          rawValue: longestDuration.activity.metrics.elapsedDurationSeconds.value ?? 0,
          unit: "s",
          sourceId: longestDuration.duration.sourceId ?? longestDuration.activity.sourceId,
          uncertainty: 0,
        })
      : insufficient("observed_duration_missing", [], durationRejections),
    frequency:
      frequencySources.length > 0
        ? estimatedResult({
            estimate: frequencySources.length / windowWeeks,
            unit: "sessions/week",
            uncertainty: Math.min(1, 1 / Math.sqrt(frequencySources.length)),
            reasonCodes: ["activity_frequency_over_observation_window"],
            contributingSourceIds: frequencySources as [string, ...string[]],
          })
        : insufficient("observed_frequency_missing", [], frequencyRejections),
  };
}

function speedCapability(curve: DurationAwareEffortCurve | undefined): CalculationResult {
  const result = curve?.threshold;
  if (!result || result.estimate === null) return insufficient("compatible_speed_curve_missing");
  if (result.unit === "m/s") return result;
  if (result.unit !== "seconds_per_kilometer")
    return unavailableResult({
      state: "unsupported",
      missingDataState: "incompatible_data",
      uncertainty: result.uncertainty,
      reasonCodes: ["compatible_speed_curve_required"],
      contributingSourceIds: result.contributingSourceIds,
    });
  return estimatedResult({
    estimate: 1000 / result.estimate,
    unit: "m/s",
    uncertainty: result.uncertainty,
    reasonCodes: ["pace_curve_converted_to_speed"],
    contributingSourceIds: result.contributingSourceIds as [string, ...string[]],
  });
}

function normalizedUnit(result: CalculationResult, unit: string): CalculationResult {
  if (result.estimate === null || result.unit === unit) return result;
  const equivalent =
    (unit === "W" && result.unit === "watts") ||
    (unit === "bpm" && result.unit === "beats_per_minute");
  if (!equivalent) return result;
  return estimatedResult({
    estimate: result.estimate,
    unit,
    uncertainty: result.uncertainty,
    reasonCodes: ["equivalent_physical_unit_normalized"],
    contributingSourceIds: result.contributingSourceIds as [string, ...string[]],
  });
}

function normalizedSpeed(result: CalculationResult): CalculationResult {
  if (result.estimate === null || result.unit === "m/s") return result;
  if (result.unit !== "seconds_per_kilometer" || result.estimate <= 0)
    return unavailableResult({
      state: "unsupported",
      missingDataState: "incompatible_data",
      uncertainty: result.uncertainty,
      reasonCodes: ["positive_pace_or_speed_required"],
      contributingSourceIds: result.contributingSourceIds,
    });
  return estimatedResult({
    estimate: 1000 / result.estimate,
    unit: "m/s",
    uncertainty: result.uncertainty,
    reasonCodes: ["pace_converted_to_speed"],
    contributingSourceIds: result.contributingSourceIds as [string, ...string[]],
  });
}

function compare(
  dimension: "threshold" | "speed" | "distance" | "duration" | "frequency",
  capability: CalculationResult,
  requirement: CalculationResult,
) {
  const sources = [
    ...new Set([...capability.contributingSourceIds, ...requirement.contributingSourceIds]),
  ];
  const incompatible = [capability, requirement].some(
    (result) =>
      result.state === "unsupported" ||
      result.missingDataState === "incompatible_data" ||
      result.missingDataState === "unsupported_input",
  );
  if (
    capability.estimate === null ||
    requirement.estimate === null ||
    requirement.estimate <= 0 ||
    capability.unit !== requirement.unit
  ) {
    const unavailable = incompatible
      ? unavailableResult({
          state: "unsupported",
          missingDataState: "incompatible_data",
          uncertainty: Math.max(capability.uncertainty, requirement.uncertainty),
          reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
          contributingSourceIds: sources,
        })
      : insufficient("directly_comparable_physical_units_required", sources);
    return { dimension, capability, requirement, coverage: unavailable, physicalGap: unavailable };
  }
  const ratio = capability.estimate / requirement.estimate;
  const common = {
    uncertainty: Math.max(capability.uncertainty, requirement.uncertainty),
    contributingSourceIds: sources as [string, ...string[]],
  };
  return {
    dimension,
    capability,
    requirement,
    coverage: estimatedResult({
      estimate: ratio,
      unit: "ratio",
      reasonCodes: ["capability_divided_by_requirement"],
      ...common,
    }),
    physicalGap: estimatedResult({
      estimate: Math.max(0, requirement.estimate - capability.estimate),
      unit: requirement.unit ?? "unknown",
      reasonCodes: ["requirement_minus_capability_same_unit"],
      ...common,
    }),
  };
}

function dimensionsForGoal(input: {
  demand: GoalDemandPolicyV1Result;
  curve?: DurationAwareEffortCurve;
  physiology: PhysiologyMetricsPolicyResult;
  activity: ReturnType<typeof activityCapabilities>;
  goalSport: string | null;
  model: AthleteIntelligenceModelInput;
}) {
  if (input.demand.state !== "complete") return [];
  const requirement = input.demand.requirement;
  if (requirement.type === "threshold") {
    const capability =
      input.goalSport === null
        ? unavailableResult({
            state: "unsupported",
            missingDataState: "unsupported_input",
            uncertainty: 1,
            reasonCodes: ["goal_sport_missing"],
          })
        : (requirement.metric === "power" && input.goalSport !== "bike") ||
            (requirement.metric === "pace" && input.goalSport !== "run")
          ? unavailableResult({
              state: "unsupported",
              missingDataState: "incompatible_data",
              uncertainty: 1,
              reasonCodes: ["goal_sport_incompatible_with_direct_capability"],
            })
          : requirement.metric === "power" && hasTruncatedCoverage(input.model, "metrics")
            ? truncatedDomain("metrics")
            : requirement.metric === "hr" && hasTruncatedCoverage(input.model, "metrics")
              ? truncatedDomain("metrics")
              : requirement.metric === "pace" && hasTruncatedCoverage(input.model, "efforts")
                ? truncatedDomain("efforts")
                : requirement.metric === "power"
                  ? input.physiology.metrics.ftp.result
                  : requirement.metric === "hr"
                    ? input.physiology.metrics.lthr.result
                    : speedCapability(input.curve);
    if (requirement.metric === "pace")
      return [
        compare("threshold", normalizedSpeed(capability), normalizedSpeed(requirement.target)),
      ];
    return [
      compare(
        "threshold",
        normalizedUnit(capability, requirement.target.unit ?? ""),
        requirement.target,
      ),
    ];
  }
  if (requirement.type === "event_performance")
    return [
      compare(
        "speed",
        input.goalSport === null
          ? unavailableResult({
              state: "unsupported",
              missingDataState: "unsupported_input",
              uncertainty: 1,
              reasonCodes: ["goal_sport_missing"],
            })
          : hasTruncatedCoverage(input.model, "efforts")
            ? truncatedDomain("efforts")
            : speedCapability(input.curve),
        requirement.requiredSpeed,
      ),
    ];
  if (requirement.type === "completion")
    return [
      ...(requirement.requiredDistance
        ? [compare("distance", input.activity.distance, requirement.requiredDistance)]
        : []),
      ...(requirement.requiredDuration
        ? [compare("duration", input.activity.duration, requirement.requiredDuration)]
        : []),
    ];
  return [compare("frequency", input.activity.frequency, requirement.sessionsPerWeek)];
}

const dimensionOrder = ["threshold", "speed", "distance", "duration", "frequency"] as const;

function goalSport(
  model: AthleteIntelligenceModelInput,
  goalSourceId: string,
): CanonicalSport | null {
  const goal = model.goals.find((entry) => entry.sourceId === goalSourceId);
  return goal?.goalSport ?? null;
}

function isRecommendationCompatible(result: CalculationResult): boolean {
  return (
    result.estimate !== null &&
    result.state !== "unknown" &&
    result.state !== "insufficient_evidence" &&
    result.state !== "unsupported" &&
    result.missingDataState === "none" &&
    result.uncertainty <= PROJECTION_DECISION_QUALITY_POLICY.maximumRecommendationUncertainty
  );
}

function supportsTrainingRecommendation(dimension: {
  capability: CalculationResult;
  requirement: CalculationResult;
  coverage: CalculationResult;
  physicalGap: CalculationResult;
}): boolean {
  return [
    dimension.capability,
    dimension.requirement,
    dimension.coverage,
    dimension.physicalGap,
  ].every(isRecommendationCompatible);
}

/** Assembles policy outputs into the one public physical/per-goal projection contract. */
export function assembleWholeAthleteProjectionV1(
  input: WholeAthleteProjectionInput,
): AthleteIntelligenceProjection {
  const activitiesTruncated = hasTruncatedCoverage(input.model, "activities");
  const activityReadiness = activitiesTruncated
    ? {
        ...input.activityReadiness,
        endurance: truncatedDomain("activities"),
        durability: truncatedDomain("activities"),
        sportSpecificity: truncatedDomain("activities"),
        volumeTrend: truncatedDomain("activities"),
        frequencyTrend: truncatedDomain("activities"),
        readinessContext: truncatedDomain("activities"),
      }
    : input.activityReadiness;
  const suppliedByGoal = new Map(input.effortCurves.map((entry) => [entry.goalSourceId, entry]));
  const coverageWithPriority = input.model.goals.map((goal) => {
    const supplied = suppliedByGoal.get(goal.sourceId);
    const demand: GoalDemandPolicyV1Result = supplied?.demand ?? {
      policyVersion: GOAL_DEMAND_POLICY_VERSION,
      state: "incomplete",
      goalSourceId: goal.sourceId,
      missingFields: ["goal_demand"],
    };
    return {
      goalSourceId: goal.sourceId,
      priority: goal.priority,
      demand,
      effortCurve: supplied?.effortCurve,
      dimensions: dimensionsForGoal({
        demand,
        curve: supplied?.effortCurve,
        physiology: input.physiology,
        activity: activityCapabilities(input.model, goalSport(input.model, goal.sourceId)),
        goalSport: goalSport(input.model, goal.sourceId),
        model: input.model,
      }),
    };
  });

  const prioritizedTraining = coverageWithPriority
    .flatMap((goal) =>
      goal.dimensions
        .filter(
          (dimension) =>
            (dimension.physicalGap.estimate ?? 0) > 0 &&
            supportsTrainingRecommendation(dimension) &&
            (!goal.effortCurve || isRecommendationCompatible(goal.effortCurve.threshold)),
        )
        .sort((a, b) => dimensionOrder.indexOf(a.dimension) - dimensionOrder.indexOf(b.dimension))
        .map((dimension) => ({
          goalSourceId: goal.goalSourceId,
          priority: goal.priority,
          dimension: dimension.dimension,
          physicalGap: dimension.physicalGap,
        })),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.goalSourceId.localeCompare(b.goalSourceId) ||
        dimensionOrder.indexOf(a.dimension) - dimensionOrder.indexOf(b.dimension),
    );
  const training = prioritizedTraining.map(
    ({ priority: _priority, ...opportunity }) => opportunity,
  );
  const evidence = coverageWithPriority.flatMap(
    (goal): AthleteIntelligenceProjection["opportunities"]["evidence"] => {
      if (goal.demand.state !== "complete")
        return [
          {
            goalSourceId: goal.goalSourceId,
            dimension: null,
            reasonCodes: ["goal_demand_incomplete"],
          },
        ];
      return goal.dimensions.flatMap((dimension) =>
        !supportsTrainingRecommendation(dimension) ||
        (goal.effortCurve !== undefined && !isRecommendationCompatible(goal.effortCurve.threshold))
          ? [
              {
                goalSourceId: goal.goalSourceId,
                dimension: dimension.dimension,
                reasonCodes: dimension.capability.reasonCodes.some((reason) =>
                  [
                    "metrics_read_truncated",
                    "activities_read_truncated",
                    "efforts_read_truncated",
                  ].includes(reason),
                )
                  ? dimension.capability.reasonCodes.filter((reason) =>
                      [
                        "metrics_read_truncated",
                        "activities_read_truncated",
                        "efforts_read_truncated",
                      ].includes(reason),
                    )
                  : ["decision_quality_not_recommendation_compatible"],
              },
            ]
          : [],
      );
    },
  );
  const feasibilityLow = [
    input.calendarFeasibility.timeCoverage,
    input.calendarFeasibility.requiredSessionCoverage,
    input.calendarFeasibility.scheduleCoverage,
  ].some((result) => result.estimate !== null && result.estimate < 1);
  const recoveryLow =
    activityReadiness.readinessContext.estimate !== null &&
    activityReadiness.readinessContext.estimate < 0;
  const hasUnknown = evidence.length > 0 || activitiesTruncated;
  const hasGap = training.length > 0;
  const goalCoverage = coverageWithPriority.map(
    ({ priority: _priority, effortCurve: _effortCurve, ...goal }) => goal,
  );
  const state = hasUnknown
    ? "unknown"
    : feasibilityLow || recoveryLow || hasGap
      ? "adjust"
      : "proceed";

  return athleteIntelligenceProjectionSchema.parse({
    contractVersion: ATHLETE_INTELLIGENCE_PROJECTION_VERSION,
    assessmentAsOf: input.model.assessmentAsOf,
    athleteId: input.model.athleteId,
    capability: {
      ftp: input.physiology.metrics.ftp.result,
      wattsPerKilogram: input.physiology.wattsPerKilogram,
      heartRateReserve: input.physiology.heartRateReserve,
      effortCurves: input.effortCurves.flatMap((entry) =>
        entry.effortCurve
          ? [
              {
                goalSourceId: entry.goalSourceId,
                threshold: entry.effortCurve.threshold,
                highIntensity: entry.effortCurve.highIntensity,
              },
            ]
          : [],
      ),
      enduranceRecencyWeightedMinutes: activityReadiness.endurance,
      durabilityBaselineRatio: activityReadiness.durability,
      sportSpecificity: activityReadiness.sportSpecificity,
    },
    readiness: {
      volumeTrend: activityReadiness.volumeTrend,
      frequencyTrend: activityReadiness.frequencyTrend,
      recoveryContext: activityReadiness.readinessContext,
    },
    feasibility: input.calendarFeasibility,
    goalCoverage,
    opportunities: { training, evidence },
    decisionGuidance: {
      state,
      reasonCodes: [
        ...(feasibilityLow ? ["calendar_feasibility_below_requirement"] : []),
        ...(recoveryLow ? ["recovery_context_below_baseline"] : []),
        ...(hasGap ? ["physical_goal_gap_present"] : []),
        ...(hasUnknown ? ["insufficient_evidence_for_guidance"] : []),
      ],
      recommendedActions: [
        ...(hasGap ? ["Develop the listed goal-specific physical capabilities."] : []),
        ...(feasibilityLow
          ? ["Adjust the plan to fit calendar availability and constraints."]
          : []),
        ...(hasUnknown ? ["Collect directly comparable physical evidence."] : []),
      ],
      cautions: recoveryLow
        ? ["Recent recovery context is below the athlete's observed baseline."]
        : [],
    },
  });
}

export const projectWholeAthleteV1 = assembleWholeAthleteProjectionV1;
