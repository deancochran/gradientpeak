import {
  canonicalGoalObjectiveSchema,
  endOfScheduledDateToIsoInstant,
  evaluateGoalReadiness,
  goalReadinessAssessmentSchema,
  goalReadinessContextSchema,
  type ProjectedTrainingStimulus,
  simulateTrainingPlan,
} from "@repo/core";
import { profileGoals } from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  type GoalAssessmentBatchResponse,
  goalAssessmentBatchResponseSchema,
} from "../../contracts/goal-assessment-batch";
import type { DrizzleQueryExecutor } from "../../db";
import { readAthleteReadModel } from "./athlete-read-model";
import {
  projectionFreshnessSchema,
  projectionRebuildStatusSchema,
} from "./published-athlete-state";
export const goalAssessmentResponseSchema = z
  .object({
    stateRevision: z.number().int().nonnegative().nullable(),
    computedAt: z.string().datetime({ offset: true }),
    freshness: projectionFreshnessSchema,
    assessmentConfidence: z.number().min(0).max(1),
    rebuildStatus: projectionRebuildStatusSchema,
    assessment: goalReadinessAssessmentSchema.nullable(),
  })
  .strict();

export type GoalAssessmentResponse = z.infer<typeof goalAssessmentResponseSchema>;

type AssessmentGoal = {
  id: string;
  activity_category: string;
  target_date: string;
  target_payload: unknown;
};

function assessGoalFromReadModel(input: {
  goal: AssessmentGoal;
  readModel: Awaited<ReturnType<typeof readAthleteReadModel>>;
  now: Date;
  plannedSessions?: ProjectedTrainingStimulus[];
}): GoalAssessmentResponse {
  const { goal, readModel, now } = input;
  const status = readModel.status;
  const currentBaseline = readModel.currentBaseline;
  if (!status || !currentBaseline?.baseline) {
    return goalAssessmentResponseSchema.parse({
      stateRevision: readModel.publishedRevision,
      computedAt: now.toISOString(),
      freshness: "unavailable",
      assessmentConfidence: 0,
      rebuildStatus: status?.rebuildStatus ?? "unavailable",
      assessment: null,
    });
  }
  const publishedBaseline = currentBaseline.baseline;
  const objective = canonicalGoalObjectiveSchema.parse(goal.target_payload);
  const distance =
    objective.type === "event_performance" || objective.type === "completion"
      ? (objective.distance_m ?? null)
      : null;
  const durationSeconds =
    objective.type === "event_performance"
      ? (objective.target_time_s ??
        (objective.distance_m && objective.target_speed_mps
          ? Math.round(objective.distance_m / objective.target_speed_mps)
          : null))
      : objective.type === "completion"
        ? (objective.duration_s ?? null)
        : objective.type === "threshold"
          ? (objective.test_duration_s ?? null)
          : null;
  const goalContext = goalReadinessContextSchema.parse({
    goalId: goal.id,
    activityCategory: goal.activity_category,
    targetAt: endOfScheduledDateToIsoInstant({
      scheduledDate: goal.target_date,
      timeZone: currentBaseline.planningTimezone,
    }),
    targetDistanceMeters: distance,
    targetDurationMinutes: durationSeconds === null ? null : durationSeconds / 60,
  });
  const plannedSessions = input.plannedSessions?.map((session) => ({
    ...session,
    scheduledAt: new Date(session.scheduledAt).toISOString(),
  }));
  const simulationAt = new Date(
    Math.max(
      now.getTime(),
      Date.parse(publishedBaseline.asOf),
      Date.parse(goalContext.targetAt),
      ...(plannedSessions?.map(({ scheduledAt }) => Date.parse(scheduledAt)) ?? []),
    ),
  ).toISOString();
  const assessment = plannedSessions?.length
    ? simulateTrainingPlan({
        baseline: publishedBaseline,
        plannedSessions,
        simulationAt,
        planningTimezone: currentBaseline.planningTimezone,
        goal: goalContext,
      }).goalAssessment
    : evaluateGoalReadiness({
        baseline: publishedBaseline,
        goal: goalContext,
        assessmentAt: now.toISOString(),
      });
  if (!assessment) throw new Error("Goal assessment could not be evaluated");
  return goalAssessmentResponseSchema.parse({
    stateRevision: readModel.publishedRevision,
    computedAt: now.toISOString(),
    freshness: status.freshness,
    assessmentConfidence: assessment.assessmentConfidence,
    rebuildStatus: status.rebuildStatus,
    assessment,
  });
}

export async function getGoalAssessment(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  goalId: string;
  now?: Date;
  plannedSessions?: ProjectedTrainingStimulus[];
}): Promise<GoalAssessmentResponse> {
  const now = input.now ?? new Date();
  const [goal] = await input.db
    .select()
    .from(profileGoals)
    .where(and(eq(profileGoals.id, input.goalId), eq(profileGoals.profile_id, input.profileId)))
    .limit(1);
  if (!goal) throw new Error("Goal not found");
  const readModel = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
    },
    now,
  });
  return assessGoalFromReadModel({
    goal,
    readModel,
    now,
    ...(input.plannedSessions === undefined ? {} : { plannedSessions: input.plannedSessions }),
  });
}

export async function getGoalAssessmentBatch(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  goalIds: readonly string[];
  now?: Date;
}): Promise<GoalAssessmentBatchResponse> {
  const now = input.now ?? new Date();
  const goals = await input.db
    .select({
      id: profileGoals.id,
      activity_category: profileGoals.activity_category,
      target_date: profileGoals.target_date,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(
      and(eq(profileGoals.profile_id, input.profileId), inArray(profileGoals.id, input.goalIds)),
    );
  if (goals.length === 0) return goalAssessmentBatchResponseSchema.parse({ entries: [] });

  const readModel = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
    },
    now,
  });
  const results = new Map(
    goals.map((goal) => [goal.id, assessGoalFromReadModel({ goal, readModel, now })]),
  );
  return goalAssessmentBatchResponseSchema.parse({
    entries: input.goalIds.flatMap((goalId) => {
      const result = results.get(goalId);
      if (!result) return [];
      return [
        {
          goalId,
          readiness: result.assessment
            ? { status: result.assessment.status, value: result.assessment.readiness }
            : null,
          freshness: result.freshness,
          confidence: result.assessmentConfidence,
          revision: result.stateRevision,
          computedAt: result.computedAt,
        },
      ];
    }),
  });
}
