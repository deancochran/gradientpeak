import {
  ACTIVITY_READINESS_CONSTANTS,
  type AthleteIntelligenceModelInput,
  type AthleteIntelligenceProjection,
  assembleAthleteState,
  assembleWholeAthleteProjectionV1,
  athleteIntelligenceProjectionSchema,
  athleteStateVectorSchema,
  type CalculationResult,
  type CanonicalSport,
  calculateActivityReadinessV1,
  calculateCriticalPowerCapability,
  calculateDurationAwareEffortCurve,
  calculateGoalDemandV1,
  calculateTrainingFeasibility,
  type DurationAwareEffortCurve,
  type EvidenceItem,
  evaluatePhysiologyMetrics,
  type GoalDemandPolicyV1Result,
  unavailableResult,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const athleteRuntimeContextSchema = z
  .object({
    stateVector: athleteStateVectorSchema,
  })
  .strict();

const explainabilityResultStateSchema = z.enum([
  "observed",
  "estimated",
  "unknown",
  "insufficient_evidence",
  "unsupported",
]);

const explainabilityReasonLabels: Readonly<Record<string, string>> = {
  activities_read_truncated: "Some activity history could not be read",
  calendar_feasibility_below_requirement: "Calendar availability is below the goal requirement",
  capability_evidence_missing: "More compatible activity evidence is needed",
  distinct_high_intensity_requirement_missing: "A higher-intensity requirement is unavailable",
  goal_demand_incomplete: "Some goal details are incomplete",
  goal_sport_incompatible_with_direct_capability:
    "The selected activity type does not match available evidence",
  goal_sport_missing: "The goal activity type is missing",
  incompatible_physical_evidence_cannot_be_compared: "Some measurements cannot be compared",
  insufficient_evidence_for_guidance: "Evidence is not sufficient for this assessment",
  invalid_or_incompatible_metric_evidence: "A profile metric could not be used",
  no_compatible_efforts: "Compatible activity efforts are unavailable",
  physical_goal_gap_present: "Available physical evidence is below the goal requirement",
  recent_history_missing: "Recent activity history is unavailable",
  recovery_context_below_baseline: "Recent activity context is below the usual baseline",
  required_goal_data_missing: "Some goal details are missing",
  schedule_read_truncated: "Some calendar availability could not be read",
  target_goal_sport_required_for_session_coverage: "The goal activity type is required",
};

function explainabilityReasonLabel(reasonCode: string) {
  return explainabilityReasonLabels[reasonCode] ?? "Some assessment details limit this result";
}

const athleteIntelligenceExplainabilitySchema = z
  .object({
    assessment: z
      .object({
        at: z.string().datetime(),
        state: explainabilityResultStateSchema,
        uncertainty: z.enum(["low", "moderate", "high", "unknown"]),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            label: z.string(),
            type: z.enum(["activity", "activity_effort", "profile_metric", "manual", "goal"]),
            observedAt: z.string().datetime(),
          })
          .strict(),
      )
      .readonly(),
    limits: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            state: explainabilityResultStateSchema,
            reasons: z.array(z.string()).readonly(),
          })
          .strict(),
      )
      .readonly(),
    coverage: z
      .array(
        z
          .object({
            label: z.string(),
            state: z.enum(["complete", "truncated"]),
          })
          .strict(),
      )
      .readonly(),
    collectionPrompts: z
      .array(
        z
          .object({
            label: z.string(),
            destination: z.enum(["profile_metrics", "activity_import"]),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

export const athleteIntelligenceRuntimeProjectionSchema = athleteIntelligenceProjectionSchema
  .extend({
    runtimeContext: athleteRuntimeContextSchema,
    explainability: athleteIntelligenceExplainabilitySchema,
  })
  .strict();

export type AthleteIntelligenceRuntimeProjection = z.infer<
  typeof athleteIntelligenceRuntimeProjectionSchema
>;

export interface AthleteIntelligenceModelReader {
  read(input: {
    profileId: string;
    goalId: string;
    asOf: Date;
  }): Promise<AthleteIntelligenceModelInput>;
}

function goalIdFromSourceId(sourceId: string): string | null {
  const match = /^goal:([^:]+):record$/.exec(sourceId);
  return match?.[1] && UUID.test(match[1]) ? match[1] : null;
}

function goalSport(goal: AthleteIntelligenceModelInput["goals"][number]): CanonicalSport | null {
  return goal.goalSport;
}

function fieldEligibility(model: AthleteIntelligenceModelInput, sourceIds: readonly string[]) {
  const evidence = sourceIds.map((sourceId) => model.evidenceRegistry[sourceId]).find(Boolean);
  return evidence ? { evidence } : undefined;
}

function goalDurationSeconds(demand: GoalDemandPolicyV1Result): number | null {
  if (demand.state !== "complete") return null;
  const requirement = demand.requirement;
  if (requirement.type === "event_performance") return requirement.requiredDuration.estimate;
  if (requirement.type === "threshold") return requirement.testDuration.estimate;
  if (requirement.type === "completion") return requirement.requiredDuration?.estimate ?? null;
  return null;
}

function goalRelevantEffortCurve(input: {
  model: AthleteIntelligenceModelInput;
  durationSeconds: number;
  modality: "pace" | "power";
  unit: "seconds_per_kilometer" | "seconds_per_100m" | "watts";
  sport: CanonicalSport;
}): DurationAwareEffortCurve {
  const target = {
    durationSeconds: input.durationSeconds,
    modality: input.modality,
    unit: input.unit,
    sport: input.sport,
  } as const;
  const calculated = calculateDurationAwareEffortCurve({
    model: input.model,
    assessmentAsOf: input.model.assessmentAsOf,
    threshold: target,
    // The core contract currently requires both slots; an invalid duration prevents a
    // second physical calculation when the goal has no distinct high-intensity demand.
    highIntensity: { ...target, durationSeconds: -1 },
  });
  const relevantKind = input.modality === "power" ? "power" : "speed";
  const incompatibleRelevantEffortSourceIds = Object.values(input.model.evidenceRegistry)
    .filter(
      (evidence) =>
        evidence.athleteId === input.model.athleteId &&
        evidence.sourceType === "activity_effort" &&
        evidence.sport === input.sport &&
        evidence.modality === "value-raw" &&
        evidence.compatibilityState !== "compatible",
    )
    .map((evidence) => evidence.sourceId);
  for (const effort of input.model.efforts) {
    if (effort.sport !== input.sport || effort.kind !== relevantKind) continue;
    for (const sourceId of effort.evidenceSourceIds) {
      if (input.model.evidenceRegistry[sourceId]?.compatibilityState !== "compatible") {
        incompatibleRelevantEffortSourceIds.push(sourceId);
      }
    }
  }
  const uniqueIncompatibleSourceIds = [...new Set(incompatibleRelevantEffortSourceIds)];
  const threshold =
    calculated.threshold.estimate === null && uniqueIncompatibleSourceIds.length > 0
      ? unavailableResult({
          state: "unsupported",
          missingDataState: "incompatible_data",
          uncertainty: 1,
          reasonCodes: ["incompatible_physical_evidence_cannot_be_compared"],
          contributingSourceIds: uniqueIncompatibleSourceIds,
        })
      : calculated.threshold;
  return {
    policyVersion: calculated.policyVersion,
    threshold,
    highIntensity: unavailableResult({
      state: "insufficient_evidence",
      missingDataState: "required_data_missing",
      uncertainty: 1,
      reasonCodes: ["distinct_high_intensity_requirement_missing"],
    }),
  };
}

function demandForGoal(goal: AthleteIntelligenceModelInput["goals"][number]) {
  const id = goalIdFromSourceId(goal.sourceId);
  return calculateGoalDemandV1({
    goal: {
      id,
      profile_id: goal.athleteId,
      target_date: goal.targetDate,
      title: "Athlete goal",
      priority: goal.priority,
      activity_category: goalSport(goal),
      objective: goal.objective,
    },
  });
}

function readinessContext(model: AthleteIntelligenceModelInput) {
  const supported = new Set([
    "hrv_rmssd",
    "sleep_hours",
    "stress_score",
    "soreness_level",
    "wellness_score",
  ]);
  return model.metricEvidence.flatMap((metric) => {
    if (!supported.has(metric.metricType) || metric.value.value === null) return [];
    const sourceId = metric.value.evidenceSourceIds[0];
    const evidence = sourceId ? model.evidenceRegistry[sourceId] : undefined;
    if (!sourceId || !evidence) return [];
    return [
      {
        sourceId,
        lineageGroupId: evidence.lineageGroupId,
        observedAt: evidence.observedAt,
        metric: metric.metricType as
          | "hrv_rmssd"
          | "sleep_hours"
          | "stress_score"
          | "soreness_level"
          | "wellness_score",
        value: metric.value.value,
      },
    ];
  });
}

function uncertaintyLabel(results: readonly CalculationResult[]) {
  if (results.some((result) => result.state === "unknown")) return "unknown" as const;
  const uncertainty = Math.max(...results.map((result) => result.uncertainty));
  if (uncertainty >= 0.67) return "high" as const;
  if (uncertainty >= 0.34) return "moderate" as const;
  return "low" as const;
}

function aggregateState(results: readonly CalculationResult[]) {
  const states = new Set(results.map((result) => result.state));
  if (states.has("unsupported")) return "unsupported" as const;
  if (states.has("insufficient_evidence")) return "insufficient_evidence" as const;
  if (states.has("unknown")) return "unknown" as const;
  if (states.has("estimated")) return "estimated" as const;
  return "observed" as const;
}

function evidenceLabel(evidence: EvidenceItem) {
  switch (evidence.sourceType) {
    case "activity":
      return { label: "Activity record", type: "activity" as const };
    case "activity_effort":
      return { label: "Activity effort", type: "activity_effort" as const };
    case "profile_metric":
      return { label: "Profile metric", type: "profile_metric" as const };
    case "goal":
      return { label: "Goal details", type: "goal" as const };
    case "manual_observation":
      return { label: "Manual entry", type: "manual" as const };
  }
}

function curatedExplainability(input: {
  model: AthleteIntelligenceModelInput;
  projection: AthleteIntelligenceProjection;
}) {
  const goalDimensions = input.projection.goalCoverage.flatMap((goal) =>
    goal.dimensions.flatMap((dimension) => [
      dimension.requirement,
      dimension.coverage,
      ...(dimension.capability ? [dimension.capability] : []),
      ...(dimension.physicalGap ? [dimension.physicalGap] : []),
    ]),
  );
  const results = [
    input.projection.capability.sportSpecificity,
    input.projection.readiness.volumeTrend,
    input.projection.feasibility.scheduleCoverage,
    ...goalDimensions,
  ];
  const referencedEvidence = [...new Set(results.flatMap((result) => result.contributingSourceIds))]
    .map((sourceId) => input.model.evidenceRegistry[sourceId])
    .filter((evidence): evidence is EvidenceItem => evidence?.athleteId === input.model.athleteId)
    .map((evidence) => ({ ...evidenceLabel(evidence), observedAt: evidence.observedAt }))
    .sort(
      (left, right) =>
        left.observedAt.localeCompare(right.observedAt) || left.label.localeCompare(right.label),
    );
  const limitedResults = results.filter(
    (result) =>
      result.state === "unknown" ||
      result.state === "insufficient_evidence" ||
      result.state === "unsupported",
  );
  const limits = [
    ...limitedResults.flatMap((result) =>
      result.reasonCodes.map((reasonCode) => ({
        label: explainabilityReasonLabel(reasonCode),
        state: result.state,
        reasons: [explainabilityReasonLabel(reasonCode)],
      })),
    ),
    ...input.projection.decisionGuidance.reasonCodes.map((reasonCode) => ({
      label: explainabilityReasonLabel(reasonCode),
      state: aggregateState(results),
      reasons: [explainabilityReasonLabel(reasonCode)],
    })),
  ].map((limit, index) => ({ ...limit, id: `limit-${index + 1}` }));
  const collectionPrompts = [
    ...(input.projection.capability.ftp.state === "unknown" ||
    input.projection.capability.ftp.state === "insufficient_evidence"
      ? [{ label: "Add a profile metric", destination: "profile_metrics" as const }]
      : []),
    ...(input.projection.readiness.volumeTrend.state === "unknown" ||
    input.projection.readiness.volumeTrend.state === "insufficient_evidence"
      ? [{ label: "Import activities", destination: "activity_import" as const }]
      : []),
  ];
  return {
    assessment: {
      at: input.model.assessmentAsOf,
      state: aggregateState(results),
      uncertainty: uncertaintyLabel(results),
    },
    evidence: referencedEvidence,
    limits,
    coverage: Object.entries(input.model.readCoverage ?? {}).map(([domain, coverage]) => ({
      label:
        domain === "metrics"
          ? "Profile metrics"
          : domain === "activities"
            ? "Recorded activities"
            : domain === "efforts"
              ? "Activity efforts"
              : "Availability data",
      state: coverage.state,
    })),
    collectionPrompts: [
      ...new Map(collectionPrompts.map((prompt) => [prompt.destination, prompt])).values(),
    ],
  };
}

/** Runs the approved pure policies over one canonical, profile-scoped model snapshot. */
export async function projectAthleteIntelligence(input: {
  modelReader: AthleteIntelligenceModelReader;
  profileId: string;
  goalId: string;
  asOf: Date;
}): Promise<AthleteIntelligenceRuntimeProjection> {
  const materializedModel = await input.modelReader.read({
    profileId: input.profileId,
    goalId: input.goalId,
    asOf: input.asOf,
  });
  if (materializedModel.athleteId !== input.profileId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }
  const selectedGoal = materializedModel.goals.find(
    (goal) => goalIdFromSourceId(goal.sourceId) === input.goalId,
  );
  if (!selectedGoal || selectedGoal.athleteId !== input.profileId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }

  const model = materializedModel;
  const selectedModel = { ...model, goals: [selectedGoal] };
  const demand = demandForGoal(selectedGoal);
  const durationSeconds = goalDurationSeconds(demand);
  const sport = goalSport(selectedGoal);
  const modality = sport === "bike" ? "power" : "pace";
  const unit =
    sport === "bike" ? "watts" : sport === "swim" ? "seconds_per_100m" : "seconds_per_kilometer";
  const effortCurve =
    sport !== null && durationSeconds && durationSeconds > 0
      ? goalRelevantEffortCurve({
          model,
          durationSeconds,
          modality,
          unit,
          sport,
        })
      : undefined;
  const policyActivities = model.activities.map((activity) => ({
    sourceId: activity.sourceId,
    lineageGroupId: activity.lineageGroupId,
    startedAt: activity.startedAt,
    sport: activity.sport,
    durationSeconds: activity.metrics.elapsedDurationSeconds.value,
    trainingLoad: activity.metrics.trainingLoad.value,
    trainingLoadIdentity: activity.metrics.trainingLoad.identity,
    averagePowerWatts: activity.metrics.averagePowerWatts.value,
    averageHeartRateBpm: activity.metrics.averageHeartRateBpm.value,
    evidence: {
      durationSeconds: fieldEligibility(
        model,
        activity.metrics.elapsedDurationSeconds.evidenceSourceIds,
      ),
      trainingLoad: fieldEligibility(model, activity.metrics.trainingLoad.evidenceSourceIds),
      averagePowerWatts: fieldEligibility(
        model,
        activity.metrics.averagePowerWatts.evidenceSourceIds,
      ),
      averageHeartRateBpm: fieldEligibility(
        model,
        activity.metrics.averageHeartRateBpm.evidenceSourceIds,
      ),
    },
  }));
  const policyReadinessContext = readinessContext(model).map((observation) => ({
    ...observation,
    eligibility: fieldEligibility(model, [observation.sourceId]),
  }));
  const activityReadiness = calculateActivityReadinessV1({
    assessmentAt: model.assessmentAsOf,
    // Missing goal sport must not borrow activity evidence from another sport.
    targetSport: sport ?? "other",
    activities: policyActivities,
    readinessContext: policyReadinessContext,
  });
  const requiredWeeklySessions =
    demand.state === "complete" && demand.requirement.type === "consistency"
      ? demand.requirement.sessionsPerWeek.estimate
      : null;
  const calculatedCalendarFeasibility = calculateTrainingFeasibility({
    sourceId: model.trainingContext.sourceId,
    assessmentAsOf: model.assessmentAsOf,
    // The planning authority is explicit; event zones never become a profile fallback.
    planningTimezone: model.planningTimezone ?? null,
    timezone: null,
    planningStart: model.assessmentAsOf,
    goalDate: selectedGoal.targetDate,
    availabilityWindows: model.trainingContext.weeklyTimeWindows,
    hardRestDays: model.trainingContext.hardRestDays,
    maximumWeeklyMinutes: model.trainingContext.maximumWeeklyMinutes.value,
    maximumWeeklySessions: null,
    maximumDailyMinutes: model.trainingContext.maximumDailyMinutes.value,
    maximumSessionsPerDay: model.trainingContext.maximumSessionsPerDay.value,
    maximumSessionDurationMinutes: model.trainingContext.maximumSessionDurationMinutes.value,
    allowDoubleDays: model.trainingContext.allowDoubleDays,
    sportOverrides: model.trainingContext.sportDoseLimits.map((limit) => ({
      sport: limit.sport,
      caps: {
        maximumWeeklyMinutes: limit.maximumWeeklyMinutes.value,
        maximumSessionsPerWeek: limit.maximumSessionsPerWeek.value,
        maximumSessionDurationMinutes: limit.maximumSessionDurationMinutes.value,
      },
    })),
    recoveryPreference: model.trainingContext.recoveryPreference,
    requiredWeeklyMinutes: null,
    requiredWeeklySessions,
    // Session coverage must be scoped to the selected goal rather than every planned workout.
    targetGoalSport: sport,
    scheduleComplete: model.readCoverage?.schedules.state === "complete",
    plannedSchedule: model.plannedSchedule.map((event) => ({
      sourceId: event.sourceId,
      startAt: event.startAt,
      endAt: event.endAt,
      lifecycle: event.lifecycle,
      eventType: event.eventType,
      sport: event.sport,
      timezone: event.timezone,
      recurrence: event.recurrence
        ? { ...event.recurrence, timezone: event.recurrence.timezone ?? undefined }
        : null,
    })),
  });
  const planningTimezoneRequired = () =>
    unavailableResult({
      state: "unsupported",
      missingDataState: "unsupported_input",
      uncertainty: 1,
      reasonCodes: ["planning_timezone_required"],
    });
  const calendarFeasibility = model.planningTimezone
    ? calculatedCalendarFeasibility
    : {
        ...calculatedCalendarFeasibility,
        timeCoverage: planningTimezoneRequired(),
        requiredSessionCoverage: planningTimezoneRequired(),
        compatibleScheduledMinutes: planningTimezoneRequired(),
        scheduleCoverage: planningTimezoneRequired(),
        constraints: Object.fromEntries(
          Object.keys(calculatedCalendarFeasibility.constraints).map((key) => [
            key,
            planningTimezoneRequired(),
          ]),
        ) as typeof calculatedCalendarFeasibility.constraints,
      };

  const physiology = evaluatePhysiologyMetrics(model, sport);
  const criticalPower = calculateCriticalPowerCapability({ model });
  const assembledProjection = athleteIntelligenceProjectionSchema.parse(
    assembleWholeAthleteProjectionV1({
      model: selectedModel,
      physiology,
      criticalPower,
      effortCurves: [
        { goalSourceId: selectedGoal.sourceId, demand, ...(effortCurve ? { effortCurve } : {}) },
      ],
      activityReadiness,
      calendarFeasibility,
    }),
  );
  const incompatibleEffortOpportunity =
    effortCurve?.threshold.missingDataState === "incompatible_data" &&
    !assembledProjection.opportunities.evidence.some(
      (opportunity) =>
        opportunity.goalSourceId === selectedGoal.sourceId && opportunity.dimension === "threshold",
    )
      ? [
          {
            goalSourceId: selectedGoal.sourceId,
            dimension: "threshold" as const,
            reasonCodes: ["missing_incompatible_or_uncertain_physical_evidence"],
          },
        ]
      : [];
  const projection = athleteIntelligenceProjectionSchema.parse({
    ...assembledProjection,
    opportunities: {
      ...assembledProjection.opportunities,
      evidence: [...assembledProjection.opportunities.evidence, ...incompatibleEffortOpportunity],
    },
  });
  const channel = (
    result: typeof activityReadiness.volumeTrend,
    coverageDomain: "metrics" | "activities" | "efforts" | "schedules",
    policy: { policy: string; version: string },
    identityInputs: unknown,
  ) => ({
    result,
    coverageDomain,
    policy,
    identityInputs,
  });
  const absentStrength = unavailableResult({
    state: "unsupported",
    missingDataState: "unsupported_input",
    uncertainty: 1,
    reasonCodes: ["strength_exposure_policy_not_available"],
  });
  const absentMechanical = unavailableResult({
    state: "unsupported",
    missingDataState: "unsupported_input",
    uncertainty: 1,
    reasonCodes: ["mechanical_exposure_policy_not_available"],
  });
  const absentInternal = unavailableResult({
    state: "unsupported",
    missingDataState: "unsupported_input",
    uncertainty: 1,
    reasonCodes: ["internal_response_policy_not_available"],
  });
  const policyVersions = [
    { policy: "physiology", version: physiology.policyVersion },
    { policy: "criticalPower", version: criticalPower.policyVersion },
    { policy: "goalDemand", version: demand.policyVersion },
    { policy: "activityReadiness", version: activityReadiness.policyVersion },
    ...(effortCurve ? [{ policy: "effortCurves", version: effortCurve.policyVersion }] : []),
    { policy: "trainingFeasibility", version: calendarFeasibility.policyVersion },
  ];
  const limitations = [
    ...(model.planningTimezone ? [] : ["planning_timezone_required"]),
    "internal_response_policy_not_available",
    "mechanical_exposure_policy_not_available",
    "strength_exposure_policy_not_available",
  ];
  const readinessPolicy = { policy: "activityReadiness", version: activityReadiness.policyVersion };
  const representedLoadGroups = new Map<string, typeof policyActivities>();
  for (const activity of policyActivities) {
    const identity = activity.trainingLoadIdentity;
    if (activity.trainingLoad === null || identity == null || identity.sport !== activity.sport)
      continue;
    const key = JSON.stringify(identity);
    representedLoadGroups.set(key, [...(representedLoadGroups.get(key) ?? []), activity]);
  }
  const calculationInputs = (activities: typeof policyActivities) =>
    activities
      .map((activity) => ({
        sourceId: activity.sourceId,
        startedAt: activity.startedAt,
        sport: activity.sport,
        durationSeconds: activity.durationSeconds,
        trainingLoad: activity.trainingLoad,
        trainingLoadIdentity: activity.trainingLoadIdentity,
      }))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const stateVector = assembleAthleteState({
    model: selectedModel,
    internalResponse: channel(
      absentInternal,
      "metrics",
      { policy: "internalResponse", version: "unsupported" },
      null,
    ),
    externalWork: [...representedLoadGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([loadIdentity, activities]) => {
        const targetSport = activities[0]?.sport ?? "other";
        const groupReadiness = calculateActivityReadinessV1({
          assessmentAt: model.assessmentAsOf,
          targetSport,
          activities,
        });
        return {
          sport: targetSport,
          loadIdentity,
          ...channel(groupReadiness.volumeTrend, "activities", readinessPolicy, {
            activities: calculationInputs(activities),
            assessmentAsOf: model.assessmentAsOf,
            activityWindow: model.activityWindow,
            constants: ACTIVITY_READINESS_CONSTANTS,
          }),
        };
      }),
    mechanicalExposure: channel(
      absentMechanical,
      "efforts",
      { policy: "mechanicalExposure", version: "unsupported" },
      null,
    ),
    strengthExposure: channel(
      absentStrength,
      "activities",
      { policy: "strengthExposure", version: "unsupported" },
      null,
    ),
    wellnessContext: channel(activityReadiness.readinessContext, "metrics", readinessPolicy, {
      observations: policyReadinessContext,
      assessmentAsOf: model.assessmentAsOf,
      activityWindow: model.activityWindow,
      constants: ACTIVITY_READINESS_CONSTANTS,
    }),
    calendarContext: channel(
      calendarFeasibility.compatibleScheduledMinutes,
      "schedules",
      { policy: "trainingFeasibility", version: calendarFeasibility.policyVersion },
      {
        planningTimezone: model.planningTimezone ?? null,
        trainingContext: model.trainingContext,
        plannedSchedule: model.plannedSchedule,
      },
    ),
    policyVersions,
    limitations,
    generatedAt: input.asOf.toISOString(),
  });
  const withRuntimeContext = (value: AthleteIntelligenceProjection) =>
    athleteIntelligenceRuntimeProjectionSchema.parse({
      ...value,
      explainability: curatedExplainability({ model, projection: value }),
      runtimeContext: {
        stateVector,
      },
    });
  const weeklyDemandApproved = requiredWeeklySessions !== null;
  if (!weeklyDemandApproved) {
    return withRuntimeContext(
      athleteIntelligenceProjectionSchema.parse({
        ...projection,
        decisionGuidance: {
          ...projection.decisionGuidance,
          state: "unknown",
          reasonCodes: [
            ...new Set([
              ...projection.decisionGuidance.reasonCodes,
              "weekly_training_demand_not_approved",
            ]),
          ],
          recommendedActions: projection.decisionGuidance.recommendedActions.filter(
            (action) => !action.toLowerCase().includes("calendar"),
          ),
        },
      }),
    );
  }
  return withRuntimeContext(projection);
}
