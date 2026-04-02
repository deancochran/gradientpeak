import { type InferredStateSnapshot, inferredStateSnapshotSchema } from "@repo/core";
import type { JsonValue } from "@repo/db";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import type {
  CreatedTrainingPlanRecord,
  CreateTrainingPlanRecordInput,
  TrainingPlanRepository,
} from "../../repositories";

type DrizzleLike = {
  insert: (...args: any[]) => any;
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export function createTrainingPlanRepository(db: DrizzleLike): TrainingPlanRepository {
  const parseTrainingPlanStructure = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const parsePriorSnapshotFromStructure = (structure: unknown): InferredStateSnapshot | null => {
    const parsedStructure = parseTrainingPlanStructure(structure);
    if (!parsedStructure) {
      return null;
    }

    const metadata = parsedStructure.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }

    const candidate = (metadata as Record<string, unknown>).inferred_state_snapshot;
    const parsedSnapshot = inferredStateSnapshotSchema.safeParse(candidate);
    if (!parsedSnapshot.success) {
      return null;
    }

    return parsedSnapshot.data;
  };

  const resolveTargetPlan = async (input: {
    profileId: string;
    trainingPlanId?: string;
  }): Promise<{
    id: string;
    structure: unknown;
  } | null> => {
    if (input.trainingPlanId) {
      const [data] = await db
        .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
        .from(schema.trainingPlans)
        .where(
          and(
            eq(schema.trainingPlans.id, input.trainingPlanId),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        )
        .limit(1);

      return data ? { id: data.id, structure: data.structure } : null;
    }

    const activeEvents = await db
      .select({
        training_plan_id: schema.events.training_plan_id,
        starts_at: schema.events.starts_at,
      })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.event_type, "planned_activity"),
          isNotNull(schema.events.training_plan_id),
          gte(schema.events.starts_at, new Date()),
        ),
      )
      .orderBy(asc(schema.events.starts_at))
      .limit(1);

    const activePlanId = activeEvents[0]?.training_plan_id;
    if (!activePlanId) {
      return null;
    }

    const [activePlan] = await db
      .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
      .from(schema.trainingPlans)
      .where(
        and(
          eq(schema.trainingPlans.id, activePlanId),
          eq(schema.trainingPlans.profile_id, input.profileId),
        ),
      )
      .limit(1);

    return activePlan ? { id: activePlan.id, structure: activePlan.structure } : null;
  };

  return {
    async createTrainingPlan(
      input: CreateTrainingPlanRecordInput,
    ): Promise<CreatedTrainingPlanRecord> {
      const [data] = await db
        .insert(schema.trainingPlans)
        .values({
          name: input.name,
          description: input.description,
          structure: input.structure as JsonValue,
          profile_id: input.profileId,
        })
        .returning();

      if (!data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to create training plan",
        });
      }

      return data as CreatedTrainingPlanRecord;
    },

    async getPriorInferredStateSnapshot(profileId: string) {
      const plan = await resolveTargetPlan({ profileId });
      if (!plan) {
        return null;
      }

      return parsePriorSnapshotFromStructure(plan.structure);
    },

    async persistInferredStateSnapshot(input) {
      const plan = await resolveTargetPlan({
        profileId: input.profileId,
        trainingPlanId: input.trainingPlanId,
      });

      if (!plan) {
        return;
      }

      const parsedStructure = parseTrainingPlanStructure(plan.structure) ?? {};
      const existingMetadata =
        parsedStructure.metadata &&
        typeof parsedStructure.metadata === "object" &&
        !Array.isArray(parsedStructure.metadata)
          ? (parsedStructure.metadata as Record<string, unknown>)
          : {};

      const nextStructure = {
        ...parsedStructure,
        metadata: {
          ...existingMetadata,
          inferred_state_snapshot: inferredStateSnapshotSchema.parse(input.inferredStateSnapshot),
        },
      };

      await db
        .update(schema.trainingPlans)
        .set({
          structure: nextStructure as JsonValue,
        })
        .where(
          and(
            eq(schema.trainingPlans.id, plan.id),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        );
    },
  };
}
