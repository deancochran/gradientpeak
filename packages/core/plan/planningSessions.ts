import { z } from "zod";
import { activityPlanTargetSchema } from "../activity-plan";
import { activityPrescriptionQuantificationBundleSchema } from "../activity-quantification";
import { activityPlanDurationEstimateSchema } from "../duration";
import { commonLoadAggregateSchema, commonLoadResultSchema } from "../load";
import {
  type ActivityPlanPlanningEstimate,
  createUnavailableActivityPlanPlanningEstimate,
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
    prescriptionQuantification: activityPrescriptionQuantificationBundleSchema.nullable(),
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
    targetLoad: z.number().min(0).optional(),
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
      stage: z.enum(["template", "plan", "scheduled"]),
      prescriptionQuantification: activityPrescriptionQuantificationBundleSchema,
      authoredTargets: z.array(
        z
          .object({
            occurrenceId: z.string().min(1),
            targets: z.array(activityPlanTargetSchema),
          })
          .strict(),
      ),
      durationEstimate: activityPlanDurationEstimateSchema,
      durationProvenance: z.enum(["estimated", "prescribed", "measured", "unknown"]).nullable(),
      restSeconds: z.number(),
      distanceProvenance: z.enum(["estimated", "prescribed", "measured", "unknown"]).nullable(),
      hasOpenCompletion: z.boolean(),
      categoryDoses: z.array(
        z
          .object({
            activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
            timedActiveSeconds: z.number(),
            distanceMeters: z.number(),
            repetitionCount: z.number(),
            openOccurrenceCount: z.number(),
            commonLoad: z.union([commonLoadResultSchema, commonLoadAggregateSchema]),
            evidence: z.enum(["common_load", "partial_common_load", "unsupported"]),
            evidenceCoverage: z.number().nullable(),
          })
          .strict(),
      ),
      factors: z.array(z.string()),
      warnings: z.array(z.string()),
    })
    .strict()
    .superRefine((estimate, context) => {
      const elapsed = estimate.prescriptionQuantification.summary.duration.elapsed;
      const quantifiedDuration = elapsed.status === "unavailable" ? null : elapsed.value;
      if (
        estimate.durationEstimate.status !== "unavailable" &&
        quantifiedDuration !== estimate.durationEstimate.valueSeconds
      ) {
        context.addIssue({
          code: "custom",
          path: ["durationEstimate", "valueSeconds"],
          message: "Duration projection must match the provenance-bearing duration estimate",
        });
      }
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
  id?: string;
  activity_category?: string | null;
  structure?: unknown;
};

export function estimatePlanningActivityPlanForAthlete({
  activityPlan,
  athleteContext,
  scheduledEventId,
  planId,
  stage = "plan",
}: {
  activityPlan: EstimateablePlanningActivityPlan;
  athleteContext: AthletePlanningContext;
  scheduledEventId?: string | undefined;
  planId?: string | undefined;
  stage?: "template" | "plan" | "scheduled" | undefined;
}): ActivityPlanPlanningEstimate {
  if (activityPlan.structure === undefined) {
    return createUnavailableActivityPlanPlanningEstimate({
      asOf: athleteContext.performanceTargets.asOf,
      stage,
      planId: planId ?? activityPlan.id,
      scheduledEventId,
      reason: "source_missing",
    });
  }
  return estimateActivityPlanForTrainingContext({
    structure: activityPlan.structure,
    performanceTargets: athleteContext.performanceTargets,
    asOf: athleteContext.performanceTargets.asOf,
    stage,
    planId: planId ?? activityPlan.id,
    scheduledEventId,
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
  const activityPlan = session.activityPlan;
  if (!activityPlan) return null;
  const activityPlanId = activityPlan.id;
  const fullPlan = activityPlansById[activityPlanId];
  if (fullPlan) {
    return estimatePlanningActivityPlanForAthlete({
      activityPlan: fullPlan,
      athleteContext,
      planId: activityPlanId,
      scheduledEventId: `${session.localId}:${session.offsetDays}`,
      stage: "scheduled",
    });
  }
  return null;
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
  const existingQuantification = session.activityPlan.prescriptionQuantification;
  const evidenceRank = { unavailable: 0, partial: 1, complete: 2 } as const;
  if (
    existingQuantification &&
    evidenceRank[existingQuantification.summary.commonLoad.status] >
      evidenceRank[estimate.prescriptionQuantification.summary.commonLoad.status]
  ) {
    return session;
  }

  return {
    ...session,
    activityPlan: {
      ...session.activityPlan,
      prescriptionQuantification: estimate.prescriptionQuantification,
    },
  };
}
