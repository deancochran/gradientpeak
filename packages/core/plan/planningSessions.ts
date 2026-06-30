import { z } from "zod";
import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";
import type { CanonicalSport } from "../schemas/sport";
import {
  type ActivityPlanPlanningEstimate,
  type ActivityPlanPlanningEstimateInput,
  estimateActivityPlanForTrainingContext,
} from "./activity-plan-planning-estimate";
import type { AthletePlanningContext } from "./athletePlanningContext";

const uuidSchema = z.string().uuid();

export const plannedTrainingActivityPlanFactsSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1),
    published: z.boolean(),
    accessible: z.boolean(),
    estimatedTss: z.number().min(0).nullable(),
    estimatedDurationSeconds: z.number().int().min(0).nullable(),
  })
  .strict();

export const plannedTrainingEventOverridesSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    start_time: z.string().optional(),
  })
  .strict();

export const plannedTrainingSessionIntentSchema = z
  .object({
    type: z.enum(["endurance", "recovery", "threshold", "general", "test"]),
    driver: z.enum([
      "consistency-frequency",
      "completion-duration",
      "completion-distance",
      "preference-frequency",
      "starter-frequency",
    ]),
    targetDurationSeconds: z.number().int().min(0).optional(),
    targetTss: z.number().min(0).optional(),
  })
  .strict();

export const plannedTrainingSessionSchema = z
  .object({
    localId: z.string().min(1),
    offsetDays: z.number().int(),
    intent: plannedTrainingSessionIntentSchema.optional(),
    activityPlan: plannedTrainingActivityPlanFactsSchema.nullable(),
    eventOverrides: plannedTrainingEventOverridesSchema.optional(),
  })
  .strict();

export const estimatedPlannedTrainingSessionSchema = plannedTrainingSessionSchema.extend({
  activityPlanEstimate: z
    .object({
      durationSeconds: z.number().nullable(),
      distanceMeters: z.number().nullable(),
      intensityFactor: z.number().nullable(),
      tss: z.number().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      factors: z.array(z.string()),
      warnings: z.array(z.string()),
    })
    .nullable(),
});

export type PlannedTrainingActivityPlanFacts = z.infer<
  typeof plannedTrainingActivityPlanFactsSchema
>;
export type PlannedTrainingEventOverrides = z.infer<typeof plannedTrainingEventOverridesSchema>;
export type PlannedTrainingSessionIntent = z.infer<typeof plannedTrainingSessionIntentSchema>;
export type PlannedTrainingSession = z.infer<typeof plannedTrainingSessionSchema>;
export type EstimatedPlannedTrainingSession = z.infer<typeof estimatedPlannedTrainingSessionSchema>;

export type EstimateablePlanningActivityPlan = {
  activity_category?: string | null;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
    intensity_factor?: number | null;
    distance_meters?: number | null;
  } | null;
  structure?: unknown;
};

export function estimatePlanningActivityPlanForAthlete({
  activityPlan,
  athleteContext,
}: {
  activityPlan: EstimateablePlanningActivityPlan;
  athleteContext: AthletePlanningContext;
}): ActivityPlanPlanningEstimate {
  return estimateActivityPlanForTrainingContext({
    activityCategory: normalizePlanningActivityCategory(activityPlan.activity_category),
    structure: activityPlan.structure as ActivityPlanPlanningEstimateInput["structure"],
    authoritativeMetrics: {
      estimatedDurationSeconds: activityPlan.authoritative_metrics?.estimated_duration ?? null,
      estimatedTss: activityPlan.authoritative_metrics?.estimated_tss ?? null,
      intensityFactor: activityPlan.authoritative_metrics?.intensity_factor ?? null,
      distanceMeters: activityPlan.authoritative_metrics?.distance_meters ?? null,
    },
    athleteContext: {
      ftpWatts: athleteContext.physiology.ftpWatts.value,
      thresholdPaceSecondsPerKm: deriveThresholdPaceSecondsPerKm(athleteContext),
    },
  });
}

export function derivePlannedTrainingSessionEstimate({
  activityPlansById,
  athleteContext,
  session,
}: {
  activityPlansById: Record<string, EstimateablePlanningActivityPlan | undefined>;
  athleteContext: AthletePlanningContext;
  session: PlannedTrainingSession;
}): ActivityPlanPlanningEstimate | null {
  const activityPlanId = session.activityPlan?.id;
  if (!activityPlanId) return null;
  const fullPlan = activityPlansById[activityPlanId];
  if (fullPlan) {
    return estimatePlanningActivityPlanForAthlete({ activityPlan: fullPlan, athleteContext });
  }
  return {
    durationSeconds: session.activityPlan?.estimatedDurationSeconds ?? null,
    distanceMeters: null,
    intensityFactor: null,
    tss: session.activityPlan?.estimatedTss ?? null,
    confidence: "low",
    factors: ["saved activity plan metrics"],
    warnings: ["Full activity plan details are not loaded for athlete-context estimation."],
  };
}

export function deriveEstimatedPlannedTrainingSessions({
  activityPlansById,
  athleteContext,
  sessions,
}: {
  activityPlansById: Record<string, EstimateablePlanningActivityPlan | undefined>;
  athleteContext: AthletePlanningContext;
  sessions: PlannedTrainingSession[];
}): EstimatedPlannedTrainingSession[] {
  return sessions.map((session) => ({
    ...session,
    activityPlanEstimate: derivePlannedTrainingSessionEstimate({
      activityPlansById,
      athleteContext,
      session,
    }),
  }));
}

export function applyEstimatedSessionActivityFacts(
  session: PlannedTrainingSession,
  estimate: ActivityPlanPlanningEstimate | null,
): PlannedTrainingSession {
  if (!session.activityPlan || !estimate) return session;
  if (
    session.activityPlan.estimatedDurationSeconds === estimate.durationSeconds &&
    session.activityPlan.estimatedTss === estimate.tss
  ) {
    return session;
  }
  return {
    ...session,
    activityPlan: {
      ...session.activityPlan,
      estimatedDurationSeconds: estimate.durationSeconds,
      estimatedTss: estimate.tss,
    },
  };
}

function deriveThresholdPaceSecondsPerKm(athleteContext: AthletePlanningContext) {
  const speedEfforts = athleteContext.efforts.filter(
    (effort) =>
      effort.activityCategory === "run" && effort.effortType === "speed" && effort.value > 0,
  );
  const latestSpeed = speedEfforts[0]?.value ?? null;
  return latestSpeed ? 1000 / latestSpeed : null;
}

function normalizePlanningActivityCategory(category: string | null | undefined): CanonicalSport {
  if (category === "run" || category === "bike" || category === "swim" || category === "strength") {
    return category;
  }
  return "other";
}
