import {
  type CalculationResult,
  estimatedResult,
  observedResult,
  unavailableResult,
} from "../calculation-result-contracts";
import type { AthleteIntelligenceModelInput } from "../model-input-contracts";
import {
  ATHLETE_INTELLIGENCE_PROJECTION_VERSION,
  type AthleteIntelligenceProjection,
  athleteIntelligenceProjectionSchema,
} from "../projection-contracts";
import type { ActivityReadinessResults } from "./activity-readiness";
import type { DurationAwareEffortCurve } from "./effort-curves";
import type { GoalDemandPolicyV1Result } from "./goal-demand";
import type { PhysiologyMetricsPolicyResult } from "./physiology-metrics";
import type { TrainingFeasibilityResults } from "./training-feasibility";

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

const insufficient = (reason: string, sources: readonly string[] = []): CalculationResult =>
  unavailableResult({
    state: "insufficient_evidence",
    missingDataState: sources.length > 0 ? "partial" : "required_data_missing",
    uncertainty: 1,
    reasonCodes: [reason],
    contributingSourceIds: sources,
  });

function activityCapabilities(model: AthleteIntelligenceModelInput) {
  const longestDistance = [...model.activities]
    .filter((activity) => activity.metrics.distanceMeters.value !== null)
    .sort(
      (a, b) => (b.metrics.distanceMeters.value ?? 0) - (a.metrics.distanceMeters.value ?? 0),
    )[0];
  const longestDuration = [...model.activities]
    .filter((activity) => activity.metrics.elapsedDurationSeconds.value !== null)
    .sort(
      (a, b) =>
        (b.metrics.elapsedDurationSeconds.value ?? 0) -
        (a.metrics.elapsedDurationSeconds.value ?? 0),
    )[0];
  const windowWeeks = Math.max(
    1 / 7,
    (Date.parse(model.activityWindow.through) - Date.parse(model.activityWindow.from)) /
      (7 * 86_400_000),
  );
  const sources = model.activities.map((activity) => activity.sourceId);
  return {
    distance: longestDistance
      ? observedResult({
          rawValue: longestDistance.metrics.distanceMeters.value ?? 0,
          unit: "m",
          sourceId: longestDistance.sourceId,
          uncertainty: 0,
        })
      : insufficient("observed_distance_missing"),
    duration: longestDuration
      ? observedResult({
          rawValue: longestDuration.metrics.elapsedDurationSeconds.value ?? 0,
          unit: "s",
          sourceId: longestDuration.sourceId,
          uncertainty: 0,
        })
      : insufficient("observed_duration_missing"),
    frequency:
      sources.length > 0
        ? estimatedResult({
            estimate: model.activities.length / windowWeeks,
            unit: "sessions/week",
            uncertainty: Math.min(1, 1 / Math.sqrt(sources.length)),
            reasonCodes: ["activity_frequency_over_observation_window"],
            contributingSourceIds: sources as [string, ...string[]],
          })
        : insufficient("observed_frequency_missing"),
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
}) {
  if (input.demand.state !== "complete") return [];
  const requirement = input.demand.requirement;
  if (requirement.type === "threshold") {
    const capability =
      requirement.metric === "power"
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
    return [compare("speed", speedCapability(input.curve), requirement.requiredSpeed)];
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

/** Assembles policy outputs into the one public physical/per-goal projection contract. */
export function assembleWholeAthleteProjectionV1(
  input: WholeAthleteProjectionInput,
): AthleteIntelligenceProjection {
  const activity = activityCapabilities(input.model);
  const suppliedByGoal = new Map(input.effortCurves.map((entry) => [entry.goalSourceId, entry]));
  const coverageWithPriority = input.model.goals.map((goal) => {
    const supplied = suppliedByGoal.get(goal.sourceId);
    const demand: GoalDemandPolicyV1Result = supplied?.demand ?? {
      policyVersion: "goal-demand-v1",
      state: "incomplete",
      goalSourceId: goal.sourceId,
      missingFields: ["goal_demand"],
    };
    return {
      goalSourceId: goal.sourceId,
      priority: goal.priority,
      demand,
      dimensions: dimensionsForGoal({
        demand,
        curve: supplied?.effortCurve,
        physiology: input.physiology,
        activity,
      }),
    };
  });

  const prioritizedTraining = coverageWithPriority
    .flatMap((goal) =>
      goal.dimensions
        .filter((dimension) => (dimension.physicalGap.estimate ?? 0) > 0)
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
        dimension.coverage.estimate === null || dimension.capability.uncertainty >= 0.75
          ? [
              {
                goalSourceId: goal.goalSourceId,
                dimension: dimension.dimension,
                reasonCodes: ["missing_incompatible_or_uncertain_physical_evidence"],
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
    input.activityReadiness.readinessContext.estimate !== null &&
    input.activityReadiness.readinessContext.estimate < 0;
  const hasUnknown = evidence.length > 0;
  const hasGap = training.length > 0;
  const goalCoverage = coverageWithPriority.map(({ priority: _priority, ...goal }) => goal);
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
      enduranceRecencyWeightedMinutes: input.activityReadiness.endurance,
      durabilityBaselineRatio: input.activityReadiness.durability,
      sportSpecificity: input.activityReadiness.sportSpecificity,
    },
    readiness: {
      volumeTrend: input.activityReadiness.volumeTrend,
      frequencyTrend: input.activityReadiness.frequencyTrend,
      recoveryContext: input.activityReadiness.readinessContext,
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
