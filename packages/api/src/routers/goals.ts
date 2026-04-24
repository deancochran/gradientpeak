import { randomUUID } from "node:crypto";
import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  profileGoalCreateSchema,
  profileGoalRecordSchema,
} from "@repo/core";
import { events, profileGoals, trainingPlans } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildIndexPageInfo, indexCursorSchema, parseIndexCursor } from "../utils/index-cursor";
import { assertProfileAccess } from "./account/profile-access";

function toSafeDbErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Unknown database error";
  }

  const databaseError = error as {
    code?: string;
    message?: string;
  };

  const code = databaseError.code ? `[${databaseError.code}] ` : "";
  const message = (databaseError.message ?? "Unknown database error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return `${code}${message}`;
}

function rethrowTrpcError(error: unknown): never | void {
  if (error instanceof TRPCError) {
    throw error;
  }
}

const goalIdSchema = z.string().uuid();
const goalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const milestoneTrainingPlanIdSchema = z.string().uuid().nullable().optional();

const goalsListInputSchema = z
  .object({
    profile_id: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const profileGoalWriteSchema = z
  .object({
    profile_id: z.string().uuid(),
    target_date: goalDateSchema,
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
    training_plan_id: milestoneTrainingPlanIdSchema,
  })
  .strict();
const profileGoalUpdateDataSchema = z
  .object({
    target_date: goalDateSchema,
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
    training_plan_id: milestoneTrainingPlanIdSchema,
  })
  .partial()
  .strict();

const goalIdInputSchema = z.object({ id: goalIdSchema }).strict();

const profileGoalUpdateInputSchema = z
  .object({
    id: goalIdSchema,
    data: profileGoalUpdateDataSchema,
  })
  .strict();

type ProfileGoalRecord = z.infer<typeof profileGoalRecordSchema>;
type GoalMilestoneProjection = {
  eventType: "race" | "custom";
  startsAt: string;
  title: string;
};

function buildGoalMilestoneProjection(
  input: Pick<ProfileGoalRecord, "target_date" | "title" | "target_payload">,
): GoalMilestoneProjection {
  return {
    eventType: input.target_payload.type === "event_performance" ? "race" : "custom",
    startsAt: `${input.target_date}T12:00:00.000Z`,
    title: input.title,
  };
}

async function assertOwnedTrainingPlan(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  trainingPlanId: string;
}): Promise<void> {
  const [row] = await input.db
    .select({ id: trainingPlans.id })
    .from(trainingPlans)
    .where(
      and(
        eq(trainingPlans.id, input.trainingPlanId),
        eq(trainingPlans.profile_id, input.profileId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Training plan not found or not accessible",
    });
  }
}

async function getOwnedMilestoneEvent(input: {
  db: ReturnType<typeof getRequiredDb>;
  eventId: string;
  profileId: string;
}) {
  const [row] = await input.db
    .select({
      id: events.id,
      profile_id: events.profile_id,
      training_plan_id: events.training_plan_id,
    })
    .from(events)
    .where(eq(events.id, input.eventId))
    .limit(1);

  if (!row || row.profile_id !== input.profileId) {
    return null;
  }

  return row;
}

async function listProfileGoals(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  limit: number;
  offset: number;
}): Promise<ProfileGoalRecord[]> {
  const rows = await input.db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      milestone_event_id: profileGoals.milestone_event_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(eq(profileGoals.profile_id, input.profileId))
    .orderBy(desc(profileGoals.created_at))
    .limit(input.limit)
    .offset(input.offset);

  return profileGoalRecordSchema.array().parse(rows);
}

async function getProfileGoalById(input: {
  db: ReturnType<typeof getRequiredDb>;
  id: string;
}): Promise<ProfileGoalRecord | null> {
  const row =
    (
      await input.db
        .select({
          id: profileGoals.id,
          profile_id: profileGoals.profile_id,
          milestone_event_id: profileGoals.milestone_event_id,
          target_date: profileGoals.target_date,
          title: profileGoals.title,
          priority: profileGoals.priority,
          activity_category: profileGoals.activity_category,
          target_payload: profileGoals.target_payload,
        })
        .from(profileGoals)
        .where(eq(profileGoals.id, input.id))
        .limit(1)
    )[0] ?? null;

  return row ? profileGoalRecordSchema.parse(row) : null;
}

async function createProfileGoal(input: {
  db: ReturnType<typeof getRequiredDb>;
  values: z.infer<typeof profileGoalCreateSchema> & { milestone_event_id: string };
}): Promise<ProfileGoalRecord> {
  const [row] = await input.db
    .insert(profileGoals)
    .values({
      id: randomUUID(),
      profile_id: input.values.profile_id,
      milestone_event_id: input.values.milestone_event_id,
      target_date: input.values.target_date,
      title: input.values.title,
      priority: input.values.priority,
      activity_category: input.values.activity_category,
      target_payload: input.values.target_payload,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      milestone_event_id: profileGoals.milestone_event_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    });

  return profileGoalRecordSchema.parse(row);
}

async function updateProfileGoal(input: {
  db: ReturnType<typeof getRequiredDb>;
  id: string;
  data: ProfileGoalRecord;
}): Promise<ProfileGoalRecord> {
  const [row] = await input.db
    .update(profileGoals)
    .set({
      milestone_event_id: input.data.milestone_event_id,
      target_date: input.data.target_date,
      title: input.data.title,
      priority: input.data.priority,
      activity_category: input.data.activity_category,
      target_payload: input.data.target_payload,
      updated_at: new Date(),
    })
    .where(eq(profileGoals.id, input.id))
    .returning({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      milestone_event_id: profileGoals.milestone_event_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    });

  return profileGoalRecordSchema.parse(row);
}

async function deleteProfileGoal(input: {
  db: ReturnType<typeof getRequiredDb>;
  id: string;
}): Promise<void> {
  await input.db.delete(profileGoals).where(eq(profileGoals.id, input.id));
}

async function createGoalMilestoneEvent(input: {
  db: ReturnType<typeof getRequiredDb>;
  goal: Pick<ProfileGoalRecord, "profile_id" | "target_date" | "title" | "target_payload">;
  trainingPlanId?: string | null;
}): Promise<string> {
  const projection = buildGoalMilestoneProjection(input.goal);
  const [row] = await input.db
    .insert(events)
    .values({
      id: randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
      profile_id: input.goal.profile_id,
      training_plan_id: input.trainingPlanId ?? null,
      event_type: projection.eventType,
      status: "scheduled",
      title: projection.title,
      all_day: true,
      timezone: "UTC",
      starts_at: new Date(projection.startsAt),
      read_only: false,
    })
    .returning({ id: events.id });

  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create linked milestone event",
    });
  }

  return row.id;
}

async function updateGoalMilestoneEvent(input: {
  db: ReturnType<typeof getRequiredDb>;
  eventId: string;
  profileId: string;
  goal: Pick<ProfileGoalRecord, "target_date" | "title" | "target_payload">;
  trainingPlanId?: string | null;
  preserveTrainingPlanId?: string | null;
}): Promise<void> {
  const projection = buildGoalMilestoneProjection(input.goal);
  await input.db
    .update(events)
    .set({
      updated_at: new Date(),
      training_plan_id:
        input.trainingPlanId !== undefined
          ? input.trainingPlanId
          : (input.preserveTrainingPlanId ?? null),
      event_type: projection.eventType,
      title: projection.title,
      all_day: true,
      timezone: "UTC",
      starts_at: new Date(projection.startsAt),
      read_only: false,
    })
    .where(and(eq(events.id, input.eventId), eq(events.profile_id, input.profileId)));
}

async function deleteGoalMilestoneEvent(input: {
  db: ReturnType<typeof getRequiredDb>;
  eventId: string;
  profileId: string;
}): Promise<void> {
  await input.db
    .delete(events)
    .where(and(eq(events.id, input.eventId), eq(events.profile_id, input.profileId)));
}

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure.input(goalsListInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const offset = parseIndexCursor(input.cursor);

    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    try {
      const [items, totalRows] = await Promise.all([
        listProfileGoals({
          db,
          profileId: input.profile_id,
          limit: input.limit,
          offset,
        }),
        db
          .select({ total: count() })
          .from(profileGoals)
          .where(eq(profileGoals.profile_id, input.profile_id)),
      ]);

      const total = Number(totalRows[0]?.total ?? 0);

      return {
        items,
        total,
        ...buildIndexPageInfo({ offset, limit: input.limit, total }),
      };
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list profile goals",
      });
    }
  }),

  getById: protectedProcedure.input(goalIdInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    const goal = await getProfileGoalById({
      db,
      id: input.id,
    });

    if (!goal) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Goal not found",
      });
    }

    await assertProfileAccess({
      ctx,
      profileId: goal.profile_id,
    });

    return goal;
  }),

  create: protectedProcedure.input(profileGoalWriteSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    try {
      if (input.training_plan_id) {
        await assertOwnedTrainingPlan({
          db,
          profileId: input.profile_id,
          trainingPlanId: input.training_plan_id,
        });
      }

      const createdGoal = await db.transaction(async (tx) => {
        const txDb = tx as unknown as ReturnType<typeof getRequiredDb>;
        const milestoneEventId = await createGoalMilestoneEvent({
          db: txDb,
          goal: {
            profile_id: input.profile_id,
            target_date: input.target_date,
            title: input.title,
            target_payload: input.target_payload,
          },
          trainingPlanId: input.training_plan_id,
        });

        return createProfileGoal({
          db: txDb,
          values: {
            profile_id: input.profile_id,
            milestone_event_id: milestoneEventId,
            target_date: input.target_date,
            title: input.title,
            priority: input.priority,
            activity_category: input.activity_category,
            target_payload: input.target_payload,
          },
        });
      });

      return {
        ...createdGoal,
        cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
      };
    } catch (error) {
      rethrowTrpcError(error);
      console.error("goals.create failed", {
        profileId: input.profile_id,
        errorCode:
          error && typeof error === "object" && "code" in error ? (error as any).code : null,
        errorMessage:
          error && typeof error === "object" && "message" in error ? (error as any).message : null,
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create goal: ${toSafeDbErrorMessage(error)}`,
      });
    }
  }),

  update: protectedProcedure
    .input(profileGoalUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const existingGoal = await getProfileGoalById({
        db,
        id: input.id,
      });

      if (!existingGoal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }

      await assertProfileAccess({
        ctx,
        profileId: existingGoal.profile_id,
      });

      const { training_plan_id, ...goalUpdateData } = input.data;
      const mergedGoal = profileGoalRecordSchema.safeParse({
        ...existingGoal,
        ...goalUpdateData,
      });

      if (!mergedGoal.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Goal update payload is invalid",
          cause: mergedGoal.error.flatten(),
        });
      }

      try {
        if (training_plan_id) {
          await assertOwnedTrainingPlan({
            db,
            profileId: existingGoal.profile_id,
            trainingPlanId: training_plan_id,
          });
        }

        const updatedGoal = await db.transaction(async (tx) => {
          const txDb = tx as unknown as ReturnType<typeof getRequiredDb>;
          const existingMilestoneEvent = await getOwnedMilestoneEvent({
            db: txDb,
            eventId: existingGoal.milestone_event_id,
            profileId: existingGoal.profile_id,
          });

          const milestoneEventId = existingMilestoneEvent?.id
            ? existingMilestoneEvent.id
            : await createGoalMilestoneEvent({
                db: txDb,
                goal: mergedGoal.data,
                trainingPlanId: training_plan_id,
              });

          if (existingMilestoneEvent?.id) {
            await updateGoalMilestoneEvent({
              db: txDb,
              eventId: existingMilestoneEvent.id,
              profileId: existingGoal.profile_id,
              goal: mergedGoal.data,
              trainingPlanId: training_plan_id,
              preserveTrainingPlanId: existingMilestoneEvent.training_plan_id,
            });
          }

          return updateProfileGoal({
            db: txDb,
            id: input.id,
            data: {
              ...mergedGoal.data,
              milestone_event_id: milestoneEventId,
            },
          });
        });

        return {
          ...updatedGoal,
          cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
        };
      } catch (error) {
        rethrowTrpcError(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update goal",
        });
      }
    }),

  delete: protectedProcedure.input(goalIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    const existingGoal = await getProfileGoalById({
      db,
      id: input.id,
    });

    if (!existingGoal) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Goal not found",
      });
    }

    await assertProfileAccess({
      ctx,
      profileId: existingGoal.profile_id,
    });

    try {
      await db.transaction(async (tx) => {
        const txDb = tx as unknown as ReturnType<typeof getRequiredDb>;
        await deleteProfileGoal({
          db: txDb,
          id: input.id,
        });
        await deleteGoalMilestoneEvent({
          db: txDb,
          eventId: existingGoal.milestone_event_id,
          profileId: existingGoal.profile_id,
        });
      });
    } catch (error) {
      rethrowTrpcError(error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete goal",
      });
    }

    return {
      success: true,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    };
  }),
});
