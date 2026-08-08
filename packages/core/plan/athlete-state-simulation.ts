import { z } from "zod";
import { ianaTimezoneSchema } from "../athlete-intelligence/planning-context";
import {
  type AthleteStateBaseline,
  advanceAthleteStateTo,
  advanceProjectedAthleteState,
  athleteStateBaselineSchema,
  athleteStateTransitionSchema,
  evaluateGoalReadiness,
  type GoalReadinessContext,
  goalReadinessAssessmentSchema,
  goalReadinessContextSchema,
  projectedDailyTrainingStimulusSchema,
  projectedTrainingStimulusSchema,
} from "../athlete-intelligence/state-projection";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import { canonicalGoalObjectiveSchema } from "../schemas/goals/profile_goals";
import {
  canonicalTrainingPlanStructureSchema,
  trainingPlanSchema,
} from "../schemas/training-plan-structure";
import { endOfScheduledDateToIsoInstant, getCalendarDateInIanaZone } from "../utils/schedule-date";
import { addDaysDateOnlyUtc } from "./dateOnlyUtc";
import { materializePlanToEvents } from "./materializePlanToEvents";

export const MAX_PLAN_SIMULATION_SESSIONS = 366;
export const DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION = "draft-plan-projection-v1" as const;
export const PLAN_READINESS_HORIZON_FALLBACK = "latest_planned_session_or_baseline" as const;

export const planSimulationInputSchema = z
  .object({
    baseline: athleteStateBaselineSchema,
    plannedSessions: z.array(projectedTrainingStimulusSchema).max(MAX_PLAN_SIMULATION_SESSIONS),
    simulationAt: z.string().datetime({ offset: true }),
    planningTimezone: ianaTimezoneSchema,
    goal: goalReadinessContextSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    for (const [index, session] of input.plannedSessions.entries()) {
      if (Date.parse(session.scheduledAt) < Date.parse(input.baseline.asOf))
        context.addIssue({
          code: "custom",
          path: ["plannedSessions", index, "scheduledAt"],
          message: "A planned session cannot precede its baseline",
        });
      if (Date.parse(session.scheduledAt) > Date.parse(input.simulationAt))
        context.addIssue({
          code: "custom",
          path: ["plannedSessions", index, "scheduledAt"],
          message: "A planned session cannot follow the simulation instant",
        });
    }
  });

export const planSimulationResultSchema = z
  .object({
    baseStateRevision: z.number().int().nonnegative(),
    simulatedAt: z.string().datetime({ offset: true }),
    projectedState: athleteStateBaselineSchema,
    transitions: z.array(athleteStateTransitionSchema).max(MAX_PLAN_SIMULATION_SESSIONS + 1),
    goalAssessment: goalReadinessAssessmentSchema.nullable(),
  })
  .strict();

export type PlanSimulationInput = z.infer<typeof planSimulationInputSchema>;
export type PlanSimulationResult = z.infer<typeof planSimulationResultSchema>;

/** Goal date is authoritative; plans without a goal use the named latest-session fallback. */
export function resolvePlanReadinessHorizon(input: {
  baselineAsOf: string;
  plannedSessions: readonly { scheduledAt: string }[];
  goal: GoalReadinessContext | null;
}): string {
  if (input.goal) return input.goal.targetAt;
  return new Date(
    Math.max(
      Date.parse(input.baselineAsOf),
      ...input.plannedSessions.map(({ scheduledAt }) => Date.parse(scheduledAt)),
    ),
  ).toISOString();
}

export const draftPlanProjectionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      algorithmVersion: z.literal(DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION),
      simulation: planSimulationResultSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      algorithmVersion: z.literal(DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION),
      reason: z.enum(["missing_schedule", "missing_activity_plan", "too_many_sessions"]),
    })
    .strict(),
]);

const planningDay = getCalendarDateInIanaZone;

const projectedPlanActivityFactSchema = z
  .object({
    activityPlanId: z.string().uuid(),
    activityCategory: canonicalActivityCategorySchema,
    commonLoad: z.number().finite().nonnegative().max(10_000),
  })
  .strict();

const projectedPlanStimulusDerivationInputSchema = z
  .object({
    planId: z.string().uuid(),
    structure: z.union([canonicalTrainingPlanStructureSchema, trainingPlanSchema]),
    activityPlans: z.array(projectedPlanActivityFactSchema).max(MAX_PLAN_SIMULATION_SESSIONS),
    planningTimezone: z.string().trim().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notBefore: z.string().datetime({ offset: true }),
  })
  .strict();

export const projectedPlanStimulusDerivationSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("available"), sessions: z.array(projectedTrainingStimulusSchema) })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum(["missing_schedule", "missing_activity_plan", "too_many_sessions"]),
    })
    .strict(),
]);

export type ProjectedPlanStimulusDerivation = z.infer<typeof projectedPlanStimulusDerivationSchema>;

type SimulatablePlanStructure =
  | z.infer<typeof canonicalTrainingPlanStructureSchema>
  | z.infer<typeof trainingPlanSchema>;

function canonicalPlanStructure(structure: SimulatablePlanStructure) {
  if (!("id" in structure)) return structure;
  const { id: _id, ...canonical } = structure;
  return canonical;
}

export function derivePlanGoalReadinessContext(input: {
  planId: string;
  structure: SimulatablePlanStructure;
  planningTimezone: string;
  startDate: string;
}): GoalReadinessContext | null {
  const structure = canonicalPlanStructure(input.structure);
  const goal = structure.goal_blueprints?.[0];
  if (!goal?.activity_category || goal.target_offset_days === undefined) return null;
  const objective = canonicalGoalObjectiveSchema.safeParse(goal.objective);
  if (!objective.success) return null;
  const distance =
    objective.data.type === "event_performance" || objective.data.type === "completion"
      ? (objective.data.distance_m ?? null)
      : null;
  const durationSeconds =
    objective.data.type === "event_performance"
      ? (objective.data.target_time_s ??
        (objective.data.distance_m && objective.data.target_speed_mps
          ? Math.round(objective.data.distance_m / objective.data.target_speed_mps)
          : null))
      : objective.data.type === "completion"
        ? (objective.data.duration_s ?? null)
        : objective.data.type === "threshold"
          ? (objective.data.test_duration_s ?? null)
          : null;
  return goalReadinessContextSchema.parse({
    goalId: `${input.planId}:goal:0`,
    activityCategory: goal.activity_category,
    targetAt: endOfScheduledDateToIsoInstant({
      scheduledDate: addDaysDateOnlyUtc(input.startDate, goal.target_offset_days),
      timeZone: input.planningTimezone,
    }),
    targetDistanceMeters: distance,
    targetDurationMinutes: durationSeconds === null ? null : durationSeconds / 60,
  });
}

/** Pure adapter shared by draft clients and authoritative server validation. */
export function deriveProjectedPlanStimuli(input: {
  planId: string;
  structure:
    | z.infer<typeof canonicalTrainingPlanStructureSchema>
    | z.infer<typeof trainingPlanSchema>;
  activityPlans: Array<z.infer<typeof projectedPlanActivityFactSchema>>;
  planningTimezone: string;
  startDate: string;
  notBefore: string;
}): ProjectedPlanStimulusDerivation {
  const parsed = projectedPlanStimulusDerivationInputSchema.parse(input);
  const structure = canonicalPlanStructure(parsed.structure);
  if (structure.sessions.length > MAX_PLAN_SIMULATION_SESSIONS)
    return { status: "unavailable", reason: "too_many_sessions" };
  const factsById = new Map(parsed.activityPlans.map((fact) => [fact.activityPlanId, fact]));
  const materialized = materializePlanToEvents(
    structure,
    parsed.startDate,
    parsed.planningTimezone,
  ).filter((event) => Date.parse(event.starts_at) >= Date.parse(parsed.notBefore));
  const sessions = materialized.map((event) => {
    const fact = event.activity_plan_id ? factsById.get(event.activity_plan_id) : undefined;
    if (!fact) return null;
    return projectedTrainingStimulusSchema.parse({
      kind: "projected",
      sourceId: `${parsed.planId}:${event.source_path}`,
      scheduledAt: event.starts_at,
      activityCategory: fact.activityCategory,
      commonLoad: fact.commonLoad,
    });
  });
  if (sessions.some((session) => session === null))
    return { status: "unavailable", reason: "missing_activity_plan" };
  return projectedPlanStimulusDerivationSchema.parse({
    status: "available",
    sessions: sessions.filter(
      (session): session is NonNullable<typeof session> => session !== null,
    ),
  });
}

/** One versioned projection authority shared by tentative clients and authoritative API saves. */
export function deriveDraftPlanProjection(input: {
  baseline: AthleteStateBaseline;
  planId: string;
  structure: SimulatablePlanStructure;
  activityPlans: Array<z.infer<typeof projectedPlanActivityFactSchema>>;
  planningTimezone: string;
  startDate: string;
  simulationAt?: string;
}) {
  const baseline = athleteStateBaselineSchema.parse(input.baseline);
  const derivation = deriveProjectedPlanStimuli({
    planId: input.planId,
    structure: input.structure,
    activityPlans: input.activityPlans,
    planningTimezone: input.planningTimezone,
    startDate: input.startDate,
    notBefore: baseline.asOf,
  });
  if (derivation.status === "unavailable")
    return draftPlanProjectionResultSchema.parse({
      status: "unavailable",
      algorithmVersion: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
      reason: derivation.reason,
    });
  const goal = derivePlanGoalReadinessContext({
    planId: input.planId,
    structure: input.structure,
    planningTimezone: input.planningTimezone,
    startDate: input.startDate,
  });
  const simulationAt =
    input.simulationAt ??
    resolvePlanReadinessHorizon({
      baselineAsOf: baseline.asOf,
      plannedSessions: derivation.sessions,
      goal,
    });
  return draftPlanProjectionResultSchema.parse({
    status: "available",
    algorithmVersion: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
    simulation: simulateTrainingPlan({
      baseline,
      plannedSessions: derivation.sessions,
      simulationAt,
      planningTimezone: input.planningTimezone,
      goal,
    }),
  });
}

/** Pure bounded simulation. It never mutates or persists the supplied observed baseline. */
export function simulateTrainingPlan(input: PlanSimulationInput): PlanSimulationResult {
  const parsed = planSimulationInputSchema.parse(input);
  const byPlanningDay = new Map<
    string,
    {
      commonLoad: number;
      activityCategories: Set<PlanSimulationInput["plannedSessions"][number]["activityCategory"]>;
      scheduledAt: string;
    }
  >();
  for (const session of parsed.plannedSessions) {
    const day = planningDay(session.scheduledAt, parsed.planningTimezone);
    const aggregate = byPlanningDay.get(day) ?? {
      commonLoad: 0,
      activityCategories: new Set(),
      scheduledAt: session.scheduledAt,
    };
    aggregate.commonLoad += session.commonLoad;
    aggregate.activityCategories.add(session.activityCategory);
    if (session.scheduledAt > aggregate.scheduledAt) aggregate.scheduledAt = session.scheduledAt;
    byPlanningDay.set(day, aggregate);
  }
  const sessions = [...byPlanningDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, aggregate]) => ({
      day,
      stimulus: projectedDailyTrainingStimulusSchema.parse({
        kind: "projected",
        sourceId: `plan-day:${day}`,
        scheduledAt: aggregate.scheduledAt,
        activityCategory:
          aggregate.activityCategories.size === 1
            ? ([...aggregate.activityCategories][0] ?? "other")
            : "other",
        commonLoad: aggregate.commonLoad,
      }),
    }));
  let projectedState: AthleteStateBaseline = parsed.baseline;
  let projectedPlanningDay = planningDay(parsed.baseline.asOf, parsed.planningTimezone);
  const transitions = [];
  for (const session of sessions) {
    const transition = advanceProjectedAthleteState({
      baseline: projectedState,
      planningDays: { fromDay: projectedPlanningDay, toDay: session.day },
      stimulus: session.stimulus,
    });
    transitions.push(transition);
    projectedState = transition.state;
    projectedPlanningDay = session.day;
  }
  if (projectedState.asOf !== parsed.simulationAt) {
    const decay = advanceAthleteStateTo(projectedState, parsed.simulationAt, {
      fromDay: projectedPlanningDay,
      toDay: planningDay(parsed.simulationAt, parsed.planningTimezone),
    });
    transitions.push(decay);
    projectedState = decay.state;
  }
  return planSimulationResultSchema.parse({
    baseStateRevision: parsed.baseline.stateRevision,
    simulatedAt: parsed.simulationAt,
    projectedState,
    transitions,
    goalAssessment:
      parsed.goal === null
        ? null
        : evaluateGoalReadiness({
            baseline: projectedState,
            goal: parsed.goal,
            assessmentAt: parsed.simulationAt,
          }),
  });
}
