import { z } from "zod";

import {
  calculateLoadBalance,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "../load/progression";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";

export const ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION = "athlete-state-projection-v1" as const;
/** Maximum accepted absolute error when checking form = fitness - fatigue. */
export const FORM_MATCH_TOLERANCE = 1e-9;
export const MAX_TRAINING_STIMULUS_COMMON_LOAD = 10_000;
// A plan is bounded to 366 sessions. Keeping the same worst-case envelope for a
// planning-day sum allows every valid bounded plan while rejecting runaway input.
export const MAX_DAILY_AGGREGATE_COMMON_LOAD = 366 * MAX_TRAINING_STIMULUS_COMMON_LOAD;

const instantSchema = z.string().datetime({ offset: true });
const confidenceSchema = z.number().finite().min(0).max(1);
const finiteNonnegativeSchema = z.number().finite().nonnegative();
const finitePositiveSchema = z.number().finite().positive();
export const planningDayIdentitySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const instant = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
  }, "Planning day must be a valid ISO calendar date");
export const planningDayTransitionSchema = z
  .object({ fromDay: planningDayIdentitySchema, toDay: planningDayIdentitySchema })
  .strict();

export const observedCapabilitySchema = z
  .object({
    activityCategory: canonicalActivityCategorySchema,
    longestDistanceMeters: finiteNonnegativeSchema.nullable(),
    longestDurationMinutes: finiteNonnegativeSchema.nullable(),
    observedAt: instantSchema,
    evidenceConfidence: confidenceSchema,
  })
  .strict();

export const athleteStateBaselineSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION),
    athleteId: z.string().trim().min(1).max(128),
    stateRevision: z.number().int().nonnegative(),
    asOf: instantSchema,
    longTermLoad: finiteNonnegativeSchema,
    recentLoad: finiteNonnegativeSchema,
    loadBalance: z.number().finite(),
    evidenceConfidence: confidenceSchema,
    capabilities: z.array(observedCapabilitySchema).max(5),
    athleteAgeYears: z.number().int().min(10).max(120).nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    if (
      Math.abs(state.loadBalance - (state.longTermLoad - state.recentLoad)) > FORM_MATCH_TOLERANCE
    )
      context.addIssue({
        code: "custom",
        path: ["loadBalance"],
        message: "Load balance must equal long-term load minus recent load",
      });
    const categories = state.capabilities.map(({ activityCategory }) => activityCategory);
    if (new Set(categories).size !== categories.length)
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: "Capability activity categories must be unique",
      });
  });

const capabilityObservationSchema = z
  .object({
    distanceMeters: finiteNonnegativeSchema.nullable(),
    durationMinutes: finiteNonnegativeSchema.nullable(),
  })
  .strict()
  .refine(
    ({ distanceMeters, durationMinutes }) => distanceMeters !== null || durationMinutes !== null,
    "A capability observation must include distance or duration",
  );

export const observedTrainingStimulusSchema = z
  .object({
    kind: z.literal("observed"),
    sourceId: z.string().trim().min(1).max(256),
    occurredAt: instantSchema,
    activityCategory: canonicalActivityCategorySchema,
    commonLoad: finiteNonnegativeSchema.max(MAX_TRAINING_STIMULUS_COMMON_LOAD),
    evidenceConfidence: confidenceSchema,
    capabilityObservation: capabilityObservationSchema.nullable(),
  })
  .strict();

export const projectedTrainingStimulusSchema = z
  .object({
    kind: z.literal("projected"),
    sourceId: z.string().trim().min(1).max(256),
    scheduledAt: instantSchema,
    activityCategory: canonicalActivityCategorySchema,
    commonLoad: finiteNonnegativeSchema.max(MAX_TRAINING_STIMULUS_COMMON_LOAD),
  })
  .strict();

/** A bounded collection's same-day sum; larger than a session, but still explicitly finite. */
export const dailyAggregateCommonLoadSchema = finiteNonnegativeSchema.max(
  MAX_DAILY_AGGREGATE_COMMON_LOAD,
);
export const observedDailyTrainingStimulusSchema = observedTrainingStimulusSchema.extend({
  commonLoad: dailyAggregateCommonLoadSchema,
});
export const projectedDailyTrainingStimulusSchema = projectedTrainingStimulusSchema.extend({
  commonLoad: dailyAggregateCommonLoadSchema,
});

export const athleteStateTransitionSchema = z
  .object({
    algorithmVersion: z.literal(ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION),
    origin: z.enum(["observed", "projected", "decay"]),
    sourceId: z.string().trim().min(1).max(256).nullable(),
    fromAsOf: instantSchema,
    toAsOf: instantSchema,
    state: athleteStateBaselineSchema,
  })
  .strict();

export const goalReadinessContextSchema = z
  .object({
    goalId: z.string().trim().min(1).max(128),
    activityCategory: canonicalActivityCategorySchema,
    targetAt: instantSchema,
    targetDistanceMeters: finitePositiveSchema.nullable(),
    targetDurationMinutes: finitePositiveSchema.nullable(),
  })
  .strict();

export const goalReadinessAssessmentSchema = z
  .object({
    goalId: z.string().trim().min(1).max(128),
    assessedAt: instantSchema,
    readiness: z.number().finite().min(0).max(100),
    status: z.enum(["ready", "watch", "not_ready"]),
    fitnessScore: z.number().finite().min(0).max(100),
    fatiguePenalty: z.number().finite().min(0).max(100),
    specificityScore: z.number().finite().min(0).max(100),
    assessmentConfidence: confidenceSchema,
    reasonCodes: z.array(z.string().trim().min(1).max(96)).max(16),
  })
  .strict();

export type AthleteStateBaseline = z.infer<typeof athleteStateBaselineSchema>;
export type ObservedTrainingStimulus = z.infer<typeof observedTrainingStimulusSchema>;
export type ProjectedTrainingStimulus = z.infer<typeof projectedTrainingStimulusSchema>;
export type ObservedDailyTrainingStimulus = z.infer<typeof observedDailyTrainingStimulusSchema>;
export type ProjectedDailyTrainingStimulus = z.infer<typeof projectedDailyTrainingStimulusSchema>;
export type AthleteStateTransition = z.infer<typeof athleteStateTransitionSchema>;
export type GoalReadinessContext = z.infer<typeof goalReadinessContextSchema>;
export type GoalReadinessAssessment = z.infer<typeof goalReadinessAssessmentSchema>;
export type PlanningDayTransition = z.infer<typeof planningDayTransitionSchema>;

const observedAdvanceInputSchema = z
  .object({
    baseline: athleteStateBaselineSchema,
    stimulus: observedDailyTrainingStimulusSchema,
    planningDays: planningDayTransitionSchema.optional(),
  })
  .strict();
const projectedAdvanceInputSchema = z
  .object({
    baseline: athleteStateBaselineSchema,
    stimulus: projectedDailyTrainingStimulusSchema,
    planningDays: planningDayTransitionSchema.optional(),
  })
  .strict();
const readinessInputSchema = z
  .object({
    baseline: athleteStateBaselineSchema,
    goal: goalReadinessContextSchema,
    assessmentAt: instantSchema,
  })
  .strict();

const DAY_MS = 86_400_000;
// Preserve bit-for-bit daily iteration across the complete range supported before
// long-gap replay was introduced. Larger gaps use the mathematically equivalent
// closed-form zero-load decay, keeping work constant within the ISO instant domain.
const EXACT_DAILY_DECAY_ITERATION_DAYS = 3_660;

function utcPlanningDay(instant: string) {
  return new Date(Date.parse(instant)).toISOString().slice(0, 10);
}

function planningDayNumber(day: string) {
  return Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
}

function elapsedDays(from: string, to: string, planningDays?: PlanningDayTransition): number {
  const milliseconds = Date.parse(to) - Date.parse(from);
  if (milliseconds < 0) throw new Error("Athlete state cannot move backwards in time");
  const days = planningDayTransitionSchema.parse(
    planningDays ?? { fromDay: utcPlanningDay(from), toDay: utcPlanningDay(to) },
  );
  const elapsed = planningDayNumber(days.toDay) - planningDayNumber(days.fromDay);
  if (elapsed < 0) throw new Error("Athlete state cannot move backwards in planning days");
  return elapsed;
}

function applyDailyLoad(
  baseline: AthleteStateBaseline,
  commonLoad: number,
): Pick<AthleteStateBaseline, "longTermLoad" | "recentLoad" | "loadBalance"> {
  const longTermLoad = calculateLongTermLoad(
    baseline.longTermLoad,
    commonLoad,
    baseline.athleteAgeYears ?? undefined,
  );
  const recentLoad = calculateRecentLoad(
    baseline.recentLoad,
    commonLoad,
    baseline.athleteAgeYears ?? undefined,
  );
  return {
    longTermLoad,
    recentLoad,
    loadBalance: calculateLoadBalance(longTermLoad, recentLoad),
  };
}

function decayDays(
  baseline: AthleteStateBaseline,
  days: number,
  asOf: string,
): AthleteStateBaseline {
  if (days > EXACT_DAILY_DECAY_ITERATION_DAYS) {
    const age = baseline.athleteAgeYears ?? undefined;
    const longTermDailyRetention = calculateLongTermLoad(1, 0, age);
    const recentDailyRetention = calculateRecentLoad(1, 0, age);
    const longTermLoad = baseline.longTermLoad * longTermDailyRetention ** days;
    const recentLoad = baseline.recentLoad * recentDailyRetention ** days;
    return athleteStateBaselineSchema.parse({
      ...baseline,
      asOf,
      longTermLoad,
      recentLoad,
      loadBalance: calculateLoadBalance(longTermLoad, recentLoad),
    });
  }
  let state = baseline;
  for (let day = 0; day < days; day += 1) state = { ...state, ...applyDailyLoad(state, 0) };
  return athleteStateBaselineSchema.parse({ ...state, asOf });
}

function stateBeforeStimulus(
  baseline: AthleteStateBaseline,
  stimulusAt: string,
  planningDays?: PlanningDayTransition,
): AthleteStateBaseline {
  const days = elapsedDays(baseline.asOf, stimulusAt, planningDays);
  return decayDays(baseline, Math.max(0, days - 1), stimulusAt);
}

function mergeObservedCapability(
  baseline: AthleteStateBaseline,
  stimulus: ObservedTrainingStimulus,
): AthleteStateBaseline["capabilities"] {
  const observation = stimulus.capabilityObservation;
  if (!observation || stimulus.evidenceConfidence < 0.75) return baseline.capabilities;
  const existing = baseline.capabilities.find(
    ({ activityCategory }) => activityCategory === stimulus.activityCategory,
  );
  const maximumNullable = (left: number | null | undefined, right: number | null) => {
    const values = [left, right].filter(
      (value): value is number => value !== null && value !== undefined,
    );
    return values.length === 0 ? null : Math.max(...values);
  };
  const candidate = observedCapabilitySchema.parse({
    activityCategory: stimulus.activityCategory,
    longestDistanceMeters: maximumNullable(
      existing?.longestDistanceMeters,
      observation.distanceMeters,
    ),
    longestDurationMinutes: maximumNullable(
      existing?.longestDurationMinutes,
      observation.durationMinutes,
    ),
    observedAt: stimulus.occurredAt,
    evidenceConfidence: Math.max(existing?.evidenceConfidence ?? 0, stimulus.evidenceConfidence),
  });
  return [
    ...baseline.capabilities.filter(
      ({ activityCategory }) => activityCategory !== stimulus.activityCategory,
    ),
    candidate,
  ].sort((left, right) => left.activityCategory.localeCompare(right.activityCategory));
}

/** Advances one planning-day aggregate; omitted day identity safely defaults to UTC calendar days. */
export function advanceObservedAthleteState(input: {
  baseline: AthleteStateBaseline;
  stimulus: ObservedDailyTrainingStimulus;
  planningDays?: PlanningDayTransition;
}): AthleteStateTransition {
  const parsed = observedAdvanceInputSchema.parse(input);
  const before = stateBeforeStimulus(
    parsed.baseline,
    parsed.stimulus.occurredAt,
    parsed.planningDays,
  );
  const state = athleteStateBaselineSchema.parse({
    ...before,
    ...applyDailyLoad(before, parsed.stimulus.commonLoad),
    asOf: parsed.stimulus.occurredAt,
    evidenceConfidence: before.evidenceConfidence * 0.8 + parsed.stimulus.evidenceConfidence * 0.2,
    capabilities: mergeObservedCapability(before, parsed.stimulus),
  });
  return athleteStateTransitionSchema.parse({
    algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    origin: "observed",
    sourceId: parsed.stimulus.sourceId,
    fromAsOf: parsed.baseline.asOf,
    toAsOf: parsed.stimulus.occurredAt,
    state,
  });
}

/** Advances one projected day; omitted day identity safely defaults to UTC calendar days. */
export function advanceProjectedAthleteState(input: {
  baseline: AthleteStateBaseline;
  stimulus: ProjectedDailyTrainingStimulus;
  planningDays?: PlanningDayTransition;
}): AthleteStateTransition {
  const parsed = projectedAdvanceInputSchema.parse(input);
  const before = stateBeforeStimulus(
    parsed.baseline,
    parsed.stimulus.scheduledAt,
    parsed.planningDays,
  );
  const state = athleteStateBaselineSchema.parse({
    ...before,
    ...applyDailyLoad(before, parsed.stimulus.commonLoad),
    asOf: parsed.stimulus.scheduledAt,
  });
  return athleteStateTransitionSchema.parse({
    algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    origin: "projected",
    sourceId: parsed.stimulus.sourceId,
    fromAsOf: parsed.baseline.asOf,
    toAsOf: parsed.stimulus.scheduledAt,
    state,
  });
}

/** Advances a published baseline to a read instant without inventing a source fact. */
export function advanceAthleteStateTo(
  baselineInput: AthleteStateBaseline,
  assessmentAt: string,
  planningDays?: PlanningDayTransition,
): AthleteStateTransition {
  const baseline = athleteStateBaselineSchema.parse(baselineInput);
  instantSchema.parse(assessmentAt);
  const state = decayDays(
    baseline,
    elapsedDays(baseline.asOf, assessmentAt, planningDays),
    assessmentAt,
  );
  return athleteStateTransitionSchema.parse({
    algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    origin: "decay",
    sourceId: null,
    fromAsOf: baseline.asOf,
    toAsOf: assessmentAt,
    state,
  });
}

function demandLoad(goal: GoalReadinessContext): number {
  const distanceKm = (goal.targetDistanceMeters ?? 0) / 1_000;
  const durationHours = (goal.targetDurationMinutes ?? 0) / 60;
  return Math.max(20, Math.min(110, 25 + Math.log1p(distanceKm) * 12 + durationHours * 2));
}

/** Evaluates one selected goal without changing the athlete-wide baseline. */
export function evaluateGoalReadiness(input: {
  baseline: AthleteStateBaseline;
  goal: GoalReadinessContext;
  assessmentAt: string;
}): GoalReadinessAssessment {
  const parsed = readinessInputSchema.parse(input);
  const state = advanceAthleteStateTo(parsed.baseline, parsed.assessmentAt).state;
  const demand = demandLoad(parsed.goal);
  const fitnessScore = Math.min(100, (state.longTermLoad / demand) * 100);
  const fatiguePenalty = Math.min(100, Math.max(0, state.recentLoad - state.longTermLoad) * 2);
  const capability = state.capabilities.find(
    ({ activityCategory }) => activityCategory === parsed.goal.activityCategory,
  );
  const distanceCoverage =
    parsed.goal.targetDistanceMeters === null
      ? null
      : Math.min(1, (capability?.longestDistanceMeters ?? 0) / parsed.goal.targetDistanceMeters);
  const durationCoverage =
    parsed.goal.targetDurationMinutes === null
      ? null
      : Math.min(1, (capability?.longestDurationMinutes ?? 0) / parsed.goal.targetDurationMinutes);
  const coverage = [distanceCoverage, durationCoverage].filter(
    (value): value is number => value !== null,
  );
  const specificityScore =
    coverage.length === 0
      ? 50
      : (coverage.reduce((sum, value) => sum + value, 0) / coverage.length) * 100;
  const readiness = Math.max(
    0,
    Math.min(100, fitnessScore * 0.65 + specificityScore * 0.35 - fatiguePenalty),
  );
  const assessmentConfidence = Math.max(
    0,
    Math.min(1, state.evidenceConfidence * (capability ? capability.evidenceConfidence : 0.6)),
  );
  const reasonCodes = [
    fitnessScore < 70 ? "fitness_below_goal_demand" : "fitness_supports_goal_demand",
    fatiguePenalty > 15 ? "recent_fatigue_pressure" : "fatigue_pressure_controlled",
    capability ? "activity_specific_capability_available" : "activity_specific_capability_missing",
    assessmentConfidence < 0.5
      ? "assessment_evidence_low_confidence"
      : "assessment_evidence_supported",
  ];
  return goalReadinessAssessmentSchema.parse({
    goalId: parsed.goal.goalId,
    assessedAt: parsed.assessmentAt,
    readiness,
    status: readiness >= 70 ? "ready" : readiness >= 45 ? "watch" : "not_ready",
    fitnessScore,
    fatiguePenalty,
    specificityScore,
    assessmentConfidence,
    reasonCodes,
  });
}
