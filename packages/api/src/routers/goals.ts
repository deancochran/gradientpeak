import { randomUUID } from "node:crypto";
import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  profileGoalCreateSchema,
  profileGoalRecordSchema,
} from "@repo/core";
import { profileGoals } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
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

const goalIdSchema = z.string().uuid();

const goalsListInputSchema = z
  .object({
    profile_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

const profileGoalWriteSchema = profileGoalCreateSchema;
const profileGoalUpdateDataSchema = z
  .object({
    milestone_event_id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
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
  values: z.infer<typeof profileGoalWriteSchema>;
}): Promise<ProfileGoalRecord> {
  const [row] = await input.db
    .insert(profileGoals)
    .values({
      id: randomUUID(),
      profile_id: input.values.profile_id,
      milestone_event_id: input.values.milestone_event_id,
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

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure.input(goalsListInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    try {
      return await listProfileGoals({
        db,
        profileId: input.profile_id,
        limit: input.limit,
        offset: input.offset,
      });
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

    let createdGoal: ProfileGoalRecord;

    try {
      createdGoal = await createProfileGoal({
        db,
        values: input,
      });
    } catch (error) {
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

    return {
      ...createdGoal,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    };
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

      const mergedGoal = profileGoalRecordSchema.safeParse({
        ...existingGoal,
        ...input.data,
      });

      if (!mergedGoal.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Goal update payload is invalid",
          cause: mergedGoal.error.flatten(),
        });
      }

      let updatedGoal: ProfileGoalRecord;

      try {
        updatedGoal = await updateProfileGoal({
          db,
          id: input.id,
          data: mergedGoal.data,
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update goal",
        });
      }

      return {
        ...updatedGoal,
        cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
      };
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
      await deleteProfileGoal({
        db,
        id: input.id,
      });
    } catch {
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
