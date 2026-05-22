import { randomUUID } from "node:crypto";
import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  profileGoalCreateSchema,
  profileGoalRecordSchema,
} from "@repo/core";
import { profileGoals } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
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

const goalsListInputSchema = z
  .object({
    profile_id: z.string().uuid(),
    search: z.string().trim().max(80).optional(),
    activity_category: canonicalGoalActivityCategorySchema.optional(),
    sort_by: z.enum(["created_at", "target_date", "priority"]).default("created_at"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
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
  })
  .strict();
const profileGoalUpdateDataSchema = z
  .object({
    target_date: goalDateSchema,
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

function buildGoalListConditions(input: {
  profileId: string;
  search?: string;
  activityCategory?: z.infer<typeof canonicalGoalActivityCategorySchema>;
}) {
  const conditions = [eq(profileGoals.profile_id, input.profileId)];

  if (input.search) {
    conditions.push(ilike(profileGoals.title, `%${input.search}%`));
  }

  if (input.activityCategory) {
    conditions.push(eq(profileGoals.activity_category, input.activityCategory));
  }

  return conditions;
}

async function listProfileGoals(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  search?: string;
  activityCategory?: z.infer<typeof canonicalGoalActivityCategorySchema>;
  sortBy: "created_at" | "target_date" | "priority";
  sortOrder: "asc" | "desc";
  limit: number;
  offset: number;
}): Promise<ProfileGoalRecord[]> {
  const conditions = buildGoalListConditions(input);

  const sortColumn =
    input.sortBy === "target_date"
      ? profileGoals.target_date
      : input.sortBy === "priority"
        ? profileGoals.priority
        : profileGoals.created_at;
  const orderBy = input.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await input.db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(and(...conditions))
    .orderBy(orderBy)
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
  values: z.infer<typeof profileGoalCreateSchema>;
}): Promise<ProfileGoalRecord> {
  const [row] = await input.db
    .insert(profileGoals)
    .values({
      id: randomUUID(),
      profile_id: input.values.profile_id,
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

export const goalsRouter = createTRPCRouter({
  list: protectedProcedure.input(goalsListInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const offset = parseIndexCursor(input.cursor);

    await assertProfileAccess({
      ctx,
      profileId: input.profile_id,
    });

    const conditions = buildGoalListConditions({
      profileId: input.profile_id,
      search: input.search,
      activityCategory: input.activity_category,
    });

    try {
      const [items, totalRows] = await Promise.all([
        listProfileGoals({
          db,
          profileId: input.profile_id,
          search: input.search,
          activityCategory: input.activity_category,
          sortBy: input.sort_by,
          sortOrder: input.sort_order,
          limit: input.limit,
          offset,
        }),
        db
          .select({ total: count() })
          .from(profileGoals)
          .where(and(...conditions)),
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
      const createdGoal = await createProfileGoal({
        db,
        values: {
          profile_id: input.profile_id,
          target_date: input.target_date,
          title: input.title,
          priority: input.priority,
          activity_category: input.activity_category,
          target_payload: input.target_payload,
        },
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

      try {
        const updatedGoal = await updateProfileGoal({
          db,
          id: input.id,
          data: mergedGoal.data,
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
      await deleteProfileGoal({
        db,
        id: input.id,
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
