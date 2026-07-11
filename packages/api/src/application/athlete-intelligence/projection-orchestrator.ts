import {
  type AthleteIntelligenceModelInput,
  type AthleteIntelligenceProjection,
  assembleWholeAthleteProjectionV1,
  athleteIntelligenceProjectionSchema,
  type CanonicalSport,
  calculateActivityReadinessV1,
  calculateDurationAwareEffortCurve,
  calculateGoalDemandV1,
  calculateTrainingFeasibility,
  type DurationAwareEffortCurve,
  evaluatePhysiologyMetrics,
  type GoalDemandPolicyV1Result,
  unavailableResult,
} from "@repo/core";
import { TRPCError } from "@trpc/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  unit: "seconds_per_kilometer" | "watts";
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

/** Runs the approved pure policies over one canonical, profile-scoped model snapshot. */
export async function projectAthleteIntelligence(input: {
  modelReader: AthleteIntelligenceModelReader;
  profileId: string;
  goalId: string;
  asOf: Date;
}): Promise<AthleteIntelligenceProjection> {
  const model = await input.modelReader.read({
    profileId: input.profileId,
    goalId: input.goalId,
    asOf: input.asOf,
  });
  if (model.athleteId !== input.profileId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }
  const selectedGoal = model.goals.find(
    (goal) => goalIdFromSourceId(goal.sourceId) === input.goalId,
  );
  if (!selectedGoal || selectedGoal.athleteId !== input.profileId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }

  const selectedModel = { ...model, goals: [selectedGoal] };
  const demand = demandForGoal(selectedGoal);
  const durationSeconds = goalDurationSeconds(demand);
  const sport = goalSport(selectedGoal);
  const modality = sport === "bike" ? "power" : "pace";
  const unit = modality === "power" ? "watts" : "seconds_per_kilometer";
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
  const activityReadiness = calculateActivityReadinessV1({
    assessmentAt: model.assessmentAsOf,
    // Missing goal sport must not borrow activity evidence from another sport.
    targetSport: sport ?? "other",
    activities: model.activities.map((activity) => ({
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
    })),
    readinessContext: readinessContext(model).map((observation) => ({
      ...observation,
      eligibility: fieldEligibility(model, [observation.sourceId]),
    })),
  });
  const requiredWeeklySessions =
    demand.state === "complete" && demand.requirement.type === "consistency"
      ? demand.requirement.sessionsPerWeek.estimate
      : null;
  const calendarFeasibility = calculateTrainingFeasibility({
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

  const assembledProjection = athleteIntelligenceProjectionSchema.parse(
    assembleWholeAthleteProjectionV1({
      model: selectedModel,
      physiology: evaluatePhysiologyMetrics(model),
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
  const weeklyDemandApproved = requiredWeeklySessions !== null;
  if (!weeklyDemandApproved) {
    return athleteIntelligenceProjectionSchema.parse({
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
    });
  }
  return projection;
}
